# Diagnóstico de overlay vacío — 2026-10-05

Se inspeccionaron copias de los perfiles local habitual y aislado. No se modificó ninguna base original.

En el perfil aislado, el preset activo `starter` tiene habilitada B · Rose → Tornado F1. Esa regla usa STREAK_END, contiene únicamente MinecraftCommand y no habilita showStreakProgress. Sus logs registran [SIM] @testuser · Rose ×1 · racha en progreso. Ninguna regla de ese perfil contiene ShowAlert.

En esta configuración el evento llega al motor, pero no hay ninguna acción visual que enviar a DesktopMedia/OverlayService. El estado de alertas del main y del overlay permanece vacío. Abrir la ventana sólo abre la superficie de presentación; no crea una alerta automáticamente.

Reproducción automatizada contra el ejecutable v0.2.0 ya publicado, con un perfil temporal nuevo:

1. Abrir overlay, START EVENTS y Racha x1: evento recibido, DRY RUN activo y cero tarjetas/estado de alertas vacío.
2. Desde el editor de la regla B, añadir Show alert y habilitar Mostrar progreso desde el primer regalo; guardar.
3. Volver a Simulator y Racha x1: una tarjeta; estado recibido por main y segunda ventana idéntico.
4. Rectángulo de la tarjeta 456 × 103.1 px, posición 12/42 dentro del viewport, opacidad efectiva 1, visible, sin estado de salida.
5. Captura del compositor Chromium: imagen no vacía, 97.84% de píxeles con alfa superior a 200 y 953 colores; ventana visible y opacidad nativa 1.

Se añadieron tests/support/overlay-visibility.ts y tests/e2e/overlay-visibility.spec.ts y se reforzó tests/e2e/v02.spec.ts para comprobar dimensiones, visibilidad, opacidad acumulada en ancestros y píxeles renderizados durante x1/x2/x5 y final.

Resultado: typecheck y lint PASS; 60 tests PASS; 2 E2E de diagnóstico/racha PASS sobre el ejecutable empaquetado existente. Los 47 archivos src y los 13 ejecutables existentes conservaron exactamente sus hashes. No se cambiaron reglas del usuario, código funcional ni instaladores.

Este diagnóstico explica el perfil inspeccionado. No demuestra compatibilidad de captura con OBS/Live Studio ni descarta problemas de composición exclusivos de otros equipos. La captura en esas aplicaciones permanece pendiente de validación manual.

Para la prueba manual actual: Presets y reglas → B · Rose → Tornado F1 → Añadir acción → Show alert → texto @{{username}} envió {{giftName}} x{{giftCount}} → activar Mostrar progreso desde el primer regalo → SAVE RULE. Abrir overlay; Simulator con START EVENTS y DRY RUN; iniciar una Nueva racha y pulsar x1/x2/x5/final. El modo al finalizar se conserva para el comando Minecraft.
