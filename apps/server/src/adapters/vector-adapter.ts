import type { DB } from '../db';
import { sql } from 'drizzle-orm';

/**
 * pgvector-backed vector search adapter that mimics the Cloudflare Vectorize API.
 * Uses PostgreSQL with the pgvector extension for similarity search.
 */
export class VectorAdapter {
  private db: DB;
  private tableName: string;

  constructor(db: DB, tableName: string = 'mail0_embeddings') {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Update the database reference (needed when db is lazily initialized).
   */
  setDb(db: DB): void {
    this.db = db;
  }

  /**
   * Query for similar vectors.
   * Matches the Cloudflare Vectorize.query() API.
   */
  async query(
    vector: number[],
    options?: {
      topK?: number;
      filter?: Record<string, string>;
      returnValues?: boolean;
      returnMetadata?: 'all' | 'indexed' | 'none';
    },
  ): Promise<{
    matches: Array<{
      id: string;
      score: number;
      values?: number[];
      metadata?: Record<string, unknown>;
    }>;
    count: number;
  }> {
    const topK = options?.topK || 10;
    const vectorStr = `[${vector.join(',')}]`;

    const selectValues = options?.returnValues ? sql.raw(', embedding') : sql``;
    const selectMetadata =
      options?.returnMetadata !== 'none' ? sql.raw(', metadata') : sql``;

    const filterClause = options?.filter
      ? sql.join(
          Object.entries(options.filter).map(
            ([key, value]) => sql` AND metadata->>${key} = ${value}`
          ),
          sql``
        )
      : sql``;

    const result = await this.db.execute(sql`
      SELECT 
        id, 
        1 - (embedding <=> ${vectorStr}::vector) as score
        ${selectValues}
        ${selectMetadata}
      FROM ${sql.raw(this.tableName)}
      WHERE 1=1 ${filterClause}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `);

    const rows = (result as any).rows || result || [];
    const matches = rows.map((row: any) => ({
      id: row.id,
      score: parseFloat(row.score),
      ...(options?.returnValues && row.embedding
        ? { values: JSON.parse(row.embedding) }
        : {}),
      ...(options?.returnMetadata !== 'none' && row.metadata
        ? { metadata: row.metadata }
        : {}),
    }));

    return { matches, count: matches.length };
  }

  /**
   * Insert or update vectors.
   * Matches the Cloudflare Vectorize.upsert() API.
   */
  async upsert(
    vectors: Array<{
      id: string;
      values: number[];
      metadata?: Record<string, unknown>;
      namespace?: string;
    }>,
  ): Promise<{ count: number }> {
    if (vectors.length === 0) return { count: 0 };

    let count = 0;
    for (const vec of vectors) {
      const vectorStr = `[${vec.values.join(',')}]`;
      const metadata = vec.metadata || {};
      if (vec.namespace) {
        metadata._namespace = vec.namespace;
      }

      await this.db.execute(sql`
        INSERT INTO mail0_embeddings (id, connection_id, content_type, embedding, metadata, created_at, updated_at)
        VALUES (
          ${vec.id},
          ${(metadata as any).connectionId || ''},
          ${(metadata as any).contentType || 'thread'},
          ${sql.raw(`'${vectorStr}'::vector`)},
          ${JSON.stringify(metadata)}::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          embedding = ${sql.raw(`'${vectorStr}'::vector`)},
          metadata = ${JSON.stringify(metadata)}::jsonb,
          updated_at = NOW()
      `);
      count++;
    }

    return { count };
  }

  /**
   * Delete vectors by ID.
   * Matches the Cloudflare Vectorize.deleteByIds() API.
   */
  async deleteByIds(ids: string[]): Promise<{ count: number }> {
    if (ids.length === 0) return { count: 0 };

    const result = await this.db.execute(sql`
      DELETE FROM mail0_embeddings WHERE id = ANY(${ids}::text[])
    `);

    return { count: (result as any).rowCount || ids.length };
  }

  /**
   * Get vectors by ID.
   */
  async getByIds(
    ids: string[],
  ): Promise<
    Array<{
      id: string;
      values: number[];
      metadata?: Record<string, unknown>;
    }>
  > {
    if (ids.length === 0) return [];

    const result = await this.db.execute(sql`
      SELECT id, embedding, metadata
      FROM mail0_embeddings
      WHERE id = ANY(${ids}::text[])
    `);

    const rows = (result as any).rows || result || [];
    return rows.map((row: any) => ({
      id: row.id,
      values: JSON.parse(row.embedding),
      metadata: row.metadata,
    }));
  }
}
