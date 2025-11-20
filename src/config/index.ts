import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEV_JWT_SECRET_FALLBACK = 'dev-jwt-secret-change-in-production';

const envStringWithFallback = (fallback: string) =>
  z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      }
      return val ?? undefined;
    },
    z.string().catch(fallback),
  );

const configSchema = z.object({
  node_env: z.enum(['development', 'production', 'test']).default('development'),
  port: z.string().transform(Number).default('3000'),
  host: z.string().default('0.0.0.0'),

  postgres: z.object({
    host: z.string().default('localhost'),
    port: z.string().transform(Number).default('5432'),
    database: z.string().default('skyfi_mcp'),
    user: z.string().default('skyfi_user'),
    password: z.string(),
  }),

  redis: z.object({
    host: z.string().default('localhost'),
    port: z.string().transform(Number).default('6379'),
    password: z.string().optional(),
  }),

  skyfi: z.object({
    apiKey: z.string(),
    baseUrl: z.string().url().default('https://api.skyfi.com/v1'),
  }),

  osm: z.object({
    nominatimUrl: z.string().url().default('https://nominatim.openstreetmap.org'),
  }),

  security: z.object({
    jwtSecret: envStringWithFallback(DEV_JWT_SECRET_FALLBACK),
    apiRateLimit: z.string().transform(Number).default('100'),
  }),

  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    file: z.string().default('logs/app.log'),
  }),

  mcp: z.object({
    version: z.string().default('1.0.0'),
    timeout: z.string().transform(Number).default('30000'),
  }),
}).refine((data) => {
  // Require JWT_SECRET in production
  if (data.node_env === 'production') {
    return data.security.jwtSecret !== DEV_JWT_SECRET_FALLBACK
      && data.security.jwtSecret.length > 0;
  }
  return true;
}, {
  message: 'JWT_SECRET must be set in production environment',
  path: ['security', 'jwtSecret'],
});

const rawConfig = {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,

  postgres: {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },

  skyfi: {
    apiKey: process.env.SKYFI_API_KEY,
    baseUrl: process.env.SKYFI_BASE_URL,
  },

  osm: {
    nominatimUrl: process.env.OSM_NOMINATIM_URL,
  },

  security: {
    jwtSecret: process.env.JWT_SECRET,
    apiRateLimit: process.env.API_RATE_LIMIT,
  },

  logging: {
    level: process.env.LOG_LEVEL,
    file: process.env.LOG_FILE,
  },

  mcp: {
    version: process.env.MCP_VERSION,
    timeout: process.env.MCP_TIMEOUT,
  },
};

export const config = configSchema.parse(rawConfig);
export type Config = z.infer<typeof configSchema>;
