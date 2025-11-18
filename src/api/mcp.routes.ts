import { Router, Request, Response } from 'express';
import { handleMCPRequest } from '../mcp/handler';
import { SSEConnection, sseManager } from '../mcp/sse';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /mcp/message
 * Handle MCP protocol messages
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const response = await handleMCPRequest(req.body);
    res.json(response);
  } catch (error) {
    logger.error('Error handling MCP message:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
      },
      id: null,
    });
  }
});

/**
 * GET /mcp/sse
 * Establish Server-Sent Events connection
 */
router.get('/sse', (req: Request, res: Response) => {
  // Generate unique client ID
  const clientId = req.query.clientId as string || uuidv4();

  // Get Last-Event-ID for reconnection
  const lastEventId = req.headers['last-event-id'] as string;

  logger.info('SSE connection request', { clientId, lastEventId });

  // Create SSE connection
  const connection = new SSEConnection(res, clientId);

  // Add to manager
  sseManager.addConnection(clientId, connection);

  // Send welcome event
  connection.send({
    event: 'connected',
    data: {
      clientId,
      timestamp: new Date().toISOString(),
      message: 'Connected to SkyFi MCP Server',
    },
    id: '0',
  });

  // Clean up on close
  req.on('close', () => {
    sseManager.removeConnection(clientId);
  });
});

/**
 * GET /mcp/status
 * Get MCP server status
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    connections: sseManager.getConnectionCount(),
    version: '1.0.0',
    protocol: 'MCP/JSON-RPC 2.0',
  });
});

export default router;
