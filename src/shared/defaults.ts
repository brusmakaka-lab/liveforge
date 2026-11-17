import type { Action, Preset, Rule, SavedCommand, Trigger } from './model';

export function newAction(type: Action['type'] = 'MinecraftCommand'): Action {
  const base = { id: crypto.randomUUID(), delayBefore: 0, repeatCount: 1, intervalBetweenRepeats: 0 };
  switch (type) {
    case 'MinecraftCommand':
      return { ...base, type, command: 'execute as {{player}} at @s run summon minecraft:zombie ~ ~ ~' };
    case 'Wait':
      return { ...base, type, duration: 2000 };
    case 'PlaySound':
      return { ...base, type, file: '', volume: 1 };
    case 'ShowAlert':
      return { ...base, type, text: '{{username}} activó un evento', duration: 5000 };
    case 'LogMessage':
      return { ...base, type, message: 'Evento de {{username}}' };
    case 'ActionPool':
      return {
        ...base,
        type,
        entries: [
          {
            id: crypto.randomUUID(),
            name: 'Zombies',
            weight: 60,
            actions: [newAction('MinecraftCommand') as Extract<Action, { type: 'MinecraftCommand' }>],
          },
        ],
      };
  }
}
export function newTrigger(type: Trigger['type']): Trigger {
  if (type === 'GIFT') return { type, giftId: '', giftName: 'Rose', mode: 'STREAK_END' };
  if (type === 'LIKE_BATCH') return { type, amount: 500 };
  if (type === 'TOTAL_LIKES_THRESHOLD') return { type, amount: 50_000 };
  if (type === 'CHAT_COMMAND') return { type, text: '!boss', match: 'EXACT' };
  return { type };
}
export function newRule(presetId: string): Rule {
  return {
    id: crypto.randomUUID(),
    presetId,
    name: 'Nueva regla',
    enabled: true,
    trigger: newTrigger('GIFT'),
    conditions: { minQuantity: 1, minCoins: 0, username: '' },
    actions: [newAction()],
    cooldown: { duration: 0, policy: 'IGNORE' },
    priority: 'NORMAL',
    errorPolicy: 'STOP_JOB',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
export function starterData(): { preset: Preset; rules: Rule[]; commands: SavedCommand[] } {
  const preset = { id: 'starter', name: 'Minecraft · Primer LIVE', createdAt: Date.now() };
  const command = (value: string): Action => ({
    ...newAction('MinecraftCommand'),
    type: 'MinecraftCommand',
    command: value,
  });
  const draft = (name: string, type: Trigger['type'], actions: Action[], enabled = false): Rule => ({
    ...newRule(preset.id),
    name,
    trigger: newTrigger(type),
    actions,
    enabled,
    cooldown: { duration: 30_000, policy: 'IGNORE' },
  });
  const rules = [
    draft('A · Follow → Meteorito (configurar)', 'FOLLOW', [
      {
        ...newAction('LogMessage'),
        type: 'LogMessage',
        message: 'Pendiente: reemplazar por el comando real de Skyfall.',
      },
    ]),
    draft(
      'B · Rose → Tornado F1',
      'GIFT',
      [command('execute as {{player}} at @s run weather2 summon tornado_f1')],
      true,
    ),
    {
      ...draft('C · Regalo → Fire Tornado', 'GIFT', [
        command('execute as {{player}} at @s run weather2 summon firenado_f1'),
      ]),
      trigger: {
        type: 'GIFT' as const,
        giftId: '',
        giftName: 'CONFIGURAR_REGALO',
        mode: 'STREAK_END' as const,
      },
    },
    draft('D · 50K likes → Boss (configurar)', 'TOTAL_LIKES_THRESHOLD', [
      { ...newAction('LogMessage'), type: 'LogMessage', message: 'Pendiente: comando de spawn boss' },
      { ...newAction('Wait'), type: 'Wait', duration: 60_000 },
      { ...newAction('LogMessage'), type: 'LogMessage', message: 'Pendiente: comando de remove boss' },
    ]),
    {
      ...draft('E · Regalo → Boom (configurar potencia)', 'GIFT', [command('/boom')]),
      trigger: {
        type: 'GIFT' as const,
        giftId: '',
        giftName: 'CONFIGURAR_REGALO',
        mode: 'STREAK_END' as const,
      },
    },
  ];
  const commands: SavedCommand[] = [
    ['Weather2', 'Tornado F1', 'execute as {{player}} at @s run weather2 summon tornado_f1', ''],
    ['Weather2', 'Fire Tornado', 'execute as {{player}} at @s run weather2 summon firenado_f1', ''],
    ['Weather2', 'Sharknado', 'execute as {{player}} at @s run weather2 summon sharknado', ''],
    ['Weather2', 'Kill Storms', 'weather2 kill_all_storms', ''],
    ['Skyfall', 'Meteor', '', 'Completar con el comando real de tu versión.'],
    ['Perfomant Boom', 'Explosion', '/boom', 'Añadir la potencia usando la sintaxis real del plugin.'],
    ['Vanilla', 'Zombie', 'execute as {{player}} at @s run summon minecraft:zombie ~ ~ ~', ''],
    ['Vanilla', 'Creeper', 'execute as {{player}} at @s run summon minecraft:creeper ~ ~ ~', ''],
    ['Vanilla', 'Lightning', 'execute as {{player}} at @s run summon minecraft:lightning_bolt ~ ~ ~', ''],
    ['Vanilla', 'Give Item', 'give {{player}} minecraft:apple 1', ''],
    ['Vanilla', 'Effect', 'effect give {{player}} minecraft:speed 10 0', ''],
  ].map(([category, name, value, note]) => ({
    id: crypto.randomUUID(),
    category: category!,
    name: name!,
    command: value!,
    note: note!,
  }));
  return { preset, rules, commands };
}
