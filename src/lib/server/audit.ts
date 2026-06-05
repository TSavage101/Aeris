import { ensureSchema, getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export async function logAuditEvent(storeId: string | null, action: string, details: string) {
  try {
    await ensureSchema();
    const pool = getPool();
    const id = `audit_${randomUUID().replace(/-/g, "")}`;
    await pool.query(
      `INSERT INTO audit_logs (id, store_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [id, storeId, action, details]
    );
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}
