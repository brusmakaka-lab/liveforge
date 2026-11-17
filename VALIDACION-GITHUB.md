# Verificación para GitHub

Fecha: 16/11/2026. Fuente **0.4.0-test.1**; `package.json` conserva 0.2.0 por la decisión histórica documentada. Las dos copias C:/E: coincidieron en los 124 archivos de fuente/documentación seleccionados. Se conservó el código sin cambios; README y exclusiones se adaptaron para el respaldo público.

## Controles de esta publicación

- Instalación aislada desde `package-lock.json`: `npm ci --ignore-scripts`, 504 paquetes. Para las pruebas de escritorio se usó el runtime Electron 44.5.1 existente, de la misma versión fijada.
- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado.
- `npm test`: **105/105**, 13 archivos.
- `npm run build`: aprobado para main, preload, renderer y bundle de Browser Source.
- `playwright test tests/e2e/desktop.spec.ts tests/e2e/v04.spec.ts`: **2/2**. Flujo SQLite → UI → simulador → motor → cola → RCON fixture → reinicio, más Overlay Studio/HTTP/HUD/racha/reinicio.

Los tests usaron perfiles separados en `work/` y un RCON simulado. No se conectaron un LIVE, un servidor Minecraft real, OBS ni TikTok Live Studio. No se generaron nuevos instaladores y no se repitieron todas las pruebas históricas de medios/empaquetado. Las advertencias de SQLite experimental y comentarios de anotación Zod/Rollup no impidieron los controles.

Las capturas de `docs/screenshots/` se revisaron antes del envío y corresponden a pruebas locales históricas, no a una nueva prueba de captura OBS. Las pruebas históricas de `docs/` conservan sus fechas y alcance.
