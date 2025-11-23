/**
 * Global SSE Manager
 * Singleton for managing SSE connections across the application
 */

import { SSEClient, SSEClientOptions } from './sse-client';
import { BASE_URL } from '../constants/config';

class SSEManager {
  private client: SSEClient | null = null;
  private connectionPromise: Promise<SSEClient> | null = null;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  /**
   * Get or create SSE client
   */
  async getClient(): Promise<SSEClient> {
    // Return existing connected client
    if (this.client && this.client.isConnected()) {
      return this.client;
    }

    // Return existing connection promise to prevent duplicate connections
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Prevent concurrent connection attempts
    if (this.isConnecting) {
      // Wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getClient();
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      const options: SSEClientOptions = {
        baseUrl: BASE_URL,
        reconnect: true,
        reconnectInterval: Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000), // Exponential backoff, max 30s
        onConnected: (clientId) => {
          console.log('[SSEManager] Connected with client ID:', clientId);
          this.isConnecting = false;
          this.reconnectAttempts = 0; // Reset on successful connection
          this.connectionPromise = null;
          resolve(this.client!);
        },
        onDisconnected: () => {
          console.log('[SSEManager] Disconnected');
          this.isConnecting = false;
          // Don't clear connectionPromise here - let reconnect logic handle it
        },
        onError: (error) => {
          console.error('[SSEManager] Error:', error);
          this.isConnecting = false;

          // Only reject if we've exceeded max reconnect attempts
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.connectionPromise = null;
            this.reconnectAttempts = 0;
            reject(new Error(`SSE connection failed after ${this.maxReconnectAttempts} attempts`));
          } else {
            // Let the reconnect logic handle it
            this.reconnectAttempts++;
            this.connectionPromise = null;
          }
        },
        onEvent: (event) => {
          console.log('[SSEManager] Event:', event);
        },
      };

      this.client = new SSEClient(options);
      this.client.connect();

      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.connectionPromise && this.isConnecting) {
          this.isConnecting = false;
          this.connectionPromise = null;
          if (this.client) {
            this.client.disconnect();
            this.client = null;
          }
          reject(new Error('SSE connection timeout'));
        }
      }, 15000);
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect SSE client
   */
  disconnect(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
    this.connectionPromise = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null && this.client.isConnected();
  }

  /**
   * Reset connection state (useful for recovery)
   */
  reset(): void {
    this.disconnect();
    this.reconnectAttempts = 0;
  }

  /**
   * Get current client (may be null)
   */
  getCurrentClient(): SSEClient | null {
    return this.client;
  }
}

// Export singleton instance
export const sseManager = new SSEManager();


