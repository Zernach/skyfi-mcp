import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Minus } from 'react-feather';
import { Spinner } from '../spinner/Spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { executeTool, type ToolExecutionContext } from '../../lib/tools/registry';
import { sseManager } from '../../lib/sse-manager';
import './ChatWidget.scss';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    result?: any;
  }>;
  status?: 'sending' | 'processing' | 'complete' | 'error';
  progress?: string;
}

const PROD_BASE_URL = 'https://api.skyfi.archlife.org';
const DEV_BASE_URL = 'http://localhost:3000';
const BASE_URL = process.env.NODE_ENV === 'production' ? PROD_BASE_URL : DEV_BASE_URL;

// Enable streaming for real-time updates
const USE_STREAMING = true;

interface ChatWidgetProps {
  onMarkerUpdate?: (update: any) => void;
  onMapPositionChange?: (coords: any) => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  onMarkerUpdate,
  onMapPositionChange
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentRequestId = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageTimeouts = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const sseClientRef = useRef<any>(null);
  const eventHandlersRegistered = useRef<boolean>(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize SSE connection if streaming is enabled
  useEffect(() => {
    if (USE_STREAMING && isOpen) {
      const initSSE = async () => {
        try {
          const client = await sseManager.getClient();
          sseClientRef.current = client;
          setSseConnected(true);

          // Register event handlers for streaming updates (only once)
          if (!eventHandlersRegistered.current) {
            const handleProcessingStarted = (data: any) => {
              console.log('[ChatWidget] SSE: Processing started', data);
              const requestId = typeof data.requestId === 'string' ? parseInt(data.requestId) : data.requestId;
              console.log('[ChatWidget] SSE: Processing started for requestId', { requestId, dataRequestId: data.requestId });
              updateMessageStatus(requestId, 'processing', 'Processing your request...');
              // Clear any timeout for this request
              const timeout = messageTimeouts.current.get(requestId);
              if (timeout) {
                clearTimeout(timeout);
                messageTimeouts.current.delete(requestId);
              }
            };

            const handleProgress = (data: any) => {
              console.log('[ChatWidget] SSE: Progress update', data);
              const requestId = typeof data.requestId === 'string' ? parseInt(data.requestId) : data.requestId;
              console.log('[ChatWidget] SSE: Progress for requestId', { requestId, dataRequestId: data.requestId, stage: data.stage });
              const progressMsg = data.message || `${data.stage}...`;
              updateMessageStatus(requestId, 'processing', progressMsg);
            };

            const handleProcessingComplete = async (data: any) => {
              console.log('[ChatWidget] SSE: Processing complete', data);
              const requestId = typeof data.requestId === 'string' ? parseInt(data.requestId) : data.requestId;
              console.log('[ChatWidget] SSE: Complete for requestId', { requestId, dataRequestId: data.requestId });
              // Clear timeout
              const timeout = messageTimeouts.current.get(requestId);
              if (timeout) {
                clearTimeout(timeout);
                messageTimeouts.current.delete(requestId);
              }
              await handleStreamingResponse(requestId, data.result);
            };

            const handleProcessingError = (data: any) => {
              console.error('[ChatWidget] SSE: Processing error', data);
              const requestId = typeof data.requestId === 'string' ? parseInt(data.requestId) : data.requestId;
              console.error('[ChatWidget] SSE: Error for requestId', { requestId, dataRequestId: data.requestId, error: data.error });
              // Clear timeout
              const timeout = messageTimeouts.current.get(requestId);
              if (timeout) {
                clearTimeout(timeout);
                messageTimeouts.current.delete(requestId);
              }
              handleStreamingError(requestId, data.error);
            };

            // Register handlers
            client.on('processing_started', handleProcessingStarted);
            client.on('progress', handleProgress);
            client.on('processing_complete', handleProcessingComplete);
            client.on('processing_error', handleProcessingError);

            eventHandlersRegistered.current = true;
          }

        } catch (error) {
          console.error('Failed to initialize SSE:', error);
          setSseConnected(false);
          sseClientRef.current = null;
        }
      };

      initSSE();
    }

    // Cleanup on unmount
    return () => {
      if (USE_STREAMING && !isOpen) {
        // Clear all timeouts
        messageTimeouts.current.forEach(timeout => clearTimeout(timeout));
        messageTimeouts.current.clear();
        sseManager.disconnect();
        setSseConnected(false);
        sseClientRef.current = null;
        eventHandlersRegistered.current = false;
      }
    };
  }, [isOpen]);

  const updateMessageStatus = (requestId: number, status: string, progress?: string) => {
    console.log('[ChatWidget] updateMessageStatus', { requestId, status, progress, messageId: `${requestId}-assistant` });
    setMessages(prev => {
      const updated = prev.map(msg => {
        if (msg.id === `${requestId}-assistant`) {
          return { ...msg, status: status as any, progress };
        }
        return msg;
      });
      const found = updated.find(m => m.id === `${requestId}-assistant`);
      if (!found) {
        console.warn('[ChatWidget] Message not found for status update', { requestId, messageId: `${requestId}-assistant`, allIds: prev.map(m => m.id) });
      }
      return updated;
    });
  };

  const handleStreamingResponse = async (requestId: number | string, result: any) => {
    const id = typeof requestId === 'string' ? parseInt(requestId) : requestId;
    console.log('[ChatWidget] handleStreamingResponse called', { requestId, id, hasResult: !!result, hasResponse: !!result?.response });
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
      if (msg.id === `${id}-assistant`) {
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

  const handleStreamingError = (requestId: number | string, error: any) => {
    const id = typeof requestId === 'string' ? parseInt(requestId) : requestId;
    console.error('[ChatWidget] handleStreamingError called', { requestId, id, error });
    const errorMessage = error?.message || error?.error?.message || 'Sorry, there was an error processing your request. Please try again later.';
    setMessages(prev => prev.map(msg => {
      if (msg.id === `${id}-assistant`) {
        return {
          ...msg,
          content: errorMessage,
          status: 'error',
          progress: undefined,
        };
      }
      return msg;
    }));
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) {
      console.log('[ChatWidget] Cannot send message', { hasInput: !!inputValue.trim(), isLoading });
      return;
    }

    console.log('[ChatWidget] handleSendMessage called', { inputLength: inputValue.trim().length });

    // Cancel any pending request
    if (abortControllerRef.current) {
      console.log('[ChatWidget] Aborting previous request');
      abortControllerRef.current.abort();
    }

    const requestId = Date.now();
    console.log('[ChatWidget] Creating new request', { requestId });
    currentRequestId.current = requestId;
    abortControllerRef.current = new AbortController();
    const messageContent = inputValue.trim();
    setError(null);

    const userMsg: Message = {
      id: requestId.toString(),
      role: 'user',
      content: messageContent,
      status: 'sending'
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
      progress: 'Sending your message...'
    };
    setMessages(prev => [...prev, assistantMsg]);

    // Set a timeout to detect if message gets stuck
    const timeoutId = setTimeout(() => {
      console.warn('[ChatWidget] Message timeout - no response received', { requestId });
      setMessages(prev => {
        const currentMsg = prev.find(m => m.id === `${requestId}-assistant`);
        if (currentMsg && currentMsg.status === 'processing' && currentMsg.progress === 'Sending your message...') {
          console.error('[ChatWidget] Message stuck on "Sending your message..."', { requestId });
          return prev.map(msg => {
            if (msg.id === `${requestId}-assistant`) {
              return {
                ...msg,
                content: 'Request timed out. Please try again.',
                status: 'error',
                progress: undefined,
              };
            }
            return msg;
          });
        }
        return prev;
      });
      setIsLoading(false);
    }, 30000); // 30 second timeout
    messageTimeouts.current.set(requestId, timeoutId);

    try {
      if (USE_STREAMING) {
        // Check if SSE is actually connected before using it
        console.log('[ChatWidget] Checking SSE connection...', { requestId });
        try {
          const client = await sseManager.getClient();
          const isActuallyConnected = client.isConnected();
          console.log('[ChatWidget] SSE connection status:', { isActuallyConnected, clientId: client.getClientId() });

          if (isActuallyConnected) {
            // Use SSE for streaming responses
            console.log('[ChatWidget] Sending message via SSE...', { requestId, messageLength: messageContent.length });
            await client.sendMessage('chat', {
              message: messageContent,
              conversationId,
              streaming: true,
            }, {
              signal: abortControllerRef.current?.signal,
              requestId: requestId // Pass the requestId so backend SSE events match
            });
            console.log('[ChatWidget] SSE message sent successfully', { requestId });

            // Update user message status
            setMessages(prev => prev.map(msg =>
              msg.id === requestId.toString() ? { ...msg, status: 'complete' as any } : msg
            ));
            return; // Successfully sent via SSE, exit early
          } else {
            console.warn('[ChatWidget] SSE not connected, falling back to HTTP', { requestId });
          }
        } catch (sseError: any) {
          // If SSE fails, fall back to HTTP POST
          if (sseError.name === 'AbortError') {
            console.log('[ChatWidget] SSE request aborted', { requestId });
            return; // Request was cancelled
          }
          console.warn('[ChatWidget] SSE send failed, falling back to HTTP:', sseError);
          setSseConnected(false);
          // Fall through to HTTP fallback below
        }
      }

      // Fallback to traditional HTTP POST (non-streaming)
      console.log('[ChatWidget] Using HTTP POST fallback', { requestId });
      {
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
              message: messageContent,
              conversationId,
              streaming: false,
            },
            id: requestId
          }),
          signal: abortControllerRef.current?.signal
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
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
      }
    } catch (error: any) {
      // Clear timeout on error
      const timeout = messageTimeouts.current.get(requestId);
      if (timeout) {
        clearTimeout(timeout);
        messageTimeouts.current.delete(requestId);
      }

      // Don't update UI if request was aborted
      if (error?.name === 'AbortError') {
        return;
      }

      console.error('Error sending message:', error);

      const errorMessage = error?.message || 'Unknown error occurred';
      let userFriendlyMessage = 'Sorry, there was an error processing your request.';

      if (errorMessage.includes('timeout')) {
        userFriendlyMessage = 'The request took too long. Please try again with a simpler question.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        userFriendlyMessage = 'Network error. Please check your connection and try again.';
      } else if (errorMessage.includes('API key')) {
        userFriendlyMessage = 'Configuration error. Please contact support.';
      } else if (errorMessage.includes('not connected')) {
        userFriendlyMessage = 'Connection lost. Reconnecting...';
        // Try to reconnect SSE
        setSseConnected(false);
        sseClientRef.current = null;
        if (USE_STREAMING && isOpen) {
          setTimeout(async () => {
            try {
              const client = await sseManager.getClient();
              sseClientRef.current = client;
              setSseConnected(true);
            } catch (reconnectError) {
              console.error('Failed to reconnect SSE:', reconnectError);
            }
          }, 1000);
        }
      }

      setError(userFriendlyMessage);
      setMessages(prev => prev.map(msg => {
        if (msg.id === `${requestId}-assistant`) {
          return {
            ...msg,
            content: userFriendlyMessage,
            status: 'error',
            progress: undefined,
          };
        }
        return msg;
      }));
      setIsLoading(false);
    } finally {
      // Clear timeout
      const timeout = messageTimeouts.current.get(requestId);
      if (timeout) {
        clearTimeout(timeout);
        messageTimeouts.current.delete(requestId);
      }
      abortControllerRef.current = null;
      console.log('[ChatWidget] Request completed', { requestId });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <h3>SkyFi Assistant</h3>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              <Minus size={20} />
            </button>
          </div>
          <div className="chat-messages">
            {error && (
              <div className="chat-error">
                <span>{error}</span>
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}
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
                {msg.content && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            ))}
            {isLoading && (
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
            <button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}>
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

