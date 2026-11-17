import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ServerHub } from '../src/main/server-hub';
import { inspectServer, serverLaunch, serverLocation } from '../src/main/server-paths';
import { Repository } from '../src/storage/repository';
import { settingsSchema } from '../src/shared/model';
const hubs: ServerHub[] = [];
afterEach(async () => {
  for (const hub of hubs.splice(0)) if (hub.active) await hub.stop(2);
});
const config = { root: resolve('.'), entry: 'fixture', stopTimeout: 5 };
function hub(args: string[] = []) {
  const h = new ServerHub(
    () => {},
    async () => ({
      file: process.execPath,
      args: [resolve('tests/fixtures/server.mjs'), ...args],
      cwd: resolve('.'),
    }),
  );
  hubs.push(h);
  return h;
}
it('inspects valid paths, missing mods/plugins and rejects invalid or escaping paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liveforge-hub-'));
  await writeFile(join(root, 'start server.cmd'), '@echo off\r\n');
  const s = await inspectServer(root);
  expect(s.entries).toEqual(['start server.cmd']);
  expect(s.locations.mods).toBe(false);
  expect(s.locations.plugins).toBe(false);
  await expect(inspectServer(join(root, 'absent'))).rejects.toThrow();
  await expect(serverLocation(root, 'mods')).rejects.toThrow();
  await expect(serverLaunch({ ...config, root, entry: '../x.cmd' })).rejects.toThrow();
  await writeFile(join(root, 'a&b.cmd'), '@echo off');
  await expect(serverLaunch({ ...config, root, entry: 'a&b.cmd' })).rejects.toThrow();
  const launch = await serverLaunch({ ...config, root, entry: 'start server.cmd' });
  expect(launch.args).toContain('""start server.cmd""');
  expect(launch.windowsVerbatimArguments).toBe(true);
});
it('owns a real child: start, online, console, bounds, stop and restart', async () => {
  const h = hub();
  await h.start(config);
  await expect.poll(() => h.snapshot().state).toBe('ONLINE');
  const pid = h.snapshot().pid;
  expect(pid).toBeGreaterThan(0);
  await expect(h.start(config)).rejects.toThrow();
  await h.command('list');
  await expect.poll(() => h.snapshot().logs.some((l) => l.text === 'received: list')).toBe(true);
  await expect(h.command('list\nstop')).rejects.toThrow();
  await h.command('flood');
  await expect.poll(() => h.snapshot().logs.length).toBe(500);
  await h.restart(config);
  await expect.poll(() => h.snapshot().state).toBe('ONLINE');
  expect(h.snapshot().pid).not.toBe(pid);
  await h.stop(2);
  expect(h.snapshot().state).toBe('OFFLINE');
  expect(h.active).toBe(false);
});
it('exposes startup failures without crashing the host', async () => {
  const h = hub(['--fail']);
  await h.start(config);
  await expect.poll(() => h.snapshot().state).toBe('ERROR');
  await expect.poll(() => h.active).toBe(false);
  expect(h.snapshot().exitCode).toBe(3);
  const missing = new ServerHub(
    () => {},
    async () => ({ file: 'liveforge-missing-executable', args: [], cwd: resolve('.') }),
  );
  await expect(missing.start(config)).rejects.toThrow();
  await expect.poll(() => missing.active).toBe(false);
});
it('serializes concurrent starts and rejects changes while operation is in flight', async () => {
  const h = hub();
  const starting = h.start(config);
  await expect(h.start(config)).rejects.toThrow();
  await starting;
  await expect.poll(() => h.snapshot().state).toBe('ONLINE');
});
it('keeps process owned on stop timeout and allows retry without forced termination', async () => {
  const h = hub(['--ignore-first-stop']);
  await h.start(config);
  await expect.poll(() => h.snapshot().state).toBe('ONLINE');
  const pid = h.snapshot().pid;
  await expect(h.stop(0.05)).rejects.toThrow('no confirmó');
  expect(h.active).toBe(true);
  expect(h.snapshot().pid).toBe(pid);
  expect(h.snapshot().state).toBe('ERROR');
  await h.stop(2);
  expect(h.active).toBe(false);
  expect(h.snapshot().state).toBe('OFFLINE');
});
it('a live process without the readiness line stays STARTING and can be stopped', async () => {
  const h = hub(['--no-ready']);
  await h.start(config);
  await expect.poll(() => h.snapshot().logs.some((l) => l.text.includes('diagnostic fixture'))).toBe(true);
  expect(h.snapshot().state).toBe('STARTING');
  await expect(h.command('list')).rejects.toThrow('ONLINE');
  await h.stop(2);
  expect(h.snapshot().state).toBe('OFFLINE');
});
it('preserves existing settings and persists optional server config without a migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liveforge-hub-db-'));
  const path = join(root, 'test.sqlite');
  const repo = new Repository(path);
  repo.saveSettings(settingsSchema.parse({ player: 'Ainztk58' }));
  expect(repo.settings().localServer).toBeUndefined();
  repo.saveSettings({ ...repo.settings(), localServer: config });
  repo.close();
  const again = new Repository(path);
  expect(again.settings().localServer).toEqual(config);
  expect(again.settings().player).toBe('Ainztk58');
  again.close();
});

it.each(['bat', 'cmd'])('stops a Windows .%s ending in pause on the first request', async (extension) => {
  const root = await mkdtemp(join(tmpdir(), 'liveforge-hub-pause-'));
  const entry = `start server.${extension}`;
  await writeFile(
    join(root, entry),
    `@echo off\r\n"${process.execPath}" "${resolve('tests/fixtures/server.mjs')}"\r\npause\r\n`,
  );
  const h = new ServerHub(() => {});
  hubs.push(h);
  await h.start({ ...config, root, entry });
  await expect.poll(() => h.snapshot().state).toBe('ONLINE');
  await h.stop(2);
  expect(h.snapshot()).toMatchObject({ state: 'OFFLINE', active: false, exitCode: 0 });
  expect(h.snapshot().pid).toBeUndefined();
  expect(h.snapshot().startedAt).toBeUndefined();
  expect(h.snapshot().error).toBeUndefined();
  expect(h.snapshot().logs.filter((l) => l.text === '> stop')).toHaveLength(1);
});

it('waits for actual script exit after console stop and retries a timeout without writing after EOF', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liveforge-hub-slow-stop-'));
  const entry = 'slow stop.cmd';
  await writeFile(
    join(root, entry),
    `@echo off\r\n"${process.execPath}" "${resolve('tests/fixtures/server.mjs')}" --slow-stop\r\npause\r\n`,
  );
  const h = new ServerHub(() => {});
  hubs.push(h);
  await h.start({ ...config, root, entry });
  await expect.poll(() => h.snapshot().state).toBe('ONLINE');
  await h.command('stop');
  await expect.poll(() => h.snapshot().logs.some((l) => l.text === 'Saving world')).toBe(true);
  expect(h.snapshot()).toMatchObject({ state: 'STOPPING', active: true });
  await expect(h.stop(0.01)).rejects.toThrow('no confirmó');
  expect(h.active).toBe(true);
  await h.stop(2);
  expect(h.snapshot()).toMatchObject({ state: 'OFFLINE', active: false, error: undefined });
  expect(h.snapshot().logs.filter((l) => l.text === '> stop')).toHaveLength(1);
});
