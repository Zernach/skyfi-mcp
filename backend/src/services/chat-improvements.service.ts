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
        retryCount?: number;
    };
    debug?: {
        iterations: number;
        toolResults: Array<{
            tool: string;
            success: boolean;
            duration: number;
        }>;
    };
}

interface ConversationEntry {
    messages: ChatMessage[];
    lastAccessed: Date;
    metadata: {
        createdAt: Date;
        messageCount: number;
        lastError?: string;
    };
}

/**
 * Enhanced Conversation Store with better memory management
 */
class EnhancedConversationStore {
    private conversations = new Map<string, ConversationEntry>();
    private maxMessages = 25; // Increased from 20 for better context
    private maxConversations = 100; // Limit total conversations
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly TTL = 30 * 60 * 1000; // 30 minutes

    constructor() {
        // Start cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    get(conversationId: string): ChatMessage[] {
        const entry = this.conversations.get(conversationId);
        if (entry) {
            entry.lastAccessed = new Date();
            return entry.messages;
        }
        return [];
    }

    add(conversationId: string, message: ChatMessage): void {
        let entry = this.conversations.get(conversationId);

        if (!entry) {
            entry = {
                messages: [],
                lastAccessed: new Date(),
                metadata: {
                    createdAt: new Date(),
                    messageCount: 0,
                },
            };
            this.conversations.set(conversationId, entry);
        }

        entry.messages.push(message);
        entry.metadata.messageCount++;
        entry.lastAccessed = new Date();

        // Trim to max length, keeping system messages
        if (entry.messages.length > this.maxMessages) {
            const systemMessages = entry.messages.filter((m) => m.role === 'system');
            const otherMessages = entry.messages.filter((m) => m.role !== 'system');
            const trimmed = [
                ...systemMessages,
                ...otherMessages.slice(-this.maxMessages + systemMessages.length),
            ];
            entry.messages = trimmed;
        }

        // Limit total conversations
        if (this.conversations.size > this.maxConversations) {
            this.evictOldest();
        }
    }

    setError(conversationId: string, error: string): void {
        const entry = this.conversations.get(conversationId);
        if (entry) {
            entry.metadata.lastError = error;
        }
    }

    private evictOldest(): void {
        const entries = Array.from(this.conversations.entries());
        entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());

        const toRemove = Math.floor(this.maxConversations * 0.1); // Remove 10%
        for (let i = 0; i < toRemove && i < entries.length; i++) {
            this.conversations.delete(entries[i][0]);
        }

