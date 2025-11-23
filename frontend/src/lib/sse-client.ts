/**
 * SSE (Server-Sent Events) Client
 * Handles stateless HTTP + SSE communication with the backend
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
  onConnected?: (clientId: string) => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onEvent?: (event: SSEEvent) => void;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private clientId: string;
  private options: Required<SSEClientOptions>;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isManualClose: boolean = false;
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();

  constructor(options: SSEClientOptions) {
    this.clientId = options.clientId || this.generateClientId();
    this.options = {
      baseUrl: options.baseUrl,
      clientId: this.clientId,
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      onConnected: options.onConnected || (() => {}),
      onDisconnected: options.onDisconnected || (() => {}),
      onError: options.onError || (() => {}),
      onEvent: options.onEvent || (() => {}),
    };
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      console.warn('SSE client already connected');
      return;
    }

    this.isManualClose = false;
    const url = `${this.options.baseUrl}/mcp/sse?clientId=${this.clientId}`;

    try {
      this.eventSource = new EventSource(url);

      // Handle connection open
      this.eventSource.onopen = () => {
        console.log('SSE connection established');
        this.clearReconnectTimeout();
      };

      // Handle 'connected' event
      this.eventSource.addEventListener('connected', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        this.clientId = data.clientId || this.clientId;
        console.log('[SSEClient] SSE connected event received:', data);
        this.options.onConnected(this.clientId);
      });

      // Handle generic messages
      this.eventSource.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[SSEClient] SSE message received:', { event: 'message', data, lastEventId: e.lastEventId });
          this.handleEvent({
            event: 'message',
            data,
            id: e.lastEventId,
          });
        } catch (error) {
          console.error('[SSEClient] Error parsing SSE message:', error);
        }
      };

      // Handle errors
      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.options.onError(new Error('SSE connection error'));

        if (!this.isManualClose && this.options.reconnect) {
          this.scheduleReconnect();
        }
      };

      // Register all custom event handlers
      this.eventHandlers.forEach((handlers, eventName) => {
        this.eventSource?.addEventListener(eventName, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            console.log(`[SSEClient] SSE event received: ${eventName}`, { data, lastEventId: e.lastEventId });
            handlers.forEach(handler => handler(data));
            this.handleEvent({
              event: eventName,
              data,
              id: e.lastEventId,
            });
          } catch (error) {
            console.error(`[SSEClient] Error handling SSE event ${eventName}:`, error);
          }
        });
      });

    } catch (error) {
      console.error('Error creating SSE connection:', error);
      this.options.onError(error as Error);
      if (this.options.reconnect) {
        this.scheduleReconnect();
      }
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
      handlers.forEach(handler => handler(event.data));
    }
  }

  /**
   * Register an event handler (prevents duplicate registrations)
   */
  on(eventName: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    // Check if handler already registered
    const handlers = this.eventHandlers.get(eventName)!;
    if (handlers.has(handler)) {
      console.warn(`Handler already registered for event: ${eventName}`);
      return;
    }
    
    handlers.add(handler);

    // If already connected, register the event listener
    if (this.eventSource) {
      // Check if listener already exists to prevent duplicates
      const listenerKey = `__sse_listener_${eventName}`;
      if ((this.eventSource as any)[listenerKey]) {
        return; // Already registered
      }
      
      const eventListener = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          console.log(`[SSEClient] Event listener called for ${eventName}`, { data, lastEventId: e.lastEventId });
          handler(data);
          this.handleEvent({
            event: eventName,
            data,
            id: e.lastEventId,
          });
        } catch (error) {
          console.error(`[SSEClient] Error handling SSE event ${eventName}:`, error);
        }
      };
      
      this.eventSource.addEventListener(eventName, eventListener);
      (this.eventSource as any)[listenerKey] = eventListener;
      console.log(`[SSEClient] Registered event listener for ${eventName}`);
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
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimeout();
    this.cleanup();

    console.log(`Reconnecting in ${this.options.reconnectInterval}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.options.reconnectInterval);
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
    this.isManualClose = true;
    this.clearReconnectTimeout();
    this.cleanup();
    this.options.onDisconnected();
    console.log('SSE connection closed');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Send a message via HTTP POST (stateless)
   */
  async sendMessage(method: string, params: any, options?: { signal?: AbortSignal; requestId?: string | number }): Promise<any> {
    const requestId = options?.requestId ?? Date.now();
    console.log('[SSEClient] Sending message', {
      method,
      requestId,
      clientId: this.clientId,
      params: { ...params, message: params.message?.substring(0, 50) + '...' },
    });
    
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
        id: requestId,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      console.error('[SSEClient] HTTP error', { status: response.status, requestId });
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[SSEClient] Response received', { requestId, hasError: !!data.error, hasResult: !!data.result });

    if (data.error) {
      console.error('[SSEClient] MCP error', { requestId, error: data.error });
      throw new Error(data.error.message || 'MCP error occurred');
    }

    return data.result;
  }
}


