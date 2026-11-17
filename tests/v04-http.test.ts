import { afterEach, expect, it } from 'vitest';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OverlayHttp } from '../src/main/overlay-http';
import { defaultStudio, type PublicOverlay } from '../src/shared/overlay-studio';
const servers: OverlayHttp[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.dispose()));
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'lf-http-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<div id="root"></div>');
  await writeFile(join(dir, 'assets', 'app.js'), '/* local */');
  const settings = { ...defaultStudio(), enabled: true };
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  settings.port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const state: PublicOverlay = { layout: settings, items: [], alerts: [] };
  const service = new OverlayHttp(
    dir,
    () => state,
    () => {},
  );
  servers.push(service);
  await service.configure(settings);
  return { service, settings, state, dir };
}
it('serves only loopback public routes/assets, checks Host/Origin/methods, ETag and rejects traversal', async () => {
  const { service, settings } = await fixture();
  expect(service.snapshot.state).toBe('ONLINE');
  const base = `http://127.0.0.1:${settings.port}`;
  const first = await fetch(base + '/overlay/state.json');
  expect(first.status).toBe(200);
  expect(Object.keys(await first.json())).toEqual(['layout', 'items', 'alerts']);
  expect(
    (await fetch(base + '/overlay/state.json', { headers: { 'If-None-Match': first.headers.get('etag')! } }))
      .status,
  ).toBe(304);
  for (const path of ['/overlay/hud', '/overlay/alerts', '/assets/app.js'])
    expect((await fetch(base + path)).status).toBe(200);
  for (const path of [
    '/snapshot',
    '/settings',
    '/api',
    '/main/index.js',
    '/assets/..%2fpackage.json',
    '/overlay/state.json?file=x',
  ])
    expect((await fetch(base + path)).status).toBe(404);
  expect((await fetch(base + '/overlay/hud', { method: 'POST' })).status).toBe(405);
  expect((await fetch(base + '/overlay/hud', { headers: { origin: 'http://evil.invalid' } })).status).toBe(
    403,
  );
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const r = request(base + '/overlay/hud', { headers: { Host: 'evil.invalid' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    r.on('error', reject);
    r.end();
  });
  expect(hostStatus).toBe(403);
  expect(first.headers.get('access-control-allow-origin')).toBeNull();
  expect(first.headers.get('content-security-policy')).toContain("default-src 'none'");
  await service.configure({ ...settings, enabled: false });
  expect(service.snapshot.state).toBe('OFFLINE');
  await service.configure(settings);
  expect((await fetch(base + '/overlay/hud')).status).toBe(200);
});

it('oversized public projection fails closed without exposing a partial payload', async () => {
  const { state, settings } = await fixture();
  state.items.push({
    id: 'large',
    label: 'x',
    trigger: 'FOLLOW',
    impact: 'LOW',
    quantity: '',
    icon: '',
    fallbackImage: 'x'.repeat(16 * 1024 * 1024),
  });
  const response = await fetch(`http://127.0.0.1:${settings.port}/overlay/state.json`);
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('');
});
it('occupied port reports ERROR without selecting another, then retry recovers', async () => {
  const { service, settings, dir } = await fixture();
  const second = new OverlayHttp(
    dir,
    () => ({ layout: settings, items: [], alerts: [] }),
    () => {},
  );
  servers.push(second);
  await second.configure(settings);
  expect(second.snapshot.state).toBe('ERROR');
  await service.dispose();
  await second.configure(settings);
  expect(second.snapshot.state).toBe('ONLINE');
});
