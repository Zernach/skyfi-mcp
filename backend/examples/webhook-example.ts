/**
 * SkyFi MCP Webhook Integration Example
 * 
 * This example demonstrates how to:
 * 1. Set up AOI monitoring with webhooks
 * 2. Handle webhook notifications
 * 3. Process different event types
 */

import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Configuration
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-secret-key-here';
const PORT = process.env.PORT || 4000;

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Webhook receiver endpoint
 */
app.post('/webhook', (req, res) => {
  const payload = req.body;
  const signature = req.headers['x-skyfi-signature'] as string;

  console.log('📬 Webhook received:', {
    event: payload.event,
    timestamp: payload.timestamp,
    orderId: payload.orderId,
    aoiId: payload.aoiId,
  });

  // Verify signature
  if (signature) {
    const payloadString = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(payloadString, signature, WEBHOOK_SECRET);
    
    if (!isValid) {
      console.error('❌ Signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    console.log('✅ Signature verified');
  }

  // Process different event types
  switch (payload.event) {
    case 'order.completed':
      handleOrderCompleted(payload);
      break;
    case 'order.failed':
      handleOrderFailed(payload);
      break;
    case 'aoi.data.available':
      handleAoiDataAvailable(payload);
      break;
    case 'aoi.capture.completed':
      handleAoiCaptureCompleted(payload);
      break;
    case 'tasking.captured':
      handleTaskingCaptured(payload);
      break;
    default:
      console.log('ℹ️  Unhandled event type:', payload.event);
  }

  // Always return 200 OK quickly
  res.status(200).json({
    success: true,
    message: 'Webhook processed',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Handle order.completed event
 */
function handleOrderCompleted(payload: any) {
  console.log('✅ Order completed:', {
    orderId: payload.orderId,
    downloadUrls: payload.data?.downloadUrls,
    cloudCover: payload.data?.metadata?.cloudCover,
    resolution: payload.data?.metadata?.resolution,
  });

  // Example actions:
  // - Send email notification
  // - Download imagery
  // - Update database
  // - Trigger analysis pipeline
  // - Update user dashboard
}

/**
 * Handle order.failed event
 */
function handleOrderFailed(payload: any) {
  console.error('❌ Order failed:', {
    orderId: payload.orderId,
    error: payload.error?.message,
    code: payload.error?.code,
  });

  // Example actions:
  // - Send failure notification
  // - Log error
  // - Attempt retry
  // - Refund user
}

/**
 * Handle aoi.data.available event
 */
function handleAoiDataAvailable(payload: any) {
  console.log('🌍 New data available for AOI:', {
    aoiId: payload.aoiId,
    imageId: payload.data?.imageId,
    cloudCover: payload.data?.cloudCover,
    resolution: payload.data?.resolution,
    captureDate: payload.data?.captureDate,
  });

  // Example actions:
  // - Check if data meets criteria
  // - Automatically place order
  // - Send notification to user
  // - Update monitoring dashboard
}

/**
 * Handle aoi.capture.completed event
 */
function handleAoiCaptureCompleted(payload: any) {
  console.log('📸 AOI capture completed:', {
    aoiId: payload.aoiId,
    downloadUrls: payload.data?.downloadUrls,
    cloudCover: payload.data?.cloudCover,
  });

  // Example actions:
  // - Download imagery
  // - Run analysis
  // - Update monitoring records
  // - Send results to user
}

/**
 * Handle tasking.captured event
 */
function handleTaskingCaptured(payload: any) {
  console.log('🛰️ Tasking captured:', {
    orderId: payload.orderId,
    captureDate: payload.data?.captureDate,
    cloudCover: payload.data?.cloudCover,
  });

  // Example actions:
  // - Notify user of successful capture
  // - Update order status
  // - Wait for processing completion
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webhook-receiver',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   SkyFi Webhook Receiver                                       ║
║                                                                ║
║   Listening on http://localhost:${PORT}                           ║
║                                                                ║
║   Endpoints:                                                   ║
║   - POST /webhook       - Receive webhook notifications        ║
║   - GET  /health        - Health check                         ║
║                                                                ║
║   Use this URL for webhooks:                                   ║
║   https://your-domain.com/webhook                              ║
║                                                                ║
║   For local testing with ngrok:                                ║
║   ngrok http ${PORT}                                              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

/**
 * Example: Creating AOI with Webhook
 * 
 * Use the SkyFi MCP API to create an AOI with webhook:
 */

// Example TypeScript/JavaScript code:
export const createAoiWithWebhookExample = async () => {
  const response = await fetch('http://localhost:3000/api/v1/monitoring/aois', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: 'user-123',
      name: 'San Francisco Bay Area',
      description: 'Monitoring for infrastructure changes',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.5, 37.7],
          [-122.5, 37.9],
          [-122.3, 37.9],
          [-122.3, 37.7],
          [-122.5, 37.7]
        ]]
      },
      criteria: {
        maxCloudCover: 20,
        minResolution: 5
      },
      schedule: {
        frequency: 'weekly',
        startDate: new Date().toISOString()
      },
      webhook: {
        url: `http://localhost:${PORT}/webhook`,
        events: [
          'aoi.data.available',
          'aoi.capture.completed'
        ],
        secret: WEBHOOK_SECRET,
        metadata: {
          environment: 'development',
          userId: 'user-123'
        }
      }
    })
  });

  const aoi = await response.json();
  console.log('AOI created:', aoi);
  return aoi;
};

/**
 * Example: Testing Webhook
 * 
 * Send a test webhook to your endpoint:
 */

// cURL command:
/*
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -H "X-SkyFi-Signature: test-signature" \
  -d '{
    "event": "aoi.data.available",
    "timestamp": "2025-11-23T10:00:00Z",
    "aoiId": "aoi-123",
    "data": {
      "imageId": "img-456",
      "resolution": 3.0,
      "cloudCover": 12.5,
      "captureDate": "2025-11-23T08:00:00Z"
    }
  }'
*/

export default app;


