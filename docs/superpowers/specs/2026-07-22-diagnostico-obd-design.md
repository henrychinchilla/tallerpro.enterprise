# Diagnóstico OBD-II integrado (Opción A) — 2026-07-22

## Qué
Módulo nuevo `diagnostico_obd` (grupo Operación) que escanea vehículos OBD-II con
adaptadores ELM327/Vgate/OBDLink/STN1110 **Bluetooth LE** vía Web Bluetooth,
directamente desde la PWA (funciona en la APK actual porque es TWA = Chrome).

## Por qué así
- Todos esos adaptadores hablan el mismo protocolo (comandos AT ELM327 + PIDs OBD-II);
  una sola capa de software sirve para todos.
- Web Bluetooth solo alcanza adaptadores **BLE** (Vgate iCar Pro BT4.0, OBDLink CX,
  clones BLE). Los clones Bluetooth Classic de $5 y los WiFi requerirían app nativa
  (Opción B, futura, se montaría sobre esta misma capa).
- Cero cambios en la APK/TWA ni infraestructura nueva.

## Componentes
1. **BD** — `db/migrations/074_diagnosticos_obd.sql`: tabla `diagnosticos_obd`
   (tenant_id, vehiculo_id→vehiculos, orden_id→ordenes opcional, vin, protocolo,
   adaptador, mil boolean, dtcs jsonb, dtcs_pendientes jsonb, datos jsonb con
   snapshot en vivo, voltaje, notas, dtcs_borrados). RLS `tenant_isolation` estándar.
2. **DB helpers** (`js/core/db.js`): `getDiagnosticosOBD(ini,fin)`,
   `upsertDiagnosticoOBD(fields)`; eliminar vía `DB.deleteRegistro` genérico.
3. **Módulo** (`js/modulos/operacion/diagnostico_obd.js`):
   - Driver BLE: requestDevice → detecta pares servicio/característica conocidos
     (FFF0/FFF1-2, FFE0/FFE1, UUID Vgate) o autodetección notify+write; cola de
     comandos con timeout, respuesta termina en `>`.
   - Inicialización ELM: ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0 (autoprotocolo,
     cubre CAN/ISO9141/KWP2000 = todo vehículo OBD-II) y `0100` para enganchar.
   - Lecturas: VIN (0902), MIL+conteo (0101), DTCs confirmados (03) y
     pendientes (07) con descripción en español (diccionario de comunes +
     fallback por rango SAE), voltaje (ATRV), datos en vivo (RPM, velocidad,
     temp refrigerante, carga, acelerador, temp admisión, combustible).
   - Borrar códigos (04) con confirmación.
   - UI: lista por mes activo + historial (patrón Contabilidad), CRUD completo
     (nuevo escaneo, ver reporte, editar vehículo/OT/notas, eliminar, imprimir),
     botones con `Modulos.btnAccion`.
4. **Config**: entrada en MODULOS (Operación), PERMISOS por rol
   (admin/gerente_tal/mecanico), vendible a la carta (Q99) e incluido en plan
   Empresarial.
5. **index.html + sw.js**: script nuevo + precache + subir CACHE_VERSION.

## Manejo de errores
- Sin `navigator.bluetooth` → aviso claro (usar Chrome/Edge Android o PC).
- Adaptador sin servicio compatible, timeout de comando, `UNABLE TO CONNECT`
  (switch apagado) → mensajes específicos en el log del escaneo; nunca cuelga.

## Fuera de alcance (futuro)
- Bluetooth Classic / WiFi (requiere app nativa — Opción B).
- Gráficas históricas de datos en vivo; PIDs de fabricante.
