import type { Database } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export interface RecordAuditEventInput {
  userId?: string;
  action: string;
  target: string;
  source: string;
  meta?: Record<string, unknown>;
}

export async function recordAuditEvent(
  db: Database,
  input: RecordAuditEventInput,
): Promise<void> {
  await db.insert(auditLog).values({
    userId: input.userId,
    action: input.action,
    target: input.target,
    source: input.source,
    meta: input.meta ?? null,
  });
}
