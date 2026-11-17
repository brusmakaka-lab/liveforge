# RulesEngine y scheduler

Rule contiene id, presetId, name, enabled, trigger, conditions, actions, cooldown, priority, errorPolicy, createdAt y updatedAt. Zod valida la configuración en IPC y nuevamente al persistir.

## Triggers y contadores

- GIFT por ID (si se define) o nombre sin distinguir mayúsculas, con EACH_GIFT/STREAK_END.
- FOLLOW, SHARE y SUBSCRIBE.
- LIKE_BATCH: acumula likeCount por regla y conserva el resto módulo amount. Una actualización absoluta no genera batches por sí sola.
- TOTAL_LIKES_THRESHOLD: compara el total de sesión. Registra `ruleId:amount` sólo después de admitir el trabajo. Un umbral sin espacio puede reintentarse en el próximo LIKE; batches rechazados por cooldown/capacidad no se reproducen más tarde.
- CHAT_COMMAND: EXACT o CONTAINS, case-insensitive. Ejecuta exclusivamente acciones fijas configuradas; no interpreta el chat como comando.

Condiciones opcionales: username, cantidad mínima y coins totales para GIFT. `diamondCount` es el valor por regalo; se multiplica por la cantidad final cuando corresponde. Si el proveedor no ofrece ese dato se trata como cero.

LiveSession: id, source, startedAt, endedAt, totalLikes, receivedLikes, triggeredThresholds, eventsReceived, rulesTriggered. Conexión manual crea una sesión limpia; reconexión automática conserva la misma. El total remoto no retrocede si llega un paquete tardío. Reset toma un baseline del último total remoto y limpia thresholds/batches/contadores; conserva dedup de IDs y no elimina cooldowns. Nuevas reglas o cambios de amount tienen una clave de threshold diferente.

## Cooldown

El cooldown se reserva al aceptar un trabajo, independientemente de que luego falle. IGNORE descarta coincidencias antes del próximo turno. QUEUE reserva `max(now,nextAllowed)` y avanza nextAllowed por la duración. REPLACE cancela pendientes de la misma regla y conserva el primer turno pendiente, o el próximo turno permitido si ya hay un trabajo activo. Nunca cancela el envío activo por esta política.

Esta semántica evita que una cola pausada admita cientos de ejecuciones simultáneas de un evento con cooldown. La UI muestra el tiempo hasta el último turno reservado; QUEUE puede extenderlo más de una duración de cooldown.

## ActionQueue

Capacidad: 500 QUEUED y un RUNNING. Historial máximo: 100 terminales. Status: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED. Cada job conserva id, ruleId, eventId, nombre, prioridad, copia de acciones/evento/variables, timestamps, notBefore, errorPolicy, dryRun y error.

CRITICAL adelanta HIGH/NORMAL/LOW pendientes que ya están disponibles. A igual prioridad se respeta creación. Un trabajo activo es una secuencia serial y no se preempta por prioridad. MinecraftCommand tiene un espaciado mínimo global de 100 ms además del intervalo configurado. El transporte mantiene un envío pendiente como máximo.

Las esperas usan timers/promises y AbortSignal; no hay sleeps síncronos. Pause se observa antes de cada acción/repetición y después de intervalos. STOP aborta temporizadores y las próximas acciones, pero no deshace comandos ya enviados. Clear sólo cancela pendientes; al iniciar la aplicación la cola está vacía.

## Acciones

Cada acción tiene id, delayBefore, repeatCount e intervalBetweenRepeats. DelayBefore ocurre una vez antes de las repeticiones. Interval ocurre entre ellas. Wait tiene además su propia duración. Audio confirma el inicio de reproducción sin bloquear por la duración del archivo. ShowAlert es una notificación local con duración. LogMessage genera una entrada estructurada.

ActionPool selecciona una entrada por pesos positivos, sin porcentajes hardcodeados. Cada entrada tiene nombre y una secuencia de acciones hoja. Una seed de Settings permite resultados reproducibles con el mismo orden de trabajos. Máximo 2.000 pasos por trabajo, 1.000 repeticiones por acción, 100 acciones por secuencia y una hora por delay/interval/Wait. Estas cotas son de seguridad operacional; no limitan el número de reglas.

STOP_JOB marca FAILED y termina el trabajo cuando un handler falla. CONTINUE conserva error y sigue, finalmente FAILED. Audio siempre es no fatal. Un error no impide que el scheduler procese el siguiente trabajo.

## Renderizado seguro

Sólo variables permitidas, sin evaluación de JavaScript ni expresiones. `player` se valida contra `[A-Za-z0-9_]{1,16}`. Valores de usuarios para comandos se normalizan NFKC y se restringen a letras, números, punto, guion y guion bajo; los demás caracteres se sustituyen por `_`. No insertar directamente ese resultado en JSON/SNBT si se necesita un contenido complejo: los comandos deben ser configurados conscientemente y la variable siempre es un token simple. Variables desconocidas o plantillas incompletas fallan visiblemente.

DRY RUN se comprueba al ejecutar; se conserva también la protección de los trabajos admitidos mientras estaba activo. El motor, cooldowns, thresholds y la cola siguen funcionando normalmente. No se envían MinecraftCommand; aparece `[DRY RUN] Would execute: ...`.
