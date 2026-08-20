CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS mail0_embeddings (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'thread',
  embedding vector(1024) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat ON mail0_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_embeddings_connection ON mail0_embeddings (connection_id);
