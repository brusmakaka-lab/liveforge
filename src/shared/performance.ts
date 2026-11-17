import { z } from 'zod';

export const performanceTiers = ['LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME'] as const;
export const performanceTierSchema = z.enum(performanceTiers);
export type PerformanceTier = z.infer<typeof performanceTierSchema>;
const ms = z.number().int().min(0).max(86_400_000);
const tierSettings = z.object({
  capacity: z.number().int().min(1).max(100),
  cooldownMs: ms,
  perItemCap: z.number().int().min(1).max(1000),
});
export const performanceSettingsSchema = z.object({
  enabled: z.boolean(),
  policy: z.enum(['WAIT', 'DROP']),
  tiers: z.object({ LIGHT: tierSettings, MEDIUM: tierSettings, HEAVY: tierSettings, EXTREME: tierSettings }),
});
export type PerformanceSettings = z.infer<typeof performanceSettingsSchema>;
export const defaultWindows: Record<PerformanceTier, number> = {
  LIGHT: 0,
  MEDIUM: 10000,
  HEAVY: 60000,
  EXTREME: 120000,
};
export function defaultPerformance(): PerformanceSettings {
  return {
    enabled: false,
    policy: 'WAIT',
    tiers: {
      LIGHT: { capacity: 100, cooldownMs: 0, perItemCap: 50 },
      MEDIUM: { capacity: 5, cooldownMs: 0, perItemCap: 10 },
      HEAVY: { capacity: 1, cooldownMs: 0, perItemCap: 1 },
      EXTREME: { capacity: 1, cooldownMs: 0, perItemCap: 1 },
    },
  };
}
export const reservationSchema = z.object({
  id: z.string().max(100),
  tier: performanceTierSchema,
  until: z.number().finite().nonnegative(),
  windowMs: ms,
  active: z.boolean(),
});
export const ledgerSchema = z.object({
  reservations: z.array(reservationSchema).max(2000),
  cooldowns: z.object({ LIGHT: z.number(), MEDIUM: z.number(), HEAVY: z.number(), EXTREME: z.number() }),
});
export type PerformanceLedger = z.infer<typeof ledgerSchema>;
export type Reservation = z.infer<typeof reservationSchema> & { simulated: boolean };
export type PerformanceSnapshot = { enabled: boolean; reservations: Reservation[] };
export type AdmissionDecision =
  { kind: 'ALLOW' } | { kind: 'WAIT'; until: number; reason: string } | { kind: 'DROP'; reason: string };
