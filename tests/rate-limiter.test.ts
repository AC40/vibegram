import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimit } from '../src/core/rate-limiter.js';

describe('rate-limiter', () => {
  const testUserId = 12345;

  beforeEach(() => {
    resetRateLimit(testUserId);
  });

  it('allows first request', () => {
    const result = checkRateLimit(testUserId);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19); // 20 max - 1
  });

  it('tracks request count', () => {
    checkRateLimit(testUserId);
    checkRateLimit(testUserId);
    const result = checkRateLimit(testUserId);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(17); // 20 - 3
  });

  it('blocks after limit exceeded', () => {
    // Make 20 requests
    for (let i = 0; i < 20; i++) {
      checkRateLimit(testUserId);
    }

    // 21st should be blocked
    const result = checkRateLimit(testUserId);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('provides reset time', () => {
    const result = checkRateLimit(testUserId);
    expect(result.resetInMs).toBeGreaterThan(0);
    expect(result.resetInMs).toBeLessThanOrEqual(60000);
  });

  it('resets after manual reset', () => {
    for (let i = 0; i < 20; i++) {
      checkRateLimit(testUserId);
    }

    resetRateLimit(testUserId);

    const result = checkRateLimit(testUserId);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });
});
