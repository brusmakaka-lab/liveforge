# Auditoría de consistencia y Server Hub — cierre 2026-10-08

## Alcance y punto de recuperación

Inspección del estado posterior a 0.2.1-test.1: UI, contratos Zod, Repository, Simulator/TEST, normalizador TikTok, EventBus, RulesEngine, Queue, handlers, medios y tests. Snapshot previo: `work/snapshot-hub-20261006-204159/source.zip` y hashes del código. No incluye secretos ni modifica perfiles. Las pruebas utilizaron perfiles nuevos; no se migraron bases reales ni se actualizaron releases anteriores.

## Hallazgos antes de corregir

| ID / clase / severidad | Reproducción y actual | Esperado | Causa / propuesta |
|---|---|---|---|
| G1 BUG / media | Regla Gift ID vacío, nombre ` Rose `; evento `Rose`. No coincide. Un ID con espacios tampoco coincide. | ID no vacío manda; nombre sin diferencias de espacios/caso/Unicode coincide si ID vacío. | Comparación con lowercase solamente; normalizar ambos operandos con trim/NFKC y espacios, compartir criterio con progreso. No traducir nombres ni inventar alias. |
| G2 UX / media | Pulsar TEST en regla deshabilitada/con cooldown y luego Simulator. TEST ejecuta y Simulator puede no hacerlo. | Explicar qué prueba cada botón. | TEST está diseñado para probar acciones omitiendo elegibilidad, condiciones y cooldown; preservar y explicitar; comprobar matching con Simulator/LIVE normalizado. |
| Q1 MEJORA solicitada / media | Gift final x5 + comando repeatCount=1 ejecuta uno. | ONCE conserva comportamiento; PER_ITEM configurable y acotado por acción. | No hay configuración por cantidad; planificar repeats antes de enqueue y reutilizar scheduler intacto. |
| U1 BUG / media | Editar regla larga, scroll profundo y seleccionar otra; editor conserva el scroll. | Ver comienzo de nueva regla. | `.content` es propietario del scroll; posicionar ese contenedor en la cabecera del editor al cambiar ID. |
| U2 UX / baja | Cambiar sección desde Settings/Rules con scroll profundo; Commands edita arriba pero selección está abajo. | Inicio predecible de página/editor. | El main persiste; resetear sólo su scroll al navegar y enfocar cabecera de editor por ID. |
| U3 INCONSISTENCIA / baja | Paquete test.1 y Diagnostics/sidebar dicen 0.2.0. | Versión real del runtime. | Rótulos fijos. Registrar, no cambiar en esta entrega funcional. |
| U4 UX / media | Salir de sección con cambios sin SAVE; al volver ya no están. | Aviso de que cambios no guardados se descartan. | Formularios locales se desmontan. Documentar pendiente, sin introducir guardado automático ni rediseño. |
| C1 INCONSISTENCIA / baja | RCON Settings sólo admite loopback. | Server Hub opcional; RCON existente independiente. | Restricción deliberada previa de seguridad. Mantener; servidores externos al Hub en esta PC siguen funcionando. No ampliar exposición RCON en este trabajo. |
| C2 DEUDA TÉCNICA / baja | Snapshot cada 600ms incluye imágenes base64 en reglas/jobs. | Evitar tráfico redundante para bibliotecas muy grandes. | Poll completo actual. Dejar pendiente; no cambiar arquitectura/IPC general por optimización especulativa. |
| U5 UX / baja (detectado en revisión visual del Hub) | Con la nueva navegación y ventana mínima la versión al pie de la sidebar queda recortada; el texto largo del Hub centra la segunda línea. | Toda la navegación y su pie accesibles y alineados. | Sidebar fija sin overflow; permitir scroll vertical y alinear texto a la izquierda. |
| H1 BUG / alta dentro del Hub nuevo | Script con espacios falla al iniciar; consola muestra comillas escapadas como parte del comando. | Ejecutar el archivo seleccionado. | Node añadía escapes a las comillas para cmd.exe; argumentos verbatim sólo para scripts validados, con doble par de comillas para /s /c. E2E real de .cmd con espacios confirma la corrección. |

No se identificó un defecto destructivo que exija reemplazar arquitectura central. Los scripts locales son código del usuario: el Hub no los escribe, instala ni modifica; sólo lanza los seleccionados explícitamente. No adopta procesos Java ajenos, no usa taskkill y nunca fuerza un stop.

