# Validación y definición de terminado

Este informe separa implementación, comprobación automatizada y aceptación externa. Un build que compila no basta para declarar que TikTok/Mohist funcionaron realmente.

## Evidencia local

- 43 tests del núcleo, SQLite, RCON y reconexión pasaron en Windows con Node 24.
- TypeScript estricto y ESLint sin errores.
- E2E de la aplicación Electron: alta de preset/regla por UI, guardado, activación, TEST, dry run, simulador → motor → cola → TCP/RCON, repeticiones/intervalos, STOP, diagnóstico sin contraseña, cierre/reapertura y reconexión usando el secreto cifrado.
- Capturas reales de Dashboard, Settings, Rule editor, Simulator y Diagnostics en `docs/screenshots/`.
- Auditoría npm: cero vulnerabilidades después de actualizar la dependencia HTTP compatible. Repetir `npm audit` antes de futuras distribuciones.
- Prueba del ejecutable empaquetado e instalador: pendiente de finalizar en este ciclo; ver resultado final de build antes de distribuir.

## Definición de terminado del MVP (22 puntos)

| #   | Criterio original          | Implementación / validación                                                                                                         |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Abrir aplicación           | Electron iniciado y pantallas verificadas; ejecución empaquetada se registra al terminar el build.                                  |
| 2   | Configurar @username       | Settings; comprobado en E2E y persistencia.                                                                                         |
| 3   | Conectar LIVE              | TikTokProvider implementado; ciclo de conexión y backoff probados con conector simulado. Pendiente LIVE real.                       |
| 4   | Ver eventos reales         | Normalizador/feed implementados y validados con fixtures v2.5. Pendiente cuenta en LIVE.                                            |
| 5   | Configurar Minecraft       | Host/puerto/contraseña/jugador en Settings; comprobado en E2E.                                                                      |
| 6   | Probar conexión            | Auth RCON, `list`, latencia y respuesta comprobados contra servidor TCP de prueba. Mohist real validado manualmente por el usuario. |
| 7   | Crear preset               | UI y SQLite comprobados en E2E. CRUD/duplicación transaccional cubiertos.                                                           |
| 8   | Crear regla                | UI, Zod, acciones y persistencia comprobados.                                                                                       |
| 9   | Gift/Follow/Share/Likes    | Implementados. Gift/follow en E2E; matching y thresholds/batches en tests.                                                          |
| 10  | Uno o varios comandos      | Secuencias y handlers; verificación de orden, repetición y fallos.                                                                  |
| 11  | Delay/repetición/intervalo | Configurados desde UI y comprobados en cola/TCP.                                                                                    |
| 12  | Guardar regla              | SQLite con acciones ordenadas; cierre/reapertura comprobado.                                                                        |
| 13  | TEST sin LIVE              | Evento dirigido por bus → motor → cola; dry run y STOP respetados.                                                                  |
| 14  | Evento real TikTok         | Adaptador listo; pendiente LIVE real.                                                                                               |
| 15  | Ver Rule coincidente       | Feed/log estructurado y E2E.                                                                                                        |
| 16  | Ver acción en Queue        | Status y job history; E2E y tests de prioridad/cancelación.                                                                         |
| 17  | Comando en Minecraft       | TCP/RCON comprobado, plantillas y captura exacta. Efectos en Mohist validados manualmente por el usuario.                           |
| 18  | Cooldown                   | IGNORE/QUEUE/REPLACE y reservas comprobados con tests.                                                                              |
| 19  | Total-like thresholds      | 10K/25K/50K una vez; 50.001 sin duplicado, nueva sesión y reset con baseline probados.                                              |
| 20  | DRY RUN                    | E2E verifica cero envíos de MinecraftCommand y logs renderizados.                                                                   |
| 21  | STOP ALL EVENTS            | Cancela espera/secuencia pendiente, bloquea nuevos triggers y TEST; no interrumpe envío ya iniciado.                                |
| 22  | Persistir al reabrir       | SQLite/settings/presets/reglas/secreto cifrado; E2E reabre y reconecta.                                                             |

## Pruebas adicionales

Rachas 1→5→final5; EACH_GIFT y STREAK_END, finales duplicados e intermedios desordenados. Dedup TTL/capacidad. Template injection, placeholders desconocidos y nombres válidos. Random pools reproducibles con seed. Chat ejecuta comandos fijos. Desbordamiento de cola. Audio fallido no impide Minecraft. Fallo de un trabajo no mata la cola. Provider descarta conexiones antiguas/historial, filtra suscripciones canceladas y deja de reconectar al terminar el LIVE.

## Cierre externo necesario

El usuario confirmó manualmente el funcionamiento de UI, reglas, simulador, cola, controles, DRY RUN y ejecución real de comandos/mods en Mohist. Resta verificar recepción real de eventos TikTok tras el parche 0.1.1, con la cuenta activa. No se han inventado credenciales ni afirmado un LIVE real. Configurar los comandos exactos de Skyfall, el boss elegido y los argumentos de potencia de `/boom`; ejecutar primero con DRY RUN y después en un mundo de prueba.

Criterio de aceptación: recibir al menos un follow/gift/like real, observar regla y job, recibir respuesta RCON y comprobar el efecto dentro del juego. Hasta entonces, el MVP está implementado y probado localmente, pero su integración externa no está certificada.

## Fuera del alcance inicial

Overlay/Browser Source avanzado, otros juegos, otros proveedores, plugin HTTP/WebSocket propio, actualización automática, cuentas/pagos/cloud. Existen interfaces de extensión; no botones que aparenten servicios inexistentes.

## Parche 0.1.1

Ver [diagnóstico y evidencia TikTok](tiktok-connection.md) y [distribución/migración Windows](windows-portability.md). Este parche no reconstruye componentes ya validados.
