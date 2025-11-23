import { QueryResult } from 'pg';
import { query } from './database';

export interface AoiRecord {
  id: string;
  userId: string;
  name: string;
  description?: string;
  geometry: Record<string, any>;
  criteria?: Record<string, any>;
  schedule?: Record<string, any>;
  metadata?: Record<string, any>;
  skyfiAoiId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookRecord {
  id: string;
  userId: string;
  aoiId: string;
  url: string;
  events: string[];
  secret?: string;
  metadata?: Record<string, any>;
  skyfiWebhookId?: string;
  active: boolean;
  lastSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

const mapAoiRow = (row: any): AoiRecord => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  description: row.description ?? undefined,
  geometry: row.geometry ?? {},
  criteria: row.criteria ?? undefined,
  schedule: row.schedule ?? undefined,
  metadata: row.metadata ?? undefined,
  skyfiAoiId: row.skyfi_aoi_id ?? undefined,
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWebhookRow = (row: any): WebhookRecord => ({
  id: row.id,
  userId: row.user_id,
  aoiId: row.aoi_id,
  url: row.url,
  events: Array.isArray(row.events) ? row.events : [],
  secret: row.secret ?? undefined,
  metadata: row.metadata ?? undefined,
  skyfiWebhookId: row.skyfi_webhook_id ?? undefined,
  active: row.active,
  lastSentAt: row.last_sent_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface CreateAoiRecordInput {
  userId: string;
  name: string;
  description?: string;
  geometry: Record<string, any>;
  criteria?: Record<string, any>;
  schedule?: Record<string, any>;
  metadata?: Record<string, any>;
  skyfiAoiId?: string;
  active?: boolean;
}

export async function createAoiRecord(input: CreateAoiRecordInput): Promise<AoiRecord> {
  const result = await query(
    `
      INSERT INTO aois (
        user_id,
        name,
        description,
        geometry,
        criteria,
        schedule,
        metadata,
        skyfi_aoi_id,
        active
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, COALESCE($9, true))
      RETURNING *
    `,
    [
      input.userId,
      input.name,
      input.description ?? null,
      JSON.stringify(input.geometry ?? {}),
      input.criteria ? JSON.stringify(input.criteria) : null,
      input.schedule ? JSON.stringify(input.schedule) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.skyfiAoiId ?? null,
      input.active ?? true,
    ]
  );

  return mapAoiRow(result.rows[0]);
}

export async function listAoisByUser(userId: string): Promise<AoiRecord[]> {
  const result = await query(
    `
      SELECT *
      FROM aois
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map(mapAoiRow);
}

export async function getAoiById(id: string, userId: string): Promise<AoiRecord | null> {
  const result = await query(
    `
      SELECT *
      FROM aois
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [id, userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapAoiRow(result.rows[0]);
}

export interface UpdateAoiRecordInput {
  id: string;
  userId: string;
  name?: string;
  description?: string | null;
  geometry?: Record<string, any>;
  criteria?: Record<string, any> | null;
  schedule?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  skyfiAoiId?: string | null;
  active?: boolean;
}

export async function updateAoiRecord(input: UpdateAoiRecordInput): Promise<AoiRecord | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let index = 1;

  const pushField = (clause: string, value: any) => {
    fields.push(`${clause} = $${index}`);
    values.push(value);
    index += 1;
  };

  if (input.name !== undefined) {
    pushField('name', input.name);
  }

  if (input.description !== undefined) {
    pushField('description', input.description);
  }

  if (input.geometry !== undefined) {
    pushField('geometry', JSON.stringify(input.geometry));
  }

  if (input.criteria !== undefined) {
    pushField('criteria', input.criteria ? JSON.stringify(input.criteria) : null);
  }

  if (input.schedule !== undefined) {
    pushField('schedule', input.schedule ? JSON.stringify(input.schedule) : null);
  }

  if (input.metadata !== undefined) {
    pushField('metadata', input.metadata ? JSON.stringify(input.metadata) : null);
  }

  if (input.skyfiAoiId !== undefined) {
    pushField('skyfi_aoi_id', input.skyfiAoiId);
  }

  if (input.active !== undefined) {
    pushField('active', input.active);
  }

  if (fields.length === 0) {
    return getAoiById(input.id, input.userId);
  }

  values.push(input.id);
  values.push(input.userId);

  const updateQuery = `
    UPDATE aois
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $${index} AND user_id = $${index + 1}
    RETURNING *
  `;

  const result: QueryResult = await query(updateQuery, values);

  if (result.rowCount === 0) {
    return null;
  }

  return mapAoiRow(result.rows[0]);
}

export async function deactivateAoi(id: string, userId: string): Promise<AoiRecord | null> {
  const result = await query(
    `
      UPDATE aois
      SET active = false, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
    [id, userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapAoiRow(result.rows[0]);
}

export interface CreateWebhookRecordInput {
  userId: string;
  aoiId: string;
  url: string;
  events: string[];
  secret?: string;
  metadata?: Record<string, any>;
  skyfiWebhookId?: string;
  active?: boolean;
}

export async function createWebhookRecord(input: CreateWebhookRecordInput): Promise<WebhookRecord> {
  const result = await query(
    `
      INSERT INTO webhooks (
        user_id,
        aoi_id,
        url,
        events,
        secret,
        metadata,
        skyfi_webhook_id,
        active
      )
      VALUES ($1, $2, $3, $4::text[], $5, $6::jsonb, $7, COALESCE($8, true))
      RETURNING *
    `,
    [
      input.userId,
      input.aoiId,
      input.url,
      input.events,
      input.secret ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.skyfiWebhookId ?? null,
      input.active ?? true,
    ]
  );

  return mapWebhookRow(result.rows[0]);
}

export async function listWebhooksForAoi(
  aoiId: string,
  userId: string
): Promise<WebhookRecord[]> {
  const result = await query(
    `
      SELECT *
      FROM webhooks
      WHERE aoi_id = $1 AND user_id = $2
      ORDER BY created_at DESC
    `,
    [aoiId, userId]
  );

  return result.rows.map(mapWebhookRow);
}

export async function listWebhooksByUser(userId: string): Promise<WebhookRecord[]> {
  const result = await query(
    `
      SELECT *
      FROM webhooks
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map(mapWebhookRow);
}

export async function deactivateWebhooksForAoi(
  aoiId: string,
  userId: string
): Promise<WebhookRecord[]> {
  const result = await query(
    `
      UPDATE webhooks
      SET active = false, updated_at = NOW()
      WHERE aoi_id = $1 AND user_id = $2
      RETURNING *
    `,
    [aoiId, userId]
  );

  return result.rows.map(mapWebhookRow);
}

export async function updateWebhookLastSent(webhookId: string): Promise<void> {
  await query(
    `
      UPDATE webhooks
      SET last_sent_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [webhookId]
  );
}

export async function getWebhookById(webhookId: string): Promise<WebhookRecord | null> {
  const result = await query(
    `
      SELECT *
      FROM webhooks
      WHERE id = $1
    `,
    [webhookId]
  );

  return result.rows.length > 0 ? mapWebhookRow(result.rows[0]) : null;
}

export interface NotificationRecord {
  id: string;
  webhookId: string;
  status: string;
  payload: Record<string, any>;
  response: Record<string, any> | null;
  createdAt: string;
}

const mapNotificationRow = (row: any): NotificationRecord => ({
  id: row.id,
  webhookId: row.webhook_id,
  status: row.status,
  payload: row.payload ?? {},
  response: row.response ?? null,
  createdAt: row.created_at,
});

export interface CreateNotificationRecordInput {
  webhookId: string;
  status: string;
  payload: Record<string, any>;
  response: Record<string, any> | null;
}

export async function createNotificationRecord(
  input: CreateNotificationRecordInput
): Promise<NotificationRecord> {
  const result = await query(
    `
      INSERT INTO notifications (webhook_id, status, payload, response)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [input.webhookId, input.status, JSON.stringify(input.payload), input.response ? JSON.stringify(input.response) : null]
  );

  return mapNotificationRow(result.rows[0]);
}

export async function listNotifications(
  webhookId: string,
  limit = 50
): Promise<NotificationRecord[]> {
  const result = await query(
    `
      SELECT *
      FROM notifications
      WHERE webhook_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [webhookId, limit]
  );

  return result.rows.map(mapNotificationRow);
}
