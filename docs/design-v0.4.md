# LiveForge v0.4 — inspección y plan de implementación

Fecha: 2026-10-08. Base: **v0.3.0-test.2**, validada manualmente por el usuario.

Estado: **diseño aprobado, implementado y validado automáticamente; Portable TEST generado**. La sección 4 registra la decisión que el usuario aprobó expresamente: admisión serial con reservas y ventanas estimadas persistidas. Resultados finales y archivos en `validation-v0.4.md`. Las referencias a propuestas describen la fase de diseño inicial. OBS/TikTok Live Studio y balance real siguen pendientes de validación manual.

## 1. Inspección de la base

El proyecto continúa en `outputs/liveforge`. Git muestra sus archivos como no rastreados; no existe un diff útil contra HEAD. Para esta fase se registraron hashes de `src` y `tests` en `work/v04-phase0/source-before.json`, además del Portable test.2. No se leyó ni copió ningún perfil real.

| Infraestructura inspeccionada | Estado y reutilización |
|---|---|
| `core/rules-engine.ts` | Matching por ID/nombre, streaks, cooldowns, thresholds, TEST y STOP existentes. No duplicar el motor para previews. |
| `core/queue.ts` | Una sola secuencia RUNNING; prioridades entre pendientes, notBefore, pausa, aborto entre acciones y presupuesto de 2.000 pasos. No reemplazar el scheduler. |
| `core/gift-actions.ts` | Planifica copias de acciones ONCE/PER_ITEM y limita repeats por acción. Conservar semántica EACH_GIFT/STREAK_END/STREAK_UPDATE. |
| `main/media.ts` y `core/alert-store.ts` | Una fuente de alertas, actualización de rachas y expiración. Distribuir su presentación a HTTP, sin otro generador de alertas. |
| `components/AlertCards.tsx` | `AlertCards` recibe datos y dibuja; `useAlerts` depende del IPC de Electron. Reutilizar la presentación, no ejecutar el hook IPC en un navegador. |
| `main/overlay-window.ts` | Ventana transparente, sin foco, IPC restringido. Se conserva como está; el HUD web coexistirá con ella. |
| `providers/simulator.ts` | Publica por EventBus y motor real. Se reutiliza para reglas; preview de composición del HUD no ejecuta gameplay. |
| `shared/model.ts` | Ya existe `impact` LOW/NORMAL/HIGH/EPIC. No crear otro `impactTier` que pueda contradecirlo. |
| `storage/repository.ts` | Metadatos de reglas/settings guardados como JSON validado; acciones en su tabla actual. Permite campos opcionales sin migración SQL. |
| `shared/defaults.ts` | Biblioteca conocida de Weather2; Meteor tiene comando vacío. `/boom` necesita potencia; el nuevo pedido confirma `execute as {{player}} at @s run boom 4`. |
| `main/server-hub.ts` | Cierre de scripts mediante stop + EOF y espera de close real, timeout sin kill. Congelar durante v0.4. |
| TikTok | Se conservan `enableExtendedGiftInfo: false`, `content`, `displayId`, normalización y reconexión. No consultar catálogo premium. |

Pruebas leídas: motor/dedup/thresholds; Queue/cancelación/DRY RUN; cantidades; persistencia; alertas/rachas/audio; Server Hub y E2E de UI, medios y procesos Windows. La última evidencia de v0.3 es 83 tests, typecheck/lint/compile y 5 E2E del Hub aprobados, más smoke del Portable. Son resultados previos, **no pruebas de v0.4**.

La confirmación manual nueva del usuario cubre Mohist, RCON, Hub y demás funciones enumeradas en su pedido; prevalece sobre pendientes históricos de informes anteriores. OBS/TikTok Live Studio no se consideran validados.

## 2. Arquitectura propuesta para Overlay Studio y Browser Source

```text
Repository: preset activo + reglas + ajustes Studio
                       ↓
                proyección pública HUD ───────→ Studio preview
                       ↓
              servidor HTTP loopback ─────────→ Browser Source HUD

ShowAlert / progreso → DesktopMedia / AlertStore
                       ├→ ventana transparente existente (IPC)
                       └→ proyección pública de alertas → Browser Source alerts

Browser Source: lectura únicamente; sin ruta hacia Rules Engine, Queue o RCON
```

