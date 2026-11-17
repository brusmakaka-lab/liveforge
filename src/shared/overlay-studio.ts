import { z } from 'zod';
import type { AlertView } from './media';

export const studioSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  hudEnabled: z.boolean(),
  orientation: z.enum(['VERTICAL', 'HORIZONTAL']),
  scale: z.number().min(0.25).max(2),
  align: z.enum(['left', 'center', 'right']),
  x: z.number().int().min(0).max(1920),
  y: z.number().int().min(0).max(1920),
  columns: z.number().int().min(1).max(6),
  gap: z.number().int().min(0).max(80),
  iconSize: z.number().int().min(24).max(160),
  textSize: z.number().int().min(12).max(64),
  showPrice: z.boolean(),
  showGift: z.boolean(),
  showLabel: z.boolean(),
});
export type StudioSettings = z.infer<typeof studioSchema>;
export function defaultStudio(): StudioSettings {
  return {
    enabled: false,
    port: 18764,
    hudEnabled: true,
    orientation: 'VERTICAL',
    scale: 1,
    align: 'center',
    x: 24,
    y: 40,
    columns: 2,
    gap: 16,
    iconSize: 64,
    textSize: 24,
    showPrice: false,
    showGift: true,
    showLabel: true,
  };
}
export type HudItem = {
  id: string;
  label: string;
  trigger: string;
  impact: string;
  quantity: string;
  icon: string;
  image?: string;
  fallbackImage?: string;
  price?: number;
};
export type PublicOverlay = { layout: StudioSettings; items: HudItem[]; alerts: AlertView[] };
export type OverlayHttpStatus = { state: 'OFFLINE' | 'ONLINE' | 'ERROR'; port?: number; error?: string };
