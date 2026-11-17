# Modelo de eventos

`InternalLiveEvent` es una unión discriminada validada con Zod. Campos comunes: id, type, timestamp en milisegundos, source (`tiktok`/`simulator`), user (`id`, `username`, `nickname`, avatar opcional), payload. `raw` es opcional y acotado; el motor no lo inspecciona y se elimina de los trabajos.

| Tipo                                  | Payload                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| LIKE                                  | likeCount ≥0; totalLikeCount opcional ≥0                                             |
| GIFT                                  | giftId, giftName, repeatCount ≥1, repeatEnd, streak, streakId, diamondCount opcional |
| FOLLOW, SHARE, SUBSCRIBE, MEMBER_JOIN | Objeto vacío                                                                         |
| CHAT                                  | message (máximo 4.000 caracteres)                                                    |

Ejemplo normalizado:

```json
{
  "id": "GIFT:123:5:true",
  "type": "GIFT",
  "timestamp": 1791000000000,
  "source": "tiktok",
  "user": { "id": "42", "username": "maria", "nickname": "María" },
  "payload": {
    "giftId": "5655",
    "giftName": "Rose",
    "repeatCount": 5,
    "repeatEnd": true,
    "streak": true,
    "streakId": "group-1",
    "diamondCount": 1
  }
}
```

## Mapping TikTok 2.5.0

- `common.msgId` → id; type, repeatCount y repeatEnd distinguen fases que reutilizan msgId.
- `common.createTime` → timestamp; segundos se convierten a milisegundos. Sin timestamp se usa recepción local.
- `user.id` / `user.userId`, uniqueId, nickname y avatarThumb.urlList → user.
- LIKE: count, total → likeCount, totalLikeCount. IDs de 64 bits se mantienen como strings; counts deben caber en un entero seguro.
- GIFT: giftId, gift.name, gift.type=1, repeatCount, repeatEnd numérico/booleano, groupId/orderId y gift.diamondCount. extendedGiftInfo se usa si existe.
- CHAT: comment → message.
- SUBSCRIBE: SUB_NOTIFY con subscribingStatus 1/2; se excluyen cancelación/refund. No se infiere por presencia en chat.

Todos los campos externos se tratan como `unknown` antes de validarlos. Fallos se registran y sólo se descarta el evento defectuoso.

## Deduplicación y rachas

Dedup usa source+id en una ventana de cinco minutos, máximo 20.000 IDs. Si falta el ID, el normalizador deriva un hash del payload. Payloads idénticos sin ID pueden ser indistinguibles: se elige evitar duplicar, con posible descarte conservador. No se promete exactamente una ejecución ante cualquier fallo de proveedor.

El tracker mantiene el mayor repeatCount por usuario+regalo+streakId, no reduce el contador si llegan paquetes desordenados y conserva tombstones de finales. Ventana de diez minutos y máximo 10.000 rachas. groupId/orderId tienen prioridad. Sin ellos se reconstruye una racha por usuario/regalo con expiración y nueva fase; un final aislado idéntico dentro de diez segundos puede ser descartado conservadoramente. Una racha sin final no dispara STREAK_END: no se inventa su cantidad final.

EACH_GIFT usa deltas: 1 → 5 → final 5 produce 1 + 4 + 0 ejecuciones. STREAK_END produce 0 + 0 + 1 ejecución, con giftCount=5. El mínimo de cantidad en EACH_GIFT aplica a cada regalo (cantidad 1); para condiciones sobre el total usa STREAK_END.

## Simulaciones

Simulator construye el mismo contrato, lo valida y publica en EventBus. Puede emitir fases de una racha con el mismo streakId, incrementos de likes y actualizaciones absolutas con likeCount=0. Una nueva racha se crea al enviar su final.

TEST usa un evento con testRuleId interno dirigido a una regla guardada del preset activo. RulesEngine admite esa ejecución explícita sin habilitación, filtros ni cooldown, pero respeta el kill switch. No modifica contadores ni thresholds reales. No hay un envío directo Simulator → Minecraft.
