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

import bcrypt from "bcryptjs";

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

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          store_id TEXT,
          action TEXT NOT NULL,
          details TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_kind ON sessions(kind);
        CREATE INDEX IF NOT EXISTS idx_sessions_merchant_id ON sessions(merchant_id);
        CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON audit_logs(store_id);
      `);

      const adminEmail = "admin@aeris.store";
      const { rows } = await pool.query("SELECT id FROM merchants WHERE LOWER(email) = LOWER($1)", [adminEmail]);
      if (rows.length === 0) {
        const hash = await bcrypt.hash("admin123", 10);
        await pool.query(
          "INSERT INTO merchants (id, email, password_hash) VALUES ($1, $2, $3)",
          ["merch_admin", adminEmail, hash]
        );
      }
    })();
  }

  await global.__aerisSchemaReady;
}