### HTTP y actualización

- Servicio propio pequeño con `node:http`; no Express, WebSocket adicional ni dependencias grandes.
- Bind **siempre explícito a 127.0.0.1**. No opción de publicación en LAN en v0.4.
- Puerto configurable persistido; propuesta inicial 18764. Deshabilitado por defecto al abrir perfiles antiguos. Activación explícita desde Studio.
- URLs estables `/overlay/hud` y `/overlay/alerts`; endpoint GET de estado público separado. Misma URL al reiniciar mientras el puerto esté disponible.
- Puerto ocupado: estado ERROR con motivo, botón reintentar y edición de puerto. No elegir silenciosamente otro puerto que rompa la URL de OBS.
- Cliente consulta estado cada 500 ms, sin peticiones solapadas, con reintento tras desconexión. Revisión/ETag para evitar reenviar imágenes sin cambios. Al reiniciar no reproducir alertas antiguas.
- Snapshot HTTP propio y explícito: nunca reutilizar `Runtime.snapshot()` como respuesta pública.
- Entrada web independiente, compilada junto al renderer, sin `window.liveforge`, preload, Node ni dependencias de la aplicación de administración. React y CSS locales, sin CDN.
- Mantener `/overlay/hud` y `/overlay/alerts` independientes para que el usuario coloque cada fuente. El overlay transparente actual mantiene sus funciones.
- La aplicación es dueña del ciclo de vida HTTP: iniciar según configuración, cerrar listener/conexiones al cerrar LiveForge; error HTTP no impide RCON ni Hub.

### Seguridad y assets

- Sólo GET/HEAD sobre rutas enumeradas. POST/PUT/DELETE y rutas de comandos/configuración/filesystem: rechazadas.
- Assets estáticos: mapa de archivos generados por el build, no concatenación de una ruta solicitada por el cliente. No servir el bundle de administración, source maps, `app.asar`, SQLite, documentos, logs ni archivos del servidor Minecraft.
- Comprobar Host y Origin cuando exista; no CORS comodín. CSP restringida, `nosniff`, límites de cabeceras/tiempo/conexiones y respuestas sin secretos.
- Datos públicos mediante lista permitida de campos: etiquetas, trigger legible, imagen segura, emoji, impacto, cantidad pública, precio conocido y ajustes visuales. Excluir comandos, condiciones privadas, nombres internos de regla por defecto, rutas locales, configuración, eventos raw y credenciales.
- Render mediante texto React, nunca HTML configurable ni `dangerouslySetInnerHTML`.
- Imagen personalizada: reutilizar el PNG importado/data URL validado existente. No crear un endpoint que lea rutas del disco.
- Imágenes de TikTok sólo si ya vinieron en eventos normalizados, con la validación de URL existente; una imagen remota puede fallar sin Internet y debe caer a personalizada/emoji. El funcionamiento esencial del HUD y sus assets locales no requiere Internet.
- Cualquier proceso local puede consultar el contenido público; la URL no será un sistema de autenticación. Por eso sólo transportará lo que se pretende mostrar al público.

### Studio

Nueva sección, formulario simple y preview compartiendo el mismo componente `HudScene` con la Browser Source. Controles: habilitar HUD, canvas vertical 1080×1920, escala, alineación/posición, columnas, separación, tamaño de icono y texto, mostrar precio/regalo/efecto. Filas derivadas del número de elementos y columnas; aviso de desbordamiento en preview, sin eliminar reglas silenciosamente.

Lista derivada del preset activo: ordenar con subir/bajar o número, ocultar mediante `showInHud`, editar etiqueta pública y ver impacto/coste. Guardado explícito y actualización automática de la Browser Source después de guardar. Mostrar estado HTTP, copiar URLs y abrir preview. La ventana transparente existente sigue accesible.

## 3. Modelo compatible y persistencia

Campos propuestos opcionales de Rule:

