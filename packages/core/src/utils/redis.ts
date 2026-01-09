/**
 * Redis Utilities
 *
 * Shared Redis connection handling using WHATWG URL API
 * to avoid url.parse() deprecation warnings.
 */

import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

// Global Redis connection singleton
let sharedRedisConnection: Redis | null = null;

/**
 * Parse Redis URL using WHATWG URL API.
 * Avoids the url.parse() deprecation warning from ioredis.
 */
export function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  useTls: boolean;
} {
  // Handle rediss:// protocol (TLS)
  const useTls = redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io');

  // Convert rediss:// to https:// for URL parsing (WHATWG URL doesn't support rediss://)
  const urlToParse = redisUrl.replace(/^rediss?:\/\//, 'https://');
  const url = new URL(urlToParse);

  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 6379,
    password: url.password || undefined,
    username: url.username || undefined,
    useTls,
  };
}

/**
 * Create a Redis connection from URL.
 */
export function createRedisConnection(redisUrl: string): Redis {
  const { host, port, password, username, useTls } = parseRedisUrl(redisUrl);

  return new Redis({
    host,
    port,
    password,
    username,
    maxRetriesPerRequest: null,
    tls: useTls ? {} : undefined,
  });
}

/**
 * Get a shared Redis connection (singleton).
 * Creates one if it doesn't exist.
 */
export function getSharedRedisConnection(): ConnectionOptions {
  if (!sharedRedisConnection) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    sharedRedisConnection = createRedisConnection(redisUrl);
  }
  return sharedRedisConnection as unknown as ConnectionOptions;
}

/**
 * Close the shared Redis connection.
 */
export async function closeSharedRedisConnection(): Promise<void> {
  if (sharedRedisConnection) {
    await sharedRedisConnection.quit();
    sharedRedisConnection = null;
  }
}
