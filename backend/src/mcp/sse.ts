import { Response } from 'express';
import { MCPEvent } from './types';
import logger from '../utils/logger';

/**
 * SSE Connection Manager
 */
export class SSEConnection {
  private res: Response;
  private clientId: string;
  private isConnected: boolean = true;

  constructor(res: Response, clientId: string) {
    this.res = res;
    this.clientId = clientId;

    // Set SSE headers
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial comment to establish connection
    this.res.write(': connected\n\n');

    // Handle client disconnect
    this.res.on('close', () => {
      this.isConnected = false;
      logger.info(`SSE connection closed: ${this.clientId}`);
    });

    logger.info(`SSE connection established: ${this.clientId}`);
  }

  /**
   * Send an event to the client
   */
  send(event: MCPEvent): boolean {
    if (!this.isConnected) {
      logger.warn(`Cannot send SSE event - not connected`, {
        clientId: this.clientId,
        event: event.event,
      });
      return false;
    }

    try {
      let message = '';

      if (event.id) {
        message += `id: ${event.id}\n`;
      }

      message += `event: ${event.event}\n`;
      message += `data: ${JSON.stringify(event.data)}\n\n`;

      logger.info(`Sending SSE event`, {
        clientId: this.clientId,
        event: event.event,
        eventId: event.id,
        hasData: !!event.data,
      });
      
      this.res.write(message);
      logger.info(`SSE event sent successfully`, {
        clientId: this.clientId,
        event: event.event,
      });
      return true;
    } catch (error) {
      logger.error(`Error sending SSE event: ${this.clientId}`, {
        error: error instanceof Error ? error.message : String(error),
        event: event.event,
        clientId: this.clientId,
      });
      return false;
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.res.end();
      logger.info(`SSE connection terminated: ${this.clientId}`);
    }
  }

  /**
   * Check if connection is still active
   */
  isActive(): boolean {
    return this.isConnected;
  }
}

/**
 * SSE Connection Manager
 * Manages multiple SSE connections
 */
class SSEManager {
  private connections: Map<string, SSEConnection> = new Map();

  /**
   * Add a new connection
   */
  addConnection(clientId: string, connection: SSEConnection): void {
    this.connections.set(clientId, connection);
    logger.info(`SSE Manager: Added connection ${clientId}`);
  }

  /**
   * Remove a connection
   */
  removeConnection(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.close();
      this.connections.delete(clientId);
      logger.info(`SSE Manager: Removed connection ${clientId}`);
    }
  }

  /**
   * Send event to specific client
   */
  sendToClient(clientId: string, event: MCPEvent): boolean {
    const connection = this.connections.get(clientId);
    if (!connection) {
      logger.warn(`No SSE connection found for client`, {
        clientId,
        event: event.event,
        activeConnections: Array.from(this.connections.keys()),
      });
      return false;
    }
    if (!connection.isActive()) {
      logger.warn(`SSE connection not active for client`, {
        clientId,
        event: event.event,
      });
      return false;
    }
    return connection.send(event);
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: MCPEvent): number {
    let sentCount = 0;
    for (const [clientId, connection] of this.connections) {
      if (connection.isActive() && connection.send(event)) {
        sentCount++;
      } else {
        this.removeConnection(clientId);
      }
    }
    return sentCount;
  }

  /**
   * Get number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.connections.keys());
  }
}

// Singleton instance
export const sseManager = new SSEManager();
