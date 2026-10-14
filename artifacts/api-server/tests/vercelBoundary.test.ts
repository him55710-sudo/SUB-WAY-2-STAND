/** Test the actual deployment entrypoints with Web Request/Response, no network or real API key. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { build } from 'esbuild';
import { GetSubwayTrainsResponse } from '../../../lib/api-zod/src/generated/api.ts';

type FetchHandler = { fetch(request: Request): Response | Promise<Response> };

// Vercel bundles workspace and extensionless TypeScript imports. Use the same
// resolution boundary here instead of rewriting production imports for Node.
async function loadEntrypoint(path: string): Promise<FetchHandler> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'node24',
    logLevel: 'silent',
  });
  const source = result.outputFiles[0]!.text;
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
}

function environment(t: TestContext, key?: string) {
  const priorKey = process.env.SEOUL_SUBWAY_API_KEY;
  const priorBase = process.env.SEOUL_SUBWAY_API_BASE;
  delete process.env.SEOUL_SUBWAY_API_BASE;
  if (key === undefined) delete process.env.SEOUL_SUBWAY_API_KEY;
  else process.env.SEOUL_SUBWAY_API_KEY = key;
  t.after(() => {
    if (priorKey === undefined) delete process.env.SEOUL_SUBWAY_API_KEY;
    else process.env.SEOUL_SUBWAY_API_KEY = priorKey;
    if (priorBase === undefined) delete process.env.SEOUL_SUBWAY_API_BASE;
    else process.env.SEOUL_SUBWAY_API_BASE = priorBase;
  });
}

test('Vercel health endpoint returns JSON health and disables shared cache', async () => {
  const handler = await loadEntrypoint('../../../api/healthz.ts');
  const response = await handler.fetch(new Request('https://demo.example/api/healthz'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('Vercel train endpoint rejects unsupported methods before any provider call', async (t) => {
  environment(t, 'UNIT-TEST-KEY-NEVER-REAL');
  const provider = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network must not run'); });
  const handler = await loadEntrypoint('../../../api/subway/trains.ts');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const response = await handler.fetch(new Request('https://demo.example/api/subway/trains?line=2', { method }));
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('Allow'), 'GET');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'method_not_allowed' });
  }
  assert.equal(provider.mock.callCount(), 0);
});

test('Vercel train endpoint rejects malformed query values before quota or provider access', async (t) => {
  environment(t, 'UNIT-TEST-KEY-NEVER-REAL');
  const provider = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network must not run'); });
  const handler = await loadEntrypoint('../../../api/subway/trains.ts');
  for (const query of ['', 'line=', 'line=nope', 'line=0', 'line=10', 'line=2.5', 'line=2&direction=out', `line=2&station=${'x'.repeat(41)}`]) {
    const response = await handler.fetch(new Request(`https://demo.example/api/subway/trains?${query}`));
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'invalid_query' });
  }
  assert.equal(provider.mock.callCount(), 0);
});

test('Vercel train endpoint without a key returns schema-valid missing_key without calling provider', async (t) => {
  environment(t);
  const provider = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network must not run'); });
  const handler = await loadEntrypoint('../../../api/subway/trains.ts');
  const response = await handler.fetch(new Request('https://demo.example/api/subway/trains?line=2&direction=0'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = GetSubwayTrainsResponse.parse(await response.json());
  assert.equal(body.status, 'missing_key');
  assert.equal(body.cached, false);
  assert.deepEqual(body.trains, []);
  assert.equal(provider.mock.callCount(), 0);
});

test('Vercel train endpoint rejects duplicate known query keys rather than choosing a value', async (t) => {
  environment(t, 'UNIT-TEST-KEY-NEVER-REAL');
  const provider = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network must not run'); });
  const handler = await loadEntrypoint('../../../api/subway/trains.ts');
  for (const query of ['line=2&line=3', 'line=2&direction=0&direction=1', 'line=2&station=강남&station=역삼']) {
    const response = await handler.fetch(new Request(`https://demo.example/api/subway/trains?${query}`));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_query' });
  }
  assert.equal(provider.mock.callCount(), 0);
});

test('Vercel train endpoint treats whitespace-only keys as missing', async (t) => {
  environment(t, '   ');
  const provider = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network must not run'); });
  const handler = await loadEntrypoint('../../../api/subway/trains.ts');
  const response = await handler.fetch(new Request('https://demo.example/api/subway/trains?line=2'));
  const body = GetSubwayTrainsResponse.parse(await response.json());
  assert.equal(body.status, 'missing_key');
  assert.equal(provider.mock.callCount(), 0);
});
