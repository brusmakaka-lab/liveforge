import { createServer, type Server } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { OverlayHttpStatus, PublicOverlay, StudioSettings } from '../shared/overlay-studio';
import { errorMessage } from '../core/logging';

/** Only serves generated browser assets and an explicit public projection. No application IPC. */
export class OverlayHttp {
  private server?: Server;
  private status: OverlayHttpStatus = { state: 'OFFLINE' };
  private serial: Promise<void> = Promise.resolve();
  constructor(
    private readonly directory: string,
    private readonly state: () => PublicOverlay,
    private readonly warn: (message: string) => void,
  ) {}
  get snapshot(): OverlayHttpStatus {
    return { ...this.status };
  }
  configure(settings: StudioSettings): Promise<void> {
    this.serial = this.serial.then(async () => {
      if (this.status.state === 'ONLINE' && settings.enabled && settings.port === this.status.port) return;
      await this.close();
      if (!settings.enabled) return;
      try {
        await this.start(settings.port);
      } catch (error) {
        this.status = { state: 'ERROR', error: errorMessage(error) };
        this.warn(`Overlay HTTP: ${errorMessage(error)}`);
      }
    });
    return this.serial;
  }
  private async start(port: number): Promise<void> {
    const html = await readFile(join(this.directory, 'index.html'));
    const assets = new Map<string, { body: Buffer; type: string }>();
    for (const name of await readdir(join(this.directory, 'assets'))) {
      if (!/^[\w.-]+\.(js|css)$/.test(name)) continue;
      assets.set(`/assets/${name}`, {
        body: await readFile(join(this.directory, 'assets', name)),
        type: name.endsWith('.css') ? 'text/css' : 'text/javascript',
      });
    }
    const origin = `http://127.0.0.1:${port}`;
    const server = createServer(
      { maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 },
      (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https://*.tiktokcdn.com https://*.tiktokcdn-us.com https://*.tiktokcdn-eu.com https://*.ibyteimg.com https://*.ibytedtos.com https://*.muscdn.com; base-uri 'none'; form-action 'none'",
        );
        if (
          req.headers.host !== `127.0.0.1:${port}` ||
          (req.headers.origin && req.headers.origin !== origin)
        ) {
          res.writeHead(403).end();
          return;
        }
        if (!['GET', 'HEAD'].includes(req.method ?? '')) {
          res.writeHead(405).end();
          return;
        }
        const path = req.url ?? '';
        let body: Buffer | string;
        let type: string;
        if (path === '/overlay/hud' || path === '/overlay/alerts') {
          body = html;
          type = 'text/html; charset=utf-8';
        } else if (path === '/overlay/state.json') {
          try {
            body = JSON.stringify(this.state());
            type = 'application/json';
            if (Buffer.byteLength(body) > 16 * 1024 * 1024)
              throw new Error('Proyección pública supera 16 MiB; reduce imágenes o reglas visibles');
          } catch (error) {
            this.warn(`Overlay projection: ${errorMessage(error)}`);
            res.writeHead(503).end();
            return;
          }
        } else {
          const asset = assets.get(path);
          if (!asset) {
            res.writeHead(404).end();
            return;
          }
          body = asset.body;
          type = asset.type;
        }
        const tag = '"' + createHash('sha256').update(body).digest('hex') + '"';
        res.setHeader('ETag', tag);
        if (req.headers['if-none-match'] === tag) {
          res.writeHead(304).end();
          return;
        }
        res.setHeader('Content-Type', type);
        res.end(req.method === 'HEAD' ? undefined : body);
      },
    );
    server.maxConnections = 20;
    server.keepAliveTimeout = 1000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    server.on('error', (error) => {
      this.warn(errorMessage(error));
      this.status = { state: 'ERROR', error: errorMessage(error) };
    });
    this.server = server;
    this.status = { state: 'ONLINE', port };
  }
  private async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server)
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    this.status = { state: 'OFFLINE' };
  }
  async dispose(): Promise<void> {
    await this.serial;
    await this.close();
  }
}
