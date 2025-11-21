import OpenAI from 'openai';
import { config } from '../config';
import logger from '../utils/logger';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  tools?: ChatCompletionTool[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionResponse {
  message: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * OpenAI Service for LLM tool-calling
 */
export class OpenAIService {
  private client?: OpenAI;
  private model: string;
  private maxTokens: number;
  private enabled: boolean;

  constructor() {
    this.model = config.openai.model;
    this.maxTokens = config.openai.maxTokens;
    this.enabled = Boolean(config.openai.apiKey);

    if (this.enabled) {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey,
      });
    } else {
      logger.warn(
        'OPENAI_API_KEY is not set. OpenAI features are disabled until the key is provided.'
      );
    }
  }

  private ensureClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        'OpenAI integration is disabled because OPENAI_API_KEY is not configured.'
      );
    }
    return this.client;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create a chat completion with tool calling support
   */
  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    if (!this.isEnabled()) {
      throw new Error(
        'Unable to process chat completions because OPENAI_API_KEY is not configured.'
      );
    }

    try {
      const client = this.ensureClient();
      const messages: ChatCompletionMessageParam[] = request.messages.map((msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.tool_call_id!,
          };
        }
        if (msg.role === 'assistant' && msg.tool_calls) {
          return {
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return {
          role: msg.role,
          content: msg.content,
        };
      });

      const completion = await client.chat.completions.create({
        model: this.model,
        messages,
        tools: request.tools,
        max_tokens: request.maxTokens || this.maxTokens,
        temperature: request.temperature ?? 0.7,
      });

      const choice = completion.choices[0];
      const message = choice.message;

      logger.info('OpenAI completion created', {
        finishReason: choice.finish_reason,
        usage: completion.usage,
      });

      // Extract tool calls if present
      const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((tc) => {
        if ('function' in tc) {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          };
        }
        throw new Error('Unsupported tool call type');
      });

      return {
        message: message.content || '',
        toolCalls,
        finishReason: choice.finish_reason,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the configured model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Set a different model
   */
  setModel(model: string): void {
    this.model = model;
  }
}

// Singleton instance
export const openaiService = new OpenAIService();

