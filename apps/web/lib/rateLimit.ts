/**
 * Best-effort, per-instance rate limit by IP (fixed window). Instances are reused on Vercel's
 * Fluid Compute, so this catches casual abuse; it isn't a global quota.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 6;
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function rateLimit(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
  if (hits.size > 10_000) {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= MAX_REQUESTS) return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  entry.count++;
  return { ok: true };
}
