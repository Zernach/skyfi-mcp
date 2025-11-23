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
 * Conversation history storage with automatic cleanup and locking
 */
class ConversationStore {
  private conversations = new Map<string, { messages: ChatMessage[]; lastAccess: number }>();
  private locks = new Map<string, Promise<void>>();
  private lockQueue = new Map<string, Array<() => void>>();
  private maxMessages = 20; // Keep last 20 messages per conversation
  private maxAge = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup old conversations every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Acquire a lock for a conversation (prevents race conditions)
   */
  private async acquireLock(conversationId: string): Promise<() => void> {
    // Wait for existing lock to release
    while (this.locks.has(conversationId)) {
      await this.locks.get(conversationId);
    }

    // Create new lock
    let releaseLock: () => void = () => { };
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = () => {
        this.locks.delete(conversationId);
        resolve();

        // Process queued lock requests
        const queue = this.lockQueue.get(conversationId);
        if (queue && queue.length > 0) {
          const next = queue.shift();
          if (next) next();
        } else {
          this.lockQueue.delete(conversationId);
        }
      };
    });

    this.locks.set(conversationId, lockPromise);
    return releaseLock;
  }

  get(conversationId: string): ChatMessage[] {
    const entry = this.conversations.get(conversationId);
    if (entry) {
      entry.lastAccess = Date.now();
      return [...entry.messages]; // Return copy to prevent external modifications
    }
    return [];
  }

  async add(conversationId: string, message: ChatMessage): Promise<void> {
    const release = await this.acquireLock(conversationId);
    try {
      let entry = this.conversations.get(conversationId);
      if (!entry) {
        entry = { messages: [], lastAccess: Date.now() };
        this.conversations.set(conversationId, entry);
      }

      entry.messages.push(message);
      entry.lastAccess = Date.now();

      // Trim to max length, keeping system message and preserving tool call pairs
      if (entry.messages.length > this.maxMessages) {
        const systemMessages = entry.messages.filter((m) => m.role === 'system');
        const otherMessages = entry.messages.filter((m) => m.role !== 'system');
        
        // Find a safe starting point that doesn't break assistant+tool pairs
        const targetLength = this.maxMessages - systemMessages.length;
        let startIndex = Math.max(0, otherMessages.length - targetLength);
        
        // Adjust startIndex to not break tool call pairs
        // If we're starting on a tool message, back up to include its assistant message
        while (startIndex > 0 && otherMessages[startIndex].role === 'tool') {
          startIndex--;
          // Also check if this is an assistant with tool_calls
          if (otherMessages[startIndex].role === 'assistant' && otherMessages[startIndex].tool_calls) {
            break; // Found the assistant message, this is a good starting point
          }
        }
        
        // Also check if we're starting on an assistant message with tool_calls
        // In that case, we need to include all its tool responses
        if (startIndex < otherMessages.length && 
            otherMessages[startIndex].role === 'assistant' && 
            otherMessages[startIndex].tool_calls) {
          // This is fine - we'll include the assistant and all its tool responses
        }
        
        const trimmedMessages = otherMessages.slice(startIndex);
        entry.messages = [...systemMessages, ...trimmedMessages];
      }
    } finally {
      release();
    }
  }

  async clear(conversationId: string): Promise<void> {
    const release = await this.acquireLock(conversationId);
    try {
      this.conversations.delete(conversationId);
    } finally {
      release();
    }
  }

  size(): number {
    return this.conversations.size;
  }

  /**
   * Cleanup old conversations that haven't been accessed recently
   */
  cleanup(force: boolean = false): void {
    const now = Date.now();
    let cleaned = 0;
    const toDelete: string[] = [];

    // Collect conversations to delete
    for (const [id, entry] of this.conversations.entries()) {
      if (force || now - entry.lastAccess > this.maxAge) {
        toDelete.push(id);
      }
    }

    // Delete conversations (sorted by lastAccess, oldest first)
    const sortedToDelete = toDelete
      .map(id => ({ id, lastAccess: this.conversations.get(id)?.lastAccess || 0 }))
      .sort((a, b) => a.lastAccess - b.lastAccess)
      .map(item => item.id);

    // Delete up to 10% of conversations at a time to avoid blocking
    const deleteCount = force ? sortedToDelete.length : Math.min(sortedToDelete.length, Math.max(1, Math.floor(this.conversations.size * 0.1)));

    for (let i = 0; i < deleteCount; i++) {
      const id = sortedToDelete[i];
      // Only delete if not currently locked
      if (!this.locks.has(id)) {
        this.conversations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old conversation(s)`, {
        totalConversations: this.conversations.size,
        force,
      });
    }
  }

  /**
   * Get memory usage stats
   */
  getStats(): { totalConversations: number; totalMessages: number } {
    let totalMessages = 0;
    for (const entry of this.conversations.values()) {
      totalMessages += entry.messages.length;
    }
    return {
      totalConversations: this.conversations.size,
      totalMessages,
    };
  }

  /**
   * Destroy cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Chat Service - Handles LLM tool-calling flow
 */
export class ChatService {
  private conversationStore = new ConversationStore();
  private activeRequests = new Map<string, Promise<ChatResponse>>();
  private systemPrompt = `You are a helpful AI assistant for SkyFi, a satellite imagery platform. You help users search for, order, and manage satellite imagery.

Your capabilities include:
- Searching the SkyFi archive for existing satellite imagery
- Creating orders to purchase satellite images
- Requesting new satellite captures (tasking)
- Checking order and tasking status
- Estimating pricing for imagery
- Converting location names to coordinates
- Iterative search refinement with session management
- Order history exploration with filtering and pagination
- Intelligent recommendations based on search patterns
- Session analytics and comparison
- Export and analysis of search history

ITERATIVE SEARCH & EXPLORATION:
When users search for imagery or explore orders, the system maintains sessions that support:
1. **Pagination**: Use action="next", "previous", or "first" to navigate results
2. **Refinement**: Use sessionId to refine existing searches with new filters
3. **History**: Use includeHistory=true to see previous iterations
4. **Context preservation**: Sessions maintain state across multiple queries
5. **Smart Recommendations**: System provides suggestions when results are limited

Search session examples:
- "Show me the next page" → Use action="next" with existing sessionId
- "Refine to only show recent images" → Use sessionId + new date filters
- "What filters did I use?" → Use includeHistory=true
- "I'm not finding much" → System automatically provides recommendations

Order history examples:
- "Show my completed orders" → Use status="completed" filter
- "Next page of orders" → Use action="next" with sessionId
- "Filter to WorldView-3" → Add satellite filter to existing session

INTELLIGENT RECOMMENDATIONS:
When users have limited search results or ask for suggestions:
1. Call get_search_recommendations to get personalized suggestions
2. Recommendations are based on their successful past searches
3. Suggest refinements like adjusting cloud coverage or trying preferred satellites
4. If they're a new user, provide general exploration recommendations

Use get_session_analytics to:
- Show users their search patterns and preferences
- Help optimize future searches based on historical success
- Understand their satellite and filter preferences

Use compare_search_sessions to:
- Help users understand why one search performed better
- Identify optimal search parameters
- Learn from past search experiences

Examples:
- User: "I can't find what I'm looking for"
  You: [Call get_search_recommendations] "Based on your previous searches, try reducing cloud coverage to 15% or using WorldView-3 which you've had success with."

- User: "What have I been searching for?"
  You: [Call get_session_analytics] "You've performed 12 searches with an 83% success rate. Your preferred satellites are Sentinel-2 and WorldView-3, and you typically filter for <20% cloud coverage."

- User: "Why did my first search work better than this one?"
  You: [Call compare_search_sessions with both sessionIds] "Session 1 found more results because it had less restrictive cloud coverage (30% vs 10%). Would you like to try the more permissive filters?"

CRITICAL ORDER PLACEMENT WORKFLOW - ALWAYS FOLLOW:
1. When a user wants to order imagery, NEVER call create_satellite_order directly
2. FIRST call confirm_order_with_pricing to:
   - Validate the order is feasible
   - Calculate exact pricing with breakdown
   - Check authentication and payment method
   - Show all costs and delivery time to the user
3. THEN present the pricing to the user and ask: "Would you like to proceed with this order for [PRICE]?"
4. ONLY call create_satellite_order AFTER the user explicitly confirms (e.g., "yes", "proceed", "confirm", "order it")
5. If user declines or asks for changes, help them refine their search or explore alternatives

When users ask about satellite imagery:
1. If they provide a location name, use geocode_location first to get coordinates
2. Search the archive first (cheaper and faster than tasking)
3. If no suitable archive imagery exists, suggest tasking
4. When user shows interest in ordering, use confirm_order_with_pricing to show them the exact price
5. Wait for explicit confirmation before placing the order
6. Provide clear, concise responses with relevant details

Conversation examples:
- User: "I want to order this image"
  You: [Call confirm_order_with_pricing] "This image costs $250.00 for 25 sq km at orthorectified processing. Delivery in 1-2 days. Would you like to proceed with this order?"
  
- User: "Yes, order it" or "Proceed" or "Confirm"
  You: [Call create_satellite_order] "Order placed successfully! Order ID: ORD-12345"

Be proactive in helping users accomplish their goals. If you need more information, ask clarifying questions.`;

  /**
   * Process a chat message with tool-calling support
   */
  async chat(
    request: ChatRequest,
    streamingContext?: {
      clientId?: string;
      streaming?: boolean;
      onProgress?: (progress: any) => void;
    }
  ): Promise<ChatResponse> {
    const startTime = Date.now();
    const conversationId = this.getOrCreateConversationId(request.conversationId);
    const toolsUsed: string[] = [];
    const REQUEST_TIMEOUT = 120000; // 2 minutes

    // Validate request
    if (!request.message || typeof request.message !== 'string') {
      throw new Error('Message is required and must be a string');
    }

    if (request.message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    if (request.message.length > 10000) {
      throw new Error('Message is too long (max 10000 characters)');
    }

    // Validate conversation ID if provided
    if (request.conversationId && !this.isValidConversationId(request.conversationId)) {
      logger.warn('Invalid conversation ID format, generating new one', {
        providedId: request.conversationId,
        newId: conversationId,
      });
    }

    logger.info('Processing chat request', {
      conversationId,
      messageLength: request.message.length,
      streaming: streamingContext?.streaming || false,
      clientId: streamingContext?.clientId,
    });

    if (!openaiService.isEnabled()) {
      throw new Error(
        'Chat service is disabled because OPENAI_API_KEY is not configured. Please set the key to enable LLM-powered conversations.'
      );
    }

    // Prevent concurrent requests for the same conversation (deduplication)
    const existingRequest = this.activeRequests.get(conversationId);
    if (existingRequest) {
      logger.warn('Concurrent request detected for same conversation', {
        conversationId,
      });
      // For now, allow concurrent requests but log them
      // In production, you might want to queue or reject concurrent requests
    }

    // Create request key for deduplication (same conversation + same message = same request)
    const requestKey = `${conversationId}:${Buffer.from(request.message).toString('base64').substring(0, 50)}`;

    // Check if same request is already in progress (only for non-streaming)
    if (!streamingContext?.streaming) {
      const existingRequest = this.activeRequests.get(requestKey);
      if (existingRequest) {
        logger.info('Deduplicating duplicate request', { conversationId, requestKey });
        try {
          return await existingRequest;
        } catch (error) {
          // If existing request failed, allow new request
          this.activeRequests.delete(requestKey);
        }
      }
    }

    // Create timeout promise with cleanup
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Request timeout: Chat processing took too long'));
      }, REQUEST_TIMEOUT);
    });

    // Create new request promise
    const requestPromise = Promise.race([
      this.processChatRequest(request, conversationId, toolsUsed, startTime, streamingContext),
      timeoutPromise,
    ]).finally(() => {
      // Clean up timeout and request tracking
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (!streamingContext?.streaming) {
        this.activeRequests.delete(requestKey);
      }
    });

    // Store for deduplication (only for non-streaming requests)
    if (!streamingContext?.streaming) {
      this.activeRequests.set(requestKey, requestPromise);
    }

    try {
      return await requestPromise;
    } catch (error) {
      logger.error('Chat service error:', error);

      // Provide user-friendly error messages
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error('The request took too long to process. Please try again with a simpler question.');
        }
        if (error.message.includes('rate limit')) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        }
        if (error.message.includes('API key')) {
          throw new Error('Configuration error: API key is invalid or missing.');
        }
      }

      throw new Error(
        `Chat processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate message array format before sending to OpenAI
   * Ensures tool messages always follow assistant messages with tool_calls
   */
  private validateMessages(messages: ChatMessage[], conversationId: string): void {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      // Check if this is a tool message
      if (msg.role === 'tool') {
        // Find the preceding assistant message
        let found = false;
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'assistant') {
            if (messages[j].tool_calls && messages[j].tool_calls!.length > 0) {
              // Found valid assistant with tool_calls
              found = true;
              break;
            } else {
              // Found assistant without tool_calls - this is invalid
              break;
            }
          } else if (messages[j].role !== 'tool') {
            // Found non-assistant, non-tool message before finding assistant
            break;
          }
        }
        
        if (!found) {
          logger.error('Invalid message format: tool message without preceding assistant with tool_calls', {
            conversationId,
            messageIndex: i,
            toolMessage: {
              role: msg.role,
              tool_call_id: msg.tool_call_id,
              name: msg.name,
            },
            precedingMessages: messages.slice(Math.max(0, i - 3), i).map(m => ({
              role: m.role,
              has_tool_calls: !!(m as any).tool_calls,
            })),
          });
          throw new Error('Invalid conversation history: tool message without preceding assistant message with tool_calls');
        }
      }
    }
  }

  /**
   * Internal method to process chat request
   */
  private async processChatRequest(
    request: ChatRequest,
    conversationId: string,
    toolsUsed: string[],
    startTime: number,
    streamingContext?: {
      clientId?: string;
      streaming?: boolean;
      onProgress?: (progress: any) => void;
    }
  ): Promise<ChatResponse> {
    // Track tool arguments for client-side tool execution
    const toolMetadata: Record<string, any> = {};
    try {
      // Get conversation history (with locking)
      let messages = this.conversationStore.get(conversationId);

      // Add system prompt if new conversation
      if (messages.length === 0) {
        const systemMessage: ChatMessage = {
          role: 'system',
          content: this.systemPrompt,
        };
        await this.conversationStore.add(conversationId, systemMessage);
        messages = this.conversationStore.get(conversationId);
      }

      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: request.message,
      };
      await this.conversationStore.add(conversationId, userMessage);
      messages = this.conversationStore.get(conversationId);

      // Tool-calling loop (max 5 iterations to prevent infinite loops)
      let iterations = 0;
      const maxIterations = 5;
      let finalResponse = '';

      while (iterations < maxIterations) {
        iterations++;

        // Send progress update if streaming
        if (streamingContext?.onProgress) {
          logger.info('Sending LLM thinking progress', {
            conversationId,
            iteration: iterations,
          });
          streamingContext.onProgress({
            stage: 'llm_thinking',
            iteration: iterations,
            message: 'Thinking...',
          });
        }

        // Get LLM completion with retry logic
        let completion: Awaited<ReturnType<typeof openaiService.createChatCompletion>> | undefined;
        let retries = 0;
        const maxRetries = 2;

        while (retries <= maxRetries) {
          try {
            // Validate message format before sending to OpenAI
            this.validateMessages(messages, conversationId);
            
            completion = await openaiService.createChatCompletion({
              messages,
              tools: skyfiTools,
              temperature: 0.7,
            });
            break; // Success, exit retry loop
          } catch (error) {
            if (retries >= maxRetries) {
              throw error; // Re-throw if max retries reached
            }

            // Retry on transient errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('rate limit') || errorMessage.includes('timeout')) {
              retries++;
              const delay = Math.min(Math.pow(2, retries) * 1000, 10000); // Exponential backoff, max 10s
              logger.warn(`Retrying LLM completion (attempt ${retries}/${maxRetries})`, {
                delay,
                error: errorMessage,
                conversationId,
              });

              // Use a cancellable delay
              let delayTimeout: NodeJS.Timeout | null = null;
              try {
                await new Promise<void>((resolve, reject) => {
                  delayTimeout = setTimeout(resolve, delay);
                  // Check if request was cancelled (conversation cleared)
                  const checkInterval = setInterval(() => {
                    const currentMessages = this.conversationStore.get(conversationId);
                    if (currentMessages.length === 0) {
                      clearInterval(checkInterval);
                      if (delayTimeout) clearTimeout(delayTimeout);
                      reject(new Error('Request cancelled'));
                    }
                  }, 100);

                  // Cleanup interval when delay completes
                  setTimeout(() => clearInterval(checkInterval), delay);
                });
              } catch (cancelError) {
                if (delayTimeout) clearTimeout(delayTimeout);
                throw cancelError; // Re-throw cancellation
              }
              continue;
            }
            throw error; // Don't retry on non-transient errors
          }
        }

        // Safety check - should never happen due to throw above, but satisfies TypeScript
        if (!completion) {
          throw new Error('Failed to get completion from OpenAI');
        }

        // Check if LLM wants to call tools
        if (completion.toolCalls && completion.toolCalls.length > 0) {
          logger.info(
            `LLM requested ${completion.toolCalls.length} tool call(s)`,
            {
              tools: completion.toolCalls.map((tc) => tc.name),
            }
          );

          // Send progress update if streaming
          if (streamingContext?.onProgress) {
            logger.info('Sending tool execution progress', {
              conversationId,
              toolCount: completion.toolCalls.length,
              tools: completion.toolCalls.map((tc) => tc.name),
            });
            streamingContext.onProgress({
              stage: 'tool_execution',
              tools: completion.toolCalls.map((tc) => tc.name),
              message: `Executing ${completion.toolCalls.length} tool(s)...`,
            });
          }

          // Save assistant message with tool calls
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: completion.message || '',
            tool_calls: completion.toolCalls,
          };
          await this.conversationStore.add(conversationId, assistantMessage);

          // Track tool arguments for client-side execution
          completion.toolCalls.forEach((tc) => {
            toolMetadata[tc.name] = tc.arguments;
          });

          // Execute tools with error handling
          let toolResults;
          try {
            toolResults = await toolExecutor.executeTools(
              completion.toolCalls,
              { conversationId }
            );
          } catch (toolError) {
            logger.error('Tool execution batch failed', {
              error: toolError instanceof Error ? toolError.message : String(toolError),
              conversationId,
              toolCount: completion.toolCalls.length,
            });

            // Create error results for all tools
            toolResults = completion.toolCalls.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.name,
              result: null,
              error: toolError instanceof Error ? toolError.message : 'Tool execution failed',
            }));
          }

          // Track tools used and log results
          toolResults.forEach((result) => {
            if (!toolsUsed.includes(result.toolName)) {
              toolsUsed.push(result.toolName);
            }

            // Log detailed tool execution results
            if (result.error) {
              logger.error('Tool execution returned error', {
                toolName: result.toolName,
                toolCallId: result.toolCallId,
                error: result.error,
                conversationId,
              });
            } else {
              logger.info('Tool execution succeeded', {
                toolName: result.toolName,
                toolCallId: result.toolCallId,
                resultPreview: JSON.stringify(result.result).substring(0, 200),
                conversationId,
              });
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
            await this.conversationStore.add(conversationId, toolMessage);
          }

          // Update messages for next iteration
          messages = this.conversationStore.get(conversationId);

          // Continue loop to get final response
          continue;
        }

        // No more tool calls - we have the final response
        finalResponse = completion.message || '';

        // Validate response is not empty
        if (!finalResponse || finalResponse.trim().length === 0) {
          logger.warn('Empty response from LLM', {
            conversationId,
            iteration: iterations,
            finishReason: completion.finishReason,
          });

          // If we have tool results from previous iterations, provide a helpful message
          if (toolsUsed.length > 0) {
            finalResponse = 'I processed your request but encountered an issue generating a response. The tools executed successfully. Please try rephrasing your question.';
          } else {
            finalResponse = 'I apologize, but I received an empty response. Please try rephrasing your question.';
          }
        }

        // Save final assistant message (with locking)
        const finalMessage: ChatMessage = {
          role: 'assistant',
          content: finalResponse,
        };
        await this.conversationStore.add(conversationId, finalMessage);

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
          ...toolMetadata, // Include tool arguments for client-side execution
        },
      };
    } catch (error) {
      // Log error with context
      logger.error('Error in processChatRequest', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Clear conversation history
   */
  async clearConversation(conversationId: string): Promise<void> {
    await this.conversationStore.clear(conversationId);
    // Also clear any active requests for this conversation
    for (const [key] of this.activeRequests.entries()) {
      if (key.startsWith(`${conversationId}:`)) {
        this.activeRequests.delete(key);
      }
    }
    logger.info('Conversation cleared', { conversationId });
  }

  /**
   * Get conversation count
   */
  getConversationCount(): number {
    return this.conversationStore.size();
  }

  /**
   * Get conversation store statistics
   */
  getStats(): { totalConversations: number; totalMessages: number } {
    return this.conversationStore.getStats();
  }

  /**
   * Cleanup old conversations manually
   */
  cleanupOldConversations(): void {
    this.conversationStore.cleanup();
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * Cancel active request for a conversation
   */
  cancelRequest(conversationId: string): boolean {
    const request = this.activeRequests.get(conversationId);
    if (request) {
      this.activeRequests.delete(conversationId);
      logger.info('Cancelled active request', { conversationId });
      return true;
    }
    return false;
  }

  /**
   * Generate a unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate conversation ID format
   */
  private isValidConversationId(id: string): boolean {
    return typeof id === 'string' && id.startsWith('conv_') && id.length > 10;
  }

  /**
   * Get or create conversation ID with validation
   */
  private getOrCreateConversationId(requestId?: string): string {
    if (requestId && this.isValidConversationId(requestId)) {
      return requestId;
    }
    return this.generateConversationId();
  }
}

// Singleton instance
export const chatService = new ChatService();

