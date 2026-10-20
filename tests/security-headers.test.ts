import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config';

test('todas as rotas bloqueiam enquadramento externo e não enviam links de convite no Referer', async () => {
  const rules = await config.headers!();
  const headers = Object.fromEntries(rules.find(rule => rule.source === '/:path*')!.headers.map(({ key, value }) => [key, value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
  assert.match(headers['Content-Security-Policy'], /base-uri 'self'/);
  assert.match(headers['Content-Security-Policy'], /form-action 'self'/);
  assert.equal(headers['Referrer-Policy'], 'same-origin');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(config.poweredByHeader, false);
  for (const source of ['/sw.js', '/app-version.json']) {
    assert.match(rules.find(rule => rule.source === source)!.headers.find(header => header.key === 'Cache-Control')!.value, /no-store/);
  }
});
