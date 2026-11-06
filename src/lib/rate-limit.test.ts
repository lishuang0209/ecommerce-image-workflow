import assert from 'node:assert/strict';
import test from 'node:test';

import { enforceMinIntervalRateLimit } from './rate-limit';

test('cookie changes cannot bypass a cookie-independent rate limit', () => {
  const url = `https://example.com/api/test-${crypto.randomUUID()}`;
  const first = new Request(url, {
    method: 'POST',
    headers: { cookie: 'session=one', 'x-forwarded-for': '203.0.113.10' },
  });
  const second = new Request(url, {
    method: 'POST',
    headers: { cookie: 'session=two', 'x-forwarded-for': '203.0.113.10' },
  });
  const options = {
    intervalMs: 60_000,
    keyPrefix: 'cookie-independent-test',
    extraKey: 'same-email',
    includeCookie: false,
  };

  assert.equal(enforceMinIntervalRateLimit(first, options), null);
  assert.equal(enforceMinIntervalRateLimit(second, options)?.status, 429);
});

test('different generation cards are not blocked by the same short interval', () => {
  const url = `https://example.com/api/test-${crypto.randomUUID()}`;
  const request = () => new Request(url, {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.11' },
  });
  const base = {
    intervalMs: 60_000,
    keyPrefix: 'generation-precheck',
    includeCookie: false as const,
  };

  assert.equal(enforceMinIntervalRateLimit(request(), { ...base, extraKey: 'project|street' }), null);
  assert.equal(enforceMinIntervalRateLimit(request(), { ...base, extraKey: 'project|grass' }), null);
  assert.equal(enforceMinIntervalRateLimit(request(), { ...base, extraKey: 'project|street' })?.status, 429);
});
