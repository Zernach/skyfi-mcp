import { createApp } from './app';
import { config } from './config';
import logger from './utils/logger';

/**
 * Start the server
 */
async function startServer() {
  try {
    const app = createApp();

    const server = app.listen(config.port, () => {
      logger.info(`🚀 SkyFi MCP Server started`);
      logger.info(`📍 Environment: ${config.node_env}`);
      logger.info(`🌐 Server running on http://${config.host}:${config.port}`);
      logger.info(`💚 Health check: http://${config.host}:${config.port}/health`);
      logger.info(`📡 MCP Version: ${config.mcp.version}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
