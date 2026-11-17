import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path';
import {
  serverLocations,
  type ServerConfig,
  type ServerInspection,
  type ServerLocation,
} from '../shared/server';

export async function serverRoot(root: string): Promise<string> {
  if (!root.trim() || !isAbsolute(root)) throw new Error('Selecciona una carpeta absoluta de servidor');
  const resolved = await realpath(root);
  if (!(await stat(resolved)).isDirectory()) throw new Error('La raíz no es una carpeta');
  return resolved;
}
export async function serverLocation(root: string, location: ServerLocation): Promise<string> {
  const base = await serverRoot(root);
  const target = location === 'root' ? base : await realpath(join(base, location));
  const rel = relative(base, target);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('La ubicación sale de la carpeta del servidor');
  const info = await stat(target);
  if (location === 'server.properties' ? !info.isFile() : !info.isDirectory())
    throw new Error('La ubicación no tiene el tipo esperado');
  return target;
}
export async function inspectServer(root: string): Promise<ServerInspection> {
  const base = await serverRoot(root);
  const locations = {} as ServerInspection['locations'];
  for (const location of serverLocations) {
    try {
      await serverLocation(base, location);
      locations[location] = true;
    } catch {
      locations[location] = false;
    } // Missing/inaccessible locations are surfaced as disabled buttons.
  }
  const files = await readdir(base, { withFileTypes: true });
  return {
    root: base,
    entries: files
      .filter((f) => f.isFile() && /\.(bat|cmd|jar)$/i.test(f.name))
      .map((f) => f.name)
      .sort(),
    locations,
  };
}
export async function serverLaunch(
  config: ServerConfig,
): Promise<{ cwd: string; file: string; args: string[]; windowsVerbatimArguments?: boolean }> {
  const cwd = await serverRoot(config.root);
  // Only a selected file directly inside root; never accept a shell expression.
  if (!config.entry || basename(config.entry) !== config.entry)
    throw new Error('El inicio debe ser un archivo de la raíz');
  const entry = await realpath(join(cwd, config.entry));
  if (dirname(entry) !== cwd || !(await stat(entry)).isFile())
    throw new Error('Inicio fuera de la raíz o inválido');
  const extension = extname(entry).toLowerCase();
  if (extension === '.jar') return { cwd, file: 'java', args: ['-jar', entry, 'nogui'] };
  if (extension !== '.bat' && extension !== '.cmd') throw new Error('Selecciona .bat, .cmd o .jar');
  if (process.platform !== 'win32') throw new Error('Los scripts .bat/.cmd requieren Windows');
  if (!/^[\p{L}\p{N} _.-]+$/u.test(config.entry))
    throw new Error(
      'El nombre del script contiene caracteres de shell; usa letras, números, espacios, guiones o puntos',
    );
  if (!process.env.SystemRoot) throw new Error('Windows no informó SystemRoot');
  // /s consumes the outer quote pair; keep the inner pair around the selected filename.
  return {
    cwd,
    file: join(process.env.SystemRoot, 'System32', 'cmd.exe'),
    args: ['/d', '/s', '/c', `""${config.entry}""`],
    windowsVerbatimArguments: true,
  };
}
