import { Pool } from "pg";
import { requireEnv } from "@/lib/server/env";

declare global {
  // eslint-disable-next-line no-var
  var __aerisPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __aerisSchemaReady: Promise<void> | undefined;
}

function createPool() {
  return new Pool({
    connectionString: requireEnv("DATABASE_URL")
  });
}

export function getPool() {
  if (!global.__aerisPool) {
    global.__aerisPool = createPool();
  }

  return global.__aerisPool;
}

export async function ensureSchema() {
  if (!global.__aerisSchemaReady) {
    global.__aerisSchemaReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS merchants (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          store_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS stores (
          id TEXT PRIMARY KEY,
          merchant_id TEXT UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          owner_email TEXT,
          state_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('guest', 'merchant')),
          merchant_id TEXT,
          store_id TEXT,
          state_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_kind ON sessions(kind);
        CREATE INDEX IF NOT EXISTS idx_sessions_merchant_id ON sessions(merchant_id);
        CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
      `);
    })();
  }

  await global.__aerisSchemaReady;
}

