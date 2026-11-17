# Plan técnico y decisiones

Aplicación original de escritorio Windows, nombre provisional LiveForge. No se utiliza código, interfaz ni assets de productos de referencia.

Stack: Electron 44, React, TypeScript estricto, Zod, SQLite mediante `node:sqlite` (sin recompilar addons), electron-vite, Vitest y Playwright Electron. Node 24 disponible. Versiones reproducibles en package-lock.json.

1. Scaffold, contratos compartidos, migraciones SQLite y repositorio transaccional.
2. Eventos discriminados, bus síncrono aislado y deduplicación acotada.
3. Motor de reglas: rachas, condiciones, thresholds de sesión, batches, cooldowns y pools deterministas.
4. Cola asíncrona serial: prioridades, capacidad, pausas, cancelación entre acciones y temporizadores abortables.
5. GameAdapter → MinecraftAdapter → MinecraftTransport → RCON. Comandos libres, plantillas seguras.
6. Simulador por el mismo bus y motor; TEST dirigido sin modificar contadores reales.
7. TikTokProvider aislado, normalizador validado, backoff, rechazo de historial y generaciones de conexión.
8. UI: Dashboard, presets/editor, biblioteca, simulador, diagnósticos y settings.
9. Integración y validación de dry run, STOP, sesiones y persistencia.
10. Pruebas unitarias, integración con servidor RCON de prueba, recorrido Electron, compilación Windows y documentación.

Proceso principal propietario del estado y SQLite; renderer aislado, sandbox y puente IPC limitado con Zod. Secretos cifrados con safeStorage/DPAPI. Cola no persistida: al reiniciar no se repiten comandos pendientes. Logs con límites de cantidad/edad; eventos raw opcionales sólo en memoria. Al iniciar: eventos detenidos y dry run activo.

Las reglas de meteorito, boss y boom se entregan desactivadas como borradores editables: el usuario debe aportar la sintaxis real del plugin/mod. No se inventan comandos.

Actualización del usuario: UI, motor, simulador, cola, START/STOP, DRY RUN, RCON y comandos/mods reales en Mohist fueron validados manualmente. No se rehacen esos componentes.

Parche 0.1.1: corregir exclusivamente username/Room ID de TikTok y diagnóstico; mantener backoff/deduplicación. Añadir release portable junto al instalador y documentar AppData/traslado/DPAPI. El fallo por mayúsculas está reproducido y corregido; la aceptación de recepción real TikTok requiere la cuenta en LIVE. Ver `tiktok-connection.md` y `windows-portability.md`.

v0.2: ampliar sólo presentación/audio y el modo adicional STREAK_UPDATE. Seguimiento visual optativo; proveedor de conexión, scheduler, adaptadores Minecraft/RCON y repositorio/migraciones SQLite protegidos por hashes. La validación E2E real v0.1.1 fue confirmada por el usuario. Captura OBS/Live Studio v0.2 pendiente de comprobación manual; no bloquea artefactos por instrucción del usuario. Ver v0.2-alerts-audio.md.
