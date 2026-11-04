// Keeps a public deployment from draining the AssemblyAI account. Counters live in memory, so
// on serverless they are per instance: a speed bump rather than a hard quota.

import { ApiError } from "./assemblyai";

type Rule = { perIp: number; total: number; windowMs: number };

const MINUTE = 60_000;

// Sized so one person can generate, play and export a few episodes in a sitting.
const RULES = {
  episode: { perIp: 6, total: 60, windowMs: 10 * MINUTE },
  answer: { perIp: 20, total: 200, windowMs: 10 * MINUTE },
  tts: { perIp: 300, total: 3000, windowMs: 10 * MINUTE },
  extract: { perIp: 15, total: 150, windowMs: 10 * MINUTE },
  sttToken: { perIp: 10, total: 100, windowMs: 10 * MINUTE },
} satisfies Record<string, Rule>;

const hits = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export function rateLimit(request: Request, bucket: keyof typeof RULES) {
  const rule: Rule = RULES[bucket];
  const allowed = hit(`${bucket}:${clientIp(request)}`, rule.perIp, rule.windowMs) && hit(`${bucket}:*`, rule.total, rule.windowMs);
  if (!allowed) throw new ApiError("Too many requests, please try again in a few minutes", 429);
}
