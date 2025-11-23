import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { handleMCPRequest, handleMCPRequestWithStreaming } from '../mcp/handler';
import { SSEConnection, sseManager } from '../mcp/sse';
import { searchSessionService } from '../services/search-session.service';
import { orderHistoryService } from '../services/order-history.service';
import { sessionHistoryManager } from '../services/session-history-manager.service';
import logger from '../utils/logger';
// Ensure router module is loaded and methods are registered
import '../mcp/router';

const router = Router();

/**
 * POST /mcp/message
 * Handle MCP protocol messages (stateless)
 * Supports both synchronous and SSE-based streaming responses
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const clientId = req.headers['x-client-id'] as string || req.body.params?.clientId;
    const useStreaming = req.body.params?.streaming === true;

    // If streaming is enabled and client ID provided, send updates via SSE
    if (useStreaming && clientId) {
      logger.info('Processing streaming request', {
        clientId,
        method: req.body.method,
        requestId: req.body.id,
        messageLength: req.body.params?.message?.length,
      });

      // Send immediate acknowledgment
      res.json({
        jsonrpc: '2.0',
        result: {
          acknowledged: true,
          clientId,
          streaming: true,
          message: 'Request received, updates will be sent via SSE',
        },
        id: req.body.id,
      });

      // Process request and send updates via SSE (non-blocking)
      handleMCPRequestWithStreaming(req.body, clientId).catch(error => {
        logger.error('Error in streaming handler:', error);
        sseManager.sendToClient(clientId, {
          event: 'error',
          data: {
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          },
        });
      });
    } else {
      // Traditional synchronous response
      const response = await handleMCPRequest(req.body);
      res.json(response);
    }
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
  const clientId = (req.query.clientId as string) || randomUUID();

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

/**
 * GET /mcp/sessions/search/:conversationId
 * Get search session history for a conversation
 */
router.get('/sessions/search/:conversationId', (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const sessions = searchSessionService.getConversationSessions(conversationId);

    res.json({
      success: true,
      conversationId,
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    logger.error('Error fetching search sessions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch search sessions',
    });
  }
});

/**
 * GET /mcp/sessions/search/:conversationId/:sessionId
 * Get detailed search session information
 */
router.get('/sessions/search/:conversationId/:sessionId', (req: Request, res: Response): void => {
  try {
    const { sessionId } = req.params;
    const session = searchSessionService.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Search session not found',
      });
      return;
    }

    const allResults = searchSessionService.getAllSessionResults(sessionId);

    res.json({
      success: true,
      sessionId,
      criteria: session.criteria,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      pages: session.pages.length,
      totalResults: allResults.length,
      results: allResults,
      history: session.history,
    });
  } catch (error) {
    logger.error('Error fetching search session details:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch search session',
    });
  }
});

/**
 * GET /mcp/sessions/orders/:conversationId
 * Get order session history for a conversation
 */
router.get('/sessions/orders/:conversationId', (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const sessions = orderHistoryService.getConversationSessions(conversationId);

    res.json({
      success: true,
      conversationId,
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    logger.error('Error fetching order sessions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch order sessions',
    });
  }
});

/**
 * GET /mcp/sessions/orders/:conversationId/:sessionId
 * Get detailed order session information
 */
router.get('/sessions/orders/:conversationId/:sessionId', (req: Request, res: Response): void => {
  try {
    const { sessionId } = req.params;
    const session = orderHistoryService.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Order session not found',
      });
      return;
    }

    const allOrders = orderHistoryService.getAllSessionOrders(sessionId);

    res.json({
      success: true,
      sessionId,
      filters: session.filters,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      pages: session.pages.length,
      totalOrders: allOrders.length,
      uniqueOrders: session.orderIds.size,
      orders: allOrders,
      history: session.history,
    });
  } catch (error) {
    logger.error('Error fetching order session details:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch order session',
    });
  }
});

/**
 * GET /mcp/recommendations/:conversationId
 * Get intelligent recommendations based on session history
 */
router.get('/recommendations/:conversationId', (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const currentCriteria = req.query.criteria ? JSON.parse(req.query.criteria as string) : undefined;
    
    const recommendations = sessionHistoryManager.getRecommendations(conversationId, currentCriteria);
    
    res.json({
      success: true,
      conversationId,
      recommendations,
      total: recommendations.length,
    });
  } catch (error) {
    logger.error('Error fetching recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch recommendations',
    });
  }
});

/**
 * GET /mcp/analytics/:conversationId
 * Get comprehensive analytics for a conversation
 */
