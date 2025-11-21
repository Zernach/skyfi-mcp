import { z } from 'zod';
import { skyfiClient } from '../integrations/skyfi/client';
import {
  CreateAOIParams,
  UpdateAOIParams,
  WebhookParams,
} from '../integrations/skyfi/types';
import logger from '../utils/logger';
import {
  AoiRecord,
  WebhookRecord,
  createAoiRecord,
  listAoisByUser,
  getAoiById,
  updateAoiRecord,
  deactivateAoi,
  createWebhookRecord,
  listWebhooksByUser,
  listWebhooksForAoi,
  deactivateWebhooksForAoi,
} from '../models/monitoring.repository';
import { ToolPolygonInput, toGeoJsonPolygon } from '../utils/geojson';

export interface WebhookInput {
  url: string;
  events?: string[];
  secret?: string;
  metadata?: Record<string, any>;
}

export interface CreateAoiInput {
  userId: string;
  name: string;
  description?: string;
  geometry: unknown;
  criteria?: Record<string, any>;
  schedule?: Record<string, any>;
  metadata?: Record<string, any>;
  webhook?: WebhookInput;
}

export interface UpdateAoiInput {
  name?: string;
  description?: string | null;
  geometry?: unknown;
  criteria?: Record<string, any> | null;
  schedule?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  active?: boolean;
}

export interface AoiWithWebhooks extends AoiRecord {
  webhooks: WebhookRecord[];
}

const webhookSchema = z
  .object({
    url: z.string().url(),
    events: z.array(z.string()).min(1).optional(),
    secret: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })
  .strict();

const createAoiSchema = z
  .object({
    userId: z.string().min(1, 'userId is required'),
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    geometry: z.any(),
    criteria: z.record(z.any()).optional(),
    schedule: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
    webhook: webhookSchema.optional(),
  })
  .strict();

const updateAoiSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    geometry: z.any().optional(),
    criteria: z.union([z.record(z.any()), z.null()]).optional(),
    schedule: z.union([z.record(z.any()), z.null()]).optional(),
    metadata: z.union([z.record(z.any()), z.null()]).optional(),
    active: z.boolean().optional(),
  })
  .strict();

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const DEFAULT_WEBHOOK_EVENTS = ['aoi.data.available'];

const normalizeOptionalObject = (value?: Record<string, any> | null) =>
  value ?? undefined;

class MonitoringService {
  private normalizeGeometry(geometry: unknown): CreateAOIParams['geometry'] {
    if (!geometry) {
      throw new Error('geometry is required');
    }

    if (typeof geometry === 'object' && geometry !== null) {
      const candidate = geometry as { type?: string; coordinates?: unknown };
      if (candidate.type === 'Polygon') {
        polygonSchema.parse(candidate);
        return candidate as CreateAOIParams['geometry'];
      }
    }

    const polygon = toGeoJsonPolygon(geometry as ToolPolygonInput);
    if (!polygon) {
      throw new Error('Invalid AOI polygon geometry');
    }

    polygonSchema.parse(polygon);
    return polygon;
  }

  private mapToResponse(aoi: AoiRecord, webhooks: WebhookRecord[]): AoiWithWebhooks {
    return {
      ...aoi,
      webhooks,
    };
  }

  async createAoi(input: CreateAoiInput): Promise<AoiWithWebhooks> {
    const payload = createAoiSchema.parse(input);
    const geometry = this.normalizeGeometry(payload.geometry);

    const skyfiParams: CreateAOIParams = {
      name: payload.name,
      geometry,
      description: payload.description,
      criteria: normalizeOptionalObject(payload.criteria),
      schedule: normalizeOptionalObject(payload.schedule),
      metadata: normalizeOptionalObject({
        ...(payload.metadata ?? {}),
        userId: payload.userId,
      }),
    };

    logger.info('Creating AOI via SkyFi API', { userId: payload.userId, name: payload.name });

    const skyfiAoi = await skyfiClient.createAoi(skyfiParams);

    logger.info('SkyFi AOI created', { skyfiAoiId: skyfiAoi.id, userId: payload.userId });

    let createdAoi: AoiRecord | null = null;

    try {
      createdAoi = await createAoiRecord({
        userId: payload.userId,
        name: payload.name,
        description: payload.description,
        geometry,
        criteria: payload.criteria,
        schedule: payload.schedule,
        metadata: {
          ...(payload.metadata ?? {}),
          skyfi: skyfiAoi.metadata ?? {},
        },
        skyfiAoiId: skyfiAoi.id,
        active: true,
      });
    } catch (error) {
      logger.error('Failed to persist AOI record, rolling back SkyFi AOI', {
        error: error instanceof Error ? error.message : String(error),
        skyfiAoiId: skyfiAoi.id,
      });
      await skyfiClient.deleteAoi(skyfiAoi.id).catch((deleteError) => {
        logger.warn('Failed to rollback SkyFi AOI after DB error', {
          error: deleteError instanceof Error ? deleteError.message : String(deleteError),
          skyfiAoiId: skyfiAoi.id,
        });
      });
      throw error;
    }

    let webhookRecords: WebhookRecord[] = [];

    if (payload.webhook) {
      const events =
        payload.webhook.events && payload.webhook.events.length > 0
          ? payload.webhook.events
          : DEFAULT_WEBHOOK_EVENTS;

      const webhookParams: WebhookParams = {
        url: payload.webhook.url,
        events,
        secret: payload.webhook.secret,
        metadata: {
          ...(payload.webhook.metadata ?? {}),
          aoiId: createdAoi.id,
          userId: payload.userId,
        },
      };

      logger.info('Creating SkyFi AOI webhook', {
        aoiId: createdAoi.id,
        skyfiAoiId: skyfiAoi.id,
      });

      const skyfiWebhook = await skyfiClient.createAoiWebhook(skyfiAoi.id, webhookParams);

      logger.info('SkyFi AOI webhook created', {
        skyfiWebhookId: skyfiWebhook.id,
        skyfiAoiId: skyfiAoi.id,
      });

      try {
        const createdWebhook = await createWebhookRecord({
          userId: payload.userId,
          aoiId: createdAoi.id,
          url: payload.webhook.url,
          events,
          secret: payload.webhook.secret,
          metadata: {
            ...(payload.webhook.metadata ?? {}),
            skyfiWebhookId: skyfiWebhook.id,
          },
          skyfiWebhookId: skyfiWebhook.id,
          active: true,
        });
        webhookRecords = [createdWebhook];
      } catch (error) {
        logger.error('Failed to persist webhook record, attempting SkyFi cleanup', {
          error: error instanceof Error ? error.message : String(error),
          skyfiWebhookId: skyfiWebhook.id,
        });
        await skyfiClient.deleteWebhook(skyfiWebhook.id).catch((deleteError) => {
          logger.warn('Failed to rollback SkyFi webhook after DB error', {
            error: deleteError instanceof Error ? deleteError.message : String(deleteError),
            skyfiWebhookId: skyfiWebhook.id,
          });
        });
        throw error;
      }
    }

    return this.mapToResponse(createdAoi, webhookRecords);
  }

