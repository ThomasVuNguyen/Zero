import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';

/**
 * BullMQ-backed queue adapter that mimics the Cloudflare Queues API.
 * Each Cloudflare Queue becomes a BullMQ Queue.
 */
export class QueueAdapter<T = unknown> {
  private queue: Queue<T>;
  private queueName: string;
  private connection: ConnectionOptions;

  constructor(queueName: string, connection: ConnectionOptions) {
    this.queueName = queueName;
    this.connection = connection;
    this.queue = new Queue<T>(queueName, { connection });
  }

  /**
   * Send a message to the queue.
   * Matches the Cloudflare Queue.send() API.
   */
  async send(body: T, options?: { delaySeconds?: number; contentType?: string }): Promise<void> {
    await this.queue.add(this.queueName as any, body as any, {
      delay: options?.delaySeconds ? options.delaySeconds * 1000 : undefined,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
  }

  /**
   * Send multiple messages to the queue.
   * Matches the Cloudflare Queue.sendBatch() API.
   */
  async sendBatch(
    messages: Array<{ body: T; delaySeconds?: number }>,
  ): Promise<void> {
    const jobs = messages.map((msg) => ({
      name: this.queueName,
      data: msg.body,
      opts: {
        delay: msg.delaySeconds ? msg.delaySeconds * 1000 : undefined,
        removeOnComplete: { count: 1000 } as const,
        removeOnFail: { count: 5000 } as const,
      },
    }));
    await this.queue.addBulk(jobs as any);
  }

  /**
   * Register a consumer/worker for this queue.
   * This replaces the Cloudflare Worker's queue() handler.
   */
  registerConsumer(
    handler: (messages: Array<{ body: T; id: string }>) => Promise<void>,
    options?: { batchSize?: number; concurrency?: number },
  ): Worker<T> {
    const batchSize = options?.batchSize || 10;

    const worker = new Worker<T>(
      this.queueName,
      async (job: Job<T>) => {
        // Process individual jobs but wrap in batch format for compatibility
        await handler([{ body: job.data, id: job.id || '' }]);
      },
      {
        connection: this.connection,
        concurrency: options?.concurrency || 3,
        limiter: {
          max: batchSize,
          duration: 1000,
        },
      },
    );

    worker.on('failed', (job, err) => {
      console.error(`[Queue:${this.queueName}] Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
      console.error(`[Queue:${this.queueName}] Worker error:`, err.message);
    });

    return worker;
  }

  /**
   * Get the underlying BullMQ Queue for advanced operations.
   */
  getQueue(): Queue<T> {
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

/**
 * Create the Redis connection options for BullMQ from environment.
 */
export function createQueueConnection(redisUrl?: string): ConnectionOptions {
  if (!redisUrl) {
    return { host: 'localhost', port: 6379 };
  }

  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      password: url.password || undefined,
      username: url.username || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}
