// Shared plumbing for /api/hq: argument validation, the write transaction (rate
// limit + admin_audit + hq_trash) and small helpers. Every HQ write goes through
// writeTx(), so a write and its audit row either both land or neither does.
// Files under api/_lib are not deployed as functions (leading underscore).
import type { Pool, PoolClient } from 'pg';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
// Anything the browser sends that does not fit the op's shape: 400, no detail.
export const bad = () => new HttpError(400, 'Bad request.');

// ---------- validation ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad();
  return v as Record<string, unknown>;
}
// Rejects keys the op does not expect.
export function only(o: Record<string, unknown>, keys: string[]) {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw bad();
  return o;
}
export function uuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw bad();
  return v.toLowerCase();
}
export function str(v: unknown, max: number, { min = 0, optional = false } = {}): string {
  if (v === undefined || v === null) { if (optional) return ''; throw bad(); }
  if (typeof v !== 'string') throw bad();
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad();
  return s;
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], { optional = false } = {}): T | '' {
  if ((v === undefined || v === null || v === '') && optional) return '';
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw bad();
  return v as T;
}
export function date(v: unknown, { optional = false } = {}): string {
  if ((v === undefined || v === null || v === '') && optional) return '';
  if (typeof v !== 'string' || !DATE_RE.test(v) || isNaN(Date.parse(v + 'T00:00:00Z'))) throw bad();
  return v;
}
export function bool(v: unknown, { optional = false } = {}): boolean {
  if (v === undefined && optional) return false;
  if (typeof v !== 'boolean') throw bad();
  return v;
}

// Strips email addresses from anything sent to Claude.
export function scrubEmails<T>(v: T): T {
  return JSON.parse(JSON.stringify(v).replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]'));
}

// ---------- writes ----------
const WRITE_LIMIT = (() => {
  const n = parseInt(process.env.HQ_WRITE_LIMIT || '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 30;
})();
export const writeLimit = () => WRITE_LIMIT;

export type Audit = {
  action: string; entity: string; entityId?: string | null; detail: string;
  before?: unknown; after?: unknown;
};

// Runs fn inside one transaction, after the per-user rate limit. fn records its
// audit rows with audit(); if anything throws, everything rolls back.
export async function writeTx<T>(pool: Pool, userId: string, fn: (c: PoolClient, audit: (a: Audit) => Promise<string>) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const rl = await c.query(
      "select count(*)::int as n from public.admin_audit where actor_user_id = $1 and created_at > now() - interval '60 seconds'",
      [userId],
    );
    if (rl.rows[0].n >= WRITE_LIMIT) throw new HttpError(429, 'Slow down, try again in a minute.');
    const audit = async (a: Audit): Promise<string> => {
      const ar = await c.query(
        "insert into public.admin_audit (actor, actor_user_id, action, entity, entity_id, detail, before, after) values ('hq', $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) returning id",
        [userId, a.action, a.entity, a.entityId ?? null, a.detail.slice(0, 300),
          a.before === undefined ? null : JSON.stringify(a.before), a.after === undefined ? null : JSON.stringify(a.after)],
      );
      return ar.rows[0].id as string;
    };
    const out = await fn(c, audit);
    await c.query('commit');
    return out;
  } catch (e) {
    try { await c.query('rollback'); } catch { /* connection already failed */ }
    throw e;
  } finally {
    c.release();
  }
}

// Copies a row (and anything moved or removed with it) into hq_trash, inside the caller's transaction.
export async function toTrash(c: PoolClient, userId: string, entity: string, entityId: string, row: unknown, related?: unknown) {
  await c.query(
    'insert into public.hq_trash (entity, entity_id, row_data, related, deleted_by) values ($1, $2, $3::jsonb, $4::jsonb, $5)',
    [entity, entityId, JSON.stringify(row), related === undefined ? null : JSON.stringify(related), userId],
  );
}
