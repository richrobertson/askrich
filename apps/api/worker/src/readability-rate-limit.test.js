import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, getRateLimitPolicy, getClientId } from './index.js';

class MockKv {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async put(key, value) {
    this.store.set(key, value);
  }
}

const createEnv = (overrides = {}) => ({
  RATE_LIMIT_ENABLED: 'true',
  RATE_LIMIT_QPS_HOUR: '30',
  RATE_LIMIT_BURST_SECONDS: '1',
  ...overrides,
});

const createRequest = (headers = {}) => {
  const values = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return { headers: { get: (name) => values.get(name.toLowerCase()) ?? null } };
};

describe('readability: rate limiting and identity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to safe hourly limit when RATE_LIMIT_QPS_HOUR is invalid', async () => {
    const kv = new MockKv();
    const env = createEnv({ RATE_LIMIT_QPS_HOUR: 'not-a-number' });

    for (let index = 0; index < 30; index += 1) {
      const result = await checkRateLimit('client-a', env, kv);
      expect(result.allowed).toBe(true);
      vi.advanceTimersByTime(1_100);
    }

    const blocked = await checkRateLimit('client-a', env, kv);
    expect(blocked.allowed).toBe(false);
  });

  it('builds a normalized rate-limit policy from env', () => {
    expect(getRateLimitPolicy(createEnv({ RATE_LIMIT_ENABLED: 'false' }))).toEqual({
      isRateLimitEnabled: false,
      hourlyLimit: 30,
      burstWindowSeconds: 1,
    });
  });

  it('falls back to safe burst seconds when RATE_LIMIT_BURST_SECONDS is invalid', async () => {
    const kv = new MockKv();
    const env = createEnv({ RATE_LIMIT_BURST_SECONDS: 'NaN' });

    await checkRateLimit('client-b', env, kv);
    const second = await checkRateLimit('client-b', env, kv);
    expect(second.allowed).toBe(false);
    expect(second.resetTime).toBe(1);
  });

  it('hashes client identity deterministically from normalized first forwarded IP', () => {
    const requestA = createRequest({
      'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      origin: 'https://askrich.example',
      'user-agent': 'Vitest',
    });
    const requestB = createRequest({
      'x-forwarded-for': '203.0.113.10',
      origin: 'https://askrich.example',
      'user-agent': 'Vitest',
    });

    expect(getClientId(requestA)).toBe(getClientId(requestB));
  });
});