## Decisiones de implementación

- Campo opcional de cantidad por acción; ONCE/ausente preserva repeats existentes. PER_ITEM usa cantidad semántica del trabajo (`giftCount`): final para STREAK_END, acumulada para STREAK_UPDATE y 1 para EACH_GIFT. No duplica EACH_GIFT. Multiplica repeats con máximo total configurable (1..1000) por acción/trabajo y mantiene presupuesto existente de 2000 pasos. El máximo es por activación del motor; elegir fin de racha para un máximo por racha final. Intervalo propio PER_ITEM; delayBefore una vez.
- Hub local separado de RCON, configuración opcional en JSON existente, sin cambios SQL. Spawn asíncrono con pipes; scripts deben ejecutar en primer plano y conservar stdin/stdout. JAR directo usa Java del PATH. No autoinicio.
- Cierre con servidor activo: elegir detener y cerrar o cancelar. Timeout/error mantiene aplicación y proceso abiertos. Sólo stdout con marca `Done (...)!` confirma ONLINE; proceso vivo sin esa marca permanece STARTING.
- Consola acotada, archivos abiertos por shell del sistema tras comprobar existencia. Rutas sin hardcodeo.

## Cambios efectivamente implementados

- G1: criterio compartido de Gift ID/nombre para matching y alertas de progreso. ID no vacío, recortado, tiene prioridad; sin ID se usa nombre normalizado NFKC, espacios y mayúsculas. No se hacen consultas premium, traducciones ni asignaciones de IDs. Esto reproduce y corrige el fallo con espacios; no demuestra que todo caso histórico de falta de match tuviera esa causa.
- G2: ayuda explícita en TEST: prueba acciones y omite elegibilidad/condiciones/cooldown. Simulator conserva el mismo matching que eventos normalizados LIVE. No se cambió la semántica validada de TEST.
- Q1: configuración opcional ONCE/PER_ITEM por acción, intervalo y máximo. Una regla antigua sin ese campo conserva su comportamiento y sus repeticiones manuales. ONCE con repeatCount=1 produce una ejecución; PER_ITEM ×5 produce cinco salvo un máximo menor. Se planifican copias del trabajo; no se reescribe la regla guardada.
- U1/U2: al seleccionar otro ID, el editor se posiciona en su cabecera dentro de `.content`. Al cambiar de página se reinicia el scroll de ese contenedor. La biblioteca lleva al editor del comando seleccionado. No se usa `window.scrollTo`.
- U5: sidebar con scroll propio y texto alineado a la izquierda. Settings/Simulator usan una columna en ventana estrecha; filas de botones pueden envolver. Identidad visual conservada.
- Server Hub opcional: elegir raíz, detectar y seleccionar .bat/.cmd/.jar, guardar configuración, iniciar, detener, reiniciar, consola stdin/stdout/stderr, PID del proceso supervisado, uptime, estados y accesos al Explorador. Ubicaciones ausentes se deshabilitan y el backend vuelve a validar existencia/ruta. Se muestra `server.properties` seleccionado en el Explorador.
- H1: corregido quoting de scripts Windows; probado con nombre y carpeta con espacios. Concurrencia de start/stop/restart serializada; se rechaza cambiar la configuración durante un proceso activo, incluyendo la carrera con validación asíncrona.
- Cierre del Hub: diálogo cancelar/detener. Si se agota el tiempo, el proceso sigue bajo control y LiveForge permanece abierto; puede reintentarse. No se usa kill/taskkill ni se detectan/adoptan Java ajenos.

## Archivos modificados frente al snapshot previo

El repositorio no tenía archivos rastreados por Git al iniciar esta entrega; por eso la comparación se hizo contra `source.zip` y `source-hashes.json`, no se inventó un diff contra HEAD.

