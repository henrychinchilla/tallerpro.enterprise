# NexusPro — Puente OBD USB (RP1210)

Programa pequeño para Windows que conecta un adaptador de diagnóstico **RP1210**
(NEXIQ USB-Link y compatibles) con el módulo **Diagnóstico OBD-II** de NexusPro.
Habilita el escaneo por **USB**:

- 🚚 **Camiones J1939** (Isuzu NPR, Hino, Freightliner, etc.): códigos SPN/FMI,
  VIN, datos del motor en vivo.
- 🚗 **Vehículos livianos** (beta): OBD-II sobre CAN por el mismo cable USB.

## Instalación (una sola vez por PC)

1. En NexusPro → **Diagnóstico OBD-II → 📡 Nuevo Escaneo** hay un enlace
   **⬇️ Instalar el puente USB** (o descarga
   `https://nexuspro.cmtelecommgt.com/puente-obd/instalar-puente.bat`).
2. Doble clic al archivo descargado. Eso descarga el puente a
   `%USERPROFILE%\NexusPro\puente-obd`, lo registra en
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` para que **arranque
   automáticamente con Windows (oculto, sin ventana)** y lo inicia de una vez.

Desde entonces **no hay que correr nada a mano**: enchufas el USB-Link y escaneas.

- El icono **"Puente OBD USB"** del escritorio es opcional: lo abre en modo
  visible (ventana con registro) para diagnóstico. Si ya corre el oculto, la
  ventana avisa y se cierra sola — no se duplica.
- Para desinstalar: borra el valor "NexusPro Puente OBD" del registro
  (`reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "NexusPro Puente OBD" /f`)
  y la carpeta `%USERPROFILE%\NexusPro`.
- La página se conecta al puente por `ws://127.0.0.1:17210`, así que ese origen
  debe estar en `connect-src` de la CSP (`_headers`). Si falta, el navegador
  bloquea el WebSocket y el módulo reporta "no se encontró el puente".

## Requisitos

- Windows con los **drivers del USB-Link instalados** (si el adaptador ya te
  funciona con otro software, ya están).
- Chrome o Edge en **la misma PC** donde está enchufado el adaptador.

## Seguridad

- Escucha **solo en esta PC** (localhost, puerto 17210) — nada sale a la red.
- Solo acepta conexiones desde **nexuspro.cmtelecommgt.com** (y localhost para
  pruebas); cualquier otra página web es rechazada.
- Sin `.exe`: el código corre dentro de PowerShell (firmado por Microsoft), así
  el antivirus no lo marca como falso positivo.

## Problemas

| Síntoma | Solución |
|---|---|
| NexusPro dice "No se encontró el puente USB" | Corre el instalador de nuevo, o abre el icono "Puente OBD USB" del escritorio. |
| "No se pudo cargar NXULNK32.dll" | Instala los drivers del USB-Link — **o usa otro adaptador**: el puente lista los RP1210 instalados y puede cargar cualquiera (ver abajo). |
| El puente abre pero el vehículo no responde | Switch encendido, cable bien puesto. Prueba con la herramienta oficial `C:\NEXIQ\Test\CommCheck.exe`. |

## Varios adaptadores en la misma PC

Un taller que ya tiene software de fábrica (Cummins INSITE, Navistar ServiceMaxx,
Allison DOC, JPRO…) suele tener **varios adaptadores RP1210 registrados**. El
puente los carga en caliente, así que no está atado al NEXIQ:

- Al arrancar lista los que encuentra en `C:\Windows\RP121032.INI`.
- Si falta el NEXIQ, **no se cierra**: queda esperando a que NexusPro elija otro.
- Cambiar de adaptador no requiere reiniciar el puente.

Adaptadores vistos en el campo: `NXULNK32` (NEXIQ USB-Link), `DGDPA5MA` (Dearborn
DPA 5), `VCXRP32` (VXDIAG), `CMNSIM32` (simulador de Cummins, útil para probar
sin camión), `S1939C32` (International J1939), `BNB1850` (Noregon J1850).
