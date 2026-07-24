# NexusPro — Puente OBD USB (RP1210)

Programa pequeño para Windows que conecta un adaptador de diagnóstico **RP1210**
(NEXIQ USB-Link y compatibles) con el módulo **Diagnóstico OBD-II** de NexusPro.
Habilita el escaneo por **USB**:

- 🚚 **Camiones J1939** (Isuzu NPR, Hino, Freightliner, etc.): códigos SPN/FMI,
  VIN, datos del motor en vivo.
- 🚗 **Vehículos livianos** (beta): OBD-II sobre CAN por el mismo cable USB.

## Requisitos

1. Windows con los **drivers del USB-Link instalados** (los de siempre — si el
   adaptador ya te funciona con otro software, ya están).
2. Chrome o Edge en **la misma PC** donde está enchufado el adaptador.

## Cómo usarlo

1. Doble clic a **`iniciar-puente.bat`** (la primera vez compila solo, tarda 2 segundos).
2. Deja la ventana negra abierta — es el puente.
3. En NexusPro → **Diagnóstico OBD-II → 📡 Nuevo Escaneo**, elige conexión
   **USB — camión J1939** o **USB — vehículo liviano** y escanea normal.
4. Al terminar puedes cerrar la ventana.

## Seguridad

- Escucha **solo en esta PC** (localhost, puerto 17210) — nada sale a la red.
- Solo acepta conexiones desde **nexuspro.cmtelecommgt.com** (y localhost para
  pruebas); cualquier otra página web es rechazada.

## Problemas

| Síntoma | Solución |
|---|---|
| NexusPro dice "No se encontró el puente USB" | Ejecuta `iniciar-puente.bat` y reintenta. |
| "no se encontró NXULNK32.dll" | Instala los drivers del USB-Link. |
| "el puerto ya está en uso" | El puente ya corre en otra ventana — usa esa. |
| El puente abre pero el vehículo no responde | Switch encendido, cable bien puesto. Prueba con la herramienta oficial `C:\NEXIQ\Test\CommCheck.exe`. |
