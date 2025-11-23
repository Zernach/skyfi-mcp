/**
 * Enhanced SSE (Server-Sent Events) Client
 * Improved reliability, reconnection logic, and error handling
 */

export interface SSEEvent {
    event: string;
    data: any;
    id?: string;
}

export interface SSEClientOptions {
    baseUrl: string;
    clientId?: string;
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    onConnected?: (clientId: string) => void;
    onDisconnected?: () => void;
    onError?: (error: Error) => void;
    onEvent?: (event: SSEEvent) => void;
    onReconnecting?: (attempt: number) => void;
}

export enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed',
}

export class EnhancedSSEClient {
    private eventSource: EventSource | null = null;
    private clientId: string;
    private options: Required<SSEClientOptions>;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isManualClose: boolean = false;
    private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private reconnectAttempts: number = 0;
    private lastEventId: string | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private connectionStartTime: number = 0;

    constructor(options: SSEClientOptions) {
        this.clientId = options.clientId || this.generateClientId();
        this.options = {
            baseUrl: options.baseUrl,
            clientId: this.clientId,
            reconnect: options.reconnect ?? true,
            reconnectInterval: options.reconnectInterval ?? 3000,
            maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
            onConnected: options.onConnected || (() => { }),
            onDisconnected: options.onDisconnected || (() => { }),
            onError: options.onError || (() => { }),
            onEvent: options.onEvent || (() => { }),
            onReconnecting: options.onReconnecting || (() => { }),
        };
    }