| Archivo existente modificado | Cambio |
|---|---|
| `src/core/rules-engine.ts` | Delegar exclusivamente coincidencia Gift y planificación por cantidad. |
| `src/main/index.ts` | Confirmación y espera de cierre del servidor administrado. |
| `src/main/runtime.ts` | Integrar API del Hub, proteger su configuración, cerrar sólo sin servidor activo. |
| `src/shared/model.ts` | Campos opcionales `giftQuantity` y `localServer`. |
| `src/shared/api.ts` | Solicitudes/respuestas validadas del Hub. |
| `src/renderer/src/App.tsx` | Navegación Server Hub y scroll de `.content`. |
| `src/renderer/src/components/ActionEditor.tsx` | Selector ONCE/PER_ITEM, intervalo, máximo y explicación. |
| `src/renderer/src/components/RuleEditor.tsx` | Scroll y aclaraciones de Gift Name y TEST. |
| `src/renderer/src/pages/Commands.tsx` | Posicionar el editor seleccionado. |
| `src/renderer/src/styles.css` | Scroll/alineación de sidebar. |
| `src/renderer/src/styles-editor.css` | Estilos del Hub y ajustes acotados de filas/tamaño mínimo. |

Archivos nuevos:

- `src/core/gift-actions.ts`: comparación y planificación pura.
- `src/shared/server.ts`: contratos del Hub.
- `src/main/server-hub.ts`: propietario del proceso y consola acotada.
- `src/main/server-paths.ts`: validación de ubicaciones y argumentos de inicio.
- `src/renderer/src/pages/ServerHub.tsx`: controles y consola local.
- `src/renderer/src/components/useEditorScroll.ts`: posicionamiento dentro del contenedor real.
- `tests/gift-quantity.test.ts`, `tests/server-hub.test.ts`, `tests/fixtures/server.mjs`, `tests/e2e/server-hub.spec.ts`.
- Este informe, `docs/audit-server-hub.md`.

Sin cambios de dependencias, package.json, normalizador/proveedor TikTok, EventBus, scheduler Queue, handlers Minecraft, transporte RCON, audio, overlay, importador de imágenes, repositorio SQLite o migraciones. Se verificaron hashes de 19 archivos protegidos: 19 idénticos. El motor conserva el resto de su lógica; sus dos puntos modificados están detallados arriba.

## Pruebas añadidas

20 tests unitarios/integración nuevos (13 de regalos/cantidad y 7 de Hub), además de los 60 anteriores:

- Gift ID tiene prioridad aunque cambie el nombre; ID vacío/espacios permite nombre; espacios/caso/Unicode; no coincidencia y ausencia de traducción; vías Simulator y normalización TikTok.
- ×5 ONCE=1; ×5 PER_ITEM=5; intervalo real; máximo incluyendo repeticiones manuales; validación de límites; STOP cancela repeticiones y bloquea triggers; final de racha deduplicado; cooldown y prioridad; EACH_GIFT no eleva al cuadrado la cantidad; TEST conserva contadores/cooldowns; compatibilidad de reglas antiguas.
- Raíz válida/inválida, mods/plugins ausentes, prevención de escape de ruta y metacaracteres en nombre de script; proceso real de fixture, start/stop/restart, consola, límite de 500 líneas, fallo de inicio, start concurrente, timeout de stop con reintento, STARTING sin señal Done y persistencia de configuración sin migración.

3 E2E nuevos:

1. UI de cantidad → guardar → Simulator x1/x2/x5/final → cinco comandos DRY RUN → cierre/reapertura → persistencia. Cambio de regla tras scroll profundo, siete páginas de Control Room al tamaño mínimo 1050×720, biblioteca y pie de sidebar.
2. Selector de carpeta → inspección → guardar → .cmd real con espacios → ONLINE → stdin/list → stdout → restart → stop → cancelar cierre → detener y cerrar → reapertura/persistencia → fallo de startup → ruta inválida. Archivo seleccionado enviado al shell del sistema.
3. Servidor de fixture que ignora el primer stop: intento de cerrar → timeout → aplicación y proceso permanecen activos → segundo stop correcto.

En los E2E se simulan únicamente las respuestas de diálogos nativos y la apertura del Explorador; son reales la UI, IPC, validaciones, SQLite, procesos .cmd/Node, pipes y espera de cierre. No se inicia Mohist ni se conectan cuentas LIVE.

## Resultados finales

