import { newAction, newRule, starterData } from './defaults';
import type { Action, Rule, SavedCommand, Trigger } from './model';
import { defaultWindows, type PerformanceTier } from './performance';

export function bedrockPreset(commands: SavedCommand[]) {
  const preset = { id: crypto.randomUUID(), name: 'Bedrock Interactive v1', createdAt: Date.now() };
  const known = starterData().commands;
  const library = (category: string, name: string): string =>
    commands.find((c) => c.category === category && c.name === name && c.command.trim())?.command ||
    known.find((c) => c.category === category && c.name === name)?.command ||
    '';
  const mob = (name: string, offset: number) =>
    `execute as {{player}} at @s run summon minecraft:${name} ~${offset} ~ ~`;
  const chat = (text: string): Trigger => ({ type: 'CHAT_COMMAND', text, match: 'EXACT' });
  const gift = (giftName: string): Trigger => ({ type: 'GIFT', giftId: '', giftName, mode: 'STREAK_END' });
  const rows: {
    label: string;
    trigger: Trigger;
    impact: NonNullable<Rule['impact']>;
    cost: PerformanceTier;
    commands: string[];
    repeats?: number;
    perItem?: boolean;
    availability?: Rule['availability'];
  }[] = [
    {
      label: 'ZOMBIE',
      trigger: gift('Rose'),
      impact: 'LOW',
      cost: 'LIGHT',
      commands: [mob('zombie', 2)],
      perItem: true,
    },
    {
      label: 'SKELETON',
      trigger: { type: 'FOLLOW' },
      impact: 'LOW',
      cost: 'LIGHT',
      commands: [mob('skeleton', 3)],
    },
    {
      label: 'SPIDER',
      trigger: { type: 'SHARE' },
      impact: 'LOW',
      cost: 'LIGHT',
      commands: [mob('spider', 2)],
    },
    {
      label: 'ZOMBIES ×2',
      trigger: chat('!zombies'),
      impact: 'LOW',
      cost: 'LIGHT',
      commands: [mob('zombie', 2)],
      repeats: 2,
    },
    {
      label: 'BOOM',
      trigger: chat('!boom'),
      impact: 'LOW',
      cost: 'LIGHT',
      commands: ['execute as {{player}} at @s run boom 4'],
    },
    {
      label: 'CREEPER',
      trigger: { type: 'LIKE_BATCH', amount: 500 },
      impact: 'NORMAL',
      cost: 'MEDIUM',
      commands: [mob('creeper', 3)],
    },
    {
      label: 'BOOM ×4',
      trigger: gift('Donut'),
      impact: 'NORMAL',
      cost: 'MEDIUM',
      commands: ['execute as {{player}} at @s run boom 4'],
      repeats: 4,
    },
    {
      label: 'EMBOSCADA',
      trigger: chat('!ambush'),
      impact: 'NORMAL',
      cost: 'MEDIUM',
      commands: [mob('zombie', 2), mob('skeleton', 3)],
    },
    {
      label: 'MOB MIX',
      trigger: chat('!mix'),
      impact: 'NORMAL',
      cost: 'MEDIUM',
      commands: [mob('zombie', 2), mob('skeleton', 3), mob('spider', 2)],
    },
    {
      label: 'VELOCIDAD',
      trigger: chat('!speed'),
      impact: 'NORMAL',
      cost: 'LIGHT',
      commands: [library('Vanilla', 'Effect')],
    },
    {
      label: 'RAVAGER',
      trigger: gift('Crown'),
      impact: 'HIGH',
      cost: 'MEDIUM',
      commands: [mob('ravager', 4)],
    },
    {
      label: 'WARDEN',
      trigger: { type: 'TOTAL_LIKES_THRESHOLD', amount: 50000 },
      impact: 'HIGH',
      cost: 'HEAVY',
      commands: [mob('warden', 5)],
    },
    {
      label: 'LIGHTNING',
      trigger: chat('!lightning'),
      impact: 'HIGH',
      cost: 'MEDIUM',
      commands: [library('Vanilla', 'Lightning')],
    },
    {
      label: 'TORNADO F1',
      trigger: chat('!tornado'),
      impact: 'EPIC',
      cost: 'HEAVY',
      commands: [library('Weather2', 'Tornado F1')],
    },
    {
      label: 'FIRENADO F1',
      trigger: chat('!firenado'),
      impact: 'EPIC',
      cost: 'EXTREME',
      commands: [library('Weather2', 'Fire Tornado')],
    },
    {
      label: 'SHARKNADO',
      trigger: chat('!sharknado'),
      impact: 'EPIC',
      cost: 'EXTREME',
      commands: [library('Weather2', 'Sharknado')],
    },
    {
      label: 'METEOR · CONFIGURAR',
      trigger: gift(''),
      impact: 'HIGH',
      cost: 'HEAVY',
      commands: [],
      availability: 'REQUIRES_CONFIGURATION',
    },
    {
      label: 'FUTURE · MUTANT ZOMBIE',
      trigger: gift(''),
      impact: 'HIGH',
      cost: 'HEAVY',
      commands: [],
      availability: 'REQUIRES_MOD',
    },
    {
      label: 'FUTURE · MUTANT CREEPER',
      trigger: gift(''),
      impact: 'EPIC',
      cost: 'EXTREME',
      commands: [],
      availability: 'REQUIRES_MOD',
    },
    {
      label: 'FUTURE · BOSS',
      trigger: gift(''),
      impact: 'EPIC',
      cost: 'EXTREME',
      commands: [],
      availability: 'REQUIRES_MOD',
    },
  ];
  const rules: Rule[] = rows.map((row, index) => {
    const ready = !row.availability && row.commands.every((c) => c.trim());
    const actions: Action[] = ready
      ? [
          {
            ...newAction('ShowAlert'),
            type: 'ShowAlert',
            text: `@{{username}} → ${row.label}`,
            duration: 5000,
            icon: '🎁',
            showGiftImage: true,
          },
          ...row.commands.map((command) => ({
            ...newAction(),
            type: 'MinecraftCommand' as const,
            command,
            repeatCount: row.repeats ?? 1,
            intervalBetweenRepeats: 750,
            giftQuantity: {
              mode: row.perItem ? ('PER_ITEM' as const) : ('ONCE' as const),
              interval: 500,
              maxExecutions: row.perItem ? 5 : 1,
            },
          })),
        ]
      : [
          {
            ...newAction('LogMessage'),
            type: 'LogMessage',
            message: 'FUTURE / CONFIGURAR: agrega comandos validados y cambia disponibilidad a READY.',
          },
        ];
    return {
      ...newRule(preset.id),
      name: row.label,
      publicLabel: row.label,
      enabled: Boolean(ready),
      showInHud: Boolean(ready),
      hudOrder: index,
      availability: ready ? 'READY' : (row.availability ?? 'REQUIRES_CONFIGURATION'),
      trigger: row.trigger,
      impact: row.impact,
      performanceCost: row.cost,
      performanceWindowMs: defaultWindows[row.cost],
      actions,
      cooldown: {
        policy: 'IGNORE',
        duration: { LOW: 10000, NORMAL: 20000, HIGH: 45000, EPIC: 90000 }[row.impact],
      },
      priority: row.impact === 'EPIC' ? 'CRITICAL' : row.impact,
    };
  });
  return { preset, rules };
}
