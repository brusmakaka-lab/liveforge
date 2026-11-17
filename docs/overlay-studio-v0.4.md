# Overlay Studio y protección estimada — v0.4 TEST

La ventana transparente existente sigue disponible. El nuevo Browser Source es opcional, de lectura solamente y sólo escucha en **127.0.0.1**. No requiere Internet para sus scripts/estilos. La captura real en OBS/TikTok Live Studio está **pendiente de validación manual**.

## Primer uso

1. Abre Overlay Studio. Opcionalmente pulsa Crear preset Bedrock; luego actívalo en Presets y reglas. Nunca reemplaza ni activa automáticamente tu preset actual.
2. Activa Servidor local, elige un puerto disponible (18764 inicial) y guarda. Un puerto ocupado muestra ERROR; cambia el puerto o libera el anterior y pulsa Guardar Studio / reintentar.
3. Copia las URLs HUD y alerts por separado. Añade cada una como fuente de navegador en tu software de streaming. Canvas del HUD: 1080×1920 vertical o 1920×1080 horizontal. Para alertas usa ancho 480 y alto acorde a tu composición.
4. El HTTP debe quedar ONLINE mientras se use. Las URLs se conservan al reiniciar con el mismo perfil/puerto. El cliente se reconecta por polling cada 500 ms; las alertas anteriores no se reproducen al reiniciar.
5. Activa DRY RUN y EVENTS para ensayar desde Simulator. El HUD es permanente; abrirlo no dispara acciones. ShowAlert, audio y comandos siguen usando las reglas existentes. La racha x1/x2/x5/final actualiza una misma tarjeta en la fuente alerts.

## Configurar contenido

En cada regla, abre «HUD público y carga estimada». Define etiqueta pública, visibilidad, orden, disponibilidad y coste/ventana. Sólo aparecen reglas del preset activo, habilitadas, READY, visibles y con etiqueta no vacía. Las reglas antiguas permanecen privadas hasta configurarlas.

Studio también permite cambiar etiqueta y orden al salir del campo, y visibilidad al pulsar el switch. El diseño se guarda mediante su botón; el preview muestra los cambios locales antes de guardar. El editor completo de reglas conserva SAVE RULE. La fuente HTTP refleja cambios guardados en aproximadamente 500 ms. El impacto visual LOW/NORMAL/HIGH/EPIC es independiente del coste.

La imagen del regalo se usa sólo si fue recibida de TikTok. La imagen personalizada de ShowAlert y luego el emoji actúan como fallback. No se consulta catálogo premium. El precio sólo aparece cuando fue observado en un evento real: el precio ficticio del Simulator nunca se publica como precio real. La caché mantiene como máximo 500 IDs, se reinicia con la app y evita resolver por nombre si hay ambigüedad. Las etiquetas y textos de alertas son públicos: no incluyas secretos en ellos.

El preset Bedrock contiene 16 reglas listas y 4 borradores: Meteor requiere comando verificado; Mutant Zombie, Mutant Creeper y Boss quedan FUTURE, ocultos y bloqueados incluso en TEST hasta configurar y marcar READY. La tabla completa está en `design-v0.4.md`. BOOM ×4 son cuatro ejecuciones; cada comando usa la potencia 4 autorizada. El usuario debe revisar gifts/mods/balance en su servidor antes de salir de DRY RUN.

## Ventanas estimadas de carga

**LiveForge no mide entidades, efectos ni TPS.** Una reserva cuenta una secuencia, no los mobs/tornados que ésta crea. Los límites de los tiers son independientes; HEAVY y EXTREME pueden coexistir. La cola continúa serial: un Wait largo dentro de una secuencia sigue bloqueando la siguiente.

La protección global empieza desactivada. Una regla sin `performanceCost` conserva el recorrido anterior aun cuando actives la protección. Asignar coste explícito habilita su control cuando la protección global está activa. La ventana se configura por regla y comienza al finalizar su secuencia, además del tiempo que estuvo ejecutándose.

| Coste | Cupos iniciales | Ventana por defecto | Máximo PER_ITEM por acción | Cooldown global inicial |
|---|---:|---:|---:|---:|
| LIGHT | 100 | 0 s | 50 | 0 |
| MEDIUM | 5 | 10 s | 10 | 0 |
| HEAVY | 1 | 60 s | 1 | 0 |
| EXTREME | 1 | 120 s | 1 | 0 |

WAIT mantiene el trabajo pendiente y muestra motivo en Dashboard/Logs; un trabajo ligero elegible puede adelantarse a un pesado bloqueado. DROP cancela el trabajo con motivo explícito. El cooldown individual se consume según la semántica anterior al encolar; el global empieza al despachar. Un threshold descartado no se reproduce automáticamente. Los cambios de protección despiertan la cola si ya estaba activa.

PER_ITEM aplica al plan en el momento de encolar, sólo con protección habilitada y coste explícito, sin modificar la regla guardada. ONCE conserva sus repeticiones configuradas. El techo es por acción, no un conteo de entidades ni un presupuesto global de todos los pasos de un pool. EACH_GIFT produce las secuencias individuales anteriores; cada una necesita admisión. Una configuración nueva no reescribe trabajos ya encolados.

Se registra reserva, espera, descarte y vencimiento/liberación. STOP cancela pendientes y pasos futuros; mantiene las reservas de trabajos iniciados. Fallos/cancelación también conservan la ventana por precaución. **No se eliminan efectos ni procesos Java.** Desactivar protección permite omitir la admisión pero no borra reservas existentes; activarla nuevamente las respeta.

Las reservas reales se guardan en el JSON de settings existente: UUID de reserva, tier, ventana, vencimiento y marca de ejecución; además, vencimientos del cooldown global. No se modificó SQL. Al reiniciar, una reserva finalizada conserva su vencimiento original. Si el proceso cerró durante ejecución, se recupera conservadoramente una ventana completa desde el arranque y se registra. No se reejecuta el trabajo. Un fallo al persistir la reserva impide iniciar esa secuencia.

DRY RUN tiene reservas/cooldowns separados en memoria. No borra las reservas reales. Una secuencia protegida admitida en DRY RUN permanece simulada si se desactiva DRY RUN durante su ejecución. Al habilitar DRY RUN se siguen bloqueando comandos reales inmediatamente como antes.

## Límites conocidos

- Una ventana es una estimación: su vencimiento no garantiza que un tornado/boss haya desaparecido. Ajustarla deliberadamente y conservar STOP disponible.
- Un proceso local puede leer el contenido público. No hay endpoints de comandos, filesystem ni administración. HTTP rechaza Host/Origin ajenos, métodos distintos de GET/HEAD, rutas desconocidas y respuestas mayores a 16 MiB; un exceso requiere reducir imágenes/tarjetas visibles y queda en Logs.
- Si no hay Internet, una imagen remota puede fallar y usar el fallback. El canvas puede recortar tarjetas por escala/márgenes/configuración; comprobar el preview con el número real de reglas.
- Los audios siguen reproduciéndose en LiveForge; Browser Source sólo lleva imagen. Configura la captura de audio de la aplicación en tu software de streaming para evitar duplicarlo.
- No se implementaron telemetría, vidas/metas/top donadores, limpieza de mobs ni mods/bosses futuros.

Desarrollo: `npm run build` compila Electron y `out/overlay` independiente; ejecutar antes de `npm run dev` si necesitas HTTP durante desarrollo. Los cambios del bundle web requieren volver a compilar y reiniciar HTTP. No usar scripts de publicación antiguos para generar una versión final; el empaquetado TEST usa un override separado.
