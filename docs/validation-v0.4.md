# Implementación y validación v0.4 TEST

2026-10-08. Base v0.3.0-test.2. Extensión de admisión aprobada expresamente por el usuario. No se utilizaron perfiles reales ni se inició/conectó un servidor Minecraft real.

## Implementado

- Overlay Studio, HUD público configurable derivado del preset activo; etiquetas, orden, visibilidad, diseño vertical/horizontal, fallback imagen/emoji, precio únicamente observado en eventos TikTok reales.
- Browser Source separado: `node:http` sólo en 127.0.0.1, bundle web local sin preload/IPC, GET/HEAD sobre rutas exactas, validación Host/Origin, CSP, ETag, límites de cabeceras/conexiones/tiempo/respuesta. Rutas HUD/alerts independientes; proyección pública por lista permitida.
- Preset Bedrock opt-in: 20 reglas, 16 listas y 4 borradores/configuración/FUTURE. No cambia el preset activo. Gift IDs vacíos y precios no inventados; comando Meteor y mods futuros sin completar deliberadamente.
- Reservas estimadas separadas del impacto visual y del coste. WAIT/DROP, cooldown global, cap PER_ITEM por acción, ventanas posteriores a ejecución, persistencia mínima real y recuperación conservadora si el cierre ocurrió durante ejecución. STOP conserva ventanas iniciadas; DRY RUN separado.
- Compatibilidad: campos opcionales, reglas antiguas sin coste fuera de admisión, sin migración SQL. Disponibilidad bloquea FUTURE incluso al pulsar TEST. Scheduler serial preservado con integración acotada en elección/inicio/finalización.

## Hallazgos y correcciones durante implementación

- RUNNING no mide duración de efectos: la reserva permanece después del ACK/finalización. Ningún componente mide TPS/entidades, ni elimina mobs/tormentas/procesos.
- Un cambio global de DRY RUN durante ejecución podía convertir pasos restantes de una secuencia admitida como simulada: las secuencias protegidas admitidas simuladas permanecen simuladas. Test específico añadido.
- Capturar una ventana web oculta producía timeout en Playwright; el test ahora crea una ventana de prueba visible sin foco. No se cambió la ventana transparente existente.
- La comprobación de tamaño mínimo seleccionaba la primera ventana Electron, que podía ser la web; ahora identifica la principal por URL. Revisión visual efectiva a 1050×720 realizada.

## Archivos

Existentes modificados: `src/core/gift-actions.ts`, `core/queue.ts`, `core/rules-engine.ts`, `main/runtime.ts`, `shared/model.ts`, `shared/api.ts`, `renderer/src/App.tsx`, `components/RuleEditor.tsx`, `pages/Dashboard.tsx`, `package.json` (sólo script build), README y diseño.

Nuevos: `shared/performance.ts`, `shared/overlay-studio.ts`, `shared/bedrock-preset.ts`, `core/performance-guard.ts`, `core/hud.ts`, `main/overlay-http.ts`, `renderer/src/components/HudScene.tsx`, `hud.css`, `RulePublicSettings.tsx`, `pages/OverlayStudio.tsx`, `src/browser/{index.html,main.tsx,overlay.css}`, `vite.overlay.config.ts`, esta documentación y guía de uso.

Pruebas nuevas: `tests/v04-performance.test.ts`, `tests/v04-hud.test.ts`, `tests/v04-http.test.ts`, `tests/e2e/v04.spec.ts`. No se reescribieron pruebas anteriores para hacerlas pasar. Evidencias, configuración de empaquetado y smoke aislado en `work/v04`.

Comparación contra los hashes de fase 0: **23 archivos protegidos sin cambios**, incluyendo TikTok/normalizador, adaptadores RCON/Minecraft, Server Hub, almacenamiento, audio, AlertStore/AlertCards y ventana transparente. No se añadieron dependencias.

## Resultados automatizados del código

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | PASS, código 0 |
| `npm run lint` | PASS, código 0 |
| `npm test` | **105/105**, 13 archivos, código 0 |
| E2E del código compilado | **11/11**, 0 omitidos, código 0 |
| `npm run build` | PASS: main, preload, renderer, bundle HTTP, código 0 |

