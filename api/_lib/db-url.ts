// The runtime database connection goes through Supabase's pooler in TRANSACTION mode (port 6543),
// not session mode (5432). Session mode gives each client its own slot for as long as it stays
// connected, and with only 15 slots, HQ's warm serverless instances across production and
// previews filled them all and the Production build could not connect (19 Oct 2026,
// EMAXCONNSESSION). Transaction mode shares server connections between transactions, so it
// allows far more clients. Nothing in HQ needs session mode: advisory locks are the
// transaction-scoped pg_advisory_xact_lock, SET is only SET LOCAL, there are no named prepared
// statements, no LISTEN/NOTIFY and no temporary tables. Any other URL is used as it is.
export function runtimeDbUrl(raw: string | undefined): string {
  if (!raw) return raw as unknown as string;
  try {
    const u = new URL(raw);
    if (/\.pooler\.supabase\.com$/i.test(u.hostname) && (u.port === '5432' || u.port === '')) u.port = '6543';
    return u.toString();
  } catch {
    return raw;
  }
}

// Small pools that let go quickly: a finished instance releases its slot within seconds.
export const POOL_OPTS = { max: 2, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } };
