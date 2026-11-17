# Windows: instalación, portable y traslado de datos

LiveForge 0.1.1 produce dos artefactos x64:

- `LiveForge-Setup-0.1.1-x64.exe`: instalador NSIS para el usuario actual, carpeta seleccionable y acceso directo.
- `LiveForge-Portable-0.1.1-x64.exe`: ejecutable que se extrae temporalmente y arranca sin instalación. Puede copiarse a otra PC; necesita espacio temporal de escritura.

Ambos incluyen Electron, Node y SQLite. No hace falta instalar Node, npm ni herramientas de desarrollo para usarlos. No están firmados con un certificado comercial. `win-unpacked/` es el mismo paquete sin instalador: debe copiarse completo si se elige ese formato.

## Dónde viven los datos

Ambos formatos usan `%APPDATA%\LiveForge\liveforge.sqlite`, resuelto por Electron para el usuario Windows actual. No usan la carpeta del proyecto, del ejecutable ni una ruta fija de esta laptop. Instalador y portable comparten perfil si se usan con el mismo usuario Windows. Evita abrirlos simultáneamente; LiveForge mantiene una sola instancia por perfil.

El portable es portable en cuanto a distribución, **no un perfil transportable automáticamente por USB**. Mover únicamente el exe no mueve la configuración. La variable `LIVEFORGE_DATA_DIR` es un override para pruebas/desarrollo; no debe apuntar a un perfil de pruebas al utilizar tus datos normales.

## Pasar de esta laptop a otra PC

1. Cierra LiveForge normalmente en la laptop, para que SQLite cierre y consolide sus escrituras. En el Explorador abre `%APPDATA%\LiveForge` y haz una copia de seguridad de `liveforge.sqlite`. Si quedaron `liveforge.sqlite-wal` y `liveforge.sqlite-shm`, conserva el conjunto completo y no mezcles archivos de distintos backups.
2. Copia el instalador o el portable a la nueva PC Windows 10/11 x64. Instala o abre, y luego cierra LiveForge: así crea el perfil del nuevo usuario.
3. Con la aplicación cerrada, respalda cualquier perfil existente de la nueva PC y coloca la base de la laptop en `%APPDATA%\LiveForge`. Si hay archivos WAL/SHM del perfil de destino, guarda y retira ese conjunto antes de restaurar. No sobrescribas una base abierta. No necesitas trasladar las carpetas Cache, GPUCache, Network ni otros caches de Electron.
4. Abre LiveForge. Encontrarás presets, reglas, acciones, comandos guardados, preset activo, username de TikTok, jugador, puerto/host local, audio, opciones de desarrollo y logs retenidos.
5. En Settings introduce nuevamente la contraseña RCON y guarda. Si antes usabas una signing API key, vuelve a introducir esa clave y guarda también. El campo vacío conserva el valor anterior: no reemplaza un secreto cifrado de la otra PC. Los bytes cifrados del backup dependen de Windows DPAPI y no deben considerarse utilizables en otro usuario/equipo; no se exportan como texto ni se intenta eludir ese cifrado.
6. Copia por separado los archivos MP3/WAV/OGG y vuelve a elegir sus rutas en las acciones PlaySound. Las rutas guardadas son referencias locales y pueden ser distintas en la nueva PC.
7. Minecraft/Mohist, su mundo, mods, plugins y `server.properties` se trasladan o instalan por separado. LiveForge no los incluye. En este MVP RCON conecta al servidor local de la PC donde corre LiveForge; no se cambia una IP de la laptop por una dirección pública.
8. Prueba la conexión RCON y una regla en DRY RUN. La aplicación abre con eventos detenidos, sesión nueva y cola vacía: no reproduce trabajos anteriores. Luego conecta a un LIVE activo y habilita los eventos cuando estés preparado.

La base contiene configuración, comandos y logs con usernames; guárdala de forma privada. Copiarla no transfiere una cuenta TikTok ni cookies (LiveForge no las solicita). No hay sincronización cloud. No cambies la versión del esquema ni edites manualmente el SQLite para reutilizar secretos.

## Actualizar en la misma PC

Cierra la versión anterior y ejecuta el nuevo instalador, o sustituye tu archivo portable por el nuevo. El perfil se mantiene en AppData. Guarda primero un backup de SQLite. El paso entre instalador y portable tampoco necesita exportar/importar en el mismo usuario Windows.
