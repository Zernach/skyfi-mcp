import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Minus, AlertCircle, RefreshCw } from 'react-feather';
import { Spinner } from '../spinner/Spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { executeTool, type ToolExecutionContext } from '../../lib/tools/registry';
import { sseManager } from '../../lib/sse-manager';
import { BASE_URL } from '../../constants/config';
import './ChatWidget.scss';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Array<{
        name: string;
        args: Record<string, any>;
        result?: any;
    }>;
    status?: 'sending' | 'processing' | 'complete' | 'error';
    progress?: string;
    error?: string;
    timestamp: Date;
}

// Enable streaming for real-time updates
const USE_STREAMING = true;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 90000; // 90 seconds

interface ChatWidgetProps {
    onMarkerUpdate?: (update: any) => void;
    onMapPositionChange?: (coords: any) => void;
}

export const EnhancedChatWidget: React.FC<ChatWidgetProps> = ({
    onMarkerUpdate,
    onMapPositionChange
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [sseConnected, setSseConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const currentRequestId = useRef<number | null>(null);
    const retryCount = useRef<number>(0);
    const abortController = useRef<AbortController | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize SSE connection if streaming is enabled
    useEffect(() => {
        if (USE_STREAMING && isOpen) {
            initSSE();
        }

        // Cleanup on unmount
        return () => {
            if (abortController.current) {
                abortController.current.abort();
            }
            if (USE_STREAMING && !isOpen) {
                sseManager.disconnect();
                setSseConnected(false);
            }
        };
    }, [isOpen]);

    const initSSE = async () => {
        try {
            setConnectionError(null);
            setIsReconnecting(true);

            const client = await sseManager.getClient();
            setSseConnected(true);
            setIsReconnecting(false);

            // Register event handlers for streaming updates
            client.on('processing_started', handleProcessingStarted);
            client.on('progress', handleProgress);
            client.on('processing_complete', handleProcessingComplete);
            client.on('processing_error', handleProcessingError);

            console.log('SSE initialized successfully');
        } catch (error) {
            console.error('Failed to initialize SSE:', error);
            setSseConnected(false);
            setIsReconnecting(false);
            setConnectionError(
                error instanceof Error ? error.message : 'Connection failed'
            );
        }
    };

    const handleProcessingStarted = useCallback((data: any) => {
        console.log('Processing started:', data);
        updateMessageStatus(data.requestId, 'processing', 'Processing your request...');
    }, []);

    const handleProgress = useCallback((data: any) => {
        console.log('Progress update:', data);
        const progressMsg = data.message || `${data.stage}...`;
        updateMessageStatus(data.requestId, 'processing', progressMsg);
    }, []);

    const handleProcessingComplete = useCallback(async (data: any) => {
        console.log('Processing complete:', data);
        await handleStreamingResponse(data.requestId, data.result);
    }, [conversationId, onMarkerUpdate, onMapPositionChange]);

    const handleProcessingError = useCallback((data: any) => {
        console.error('Processing error:', data);
        handleStreamingError(data.requestId, data.error);
    }, []);

    const updateMessageStatus = (requestId: number, status: string, progress?: string, error?: string) => {
        setMessages(prev => prev.map(msg => {
            if (msg.id === `${requestId}-assistant`) {
                return { ...msg, status: status as any, progress, error };
            }
            return msg;
        }));
    };

    const handleStreamingResponse = async (requestId: number, result: any) => {
        if (result.conversationId) {
            setConversationId(result.conversationId);
        }

        // Create tool execution context
        const toolContext: ToolExecutionContext = {
            onMarkerUpdate,
            onMapPositionChange,
            conversationId: result.conversationId || conversationId,
        };

        // Execute client-side tools if needed
        if (result.toolsUsed && result.toolsUsed.length > 0) {
            for (const toolName of result.toolsUsed) {
                const mapTools = ['fly_to_place', 'map_fly_to', 'get_weather', 'lookup_bounding_box'];
                if (mapTools.includes(toolName) && result.metadata?.[toolName]) {
                    try {
                        await executeTool(toolName, result.metadata[toolName], toolContext);
                    } catch (err) {
                        console.warn(`Failed to execute client-side tool ${toolName}:`, err);
                    }
                }
            }
        }

        // Update the assistant message with the final response
        setMessages(prev => prev.map(msg => {
            if (msg.id === `${requestId}-assistant`) {
                return {
                    ...msg,
                    content: result.response || 'No response received.',
                    status: 'complete',
                    progress: undefined,
                    error: undefined,
                    toolCalls: result.toolsUsed?.map((name: string) => ({
                        name,
                        args: result.metadata?.[name] || {},
                    }))
                };
            }
            return msg;
        }));

        setIsLoading(false);
        retryCount.current = 0;
    };

    const handleStreamingError = (requestId: number, error: any) => {
        const errorMessage = error?.message || 'An error occurred while processing your request.';

        setMessages(prev => prev.map(msg => {
            if (msg.id === `${requestId}-assistant`) {
                return {
                    ...msg,
                    content: `Sorry, there was an error: ${errorMessage}`,
                    status: 'error',
                    progress: undefined,
                    error: errorMessage,
                };
            }
            return msg;
        }));

        setIsLoading(false);
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return;

        const requestId = Date.now();
        currentRequestId.current = requestId;
        retryCount.current = 0;

        const userMsg: Message = {
            id: requestId.toString(),
            role: 'user',
            content: inputValue,
            status: 'sending',
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        // Add placeholder assistant message for streaming updates
        const assistantMsg: Message = {
            id: `${requestId}-assistant`,
            role: 'assistant',
            content: '',
            status: 'processing',
            progress: 'Sending your message...',
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMsg]);

        // Create abort controller for this request
        abortController.current = new AbortController();

        try {
            await sendMessageWithRetry(userMsg.content, requestId);
        } catch (error) {
            console.error('Error sending message:', error);
            handleMessageError(requestId, error);
        }
    };

    const sendMessageWithRetry = async (message: string, requestId: number, attempt: number = 1): Promise<void> => {
        try {
            if (USE_STREAMING && sseConnected) {
                // Use SSE for streaming responses
                const client = await sseManager.getClient();

                await Promise.race([
                    client.sendMessage('chat', {
                        message,
                        conversationId,
                        streaming: true,
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT)
                    ),
                ]);

                // Update user message status
                setMessages(prev => prev.map(msg =>
                    msg.id === requestId.toString() ? { ...msg, status: 'complete' as any } : msg
                ));
            } else {
                // Fallback to traditional HTTP POST (non-streaming)
                await sendMessageHTTP(message, requestId);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Retry logic
            if (attempt < MAX_RETRIES && errorMessage.includes('timeout')) {
                console.warn(`Attempt ${attempt} failed, retrying...`);
                retryCount.current = attempt;
                updateMessageStatus(requestId, 'processing', `Retrying (attempt ${attempt + 1}/${MAX_RETRIES})...`);

                await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
                return sendMessageWithRetry(message, requestId, attempt + 1);
            }

            throw error;
        }
    };

    const sendMessageHTTP = async (message: string, requestId: number) => {
        const toolContext: ToolExecutionContext = {
            onMarkerUpdate,
            onMapPositionChange,
            conversationId,
        };

        const response = await fetch(`${BASE_URL}/mcp/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'chat',
                params: {
                    message,
                    conversationId,
                    streaming: false,
                },
                id: requestId
            }),
            signal: abortController.current?.signal,
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'MCP error occurred');
        }

        const result = data.result;

        if (result.conversationId) {
            setConversationId(result.conversationId);
        }

        // Execute client-side tools for map interactions
        if (result.toolsUsed && result.toolsUsed.length > 0) {
            for (const toolName of result.toolsUsed) {
                const mapTools = ['fly_to_place', 'map_fly_to', 'get_weather', 'lookup_bounding_box'];
                if (mapTools.includes(toolName) && result.metadata?.[toolName]) {
                    try {
                        await executeTool(toolName, result.metadata[toolName], toolContext);
                    } catch (err) {
                        console.warn(`Failed to execute client-side tool ${toolName}:`, err);
                    }
                }
            }
        }

        // Update assistant message with response
        setMessages(prev => prev.map(msg => {
            if (msg.id === `${requestId}-assistant`) {
                return {
                    ...msg,
                    content: result.response || 'No response received.',
                    status: 'complete',
                    progress: undefined,
                    toolCalls: result.toolsUsed?.map((name: string) => ({
                        name,
                        args: result.metadata?.[name] || {},
                    }))
                };
            }
            return msg;
        }));

        setIsLoading(false);
    };

    const handleMessageError = (requestId: number, error: any) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        setMessages(prev => prev.map(msg => {
            if (msg.id === `${requestId}-assistant`) {
                return {
                    ...msg,
                    content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
                    status: 'error',
                    progress: undefined,
                    error: errorMessage,
                };
            }
            return msg;
        }));

        setIsLoading(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleReconnect = () => {
        initSSE();
    };

    const clearConversation = () => {
        setMessages([]);
        setConversationId(null);
        setConnectionError(null);
    };

    return (
        <div className="chat-widget">
            {isOpen && (
                <div className="chat-window">
                    <div className="chat-header">
                        <h3>SkyFi Assistant</h3>
                        <div className="header-controls">
                            {USE_STREAMING && (
                                <span className={`connection-status ${sseConnected ? 'connected' : 'disconnected'}`}>
                                    {isReconnecting ? 'Connecting...' : sseConnected ? '● Connected' : '○ Offline'}
                                </span>
                            )}
                            <button className="clear-btn" onClick={clearConversation} title="Clear conversation">
                                <RefreshCw size={16} />
                            </button>
                            <button className="close-btn" onClick={() => setIsOpen(false)}>
                                <Minus size={20} />
                            </button>
                        </div>
                    </div>

                    {connectionError && (
                        <div className="connection-error">
                            <AlertCircle size={16} />
                            <span>{connectionError}</span>
                            <button onClick={handleReconnect}>Retry</button>
                        </div>
                    )}

                    <div className="chat-messages">
                        {messages.length === 0 && (
                            <div className="message assistant">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    Hello! I can help you find satellite imagery or answer questions about SkyFi. How can I assist you today?
                                </ReactMarkdown>
                            </div>
                        )}
                        {messages.map(msg => (
                            <div key={msg.id} className={`message ${msg.role} ${msg.status || ''}`}>
                                {msg.progress && (
                                    <div className="message-progress">
                                        <Spinner size={12} /> {msg.progress}
                                    </div>
                                )}
                                {msg.error && (
                                    <div className="message-error">
                                        <AlertCircle size={14} /> Error: {msg.error}
                                    </div>
                                )}
                                {msg.content && (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                )}
                                {msg.toolCalls && msg.toolCalls.length > 0 && (
                                    <div className="message-tools">
                                        Used tools: {msg.toolCalls.map(tc => tc.name).join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                        {isLoading && messages[messages.length - 1]?.status !== 'processing' && (
                            <div className="message assistant">
                                <Spinner size={16} />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-area">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Type a message..."
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={isLoading || !inputValue.trim()}
                            title="Send message"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            )}
            <button className="chat-toggle" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <X /> : <MessageSquare />}
            </button>
        </div>
    );
};