    /**
     * Generate a unique client ID
     */
    private generateClientId(): string {
        return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Get current connection state
     */
    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    /**
     * Connect to SSE endpoint
     */
    connect(): void {
        if (this.eventSource && this.connectionState === ConnectionState.CONNECTED) {
            console.warn('SSE client already connected');
            return;
        }

        this.connectionState = ConnectionState.CONNECTING;
        this.isManualClose = false;
        this.connectionStartTime = Date.now();

        const url = this.buildConnectionUrl();

        try {
            console.log('Establishing SSE connection to:', url);
            this.eventSource = new EventSource(url);

            // Handle connection open
            this.eventSource.onopen = () => {
                console.log('SSE connection opened');
                this.clearReconnectTimeout();
                this.reconnectAttempts = 0;
                this.startHeartbeat();
            };

            // Handle 'connected' event (confirmation from server)
            this.eventSource.addEventListener('connected', (e: MessageEvent) => {
                try {
                    const data = JSON.parse(e.data);
                    this.clientId = data.clientId || this.clientId;
                    this.connectionState = ConnectionState.CONNECTED;

                    const connectionTime = Date.now() - this.connectionStartTime;
                    console.log(`SSE connected successfully in ${connectionTime}ms:`, data);

                    this.options.onConnected(this.clientId);
                } catch (error) {
                    console.error('Error parsing connected event:', error);
                }
            });

            // Handle heartbeat/ping events
            this.eventSource.addEventListener('ping', (e: MessageEvent) => {
                console.debug('SSE heartbeat received');
                this.lastEventId = e.lastEventId;
            });

            // Handle generic messages
            this.eventSource.onmessage = (e: MessageEvent) => {
                try {
                    const data = JSON.parse(e.data);
                    this.lastEventId = e.lastEventId;
                    this.handleEvent({
                        event: 'message',
                        data,
                        id: e.lastEventId,
                    });
                } catch (error) {
                    console.error('Error parsing SSE message:', error);
                }
            };

            // Handle errors
            this.eventSource.onerror = (event) => {
                console.error('SSE connection error:', {
                    readyState: this.eventSource?.readyState,
                    event,
                });

                // Only try to reconnect if not manually closed
                if (!this.isManualClose) {
                    this.handleConnectionError();
                }
            };

            // Register all custom event handlers
            this.registerEventHandlers();

        } catch (error) {
            console.error('Error creating SSE connection:', error);
            this.connectionState = ConnectionState.FAILED;
            this.options.onError(error as Error);

            if (this.options.reconnect && !this.isManualClose) {
                this.scheduleReconnect();
            }
        }
    }

    /**
     * Build connection URL with query parameters
     */
    private buildConnectionUrl(): string {
        const params = new URLSearchParams({
            clientId: this.clientId,
        });

        // Include last event ID for resumption
        if (this.lastEventId) {
            params.set('lastEventId', this.lastEventId);
        }

        return `${this.options.baseUrl}/mcp/sse?${params.toString()}`;
    }

    /**
     * Register custom event handlers with EventSource
     */
    private registerEventHandlers(): void {
        if (!this.eventSource) return;

        const standardEvents = ['message', 'open', 'error', 'connected', 'ping'];

        this.eventHandlers.forEach((handlers, eventName) => {
            if (standardEvents.includes(eventName)) return;

            this.eventSource?.addEventListener(eventName, (e: MessageEvent) => {
                try {
                    const data = JSON.parse(e.data);
                    this.lastEventId = e.lastEventId;
                    handlers.forEach(handler => handler(data));
                    this.handleEvent({
                        event: eventName,
                        data,
                        id: e.lastEventId,
                    });
                } catch (error) {
                    console.error(`Error handling SSE event ${eventName}:`, error);
                }
            });
        });
    }

    /**
     * Handle connection errors
     */
    private handleConnectionError(): void {
        this.stopHeartbeat();

        if (this.connectionState === ConnectionState.CONNECTED) {
            // Connection was established but dropped
            console.warn('SSE connection dropped, attempting reconnect...');
            this.options.onDisconnected();
        }

        const shouldReconnect =
            this.options.reconnect &&
            this.reconnectAttempts < this.options.maxReconnectAttempts;

        if (shouldReconnect) {
            this.scheduleReconnect();
        } else {
            console.error('Max reconnection attempts reached');
            this.connectionState = ConnectionState.FAILED;
            this.options.onError(new Error('Max reconnection attempts exceeded'));
        }
    }

    /**
     * Handle an SSE event
     */
    private handleEvent(event: SSEEvent): void {
        this.options.onEvent(event);

        // Call registered handlers for this event type
        const handlers = this.eventHandlers.get(event.event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(event.data);
                } catch (error) {
                    console.error(`Error in event handler for ${event.event}:`, error);
                }
            });
        }
    }

    /**
     * Register an event handler
     */
    on(eventName: string, handler: (data: any) => void): void {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, new Set());
        }
        this.eventHandlers.get(eventName)!.add(handler);

        // If already connected, register the event listener
        if (this.eventSource && this.connectionState === ConnectionState.CONNECTED) {
            this.eventSource.addEventListener(eventName, (e: MessageEvent) => {
                try {
                    const data = JSON.parse(e.data);
                    this.lastEventId = e.lastEventId;
                    handler(data);
                    this.handleEvent({
                        event: eventName,
                        data,
                        id: e.lastEventId,
                    });
                } catch (error) {
                    console.error(`Error handling SSE event ${eventName}:`, error);
                }
            });
        }
    }

    /**
     * Unregister an event handler
     */
    off(eventName: string, handler: (data: any) => void): void {
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.eventHandlers.delete(eventName);
            }
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect(): void {
        this.clearReconnectTimeout();
        this.cleanup();

        this.reconnectAttempts++;
        this.connectionState = ConnectionState.RECONNECTING;

        // Exponential backoff: 3s, 6s, 12s, 24s, etc. (capped at 30s)
        const backoff = Math.min(
            this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
            30000
        );

        console.log(
            `Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})...`
        );

        this.options.onReconnecting(this.reconnectAttempts);

        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, backoff);
    }

    /**
     * Clear reconnect timeout
     */
    private clearReconnectTimeout(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    /**
     * Start heartbeat monitoring
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();

        // Check connection health every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.eventSource && this.eventSource.readyState !== EventSource.OPEN) {
                console.warn('Heartbeat detected connection issue');
                this.handleConnectionError();
            }
        }, 30000);
    }

    /**
     * Stop heartbeat monitoring
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Clean up event source
     */
    private cleanup(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    /**
     * Disconnect from SSE endpoint
     */
    disconnect(): void {
        console.log('Manually disconnecting SSE client');
        this.isManualClose = true;
        this.connectionState = ConnectionState.DISCONNECTED;
        this.clearReconnectTimeout();
        this.stopHeartbeat();
        this.cleanup();
        this.options.onDisconnected();
        this.reconnectAttempts = 0;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return (
            this.eventSource !== null &&
            this.eventSource.readyState === EventSource.OPEN &&
            this.connectionState === ConnectionState.CONNECTED
        );
    }

    /**
     * Get client ID
     */
    getClientId(): string {
        return this.clientId;
    }

    /**
     * Get reconnection attempts
     */
    getReconnectAttempts(): number {
        return this.reconnectAttempts;
    }

    /**
     * Send a message via HTTP POST (stateless)
     */
    async sendMessage(
        method: string,
        params: any,
        options?: { signal?: AbortSignal; timeout?: number }
    ): Promise<any> {
        const timeout = options?.timeout || 60000; // 60 second default timeout
        const controller = new AbortController();
        const signal = options?.signal || controller.signal;

        // Setup timeout
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(`${this.options.baseUrl}/mcp/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Client-ID': this.clientId,
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method,
                    params: {
                        ...params,
                        clientId: this.clientId, // Include clientId for SSE routing
                    },
                    id: Date.now(),
                }),
                signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message || 'MCP error occurred');
            }

            return data.result;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Request timeout');
            }

            throw error;
        }
    }
}


