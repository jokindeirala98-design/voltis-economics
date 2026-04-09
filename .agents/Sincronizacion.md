# 🔄 Regla de Sincronización Automática

**Objetivo:** Mantener una copia de seguridad "Master" del proyecto y su blueprint en la carpeta PRIVADA del usuario.

## Instrucción para el Agente:
Cada vez que se alcancen **50 interacciones (prompts)** con el usuario, DEBES:
1.  Actualizar el archivo `ULTIMATE_PROMPT.txt` con el código y lógica más recientes.
2.  Copiar dicho archivo a: `/Users/jokindeirala/Desktop/PRIVADO/voltis anual economics/ULTIMATE_PROMPT.txt`.
3.  Sincronizar toda la carpeta `/src` y archivos de configuración a: `/Users/jokindeirala/Desktop/PRIVADO/voltis anual economics/source/`.

## Registro de Versiones (PRIVADO):
- v1.0 (22/03/2026): Inicialización del sistema de backup y blueprint con código completo.
