import { Redis } from 'ioredis';
import { KVAdapter } from './kv-adapter';
import { R2Adapter } from './r2-adapter';
import { QueueAdapter, createQueueConnection } from './queue-adapter';
import { VectorAdapter } from './vector-adapter';
import { AIAdapter } from './ai-adapter';

export { KVAdapter } from './kv-adapter';
export { R2Adapter } from './r2-adapter';
export { QueueAdapter, createQueueConnection } from './queue-adapter';
export { VectorAdapter } from './vector-adapter';
export { AIAdapter } from './ai-adapter';

/**
 * Central adapter registry.
 * Initializes all service adapters from environment variables and provides a singleton.
 *
 * This replaces all Cloudflare Worker bindings (KV, R2, Queues, Vectorize, AI)
 * with self-hosted equivalents (Redis, MinIO, BullMQ, pgvector, OpenRouter).
 */

let _instance: Adapters | null = null;

export interface Adapters {
  redis: Redis;

  // KV Namespaces (10 total, backed by Redis with key prefixes)
  kv: {
    gmail_history_id: KVAdapter;
    gmail_processing_threads: KVAdapter;
    subscribed_accounts: KVAdapter;
    connection_labels: KVAdapter;
    prompts_storage: KVAdapter;
    gmail_sub_age: KVAdapter;
    pending_emails_status: KVAdapter;
    pending_emails_payload: KVAdapter;
    scheduled_emails: KVAdapter;
    snoozed_emails: KVAdapter;
  };

  // R2 Bucket (S3/MinIO)
  threadsBucket: R2Adapter;

  // Queues (BullMQ)
  queues: {
    thread_queue: QueueAdapter;
    subscribe_queue: QueueAdapter;
    send_email_queue: QueueAdapter;
  };

  // Vector Search (pgvector) — initialized lazily after DB is ready
  vectorize: VectorAdapter | null;
  vectorizeMessage: VectorAdapter | null;

  // AI (OpenRouter)
  ai: AIAdapter;
}

/**
 * Initialize all adapters. Call once at server startup.
 */
export function initAdapters(): Adapters {
  if (_instance) return _instance;

  // Redis connection (used by KV adapters and as pub/sub backbone)
  const redisUrl = process.env.REDIS_DIRECT_URL || 'redis://valkey:6379';
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redis.connect().catch((err) => {
    console.error('[Redis] Initial connection failed:', err.message);
  });

  // KV Adapters — each namespace gets a Redis key prefix
  const kv = {
    gmail_history_id: new KVAdapter(redis, 'kv:gmail_history_id'),
    gmail_processing_threads: new KVAdapter(redis, 'kv:gmail_processing_threads'),
    subscribed_accounts: new KVAdapter(redis, 'kv:subscribed_accounts'),
    connection_labels: new KVAdapter(redis, 'kv:connection_labels'),
    prompts_storage: new KVAdapter(redis, 'kv:prompts_storage'),
    gmail_sub_age: new KVAdapter(redis, 'kv:gmail_sub_age'),
    pending_emails_status: new KVAdapter(redis, 'kv:pending_emails_status'),
    pending_emails_payload: new KVAdapter(redis, 'kv:pending_emails_payload'),
    scheduled_emails: new KVAdapter(redis, 'kv:scheduled_emails'),
    snoozed_emails: new KVAdapter(redis, 'kv:snoozed_emails'),
  };

  // R2/MinIO Adapter
  const threadsBucket = new R2Adapter({
    endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'threads',
  });

  // Queue Adapters (BullMQ)
  const queueConnection = createQueueConnection(redisUrl);
  const queues = {
    thread_queue: new QueueAdapter('thread-queue', queueConnection),
    subscribe_queue: new QueueAdapter('subscribe-queue', queueConnection),
    send_email_queue: new QueueAdapter('send-email-queue', queueConnection),
  };

  // AI Adapter (OpenRouter for embeddings)
  const ai = new AIAdapter({
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENROUTER_API_KEY
      ? 'https://openrouter.ai/api/v1'
      : 'https://api.openai.com/v1',
    model: process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small',
  });

  // Vector adapters are initialized lazily after DB is available
  // (set via adapters.vectorize = new VectorAdapter(db) in main.ts)

  _instance = {
    redis,
    kv,
    threadsBucket,
    queues,
    vectorize: null,
    vectorizeMessage: null,
    ai,
  };

  return _instance;
}

/**
 * Get the singleton adapters instance.
 * Throws if not yet initialized.
 */
export function getAdapters(): Adapters {
  if (!_instance) {
    throw new Error('Adapters not initialized. Call initAdapters() first.');
  }
  return _instance;
}

/**
 * Gracefully shut down all adapters.
 */
export async function shutdownAdapters(): Promise<void> {
  if (!_instance) return;

  console.log('[Adapters] Shutting down...');

  await Promise.allSettled([
    _instance.redis.quit(),
    _instance.queues.thread_queue.close(),
    _instance.queues.subscribe_queue.close(),
    _instance.queues.send_email_queue.close(),
  ]);

  _instance = null;
  console.log('[Adapters] Shutdown complete.');
}
