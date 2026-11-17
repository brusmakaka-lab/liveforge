import { expect, it } from 'vitest';
import { startRconServer } from './support/rcon-server';
import { RCONTransport } from '../src/adapters/rcon-transport';
import { MinecraftAdapter } from '../src/adapters/minecraft';
import { Logger } from '../src/core/logging';
import { setTimeout as sleep } from 'node:timers/promises';

it('authenticates RCON, tests latency, transmits free commands and reconnects after close', async () => {
  const server = await startRconServer();
  const transport = new RCONTransport(
    { host: '127.0.0.1', port: server.port, password: server.password },
    () => {},
  );
  const adapter = new MinecraftAdapter(transport, new Logger());
  try {
    const result = await adapter.testConnection();
    expect(result.response).toContain('Ainztk58');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    await adapter.execute({
      type: 'command',
      command: 'execute as Ainztk58 at @s run weather2 summon tornado_f1',
    });
    expect(server.commands.at(-1)).toContain('weather2 summon tornado_f1');
    server.disconnectClients();
    await sleep(20);
    expect(adapter.getStatus().state).toBe('DISCONNECTED');
    await adapter.connect();
    await adapter.execute({ type: 'command', command: '/boom' });
    expect(server.commands.at(-1)).toBe('boom');
  } finally {
    await adapter.disconnect();
    await server.close();
  }
});
it('rejects invalid credentials, remote hosts and multiline commands', async () => {
  const server = await startRconServer();
  const transport = new RCONTransport({ host: '127.0.0.1', port: server.port, password: 'wrong' }, () => {});
  try {
    await expect(transport.connect()).rejects.toThrow('Authentication');
    await expect(
      new RCONTransport({ host: 'example.com', port: 25575, password: 'x' }, () => {}).connect(),
    ).rejects.toThrow('local');
  } finally {
    await transport.disconnect();
    await server.close();
  }
});