| Campo | Semántica/default para reglas antiguas |
|---|---|
| `publicLabel?: string` | Vacío; nunca extraer un comando para rellenarlo. |
| `showInHud?: boolean` | false en reglas antiguas; evita publicar inadvertidamente nombres/configuración interna. |
| `hudOrder?: number` | 0; desempate estable por orden existente/id. |
| `impact` existente | NORMAL efectivo cuando está ausente. Se conserva el nombre actual. |
| `performanceCost?: LIGHT/MEDIUM/HEAVY/EXTREME` | Ausente: sin admisión por coste, conserva comportamiento anterior incluso con protección global. Clasificación manual, no inferida. |
| `performanceWindowMs?: number` | Ventana estimada posterior a la secuencia; depende de la decisión de sección 4. |
| `availability?: READY/REQUIRES_CONFIGURATION/REQUIRES_MOD` | READY efectivo. Impide ejecutar un ejemplo FUTURE por TEST accidentalmente. |

Settings opcionales: `overlayStudio` (HTTP y diseño), `performanceProtection` (habilitación, caps por tier, cooldown global, política WAIT/DROP y límite PER_ITEM). Defaults efectivos fuera de Zod `.default()` cuando sea necesario para no alterar el round-trip de objetos antiguos. No cambiar formato/tablas de SQLite ni escribir perfiles reales.

FUTURE necesita protección distinta de `enabled=false`: TEST actualmente omite enabled deliberadamente. La marca de disponibilidad debe bloquear acciones ejecutables de FUTURE sin cambiar TEST para reglas antiguas deshabilitadas. Los ejemplos FUTURE sólo contendrán un LogMessage informativo y ningún comando de mod; aun así se bloqueará TEST hasta configurarlos y pasar a READY.

HUD: sólo preset activo, reglas enabled + READY + showInHud, con publicLabel válido. Trigger legible si no es un regalo (Follow, cada N likes, comando de chat). ONCE muestra la etiqueta; PER_ITEM añade «por unidad, hasta N» basado en el límite efectivo, sin detalles del scheduler. Acciones mixtas ONCE/PER_ITEM deben indicarlo sin afirmar que toda la regla se multiplica.

Precios/imágenes recibidos: observador de presentación del EventBus, sin cambiar TikTokProvider. Caché acotada sólo de metadatos de regalos y sin comandos/usuarios. Sólo datos reales de fuente TikTok son precio observado; el `diamondCount=1` por defecto del Simulator **no puede convertirse en precio real**. Sin precio observado, omitirlo o mostrar «—». No persistir un precio inferido ni inventar IDs. Caché por ID; resolver por nombre sólo si no es ambiguo.

## 4. Decisión arquitectónica que debe resolverse antes de implementar

### Riesgo demostrado por la implementación actual

`ActionQueue` tiene un único `running` y marca COMPLETED al terminar handlers. El handler Minecraft espera la respuesta a un comando; esa respuesta no informa cuándo desapareció un tornado, un boss o sus entidades. Dos comandos pueden finalizar rápido y dejar dos efectos activos en el mundo, aunque nunca hubo dos trabajos RUNNING simultáneos.

Contar RUNNING daría una protección ficticia. Reservar slots al recibir eventos tampoco basta: cooldowns, pausa, prioridades y demoras cambian el momento real de ejecución. Agregar un Wait largo al trabajo bloquearía también eventos ligeros por la cola serial. Cambiar el scheduler a paralelo alteraría el comportamiento validado y no se propone.

### Alternativa mínima recomendada: ventanas estimadas de actividad

