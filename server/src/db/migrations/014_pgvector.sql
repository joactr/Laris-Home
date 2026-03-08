-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to recipes
-- 384 dimensions is standard for all-MiniLM-L6-v2
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Create HNSW index for fast similarity search
-- m=16, ef_construction=64 are good defaults for this size
CREATE INDEX IF NOT EXISTS recipes_embedding_idx ON recipes USING hnsw (embedding vector_cosine_ops);
