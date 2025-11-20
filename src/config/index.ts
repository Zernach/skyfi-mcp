import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

const loadEnvConfig = () => {
  const triedPaths: string[] = [];

  const ensureEnvLoaded = (candidatePath: string) => {
    triedPaths.push(candidatePath);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      dotenv.config({ path: candidatePath });
      return true;
    }
    return false;
  };

  const resolveIfSet = (maybePath?: string) => {
    if (!maybePath) return undefined;
    return path.isAbsolute(maybePath)
      ? maybePath
      : path.resolve(process.cwd(), maybePath);
  };

  const envFilePriority = [
    `.env.${process.env.NODE_ENV}.local`,
    `.env.${process.env.NODE_ENV}`,
    '.env.local',
    '.env',
  ].filter((name): name is string => Boolean(name));

  const searchRoots = Array.from(
    new Set([
      resolveIfSet(process.env.DOTENV_PATH),
      process.cwd(),
      __dirname,
      path.resolve(__dirname, '..'),
      path.resolve(__dirname, '../..'),
    ].filter((root): root is string => Boolean(root))),
  );

  for (const root of searchRoots) {
    if (fs.existsSync(root) && fs.statSync(root).isFile()) {
      if (ensureEnvLoaded(root)) return;
      continue;
    }

    for (const envFileName of envFilePriority) {
      const candidate = path.isAbsolute(envFileName)
        ? envFileName
        : path.resolve(root, envFileName);
      if (ensureEnvLoaded(candidate)) {
        return;
      }
    }
  }

  // Fallback to default behaviour and capture attempted paths for easier debugging
  dotenv.config();
  if (!process.env.OPENAI_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      'Warning: OPENAI_API_KEY is not defined after loading environment configuration.',
      `Tried paths: ${triedPaths.join(', ')}`,
    );
  }
};

loadEnvConfig();

const DEV_JWT_SECRET_FALLBACK = 'dev-jwt-secret-change-in-production';

const normalizeEnvString = (val: unknown) => {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return val ?? undefined;
};

const envStringWithFallback = (fallback: string) =>
  z.preprocess(
    (val) => normalizeEnvString(val),
    z.string().catch(fallback),
  );

const optionalEnvString = () =>
  z.preprocess(
    (val) => normalizeEnvString(val),
    z.string().optional(),
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

  openai: z.object({
    apiKey: optionalEnvString(),
    model: z.string().default('gpt-4o'),
    maxTokens: z.string().transform(Number).default('4096'),
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
}).refine((data) => {
  // Require OPENAI_API_KEY in production
  if (data.node_env === 'production') {
    return data.openai.apiKey !== undefined
      && data.openai.apiKey !== null
      && data.openai.apiKey.length > 0;
  }
  return true;
}, {
  message: 'OPENAI_API_KEY must be set in production environment',
  path: ['openai', 'apiKey'],
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

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    maxTokens: process.env.OPENAI_MAX_TOKENS,
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