1. Mantener la ejecución serial. Añadir un punto opcional de admisión en `pump`, antes de elegir un trabajo ejecutable, y notificaciones acotadas de inicio/finalización/cancelación a un `PerformanceGuard` separado.
2. Sin protección habilitada, seguir exactamente el recorrido antiguo. Con protección, un trabajo puede estar listo, esperar hasta cierta fecha o descartarse con motivo explícito. Los ligeros listos pueden pasar por delante de un pesado bloqueado; las prioridades se mantienen entre trabajos elegibles.
3. Máximos HEAVY y EXTREME cuentan **activaciones/secuencias**, no entidades ni TPS. Cada activación conserva un cupo durante toda su ejecución y una ventana adicional configurable después. No liberar por el mero ACK RCON.
4. Cooldown global de tier opcional, desde el inicio efectivo. Política WAIT por defecto dentro de la capacidad existente de 500 trabajos; DROP opcional. Mostrar motivo y fecha estimada de elegibilidad en la cola. Evitar timers sin límite y bucles de espera sin progreso.
5. Reglas PER_ITEM: mantener límite por acción existente y añadir techo por tier a las copias planificadas, sólo cuando la protección esté habilitada. No reescribir la regla guardada. Los cupos son por secuencia: una secuencia que invoca varias entidades sigue siendo un evento; este límite no pretende medir entidades. Para HEAVY/EXTREME el preset inicial propone ONCE y máximo 1 repetición por acción, para que esa distinción no multiplique tornados por defecto.
6. STOP cancela pendientes y pasos futuros con el mecanismo existente. **No libera prematuramente** la ventana de un efecto ya ejecutado ni elimina entidades; START no debe permitir eludir la protección. Reserva previa a un trabajo nunca iniciado sí se libera. Fallo/cancelación tras inicio conserva una ventana conservadora porque un comando podría haberse ejecutado pese a una respuesta fallida.
7. DRY RUN aplica las mismas reglas de admisión para ensayar. Separar reservas simuladas de las reales; nunca borrar las reales al cambiar DRY RUN. TEST también respeta protecciones y STOP.
8. Reiniciar LiveForge pierde el estado en memoria aunque Minecraft podría seguir activo. Si se requiere conservar protección entre reinicios, persistir exclusivamente vencimientos/cooldowns reales por tier en el JSON de settings y reaplicarlos al inicio, sin reejecutar trabajos. Esto debe formar parte de la decisión, no presentarse como detección de entidades.

Propuesta inicial para el nuevo preset: HEAVY 1 cupo/60 s de ventana, EXTREME 1 cupo/120 s; editables y claramente **estimados**, no duraciones confirmadas de Weather2. Límites por tier independientes; no equivalen a un máximo conjunto HEAVY+EXTREME. Una regla con efecto permanente necesita una ventana deliberada del usuario; no puede garantizarse su desaparición sin una futura señal del juego.

**Decisión aprobada por el usuario:** control por ventanas estimadas y extensión opcional de admisión de la cola, incluyendo conservación de vencimientos reales entre reinicios. Una medición real de efectos requeriría confirmación desde Minecraft/plugin/mod; se deja fuera de esta versión.

La implementación comenzó tras esa aprobación. El scheduler continúa siendo serial; no se incorporó telemetría ni limpieza de efectos.

## 5. Preset propuesto «Bedrock Interactive v1» (20 reglas)

No reemplaza el starter ni el preset activo. Se ofrece mediante «Crear preset Bedrock», guarda una colección nueva y requiere activación explícita. Sin audio ni rutas de imágenes preasignadas. Cada regla lista incluye ShowAlert + comandos configurados; iconos emoji propios/fallback. Todas las Gift IDs vacías. Rose/Donut/Crown son nombres orientativos aportados en el pedido, editables; no se garantizan como catálogo actual.

Para no inventar otros 17 nombres de regalos, las asignaciones restantes se proponen como eventos/CHAT_COMMAND configurados, editables a Gift desde Rules. No utilizar un Gift Name ficticio como `CONFIGURAR` para una regla activa. Esta elección permite ensayar el preset completo y mantiene visibles disparadores comprensibles en el HUD.

