import type { AlertView } from './media';
import { z } from 'zod';
import {
  leafActionSchema,
  presetSchema,
  ruleSchema,
  savedCommandSchema,
  settingsSchema,
  type Snapshot,
} from './model';
import { simulationSchema } from '../providers/simulator';
import { serverConfigSchema, serverLocations, type ServerInspection, type ServerSnapshot } from './server';
import { studioSchema } from './overlay-studio';
import { performanceSettingsSchema } from './performance';

export const requestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('saveStudio'), settings: studioSchema }),
  z.object({ op: z.literal('savePerformance'), settings: performanceSettingsSchema }),
  z.object({ op: z.literal('createBedrockPreset') }),
  z.object({ op: z.enum(['copyOverlayUrl', 'openOverlayPreview']), view: z.enum(['hud', 'alerts']) }),
  z.object({
    op: z.enum(['serverStatus', 'chooseServerRoot', 'serverStart', 'serverStop', 'serverRestart']),
  }),
  z.object({ op: z.literal('serverInspect'), root: z.string().max(2000) }),
  z.object({ op: z.literal('serverSave'), config: serverConfigSchema }),
  z.object({ op: z.literal('serverOpen'), location: z.enum(serverLocations) }),
  z.object({
    op: z.literal('serverCommand'),
    command: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .regex(/^[^\r\n\0]+$/),
  }),
  z.object({
    op: z.enum([
      'snapshot',
      'connectLive',
      'disconnectLive',
      'connectGame',
      'disconnectGame',
      'testGame',
      'startEvents',
      'stopEvents',
      'pauseQueue',
      'resumeQueue',
      'clearQueue',
      'resetSession',
      'copyDiagnostics',
      'chooseSound',
      'chooseAlertImage',
    ]),
  }),
  z.object({
    op: z.literal('previewAlert'),
    action: leafActionSchema,
    event: simulationSchema,
    impact: z.enum(['LOW', 'NORMAL', 'HIGH', 'EPIC']).optional(),
  }),
  z.object({ op: z.literal('previewSound'), file: z.string().max(2000), volume: z.number().min(0).max(1) }),
  z.object({ op: z.enum(['stopSound', 'mediaReady']) }),
  z.object({
    op: z.literal('overlay'),
    visible: z.boolean(),
    locked: z.boolean(),
    x: z.number().int().min(-20000).max(20000),
    y: z.number().int().min(-20000).max(20000),
  }),
  z.object({ op: z.literal('dryRun'), value: z.boolean() }),
  z.object({
    op: z.literal('saveSettings'),
    settings: settingsSchema,
    password: z.string().max(500).optional(),
    signKey: z.string().max(2000).optional(),
  }),
  z.object({ op: z.literal('savePreset'), preset: presetSchema }),
  z.object({
    op: z.enum([
      'deletePreset',
      'duplicatePreset',
      'activatePreset',
      'deleteRule',
      'testRule',
      'deleteCommand',
    ]),
    id: z.string().min(1).max(200),
  }),
  z.object({ op: z.literal('saveRule'), rule: ruleSchema }),
  z.object({ op: z.literal('saveCommand'), command: savedCommandSchema }),
  z.object({ op: z.literal('simulate'), event: simulationSchema }),
  z.object({
    op: z.literal('audioResult'),
    id: z.string(),
    phase: z.enum(['started', 'ended']).optional(),
    error: z.string().max(1000).optional(),
  }),
]);
export type Request = z.infer<typeof requestSchema>;
export type Reply =
  | {
      ok: true;
      snapshot?: Snapshot;
      text?: string;
      image?: string;
      alerts?: AlertView[];
      server?: ServerSnapshot;
      inspection?: ServerInspection;
    }
  | { ok: false; error: string };
export type MediaMessage =
  | { type: 'audio'; id: string; dataUrl: string; volume: number }
  | { type: 'alerts'; alerts: AlertView[] }
  | { type: 'stopAudio' }
  | { type: 'stopMedia' };
export interface DesktopAPI {
  request(input: Request): Promise<Reply>;
  onMedia(listener: (message: MediaMessage) => void): () => void;
}