  async listAois(userId: string): Promise<AoiWithWebhooks[]> {
    if (!userId) {
      throw new Error('userId is required');
    }

    const [aois, webhooks] = await Promise.all([
      listAoisByUser(userId),
      listWebhooksByUser(userId),
    ]);

    const webhookMap = webhooks.reduce<Record<string, WebhookRecord[]>>((acc, webhook) => {
      if (!acc[webhook.aoiId]) {
        acc[webhook.aoiId] = [];
      }
      acc[webhook.aoiId].push(webhook);
      return acc;
    }, {});

    return aois.map((aoi) => this.mapToResponse(aoi, webhookMap[aoi.id] ?? []));
  }

  async updateAoi(userId: string, aoiId: string, input: UpdateAoiInput): Promise<AoiWithWebhooks> {
    if (!userId) {
      throw new Error('userId is required');
    }

    const payload = updateAoiSchema.parse(input);
    const existing = await getAoiById(aoiId, userId);

    if (!existing) {
      throw new Error('AOI not found');
    }

    let geometry: CreateAOIParams['geometry'] | undefined;
    if (payload.geometry !== undefined) {
      geometry = this.normalizeGeometry(payload.geometry);
    }

    const updates: UpdateAOIParams = {};

    if (payload.name !== undefined) {
      updates.name = payload.name;
    }
    if (payload.description !== undefined) {
      updates.description = payload.description ?? undefined;
    }
    if (geometry) {
      updates.geometry = geometry;
    }
    if (payload.criteria !== undefined) {
      updates.criteria = normalizeOptionalObject(payload.criteria);
    }
    if (payload.schedule !== undefined) {
      updates.schedule = normalizeOptionalObject(payload.schedule);
    }
    if (payload.metadata !== undefined) {
      updates.metadata = normalizeOptionalObject(payload.metadata);
    }
    if (payload.active !== undefined) {
      updates.active = payload.active;
    }

    if (existing.skyfiAoiId) {
      logger.info('Updating AOI via SkyFi API', {
        userId,
        aoiId,
        skyfiAoiId: existing.skyfiAoiId,
      });

      await skyfiClient.updateAoi(existing.skyfiAoiId, updates);
    } else {
      logger.warn('AOI has no skyfiAoiId, skipping remote update', { aoiId, userId });
    }

    const updatedAoi = await updateAoiRecord({
      id: aoiId,
      userId,
      name: payload.name,
      description: payload.description ?? null,
      geometry,
      criteria: payload.criteria ?? null,
      schedule: payload.schedule ?? null,
      metadata: payload.metadata ?? null,
      active: payload.active,
    });

    if (!updatedAoi) {
      throw new Error('Failed to update AOI');
    }

    const webhooks = await listWebhooksForAoi(aoiId, userId);

    return this.mapToResponse(updatedAoi, webhooks);
  }

  async deleteAoi(userId: string, aoiId: string): Promise<AoiWithWebhooks> {
    const existing = await getAoiById(aoiId, userId);

    if (!existing) {
      throw new Error('AOI not found');
    }

    if (existing.skyfiAoiId) {
      logger.info('Deleting AOI via SkyFi API', {
        userId,
        aoiId,
        skyfiAoiId: existing.skyfiAoiId,
      });

      await skyfiClient.deleteAoi(existing.skyfiAoiId).catch((error) => {
        logger.warn('Failed to delete AOI via SkyFi API', {
          error: error instanceof Error ? error.message : String(error),
          skyfiAoiId: existing.skyfiAoiId,
        });
      });
    }

    const updatedAoi = await deactivateAoi(aoiId, userId);
    if (!updatedAoi) {
      throw new Error('Failed to deactivate AOI');
    }

    const deactivatedWebhooks = await deactivateWebhooksForAoi(aoiId, userId);

    return this.mapToResponse(updatedAoi, deactivatedWebhooks);
  }
}

export const monitoringService = new MonitoringService();

