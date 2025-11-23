import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { webhookHandlerService, SkyFiWebhookPayload } from '../services/webhook-handler.service';
import { getWebhookById } from '../models/monitoring.repository';

const router = Router();

/**
 * POST /webhooks/receive/:webhookId
 * Receive webhook notifications from SkyFi API
 * 
 * This endpoint is called by SkyFi when events occur (order completed, new data available, etc.)
 */
router.post('/receive/:webhookId', async (req: Request, res: Response) => {
  const { webhookId } = req.params;
  const payload: SkyFiWebhookPayload = req.body;
  const signature = req.headers['x-skyfi-signature'] as string | undefined;

  logger.info('Webhook received', {
    webhookId,
    event: payload.event,
    hasSignature: !!signature,
  });

  try {
    // Validate webhook exists
    const webhook = await getWebhookById(webhookId);
    if (!webhook) {
      logger.warn('Webhook not found', { webhookId });
      res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
      return;
    }

    // Validate webhook is active
    if (!webhook.active) {
      logger.warn('Webhook is inactive', { webhookId });
      res.status(403).json({
        success: false,
        error: 'Webhook is inactive',
      });
      return;
    }

    // Verify signature if secret is configured
    if (webhook.secret && signature) {
      const payloadString = JSON.stringify(req.body);
      const isValid = webhookHandlerService.verifySignature(
        payloadString,
        signature,
        webhook.secret
      );

      if (!isValid) {
        logger.error('Webhook signature verification failed', { webhookId });
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
        return;
      }

      logger.info('Webhook signature verified', { webhookId });
    } else if (webhook.secret && !signature) {
      logger.warn('Webhook secret configured but no signature provided', { webhookId });
      res.status(401).json({
        success: false,
        error: 'Signature required',
      });
      return;
    }

    // Process webhook payload
    await webhookHandlerService.processWebhook(webhookId, payload);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      webhookId,
      event: payload.event,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error processing webhook', {
      webhookId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /webhooks/test/:webhookId
 * Test webhook endpoint (for manual testing)
 */
router.get('/test/:webhookId', async (req: Request, res: Response) => {
  const { webhookId } = req.params;

  try {
    const webhook = await getWebhookById(webhookId);
    if (!webhook) {
      res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
      return;
    }

    // Send test payload
    const testPayload: SkyFiWebhookPayload = {
      event: 'test.notification',
      timestamp: new Date().toISOString(),
      metadata: {
        message: 'This is a test webhook notification',
        webhookId,
      },
    };

    await webhookHandlerService.processWebhook(webhookId, testPayload);

    res.status(200).json({
      success: true,
      message: 'Test webhook sent successfully',
      webhookId,
      payload: testPayload,
    });
  } catch (error) {
    logger.error('Error sending test webhook', {
      webhookId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to send test webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /webhooks/skyfi
 * Generic SkyFi webhook receiver (legacy endpoint for backward compatibility)
 * 
 * This endpoint can handle webhooks without a specific webhook ID
 * Useful for initial setup and testing
 */
router.post('/skyfi', async (req: Request, res: Response) => {
  const payload: SkyFiWebhookPayload = req.body;

  logger.info('Generic SkyFi webhook received', {
    event: payload.event,
    orderId: payload.orderId,
    aoiId: payload.aoiId,
  });

  try {
    // Log the webhook for monitoring
    const summary = webhookHandlerService.formatPayloadSummary(payload);
    logger.info('Webhook payload summary', { summary });

    // In a production environment, you'd want to:
    // 1. Look up the webhook based on orderId or aoiId
    // 2. Verify signature
    // 3. Process the webhook

    // For now, just acknowledge receipt
    res.status(200).json({
      success: true,
      message: 'Webhook received',
      event: payload.event,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error processing generic webhook', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /webhooks/health
 * Webhook system health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'webhook-receiver',
    timestamp: new Date().toISOString(),
  });
});

export default router;