router.get('/analytics/:conversationId', (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const analytics = sessionHistoryManager.getAnalytics(conversationId);
    const recentPatterns = sessionHistoryManager.getRecentPatterns(conversationId, 10);
    
    res.json({
      success: true,
      conversationId,
      analytics,
      recentPatterns,
    });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch analytics',
    });
  }
});

/**
 * GET /mcp/patterns/:conversationId
 * Get recent search patterns for a conversation
 */
router.get('/patterns/:conversationId', (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const patterns = sessionHistoryManager.getRecentPatterns(conversationId, limit);
    
    res.json({
      success: true,
      conversationId,
      patterns,
      total: patterns.length,
    });
  } catch (error) {
    logger.error('Error fetching patterns:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch patterns',
    });
  }
});

/**
 * POST /mcp/sessions/compare
 * Compare two search sessions to find differences and opportunities
 */
router.post('/sessions/compare', (req: Request, res: Response): void => {
  try {
    const { conversationId, sessionId1, sessionId2 } = req.body;
    
    if (!conversationId || !sessionId1 || !sessionId2) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters: conversationId, sessionId1, sessionId2',
      });
      return;
    }

    const session1 = searchSessionService.getSession(sessionId1);
    const session2 = searchSessionService.getSession(sessionId2);

    if (!session1 || !session2) {
      res.status(404).json({
        success: false,
        error: 'One or both sessions not found',
      });
      return;
    }

    // Compare criteria
    const differences: Array<{ field: string; session1: any; session2: any }> = [];
    const allKeys = new Set([
      ...Object.keys(session1.criteria),
      ...Object.keys(session2.criteria),
    ]);

    for (const key of allKeys) {
      const val1 = (session1.criteria as any)[key];
      const val2 = (session2.criteria as any)[key];
      
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        differences.push({
          field: key,
          session1: val1,
          session2: val2,
        });
      }
    }

    // Generate recommendations based on differences
    const recommendations = [];
    
    // If one session had more results, recommend its criteria
    const results1 = searchSessionService.getAllSessionResults(sessionId1);
    const results2 = searchSessionService.getAllSessionResults(sessionId2);
    
    if (results1.length > results2.length) {
      recommendations.push({
        type: 'use_better_criteria',
        title: 'Use Session 1 Criteria',
        description: `Session 1 found ${results1.length} results vs ${results2.length} in Session 2`,
        action: {
          tool: 'search_satellite_imagery',
          params: session1.criteria,
        },
        confidence: 0.8,
      });
    } else if (results2.length > results1.length) {
      recommendations.push({
        type: 'use_better_criteria',
        title: 'Use Session 2 Criteria',
        description: `Session 2 found ${results2.length} results vs ${results1.length} in Session 1`,
        action: {
          tool: 'search_satellite_imagery',
          params: session2.criteria,
        },
        confidence: 0.8,
      });
    }

    res.json({
      success: true,
      comparison: {
        session1: {
          sessionId: sessionId1,
          criteria: session1.criteria,
          resultCount: results1.length,
          createdAt: new Date(session1.createdAt).toISOString(),
        },
        session2: {
          sessionId: sessionId2,
          criteria: session2.criteria,
          resultCount: results2.length,
          createdAt: new Date(session2.createdAt).toISOString(),
        },
        differences,
        recommendations,
      },
    });
  } catch (error) {
    logger.error('Error comparing sessions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compare sessions',
    });
  }
});

/**
 * GET /mcp/export/:conversationId
 * Export complete session history for a conversation
 */
router.get('/export/:conversationId', (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    
    const searchSessions = searchSessionService.getConversationSessions(conversationId);
    const orderSessions = orderHistoryService.getConversationSessions(conversationId);
    const historyExport = sessionHistoryManager.exportHistory(conversationId);
    
    const exportData = {
      conversationId,
      exportedAt: new Date().toISOString(),
      searchSessions: searchSessions.map(s => ({
        ...s,
        results: searchSessionService.getAllSessionResults(s.sessionId),
      })),
      orderSessions: orderSessions.map(s => ({
        ...s,
        orders: orderHistoryService.getAllSessionOrders(s.sessionId),
      })),
      patterns: historyExport.patterns,
      analytics: historyExport.analytics,
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="skyfi-session-${conversationId}-${Date.now()}.json"`);
    
    res.json(exportData);
  } catch (error) {
    logger.error('Error exporting session history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export session history',
    });
  }
});

export default router;
