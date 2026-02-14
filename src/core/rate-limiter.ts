import { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } from '../constants.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const userLimits = new Map<number, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * Check if a user is within rate limits
 */
export function checkRateLimit(userId: number): RateLimitResult {
  const now = Date.now();
  const entry = userLimits.get(userId);

  // No existing entry or window expired - create new window
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    userLimits.set(userId, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetInMs: RATE_LIMIT_WINDOW_MS,
    };
  }

  // Within current window
  const remaining = RATE_LIMIT_MAX_REQUESTS - entry.count - 1;
  const resetInMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs,
    };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: Math.max(0, remaining),
    resetInMs,
  };
}

/**
 * Reset rate limit for a user (e.g., for admin override)
 */
export function resetRateLimit(userId: number): void {
  userLimits.delete(userId);
}

/**
 * Clean up expired entries (call periodically to prevent memory leaks)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [userId, entry] of userLimits) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      userLimits.delete(userId);
    }
  }
}

// Clean up every minute
setInterval(cleanupExpiredEntries, 60 * 1000);
