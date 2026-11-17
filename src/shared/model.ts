import { z } from 'zod';
import { serverConfigSchema } from './server';
import {
  ledgerSchema,
  performanceSettingsSchema,
  performanceTierSchema,
  type PerformanceSnapshot,
} from './performance';
import { studioSchema, type OverlayHttpStatus, type PublicOverlay } from './overlay-studio';

export const eventTypes = ['LIKE', 'GIFT', 'FOLLOW', 'SHARE', 'SUBSCRIBE', 'CHAT', 'MEMBER_JOIN'] as const;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const userSchema = z.object({
  id: z.string().max(200),
  username: z.string().max(200),
  nickname: z.string().max(200),
  avatar: z.string().max(2000).optional(),
});
const eventBase = {
  id: z.string().min(1).max(500),
  timestamp: count,
  user: userSchema,
  source: z.enum(['tiktok', 'simulator']),
  testRuleId: z.string().optional(),
  raw: z.unknown().optional(),
};
export const eventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventBase,
    type: z.literal('LIKE'),
    payload: z.object({ likeCount: count, totalLikeCount: count.optional() }),
  }),
  z.object({
    ...eventBase,
    type: z.literal('GIFT'),
    payload: z.object({
      giftId: z.string().max(100),
      giftName: z.string().max(200),
      giftImage: z.string().url().max(2000).optional(),
      repeatCount: count.min(1),
      repeatEnd: z.boolean(),
      streak: z.boolean(),
      streakId: z.string().max(300),
      diamondCount: count.optional(),
    }),
  }),
  z.object({ ...eventBase, type: z.literal('CHAT'), payload: z.object({ message: z.string().max(4000) }) }),
  ...(['FOLLOW', 'SHARE', 'SUBSCRIBE', 'MEMBER_JOIN'] as const).map((type) =>
    z.object({ ...eventBase, type: z.literal(type), payload: z.object({}) }),
  ),
]);
export type InternalLiveEvent = z.infer<typeof eventSchema>;
export type EventType = (typeof eventTypes)[number];

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('GIFT'),
    giftId: z.string().max(100).default(''),
    giftName: z.string().max(200).default('Rose'),
    mode: z.enum(['EACH_GIFT', 'STREAK_UPDATE', 'STREAK_END']),
  }),
  z.object({ type: z.literal('FOLLOW') }),
  z.object({ type: z.literal('SHARE') }),
  z.object({ type: z.literal('SUBSCRIBE') }),
  z.object({ type: z.literal('LIKE_BATCH'), amount: count.min(1) }),
  z.object({ type: z.literal('TOTAL_LIKES_THRESHOLD'), amount: count.min(1) }),
  z.object({
    type: z.literal('CHAT_COMMAND'),
    text: z.string().trim().min(1).max(200),
    match: z.enum(['EXACT', 'CONTAINS']),
  }),
]);
export type Trigger = z.infer<typeof triggerSchema>;
const timing = {
  id: z.string().min(1),
  giftQuantity: z
    .object({
      mode: z.enum(['ONCE', 'PER_ITEM']),
      interval: count.max(60_000),
      maxExecutions: count.min(1).max(1000),
    })
    .optional(),
  delayBefore: count.max(3_600_000).default(0),
  repeatCount: count.min(1).max(1000).default(1),
  intervalBetweenRepeats: count.max(3_600_000).default(0),
};
export const leafActionSchema = z.discriminatedUnion('type', [
  z.object({
    ...timing,
    type: z.literal('MinecraftCommand'),
    command: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .refine((v) => !/[\r\n\0]/.test(v), 'El comando debe ocupar una sola línea'),
  }),
  z.object({ ...timing, type: z.literal('Wait'), duration: count.max(3_600_000) }),
  z.object({
    ...timing,
    type: z.literal('PlaySound'),
    file: z.string().max(2000),
    volume: z.number().min(0).max(1).default(1),
  }),
  z.object({
    ...timing,
    type: z.literal('ShowAlert'),
    text: z.string().max(1000),
    duration: count.max(60_000).default(5000),
    icon: z.string().max(16).optional(),
    showGiftImage: z.boolean().optional(),
    customImage: z
      .string()
      .max(525000)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
      .optional(),
  }),
  z.object({ ...timing, type: z.literal('LogMessage'), message: z.string().max(2000) }),
]);
export const poolSchema = z.object({
  ...timing,
  type: z.literal('ActionPool'),
  entries: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        weight: z.number().positive().max(1_000_000),
        actions: z.array(leafActionSchema).min(1).max(100),
      }),
    )
    .min(1)
    .max(100),
});
export const actionSchema = z.union([leafActionSchema, poolSchema]);
export type LeafAction = z.infer<typeof leafActionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ActionPool = z.infer<typeof poolSchema>;
export const prioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
export type Priority = z.infer<typeof prioritySchema>;
export const ruleSchema = z.object({
  id: z.string().min(1),
  presetId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  impact: z.enum(['LOW', 'NORMAL', 'HIGH', 'EPIC']).optional(),
  showStreakProgress: z.boolean().optional(),
  publicLabel: z.string().max(120).optional(),
  showInHud: z.boolean().optional(),
  hudOrder: z.number().int().min(0).max(1000000).optional(),
  availability: z.enum(['READY', 'REQUIRES_CONFIGURATION', 'REQUIRES_MOD']).optional(),
  performanceCost: performanceTierSchema.optional(),
  performanceWindowMs: count.max(86_400_000).optional(),
  trigger: triggerSchema,
  conditions: z.object({
    minQuantity: count.default(1),
    minCoins: count.default(0),
    username: z.string().max(200).default(''),
  }),
  actions: z.array(actionSchema).min(1).max(100),
  cooldown: z.object({ duration: count.max(86_400_000), policy: z.enum(['IGNORE', 'QUEUE', 'REPLACE']) }),
  priority: prioritySchema,
  errorPolicy: z.enum(['STOP_JOB', 'CONTINUE']).default('STOP_JOB'),
  createdAt: count,
  updatedAt: count,
});
export type Rule = z.infer<typeof ruleSchema>;
export const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  createdAt: count,
});
export type Preset = z.infer<typeof presetSchema>;
export const savedCommandSchema = z.object({
  id: z.string(),
  category: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  command: z.string().max(4096),
  note: z.string().max(1000).default(''),
});
export type SavedCommand = z.infer<typeof savedCommandSchema>;
export const settingsSchema = z.object({
  overlayStudio: studioSchema.optional(),
  performanceProtection: performanceSettingsSchema.optional(),
  performanceLedger: ledgerSchema.optional(),
  localServer: serverConfigSchema.optional(),
  overlay: z
    .object({ visible: z.boolean(), locked: z.boolean(), x: z.number().int(), y: z.number().int() })
    .optional(),
  tiktokUsername: z
    .string()
    .regex(/^@?[\w.]*$/)
    .max(100)
    .default(''),
  player: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,16}$/)
    .default('Ainztk58'),
  minecraft: z
    .object({
      host: z.enum(['127.0.0.1', 'localhost', '::1']).default('127.0.0.1'),
      port: count.min(1).max(65535).default(25575),
    })
    .default({ host: '127.0.0.1', port: 25575 }),
  audio: z
    .object({ volume: z.number().min(0).max(1), mute: z.boolean() })
    .default({ volume: 0.75, mute: false }),
  developer: z
    .object({ retainRaw: z.boolean(), randomSeed: z.string().max(100) })
    .default({ retainRaw: false, randomSeed: '' }),
  activePresetId: z.string().default('starter'),
  logRetentionDays: count.min(1).max(30).default(7),
});
export type Settings = z.infer<typeof settingsSchema>;
export type ConnectionStatus = {
  state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';
  detail?: string;
  latency?: number;
};
export type LiveSession = {
  id: string;
  source: 'tiktok' | 'simulator';
  startedAt: number;
  endedAt?: number;
  totalLikes: number;
  receivedLikes: number;
  triggeredThresholds: string[];
  eventsReceived: number;
  rulesTriggered: number;
};
export type Job = {
  performance?: { cost: z.infer<typeof performanceTierSchema>; windowMs: number };
  admissionAt?: number;
  waitReason?: string;
  id: string;
  ruleId: string;
  ruleName: string;
  eventId: string;
  priority: Priority;
  actions: Action[];
  event: InternalLiveEvent;
  variables: Record<string, string | number>;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: number;
  notBefore: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  errorPolicy: Rule['errorPolicy'];
  dryRun: boolean;
};
export type LogEntry = {
  id: string;
  timestamp: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  category: 'SYSTEM' | 'LIVE' | 'RULE' | 'QUEUE' | 'ACTION' | 'MINECRAFT' | 'AUDIO';
  message: string;
  data?: Record<string, unknown>;
};
export type Snapshot = {
  overlayHttp?: OverlayHttpStatus;
  publicOverlay?: PublicOverlay;
  performance?: PerformanceSnapshot;
  settings: Settings;
  hasPassword: boolean;
  hasSignKey: boolean;
  presets: Preset[];
  rules: Rule[];
  commands: SavedCommand[];
  session: LiveSession;
  live: ConnectionStatus;
  game: ConnectionStatus;
  eventsEnabled: boolean;
  dryRun: boolean;
  queuePaused: boolean;
  jobs: Job[];
  cooldowns: Record<string, number>;
  logs: LogEntry[];
  executed: number;
  errors: number;
};