| # | Efecto público | Trigger propuesto | Impact / coste | Estado inicial |
|---|---|---|---|---|
| 1 | ZOMBIE | Gift Rose, STREAK_END | LOW / LIGHT | Activa, PER_ITEM máx. 5, 500 ms |
| 2 | SKELETON | Follow | LOW / LIGHT | Activa, ONCE |
| 3 | SPIDER | Share | LOW / LIGHT | Activa, ONCE |
| 4 | ZOMBIES ×2 | Chat !zombies | LOW / LIGHT | Activa, 2 repeticiones, 500 ms |
| 5 | BOOM | Chat !boom | LOW / LIGHT | Activa, una ejecución de boom 4 |
| 6 | CREEPER | Cada 500 likes | NORMAL / MEDIUM | Activa, ONCE |
| 7 | BOOM ×4 | Gift Donut, STREAK_END | NORMAL / MEDIUM | Activa, 4 ejecuciones de boom 4, 750 ms |
| 8 | EMBOSCADA | Chat !ambush | NORMAL / MEDIUM | Activa, zombie + skeleton |
| 9 | MOB MIX | Chat !mix | NORMAL / MEDIUM | Activa, zombie + skeleton + spider |
| 10 | VELOCIDAD | Chat !speed | NORMAL / LIGHT | Activa, efecto vanilla conocido de biblioteca |
| 11 | RAVAGER | Gift Crown, STREAK_END | HIGH / MEDIUM | Activa, ONCE |
| 12 | WARDEN | 50.000 likes totales | HIGH / HEAVY | Activa, ONCE |
| 13 | LIGHTNING | Chat !lightning | HIGH / MEDIUM | Activa, vanilla de biblioteca |
| 14 | TORNADO F1 | Chat !tornado | EPIC / HEAVY | Activa, ONCE |
| 15 | FIRENADO F1 | Chat !firenado | EPIC / EXTREME | Activa, ONCE |
| 16 | SHARKNADO | Chat !sharknado | EPIC / EXTREME | Activa, ONCE; comando explícito existente |
| 17 | METEOR | Sin regalo asignado; borrador | HIGH / HEAVY | Deshabilitada, REQUIRES_CONFIGURATION |
| 18 | FUTURE · MUTANT ZOMBIE | Sin regalo asignado; borrador | HIGH / HEAVY | Deshabilitada, REQUIRES_MOD, oculta |
| 19 | FUTURE · MUTANT CREEPER | Sin regalo asignado; borrador | EPIC / EXTREME | Deshabilitada, REQUIRES_MOD, oculta |
| 20 | FUTURE · BOSS | Sin regalo asignado; borrador | EPIC / EXTREME | Deshabilitada, REQUIRES_MOD, oculta |

BOOM ×4 significa **cuatro ejecuciones**, no potencia 4; cada comando ya usa potencia 4 confirmada en el pedido. La ayuda del editor distinguirá ambas cantidades. Todos los comandos usan `{{player}}`, nunca un nombre fijo.

Cooldown inicial IGNORE: LOW 10 s, NORMAL 20 s, HIGH 45 s, EPIC 90 s; prioridades LOW/NORMAL/HIGH/CRITICAL respectivamente, como datos editables y separados del impacto/coste. Son propuestas de balance, no precios ni medidas de carga.

Meteor permanece sin MinecraftCommand: la biblioteca del código tiene el comando vacío, y se prohibió leer perfiles reales. Al configurar, el usuario podrá elegir un comando guardado y revisar el texto. No deducir sintaxis Skyfall a partir del nombre. FUTURE no incluye comandos inventados. Las reglas activas tendrán showInHud=true; las otras false.

## 6. Fases de implementación y archivos previstos

| Fase | Trabajo y criterio de salida |
|---|---|
| 0 (actual) | Inspección, inventario de reutilización, plan y decisión de rendimiento. Sólo documento. |
| 1 | Modelos opcionales y proyección pública pura, tests de compatibilidad/round-trip/HUD/orden/ocultación. Sin HTTP aún. |
| 2 | Componente HUD y Studio; campos públicos en Rules; preset opt-in; pruebas de previews y persistencia en perfiles nuevos. |
| 3 | HTTP loopback y entrada web independiente; rutas cerradas, puerto ocupado/reinicio, lectura pública y assets offline. E2E en Chromium sin API Electron. |
| 4 | Guard de rendimiento aprobado, puntos opcionales de Queue, techo PER_ITEM y estados visibles. Regresión completa de prioridades/cancelación antes de continuar. |
| 5 | Simulator/TEST integrado, cantidades/rachas/preview, documentación de instalación Browser Source, roadmap y QA final. |
| 6 | Sólo si todo está verde y hace falta validación manual: Portable v0.4.0-test.1 + launcher + perfil nuevo. Ningún Setup o release estable. |

Archivos existentes previstos: `shared/model.ts`, `shared/api.ts`, `main/runtime.ts`, `core/rules-engine.ts` (propagar metadatos/bloquear FUTURE), `core/gift-actions.ts` (cap opcional), `core/queue.ts` (sólo extensión acordada), `renderer/src/App.tsx`, `components/RuleEditor.tsx`, `pages/Presets.tsx`, `pages/Simulator.tsx`, `pages/Dashboard.tsx` (motivo de espera), estilos localizados y `electron.vite.config.ts` (entrada web).