E2E: desktop/RCON fixture/reinicio; WAV y MP3 reales con preview/reglas/volumen/mute/fallo aislado; imagen personalizada/persistencia/fallback; overlay visible; 5 escenarios Server Hub (incluidos `.bat`/`.cmd` con pause y servidor que no termina); racha/audio serial; nuevo Studio/HTTP/HUD/reinicio. WAV/MP3 se leyeron de archivos ya autorizados; no se afirma una nueva validación auditiva humana.

Guard: HEAVY/EXTREME reserva→espera→vencimiento, LIGHT/legacy, DROP, cooldown global+ventana e individual+ventana, STOP, DRY RUN y cambio de modo, PER_ITEM, disco fallido, SQLite/reinicio activo y finalizado. HTTP: endpoints/métodos/Host/Origin/traversal/ETag/puerto ocupado/reintento/reinicio y respuesta >16 MiB. HUD: privacidad, filtros/orden, compatibilidad, precios simulados rechazados, nombres ambiguos, preset y FUTURE bloqueado.

No errores de typecheck/lint. Warnings no bloqueantes existentes: API SQLite experimental de Node y anotaciones de comentarios de Zod removidas por Rollup. No se actualizaron dependencias para silenciarlos.

## Pendiente manual / límites

OBS/TikTok Live Studio: **pendiente de validación manual**, tanto Browser Source como captura de ventana. También balance de las 16 reglas listas en Mohist, asignación real de gifts, ventanas estimadas adecuadas a los efectos y convivencia con otras cargas externas al motor. No se repitió una conexión TikTok real durante esta implementación.

No se garantiza ausencia de efectos al vencer una reserva; no hay telemetría. Un trabajo largo sigue bloqueando la cola serial. Los límites por tier son independientes y el cap PER_ITEM es por acción, no por entidad. Imágenes remotas necesitan conectividad; el fallback/local funciona sin CDN. El HUD puede recortarse si el usuario configura escala/márgenes excesivos. Los settings de Browser Source y protección empiezan desactivados en perfiles nuevos/antiguos.

El paquete, si se entrega, será exclusivamente Portable **0.4.0-test.1**, con override de versión y salida independiente; no Setup ni release final. La versión base del package.json permanece histórica para evitar modificar configuración de publicación previa. El sidebar identifica la nueva TEST; la ventana de alertas conserva su nombre histórico.

## Cierre de empaquetado TEST

Portable generado y validado **0.4.0-test.1**, 103.220.372 bytes. No se generó Setup. Artefactos relativos a la raíz del proyecto:

- `release/v0.4.0-test.1/LiveForge-Portable-0.4.0-test.1-x64.exe`
- `release/v0.4.0-test.1/Start-LiveForge-v0.4.0-test.1-Isolated.cmd`
- Perfil exclusivo `release/v0.4.0-test.1/data-v0.4.0-test.1`.

**2/2 E2E adicionales sobre win-unpacked PASS**, 22,7 s: SQLite/audio/workflow y Studio/HTTP/racha/reinicio. Se suman a los 11 E2E del código, no sustituyen pruebas de captura humana.

**Smoke Portable mediante launcher PASS**: app.isPackaged=true, app.getVersion=0.4.0-test.1, entorno y app.getPath(userData) coinciden exactamente con el perfil TEST; Dashboard, Presets/Rules, Simulator, Logs, Settings, Server Hub y Overlay Studio sin errores. Se verificaron los bytes de todos los archivos `out/` dentro del ASAR extraído del Portable. Sin diferencias funcionales entre compilación y paquete. El smoke sólo generó un evento simulado, dejó EVENTS detenidos/DRY RUN activo y no configuró servidor real.

Hashes de **8 ejecutables anteriores conservados**, incluidos v0.3.0-test.2 y las versiones anteriores enumeradas en `work/v04/releases-before.json`. Evidencia: `check.log`, `packaged-e2e.log`, `package.log`, `smoke-result.json`, `integrity-result.json` y `portable-sha256.json`. Se conservaron perfiles anteriores sin leerlos/copiar sus configuraciones.

Limitaciones de identificación heredadas: ventana transparente titulada v0.2 y campo `app` de Copy diagnostics todavía histórico 0.2.0; la versión efectiva verificada del paquete es 0.4.0-test.1 y el sidebar la identifica. No se refactorizó diagnóstico/audio/overlay para cambiar esos textos. Portable sin firma comercial y con icono estándar Electron; Windows puede mostrar aviso de reputación. La documentación de cierre en el repositorio incluye estas pruebas posteriores al empaquetado.
