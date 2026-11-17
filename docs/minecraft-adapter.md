# MinecraftAdapter

`GameAdapter<TAction>` ofrece connect, disconnect, execute, testConnection y getStatus. `MinecraftAdapter` recibe un `MinecraftTransport`; la implementación MVP es RCONTransport con `rcon-client` 4.2.5. No hay imports de RCON desde RulesEngine.

## Configuración y estados

El host sólo puede ser loopback (`127.0.0.1`, `localhost`, `::1`), puerto de 1 a 65535, contraseña en Windows safeStorage. Default: 25575 y jugador Ainztk58. Guardar cambios de conexión detiene eventos y desconecta para aplicar el nuevo destino explícitamente.

CONNECT autentica y envía `list`. Latencia mide una ida/vuelta local de ese comando. El dashboard distingue CONNECTING, CONNECTED, DISCONNECTED y ERROR; una caída del socket actualiza la disponibilidad. No hay reconexión con reenvío de trabajos fallidos: el botón de conexión vuelve a crear un transporte limpio.

Timeout por paquete: cinco segundos. Un timeout destruye el cliente para descartar callbacks pendientes. Los errores individuales se propagan a la política del trabajo; no cierran la aplicación. El error es ambiguo respecto de si Minecraft ejecutó algo antes de perder la respuesta, por lo que jamás se reintenta automáticamente un comando.

## Comandos libres

RCON no conoce el contexto de posición del jugador. Usa `execute as {{player}} at @s run ...` cuando el mod espera contexto de entidad. La plantilla se resuelve antes del adaptador. Se acepta cualquier comando de una línea, con o sin `/` inicial, sin lista cerrada de vanilla/plugins/mods.

Ejemplos del entorno aportado:

```text
execute as {{player}} at @s run weather2 summon tornado_f1
execute as {{player}} at @s run weather2 summon firenado_f1
execute as {{player}} at @s run weather2 summon sharknado
weather2 kill_all_storms
```

El nombre del comando meteorito/Skyfall y los argumentos de potencia de `/boom` deben obtenerse del servidor/plugin instalado. Los borradores no se activan hasta configurarlos. Boss se configura como comando de spawn, Wait de 60.000 ms y comando de eliminación; no requiere lógica nueva.

## Respuestas y garantías

RCON devuelve texto, no un código estándar de éxito de gameplay. «Unknown command», errores de permisos o errores de un mod pueden llegar como respuesta normal y quedan en el feed/log. COMPLETED significa que los handlers terminaron y hubo respuesta del transporte, no una verificación visual dentro del mundo. Comandos con respuestas muy extensas pueden depender de cómo el servidor segmente RCON; no se utiliza ese texto para tomar decisiones de juego.

El test de protocolo levanta un servidor TCP local que valida auth/IDs/tipos/tamaño de paquetes y captura comandos. El E2E prueba UI → bus → motor → scheduler → transporte real TCP. No emula la física de Minecraft ni certifica compatibilidad de los mods.

## Transporte futuro

Un HTTPTransport o PluginBridgeTransport implementará connect/disconnect/send/isConnected. Podrá devolver un resultado más rico con una nueva versión de GameAdapter, sin tocar los triggers del motor. No se implementa un endpoint abierto ni un plugin ficticio como parte del MVP.
