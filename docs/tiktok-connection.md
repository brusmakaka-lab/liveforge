# Corrección TikTok 0.1.1

## Causa reproducida (4 de octubre de 2026)

El perfil real tenía `@Palermotusi`. LiveForge 0.1.0 eliminaba `@`, pero conservaba las mayúsculas. El conector instalado, `tiktok-live-connector` **2.5.0**, también conserva las mayúsculas en su normalizador y consulta estas fuentes, en orden:

1. HTML `@usuario/live`: espera el script `SIGI_STATE`. En esta red/respuesta no se encontró esa etiqueta. El fallo por sí solo no demuestra captcha ni bloqueo de cuenta.
2. `api-live/user/room/`: con `Palermotusi` y `PALERMOTUSI` devuelve **19881007 (`user_not_found`)**. Con `palermotusi`, usando el mismo cliente y cambiando sólo el parámetro `uniqueId`, devuelve Room ID **7692702295338879745**. Se repitió minúscula/mayúscula/minúscula para distinguirlo de un fallo de red transitorio.
3. El fallback existente Euler Stream rechaza la resolución por falta de permiso. No se añadió una clave, cookie, proxy ni servicio alternativo para sortearlo.

Al fallar las tres fuentes, la librería lanza `InvalidResponseCompositeError`, con los detalles en `config.requestErrs`. Su evento ERROR no es un Error directamente: es `{info, exception}`. El helper anterior usaba `String(objeto)`, produciendo `TikTok: [object Object]` y perdiendo el diagnóstico. Los logs guardados corroboran ese síntoma, pero no permiten recuperar retroactivamente las causas que no se persistieron.

La resolución en minúsculas se comprobó tanto con Node como dentro de Electron 44.5.1 y las dependencias del ejecutable empaquetado anterior. En el momento de esa consulta, TikTok informaba estado **4 (LIVE terminado)**: encontrar un Room ID no demuestra que el LIVE esté activo ni que ya se hayan recibido eventos.

## Parche acotado

- El proveedor aplica `trim`, elimina el `@` inicial y pasa a minúsculas antes de validar/construir el conector. Reutiliza ese nombre normalizado al reconectar, incluso si Settings conserva `@Palermotusi`.
- El helper de diagnóstico propio del proveedor conserva `message`, `stack`, `cause`, `info`, `exception`, `config.routeId/requestErrs`, códigos de red y estado HTTP. Maneja referencias circulares y límites de tamaño/profundidad. Excluye headers, cookies, credenciales y parámetros de URLs firmadas; el Logger existente continúa ocultando secretos conocidos.
- Los logs de reintento incluyen número de intento, username y demora. Backoff 2–60 s, generaciones de conexión, normalización de eventos y deduplicación mantienen sus políticas anteriores.
- No se modifican RCON, RulesEngine, ActionQueue, Simulator, presets, UI ni esquema SQLite. No se actualizan dependencias ni se introduce otra arquitectura.

## Verificación

- Regresión de usernames `@Palermotusi`, `PALERMOTUSI` y espacios exteriores, incluida reconexión.
- Errores compuestos de la versión realmente instalada: fuentes, stack, causa y envoltorio preservados; ausencia de `[object Object]`.
- Códigos HTTP, redacción, errores circulares y grandes, más los tests existentes de backoff/eventos antiguos/desconexión.
- Suite completa: 43 tests correctos; typecheck y lint correctos.
- Validación real con LIVE activo y recepción de eventos: pendiente de disponibilidad de la cuenta. El parche resuelve el defecto de Room ID reproducido; no se presenta una respuesta offline como una conexión LIVE exitosa.

## Si aparece otro fallo

Usa Logs / Diagnostics → Copy diagnostics: ahora incluye la causa por fuente. `user_not_found` exige revisar el username; `UserOfflineError` indica que no hay LIVE activo; un fallo `SIGN_*`, HTTP 401/403 o rate limit después de resolver el Room ID corresponde a otra etapa del conector. La firma WebSocket sigue usando el servicio externo que ya traía la librería. No se crean cuentas, no se contratan planes y no se añaden cookies automáticamente. Cualquier requisito nuevo de credenciales/servicio debe explicarse y autorizarse antes de cambiar esa integración.

Referencia primaria: [código/API del conector](https://github.com/zerodytrash/TikTok-Live-Connector). El diagnóstico anterior usa el código de la versión fijada en `package-lock.json` y respuestas medidas en esta máquina; no presupone que el HTML o los servicios no oficiales permanezcan iguales en el futuro.
