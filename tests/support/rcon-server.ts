import { createServer, type Socket } from 'node:net';

/** A protocol-level RCON fixture. No Minecraft/mod behavior is mocked as successful gameplay. */
export async function startRconServer(password = 'test-only-password') {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    let buffered = Buffer.alloc(0);
    let authenticated = false;
    socket.on('error', () => {
      sockets.delete(socket);
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 4) {
        const size = buffered.readInt32LE(0);
        if (size < 10 || size > 1024 * 1024) {
          socket.destroy();
          return;
        }
        if (buffered.length < size + 4) return;
        const packet = buffered.subarray(0, size + 4);
        buffered = buffered.subarray(size + 4);
        const id = packet.readInt32LE(4);
        const type = packet.readInt32LE(8);
        const body = packet.subarray(12, size + 2).toString('utf8');
        const reply = (replyId: number, replyType: number, text: string): void => {
          const payload = Buffer.from(text);
          const response = Buffer.alloc(payload.length + 14);
          response.writeInt32LE(payload.length + 10, 0);
          response.writeInt32LE(replyId, 4);
          response.writeInt32LE(replyType, 8);
          payload.copy(response, 12);
          socket.write(response);
        };
        if (type === 3) {
          authenticated = body === password;
          reply(authenticated ? id : -1, 2, '');
        } else if (type === 2 && authenticated) {
          commands.push(body);
          reply(
            id,
            0,
            body === 'list' ? 'There are 1 of a max of 20 players online: Ainztk58' : `Executed: ${body}`,
          );
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing TCP address');
  return {
    port: address.port,
    commands,
    password,
    disconnectClients: () => sockets.forEach((s) => s.destroy()),
    close: async () => {
      sockets.forEach((s) => s.destroy());
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
