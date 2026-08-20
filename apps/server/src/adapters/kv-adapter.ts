import { Redis } from 'ioredis';

/**
 * Redis-backed KV adapter that mimics the Cloudflare KV Namespace API.
 * Each KV namespace becomes a Redis key prefix.
 */
export class KVAdapter {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix: string) {
    this.redis = redis;
    this.prefix = prefix;
  }

  private key(name: string): string {
    return `${this.prefix}:${name}`;
  }

  async get(name: string): Promise<string | null>;
  async get(name: string, options: { type: 'json' }): Promise<any | null>;
  async get(name: string, options?: { type?: string }): Promise<any | null> {
    const value = await this.redis.get(this.key(name));
    if (value === null) return null;
    if (options?.type === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  async put(
    name: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const k = this.key(name);

    if (options?.metadata) {
      // Store metadata alongside the value
      const metaKey = `${k}:__meta__`;
      const pipeline = this.redis.pipeline();
      if (options?.expirationTtl) {
        pipeline.set(k, stringValue, 'EX', options.expirationTtl);
        pipeline.set(metaKey, JSON.stringify(options.metadata), 'EX', options.expirationTtl);
      } else {
        pipeline.set(k, stringValue);
        pipeline.set(metaKey, JSON.stringify(options.metadata));
      }
      await pipeline.exec();
    } else if (options?.expirationTtl) {
      await this.redis.set(k, stringValue, 'EX', options.expirationTtl);
    } else {
      await this.redis.set(k, stringValue);
    }
  }

  async delete(name: string): Promise<void> {
    const k = this.key(name);
    await this.redis.del(k, `${k}:__meta__`);
  }

  async list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    keys: Array<{ name: string; metadata?: Record<string, unknown> }>;
    cursor?: string;
    list_complete: boolean;
  }> {
    const scanPrefix = options?.prefix
      ? `${this.prefix}:${options.prefix}*`
      : `${this.prefix}:*`;
    const limit = options?.limit || 1000;
    const startCursor = options?.cursor || '0';

    const [nextCursor, rawKeys] = await this.redis.scan(
      Number(startCursor),
      'MATCH',
      scanPrefix,
      'COUNT',
      limit,
    );

    // Filter out metadata keys
    const keys: Array<{ name: string; metadata?: Record<string, unknown> }> = rawKeys
      .filter((k) => !k.endsWith(':__meta__'))
      .map((k) => ({
        name: k.replace(`${this.prefix}:`, ''),
      }));

    // Fetch metadata for keys that have it
    if (keys.length > 0) {
      const metaKeys = keys.map((k) => `${this.prefix}:${k.name}:__meta__`);
      const metaValues = await this.redis.mget(...metaKeys);
      keys.forEach((key, i) => {
        if (metaValues[i]) {
          try {
            key.metadata = JSON.parse(metaValues[i]!);
          } catch {
            // ignore parse errors
          }
        }
      });
    }

    return {
      keys,
      cursor: nextCursor === '0' ? undefined : nextCursor,
      list_complete: nextCursor === '0',
    };
  }
}
