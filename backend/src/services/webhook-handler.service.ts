import crypto from 'crypto';
import logger from '../utils/logger';
import { updateWebhookLastSent, createNotificationRecord } from '../models/monitoring.repository';

/**
 * SkyFi Webhook Payload Interface
 */
export interface SkyFiWebhookPayload {
  event: string;
  timestamp: string;
  orderId?: string;
  aoiId?: string;
  status?: string;
  data?: {
    downloadUrls?: string[];
    previewUrl?: string;
    metadata?: Record<string, any>;
    cloudDeliveryStatus?: string;
    imageId?: string;
    resolution?: number;
    cloudCover?: number;
    captureDate?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Webhook Handler Service
 * Processes incoming webhooks from SkyFi API
 */
class WebhookHandlerService {
  /**
   * Verify webhook signature using HMAC-SHA256
   */
  verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');
      
      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Process webhook payload
   */
  async processWebhook(
    webhookId: string,
    payload: SkyFiWebhookPayload
  ): Promise<void> {
    logger.info('Processing webhook', {
      webhookId,
      event: payload.event,
      orderId: payload.orderId,
      aoiId: payload.aoiId,
    });

    try {
      // Store notification in database
      await createNotificationRecord({
        webhookId,
        status: 'received',
        payload: payload as Record<string, any>,
        response: null,
      });

      // Update webhook last_sent_at
      await updateWebhookLastSent(webhookId);

      // Process different event types
      switch (payload.event) {
        case 'order.created':
          await this.handleOrderCreated(payload);
          break;
        case 'order.processing':
          await this.handleOrderProcessing(payload);
          break;
        case 'order.completed':
          await this.handleOrderCompleted(payload);
          break;
        case 'order.failed':
          await this.handleOrderFailed(payload);
          break;
        case 'tasking.scheduled':
          await this.handleTaskingScheduled(payload);
          break;
        case 'tasking.captured':
          await this.handleTaskingCaptured(payload);
          break;
        case 'tasking.failed':
          await this.handleTaskingFailed(payload);
          break;
        case 'imagery.available':
          await this.handleImageryAvailable(payload);
          break;
        case 'aoi.data.available':
          await this.handleAoiDataAvailable(payload);
          break;
        case 'aoi.capture.scheduled':
          await this.handleAoiCaptureScheduled(payload);
          break;
        case 'aoi.capture.completed':
          await this.handleAoiCaptureCompleted(payload);
          break;
        default:
          logger.warn('Unknown webhook event type', { event: payload.event });
      }

      logger.info('Webhook processed successfully', {
        webhookId,
        event: payload.event,
      });
    } catch (error) {
      logger.error('Error processing webhook', {
        webhookId,
        event: payload.event,
        error: error instanceof Error ? error.message : String(error),
      });

      // Store failed notification
      await createNotificationRecord({
        webhookId,
        status: 'failed',
        payload: payload as Record<string, any>,
        response: {
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * Handle order.created event
   */
  private async handleOrderCreated(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('Order created', {
      orderId: payload.orderId,
      timestamp: payload.timestamp,
    });

    // Future: Update order record in database
    // Future: Send user notification
    // Future: Trigger workflow automation
  }

  /**
   * Handle order.processing event
   */
  private async handleOrderProcessing(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('Order processing', {
      orderId: payload.orderId,
      status: payload.status,
    });

    // Future: Update order status in database
    // Future: Send user notification
  }

  /**
   * Handle order.completed event
   */
  private async handleOrderCompleted(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('Order completed', {
      orderId: payload.orderId,
      downloadUrls: payload.data?.downloadUrls,
      cloudDeliveryStatus: payload.data?.cloudDeliveryStatus,
    });

    // Future: Update order record with download URLs
    // Future: Send user notification with download links
    // Future: Trigger automatic download to cloud storage
    // Future: Update order history service
  }

  /**
   * Handle order.failed event
   */
  private async handleOrderFailed(payload: SkyFiWebhookPayload): Promise<void> {
    logger.error('Order failed', {
      orderId: payload.orderId,
      error: payload.error,
    });

    // Future: Update order record with error
    // Future: Send user notification
    // Future: Trigger refund/retry logic
  }

  /**
   * Handle tasking.scheduled event
   */
  private async handleTaskingScheduled(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('Tasking scheduled', {
      orderId: payload.orderId,
      metadata: payload.metadata,
    });

    // Future: Update tasking record with schedule
    // Future: Send user notification with capture time
  }

  /**
   * Handle tasking.captured event
   */
  private async handleTaskingCaptured(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('Tasking captured', {
      orderId: payload.orderId,
      captureDate: payload.data?.captureDate,
      cloudCover: payload.data?.cloudCover,
    });

    // Future: Update tasking record
    // Future: Send user notification
  }

  /**
   * Handle tasking.failed event
   */
  private async handleTaskingFailed(payload: SkyFiWebhookPayload): Promise<void> {
    logger.error('Tasking failed', {
      orderId: payload.orderId,
      error: payload.error,
    });

    // Future: Update tasking record with failure reason
    // Future: Send user notification
    // Future: Suggest alternative options
  }

  /**
   * Handle imagery.available event
   */
  private async handleImageryAvailable(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('Imagery available', {
      imageId: payload.data?.imageId,
      previewUrl: payload.data?.previewUrl,
      resolution: payload.data?.resolution,
      cloudCover: payload.data?.cloudCover,
    });

    // Future: Send user notification about new imagery
    // Future: Trigger automatic order if criteria met
  }

  /**
   * Handle aoi.data.available event
   */
  private async handleAoiDataAvailable(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('AOI data available', {
      aoiId: payload.aoiId,
      imageId: payload.data?.imageId,
      cloudCover: payload.data?.cloudCover,
      resolution: payload.data?.resolution,
    });

    // Future: Update AOI record with new data notification
    // Future: Send user notification
    // Future: Trigger automatic order if configured
    // Future: Check against AOI criteria (cloud cover, resolution)
  }

  /**
   * Handle aoi.capture.scheduled event
   */
  private async handleAoiCaptureScheduled(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('AOI capture scheduled', {
      aoiId: payload.aoiId,
      metadata: payload.metadata,
    });

    // Future: Update AOI record
    // Future: Send user notification with capture schedule
  }

  /**
   * Handle aoi.capture.completed event
   */
  private async handleAoiCaptureCompleted(payload: SkyFiWebhookPayload): Promise<void> {
    logger.info('AOI capture completed', {
      aoiId: payload.aoiId,
      downloadUrls: payload.data?.downloadUrls,
      cloudCover: payload.data?.cloudCover,
    });

    // Future: Update AOI record with capture result
    // Future: Send user notification with download links
    // Future: Trigger automatic download
  }

  /**
   * Format webhook payload for logging/display
   */
  formatPayloadSummary(payload: SkyFiWebhookPayload): string {
    const parts: string[] = [
      `Event: ${payload.event}`,
      `Timestamp: ${payload.timestamp}`,
    ];

    if (payload.orderId) {
      parts.push(`Order ID: ${payload.orderId}`);
    }
    if (payload.aoiId) {
      parts.push(`AOI ID: ${payload.aoiId}`);
    }
    if (payload.status) {
      parts.push(`Status: ${payload.status}`);
    }
    if (payload.data?.downloadUrls && payload.data.downloadUrls.length > 0) {
      parts.push(`Downloads: ${payload.data.downloadUrls.length} file(s)`);
    }
    if (payload.error) {
      parts.push(`Error: ${payload.error.message} (${payload.error.code})`);
    }

    return parts.join(' | ');
  }
}

export const webhookHandlerService = new WebhookHandlerService();


