# Dependencias y procedencia

LiveForge es un proyecto personal original. No incorpora código, assets, nombres comerciales ni interfaz copiados de StreamToEarn, TikFinity u otros productos de referencia conceptual.

Dependencias principales:

| Componente                  | Procedencia                                          | Licencia indicada por el paquete              |
| --------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| Electron                    | https://github.com/electron/electron                 | MIT y componentes Chromium/Node               |
| React / React DOM           | https://github.com/facebook/react                    | MIT                                           |
| Zod                         | https://github.com/colinhacks/zod                    | MIT                                           |
| lucide-react                | https://github.com/lucide-icons/lucide               | ISC                                           |
| rcon-client                 | https://github.com/janispritzkau/rcon-client         | MIT                                           |
| tiktok-live-connector 2.5.0 | https://github.com/zerodytrash/TikTok-Live-Connector | AGPL-3.0-only                             |
| SQLite / node:sqlite        | https://nodejs.org/api/sqlite.html                   | SQLite public domain; Node MIT y dependencias |

Consulta los archivos LICENSE de cada paquete para sus términos completos; Electron incluye LICENSE y LICENSES.chromium.html. Las versiones resueltas están en package-lock.json. TikTok no patrocina ni respalda este proyecto.

El conector TikTok usa un servicio externo de firma (Euler Stream). Sus términos y disponibilidad son independientes de la licencia del código cliente. LiveForge no incluye claves ajenas ni credenciales compartidas.

Este build se genera localmente para uso personal y no está firmado comercialmente. Antes de distribuirlo públicamente, revisar las obligaciones de las licencias, incluida AGPL y sus dependencias, y acompañar los fuentes correspondientes. El campo UNLICENSED del código propio no reemplaza las licencias de terceros.