- `npm run check`: PASS; incluye typecheck, lint, **80 tests en 10 archivos**, y compilación Electron/Vite.
- Typecheck y lint repetidos después de la última modificación del test visual: PASS.
- `npx playwright test`, con WAV y MP3 locales: **9/9 PASS, sin omisiones, en 1 minuto**. Ocho casos ejercitan el código recién compilado; `packaged.spec.ts` comprueba el arranque del paquete 0.2.0 existente y no acredita el Hub nuevo empaquetado. Resultado completo en `work/validation-20261008/e2e-final.log`.
- Primera pasada Playwright: 8/9; la nueva aserción de sidebar midió 0,2 px de diferencia por escala Windows. Se ajustó sólo la tolerancia del test a 1 píxel CSS, sin modificar código funcional. La repetición completa terminó con los nueve casos aprobados.
- Revisión visual final a tamaño mínimo de ventana 1050×720: PASS. Se revisaron las capturas de las siete páginas y del pie de sidebar después del ajuste. Navegación y versión accesibles mediante scroll propio, botones alineados, sin desbordamiento horizontal del contenido; STOP permanece visible. Evidencia: `work/hub-e2e/screenshots/0.png` a `6.png` y `sidebar-bottom.png`.
- Advertencias no bloqueantes: `node:sqlite` experimental, anotaciones PURE de Zod al compilar y NO_COLOR/FORCE_COLOR en Playwright. No se ocultaron errores de aplicación.
- Evidencia: `work/validation-20261008/check.log`, `e2e-final.log`, `protected.json`, `releases.json`, y capturas de `work/hub-e2e/screenshots/`.
- Los 13 ejecutables anteriores conservan sus hashes; también coincide el hash conocido del Portable 0.2.1-test.1. No se modificaron perfiles reales ni se generó paquete TEST, Portable, Setup o instalador nuevo. Sólo se recompiló `out` para los tests.

## Pendientes y límites conocidos

1. Validación manual del Hub con el Mohist/Forge real del usuario y su script. JAR directo usa `java` del PATH; no se instala Java, no se elige automáticamente una versión ni se acepta EULA. El E2E de proceso usa Node como servidor de fixture, no un Minecraft real.
2. Los scripts deben mantener Java en primer plano con stdin/stdout, sin `start`, `pause` ni auto-restart. El PID mostrado puede ser el supervisor cmd.exe. No hay garantía de cierre ante apagado forzado de Windows, crash o terminación externa de LiveForge.
3. ONLINE depende de la línea `Done (...)!`; un mod/launcher que no la emita queda STARTING. El log se decodifica como UTF-8; scripts que usen páginas de códigos antiguas pueden mostrar caracteres incorrectos. Consola limitada a 500 líneas × 4.096 caracteres.
4. La consola del Hub envía comandos reales aunque DRY RUN esté activo; así se indica en UI. DRY RUN protege las acciones MinecraftCommand de reglas. STOP ALL EVENTS no detiene el servidor local.
5. En modo STREAK_UPDATE la cantidad es acumulada por actualización; PER_ITEM puede ejecutar 1+2+5. Para ejecutar sólo cinco al final elegir STREAK_END. EACH_GIFT ya genera activaciones por unidad. El máximo es por acción/activación; pools y repeticiones siguen sujetos al límite global existente de 2.000 pasos. El espaciado mínimo de Minecraft real (100 ms) puede superar el intervalo elegido.
6. Si TikTok no entrega un nombre de regalo, no se inventa ni se consulta el catálogo premium: para ese evento usar el ID recibido. Las pruebas con normalización usan fixtures; no sustituyen una nueva prueba LIVE.
7. Captura real del overlay en OBS/TikTok Live Studio y uso físico de diálogos/Explorador: **pendiente de validación manual**. Audio/imagen se verificaron con reproductor/render real en E2E, sin cambiar sus implementaciones ya aprobadas.
8. Hallazgos no corregidos en este alcance: U3 (rótulo fijo 0.2.0), U4 (cambios no guardados al salir), C1 (RCON sólo loopback, preservado) y C2 (snapshot completo periódico). No se aplicó un refactor general para resolverlos.

Esta entrega queda en código compilado y validado. La build TEST aislada se generará sólo después de la revisión de este informe, según la última instrucción del usuario.

Fuentes API: [Node child_process](https://nodejs.org/api/child_process.html), [Electron app](https://www.electronjs.org/docs/latest/api/app), [Electron shell](https://www.electronjs.org/docs/latest/api/shell).