        logger.info(`Evicted ${toRemove} old conversations`);
    }

    clear(conversationId: string): void {
        this.conversations.delete(conversationId);
    }

    size(): number {
        return this.conversations.size;
    }

    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, entry] of this.conversations.entries()) {
            if (now - entry.lastAccessed.getTime() > this.TTL) {
                this.conversations.delete(id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info(`Cleaned up ${cleaned} stale conversation(s)`);
        }
    }

    getStats(): { totalConversations: number; totalMessages: number; oldestAccess: Date | null } {
        let totalMessages = 0;
        let oldestAccess: Date | null = null;

        for (const entry of this.conversations.values()) {
            totalMessages += entry.messages.length;
            if (!oldestAccess || entry.lastAccessed < oldestAccess) {
                oldestAccess = entry.lastAccessed;
            }
        }

        return {
            totalConversations: this.conversations.size,
            totalMessages,
            oldestAccess,
        };
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

/**
 * Enhanced Chat Service with improved error handling and stability
 */
export class EnhancedChatService {
    private conversationStore = new EnhancedConversationStore();
    private systemPrompt = `You are a helpful AI assistant for SkyFi, a satellite imagery platform. You help users search for, order, and manage satellite imagery.

Your capabilities include:
- Searching the SkyFi archive for existing satellite imagery
- Creating orders to purchase satellite images
- Requesting new satellite captures (tasking)
- Checking order and tasking status
- Estimating pricing for imagery
- Converting location names to coordinates
- Monitoring areas of interest for new imagery

When users ask about satellite imagery:
1. If they provide a location name, use geocode_location first to get coordinates
2. Search the archive first (cheaper and faster than tasking)
3. If no suitable archive imagery exists, suggest tasking
4. Always inform users about pricing before creating orders
5. Provide clear, concise responses with relevant details

IMPORTANT ERROR HANDLING:
- If a tool fails, acknowledge the error gracefully and suggest alternatives
- If geocoding fails, ask the user to provide coordinates directly
- If searches return no results, suggest broadening the criteria
- If API errors occur, let the user know the system is experiencing issues

Be proactive, helpful, and transparent about any limitations or errors you encounter.`;

    async chat(
        request: ChatRequest,
        streamingContext?: {
            clientId?: string;
            streaming?: boolean;
            onProgress?: (progress: any) => void;
        }
    ): Promise<ChatResponse> {
        const startTime = Date.now();
        const conversationId = request.conversationId || this.generateConversationId();
        const toolsUsed: string[] = [];
        const toolResults: Array<{ tool: string; success: boolean; duration: number }> = [];
        let retryCount = 0;

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

        logger.info('Processing enhanced chat request', {
            conversationId,
            messageLength: request.message.length,
            streaming: streamingContext?.streaming || false,
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
                const systemMessage: ChatMessage = {
                    role: 'system',
                    content: this.systemPrompt,
                };
                this.conversationStore.add(conversationId, systemMessage);
                messages = this.conversationStore.get(conversationId);
            }

            // Add user message
            const userMessage: ChatMessage = {
                role: 'user',
                content: request.message,
            };
            this.conversationStore.add(conversationId, userMessage);
            messages = this.conversationStore.get(conversationId);

            // Tool-calling loop with better error handling
            let iterations = 0;
            const maxIterations = 6; // Increased from 5
            let finalResponse = '';

            while (iterations < maxIterations) {
                iterations++;

                // Send progress update
                if (streamingContext?.onProgress) {
                    streamingContext.onProgress({
                        stage: 'llm_thinking',
                        iteration: iterations,
                        message: iterations === 1 ? 'Processing your request...' : 'Analyzing results...',
                    });
                }

                try {
                    // Get LLM completion with timeout
                    const completion = await Promise.race([
                        openaiService.createChatCompletion({
                            messages,
                            tools: skyfiTools,
                            temperature: 0.7,
                        }),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('LLM request timeout')), 45000)
                        ),
                    ]);

                    // Check if LLM wants to call tools
                    if (completion.toolCalls && completion.toolCalls.length > 0) {
                        logger.info(
                            `LLM requested ${completion.toolCalls.length} tool call(s) in iteration ${iterations}`,
                            {
                                tools: completion.toolCalls.map((tc) => tc.name),
                                conversationId,
                            }
                        );

                        // Send progress update
                        if (streamingContext?.onProgress) {
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
                        this.conversationStore.add(conversationId, assistantMessage);

                        // Execute tools with individual error handling
                        const toolStartTime = Date.now();
                        const toolExecutionResults = await toolExecutor.executeTools(
                            completion.toolCalls,
                            { conversationId }
                        );

                        // Track tool results
                        for (const result of toolExecutionResults) {
                            const toolDuration = Date.now() - toolStartTime;
                            toolResults.push({
                                tool: result.toolName,
                                success: !result.error,
                                duration: toolDuration,
                            });

                            if (!toolsUsed.includes(result.toolName)) {
                                toolsUsed.push(result.toolName);
                            }

                            // Log tool results
                            if (result.error) {
                                logger.warn('Tool execution failed', {
                                    toolName: result.toolName,
                                    error: result.error,
                                    conversationId,
                                    iteration: iterations,
                                });
                            } else {
                                logger.info('Tool execution succeeded', {
                                    toolName: result.toolName,
                                    conversationId,
                                    iteration: iterations,
                                    resultSize: JSON.stringify(result.result).length,
                                });
                            }

                            // Add tool result to conversation
                            const toolMessage: ChatMessage = {
                                role: 'tool',
                                content: result.error
                                    ? JSON.stringify({
                                        error: result.error,
                                        message: 'This tool encountered an error. Please try a different approach or inform the user.',
                                    })
                                    : JSON.stringify(result.result),
                                tool_call_id: result.toolCallId,
                                name: result.toolName,
                            };
                            this.conversationStore.add(conversationId, toolMessage);
                        }

                        // Update messages for next iteration
                        messages = this.conversationStore.get(conversationId);

                        // Continue loop
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
                } catch (error) {
                    retryCount++;
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

                    logger.error(`Error in chat iteration ${iterations}`, {
                        error: errorMessage,
                        conversationId,
                        iteration: iterations,
                        retryCount,
                    });

                    // If it's the last iteration or a fatal error, throw
                    if (iterations >= maxIterations || retryCount >= 2) {
                        throw error;
                    }

                    // Add error context for LLM to recover
                    const errorContextMessage: ChatMessage = {
                        role: 'system',
                        content: `The previous operation encountered an error: ${errorMessage}. Please provide a helpful response to the user explaining the issue and suggesting alternatives.`,
                    };
                    this.conversationStore.add(conversationId, errorContextMessage);
                    messages = this.conversationStore.get(conversationId);

                    // Continue to next iteration to let LLM recover
                    continue;
                }
            }

            if (iterations >= maxIterations) {
                logger.warn('Max tool-calling iterations reached', {
                    conversationId,
                    iterations,
                    toolsUsed,
                });
                finalResponse =
                    finalResponse ||
                    'I apologize, but I encountered difficulty processing your request after multiple attempts. Please try rephrasing your question or breaking it into smaller parts.';
            }

            const executionTime = Date.now() - startTime;

            logger.info('Enhanced chat request completed', {
                conversationId,
                toolsUsed,
                iterations,
                executionTime,
                retryCount,
                success: true,
            });

            return {
                response: finalResponse,
                conversationId,
                toolsUsed,
                metadata: {
                    model: openaiService.getModel(),
                    executionTime,
                    toolCallCount: toolsUsed.length,
                    retryCount: retryCount > 0 ? retryCount : undefined,
                },
                debug: {
                    iterations,
                    toolResults,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.conversationStore.setError(conversationId, errorMessage);

            logger.error('Enhanced chat service error:', {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                conversationId,
                messageLength: request.message.length,
            });

            throw new Error(
                `Chat processing failed: ${errorMessage}`
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
     * Get conversation statistics
     */
    getStats() {
        return this.conversationStore.getStats();
    }

    /**
     * Generate a unique conversation ID
     */
    private generateConversationId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        this.conversationStore.destroy();
    }
}

// Singleton instance
export const enhancedChatService = new EnhancedChatService();


