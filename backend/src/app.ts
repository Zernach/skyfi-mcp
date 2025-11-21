import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import logger from './utils/logger';
import mcpRoutes from './api/mcp.routes';
import monitoringRoutes from './api/monitoring.routes';

/**
 * Create and configure Express application
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging middleware
  if (config.node_env !== 'test') {
    app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
  }

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: config.mcp.version,
    });
  });

  // MCP routes
  app.use('/mcp', mcpRoutes);

  // Monitoring routes
  app.use('/api/v1/monitoring', monitoringRoutes);

  // API routes placeholder
  app.get('/api/v1', (_req: Request, res: Response) => {
    res.json({
      message: 'SkyFi MCP API v1',
      version: config.mcp.version,
      endpoints: {
        health: '/health',
        mcp: '/mcp',
        api: '/api/v1',
      },
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist',
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: config.node_env === 'development' ? err.message : 'An error occurred',
    });
  });

  return app;
}
