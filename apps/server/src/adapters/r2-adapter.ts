import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

/**
 * S3-compatible object storage adapter that mimics the Cloudflare R2 Bucket API.
 * Works with MinIO, AWS S3, or any S3-compatible provider.
 */
export class R2Adapter {
  private client: S3Client;
  private bucket: string;

  constructor(config: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
  }) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
    this.bucket = config.bucket;
  }

  async get(
    key: string,
  ): Promise<{
    text: () => Promise<string>;
    json: () => Promise<any>;
    arrayBuffer: () => Promise<ArrayBuffer>;
    body: ReadableStream | null;
  } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!response.Body) return null;

      // Convert the AWS SDK stream to a buffer for easy consumption
      const chunks: Uint8Array[] = [];
      const stream = response.Body as Readable;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      return {
        text: async () => buffer.toString('utf-8'),
        json: async () => JSON.parse(buffer.toString('utf-8')),
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        body: null, // Simplified — use text()/json() instead
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async put(
    key: string,
    value: string | Buffer | ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    let body: Buffer;
    if (typeof value === 'string') {
      body = Buffer.from(value, 'utf-8');
    } else if (value instanceof ArrayBuffer) {
      body = Buffer.from(value);
    } else if (Buffer.isBuffer(value)) {
      body = value;
    } else {
      // ReadableStream — collect chunks
      const chunks: Uint8Array[] = [];
      const reader = (value as ReadableStream).getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options?.httpMetadata?.contentType || 'application/octet-stream',
        Metadata: options?.customMetadata,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        size: response.ContentLength || 0,
        httpMetadata: { contentType: response.ContentType },
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    objects: Array<{ key: string; size: number }>;
    truncated: boolean;
    cursor?: string;
  }> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options?.prefix,
        MaxKeys: options?.limit || 1000,
        ContinuationToken: options?.cursor,
      }),
    );

    return {
      objects: (response.Contents || []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size || 0,
      })),
      truncated: response.IsTruncated || false,
      cursor: response.NextContinuationToken,
    };
  }
}
