import { z } from 'zod';

export const serverConfigSchema = z.object({
  root: z.string().max(2000),
  entry: z.string().max(2000),
  stopTimeout: z.number().int().min(5).max(180).default(60),
});
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export const serverLocations = [
  'root',
  'mods',
  'plugins',
  'config',
  'logs',
  'world',
  'server.properties',
] as const;
export type ServerLocation = (typeof serverLocations)[number];
export type ServerLine = { id: number; time: number; level: 'INFO' | 'WARN' | 'ERROR'; text: string };
export type ServerSnapshot = {
  state: 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING' | 'ERROR';
  active: boolean;
  busy: boolean;
  pid?: number;
  startedAt?: number;
  error?: string;
  exitCode?: number | null;
  logs: ServerLine[];
};
export type ServerInspection = {
  root: string;
  entries: string[];
  locations: Record<ServerLocation, boolean>;
};