Archivos nuevos previstos: `shared/overlay-studio.ts`, `core/hud.ts`, `core/performance-guard.ts`, `shared/bedrock-preset.ts`, `main/overlay-http.ts`, `renderer/overlay.html`, entrada web de overlay, `components/HudScene.tsx`, `pages/OverlayStudio.tsx`, CSS dedicado y tests por módulo. Nombres finales ajustables sin duplicar responsabilidades.

Preservar implementación de TikTokProvider/normalizer, RCON/MinecraftAdapter, ServerHub/server-paths, SQLite/migrations, AudioQueue/AudioPlayer, AlertStore y OverlayWindow. `AlertCards` puede importarse por su función de presentación pura; no alterar su hook IPC validado. La distribución HTTP de alertas se incorpora en Runtime sin reemplazar DesktopMedia.

## 7. Validación requerida antes de afirmar que v0.4 funciona

- Modelo: reglas antiguas siguen equivalentes, defaults no destructivos, serialización/duplicado/reinicio con nuevos campos, FUTURE no ejecutable por evento ni TEST.
- HUD: preset activo, disabled/ocultas excluidas, orden estable, no comandos/secretos, cantidad mixta ONCE/PER_ITEM, impacto separado de coste, datos sin precio, cambio de reglas reflejado.
- HTTP: bind real loopback; sólo rutas/métodos permitidos; sin lectura de archivos arbitrarios, path traversal, CORS abierto ni ejecución; Host inválido; puerto ocupado; stop/start mismo puerto; clientes desconectados/reconectados; límites de respuesta.
- Navegador real: fuente transparente (CSS calculado y captura), canvas vertical, sin `window.liveforge`, actualización en vivo, assets locales con red externa bloqueada, fallback de imagen, cero ejecución automática al abrir preview.
- Rendimiento: reloj controlado para caps/cooldowns, WAIT/DROP y prioridad entre elegibles; sin hambre/busy-loop; límites combinados con PER_ITEM/pools/EACH_GIFT; protección desactivada idéntica a v0.3; STOP/RESUME no libera efectos ya enviados; timeout/errores/cancelación conservadores; DRY RUN y TEST; reinicio con vencimientos reales.
- Preset: exactamente 20 reglas propuestas, sin IDs/precios/assets ficticios, comandos válidos conocidos, ninguna acción ejecutable de mods futuros, preset no activado automáticamente.
- Regresión: typecheck, lint, todos los tests y todos los E2E pertinentes existentes, incluidos medios WAV/MP3, rachas y Hub con/sin pause. Compilar Electron y entrada web.
- Si hay artefacto TEST: arrancar mediante launcher, verificar ruta efectiva de datos, ambos tipos de overlay y HTTP empaquetado; comparar hashes de releases anteriores. No reutilizar perfiles reales/test anteriores.

## 8. Limitaciones y roadmap

- Los límites de actividad por tiempo son estimaciones; no prueban ausencia de tornados/entidades ni salud del servidor. Para ello haría falta instrumentación futura del adaptador/plugin.
- Un único job largo conserva la ejecución serial existente; esta versión no introduce paralelismo de acciones.
- El Browser Source público comparte sólo datos destinados a espectadores. Las etiquetas/textos de alertas configurados por el usuario son públicos por definición.
- Captura real y compatibilidad con **OBS y TikTok Live Studio: pendientes de validación manual**; Chromium E2E no las sustituye.
- Nuevos gifts/precios, asignación de regalos de cada cuenta, balance del preset y duración real de efectos requieren revisión manual. No usar catálogo premium.
- Fuera de v0.4: vidas, metas visuales avanzadas, top donadores, limpieza de mobs, TPS/RAM/entidades, plugin de confirmación de fin de efecto, nuevos mods y bosses, cloud/marketplace.

## 9. Evidencia y referencias

Base previa: `work/test-release-030-2/check.log`, `e2e.log`, `smoke-result.json`, `integrity-result.json`. No se reejecutaron checks en esta fase documental ni se presenta aquella evidencia como validación de v0.4.

HTTP integrado: [API HTTP de Node 24](https://nodejs.org/docs/latest-v24.x/api/http.html). Entradas web compiladas: [Vite 7, aplicación multipágina](https://v7.vite.dev/guide/build.html#multi-page-app). Mantener la API de la versión instalada (Vite 7.3.6 / rollupOptions); no actualizar dependencias para seguir ejemplos de otra versión.
