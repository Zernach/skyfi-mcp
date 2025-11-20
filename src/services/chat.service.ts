import { openaiService, ChatMessage } from './openai.service';
import { skyfiTools } from './tool-definitions';
import { toolExecutor } from './tool-executor';
import logger from '../utils/logger';

export interface ChatRequest {
  message: string;
  conversationId?: string;
  context?: Record<string, any>;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  toolsUsed: string[];
  metadata: {
    model: string;
    tokensUsed?: number;
    executionTime: number;
    toolCallCount: number;
  };
}

/**
 * Conversation history storage (in-memory for now)
 */
class ConversationStore {
  private conversations = new Map<string, ChatMessage[]>();
  private maxMessages = 20; // Keep last 20 messages per conversation

  get(conversationId: string): ChatMessage[] {
    return this.conversations.get(conversationId) || [];
  }

  add(conversationId: string, message: ChatMessage): void {
    const messages = this.get(conversationId);
    messages.push(message);

    // Trim to max length, keeping system message
    if (messages.length > this.maxMessages) {
      const systemMessages = messages.filter((m) => m.role === 'system');
      const otherMessages = messages.filter((m) => m.role !== 'system');
      const trimmed = [
        ...systemMessages,
        ...otherMessages.slice(-this.maxMessages + systemMessages.length),
      ];
      this.conversations.set(conversationId, trimmed);
    } else {
      this.conversations.set(conversationId, messages);
    }
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  size(): number {
    return this.conversations.size;
  }
}

/**
 * Chat Service - Handles LLM tool-calling flow
 */
export class ChatService {
  private conversationStore = new ConversationStore();
  private systemPrompt = `You are a helpful AI assistant for SkyFi, a satellite imagery platform. You help users search for, order, and manage satellite imagery.

Your capabilities include:
- Searching the SkyFi archive for existing satellite imagery
- Creating orders to purchase satellite images
- Requesting new satellite captures (tasking)
- Checking order and tasking status
- Estimating pricing for imagery
- Converting location names to coordinates

When users ask about satellite imagery:
1. If they provide a location name, use geocode_location first to get coordinates
2. Search the archive first (cheaper and faster than tasking)
3. If no suitable archive imagery exists, suggest tasking
4. Always inform users about pricing before creating orders
5. Provide clear, concise responses with relevant details

Be proactive in helping users accomplish their goals. If you need more information, ask clarifying questions.`;

  /**
   * Process a chat message with tool-calling support
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const conversationId = request.conversationId || this.generateConversationId();
    const toolsUsed: string[] = [];

    logger.info('Processing chat request', {
      conversationId,
      messageLength: request.message.length,
    });

    if (!openaiService.isEnabled()) {
      throw new Error(
        'Chat service is disabled because OPENAI_API_KEY is not configured. Please set the key to enable LLM-powered conversations.'
      );
    }

    try {
      // Get conversation history
      let messages = this.conversationStore.get(conversationId);

      // Add system prompt if new conversation
      if (messages.length === 0) {
        messages = [
          {
            role: 'system',
            content: this.systemPrompt,
          },
        ];
        this.conversationStore.add(conversationId, messages[0]);
      }

      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: request.message,
      };
      this.conversationStore.add(conversationId, userMessage);
      messages = this.conversationStore.get(conversationId);

      // Tool-calling loop (max 5 iterations to prevent infinite loops)
      let iterations = 0;
      const maxIterations = 5;
      let finalResponse = '';

      while (iterations < maxIterations) {
        iterations++;

        // Get LLM completion
        const completion = await openaiService.createChatCompletion({
          messages,
          tools: skyfiTools,
          temperature: 0.7,
        });

        // Check if LLM wants to call tools
        if (completion.toolCalls && completion.toolCalls.length > 0) {
          logger.info(
            `LLM requested ${completion.toolCalls.length} tool call(s)`,
            {
              tools: completion.toolCalls.map((tc) => tc.name),
            }
          );

          // Save assistant message with tool calls
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: completion.message || '',
            tool_calls: completion.toolCalls,
          };
          this.conversationStore.add(conversationId, assistantMessage);

          // Execute tools
          const toolResults = await toolExecutor.executeTools(
            completion.toolCalls
          );

          // Track tools used
          toolResults.forEach((result) => {
            if (!toolsUsed.includes(result.toolName)) {
              toolsUsed.push(result.toolName);
            }
          });

          // Add tool results to conversation
          for (const result of toolResults) {
            const toolMessage: ChatMessage = {
              role: 'tool',
              content: result.error
                ? JSON.stringify({ error: result.error })
                : JSON.stringify(result.result),
              tool_call_id: result.toolCallId,
              name: result.toolName,
            };
            this.conversationStore.add(conversationId, toolMessage);
          }

          // Update messages for next iteration
          messages = this.conversationStore.get(conversationId);

          // Continue loop to get final response
          continue;
        }

        // No more tool calls - we have the final response
        finalResponse = completion.message;

        // Save final assistant message
        const finalMessage: ChatMessage = {
          role: 'assistant',
          content: finalResponse,
        };
        this.conversationStore.add(conversationId, finalMessage);

        break;
      }

      if (iterations >= maxIterations) {
        logger.warn('Max tool-calling iterations reached', {
          conversationId,
          iterations,
        });
        finalResponse =
          finalResponse ||
          'I apologize, but I encountered an issue processing your request. Please try rephrasing your question.';
      }

      const executionTime = Date.now() - startTime;

      logger.info('Chat request completed', {
        conversationId,
        toolsUsed,
        iterations,
        executionTime,
      });

      return {
        response: finalResponse,
        conversationId,
        toolsUsed,
        metadata: {
          model: openaiService.getModel(),
          executionTime,
          toolCallCount: toolsUsed.length,
        },
      };
    } catch (error) {
      logger.error('Chat service error:', error);
      throw new Error(
        `Chat processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): void {
    this.conversationStore.clear(conversationId);
    logger.info('Conversation cleared', { conversationId });
  }

  /**
   * Get conversation count
   */
  getConversationCount(): number {
    return this.conversationStore.size();
  }

  /**
   * Generate a unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const chatService = new ChatService();

