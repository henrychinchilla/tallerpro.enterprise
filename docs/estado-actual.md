# Dónde estamos — actualizado 2026-07-30

> Este archivo existe para no perder el hilo entre sesiones ni entre computadoras.
> Si Claude arranca sin contexto, **lee esto primero** y no preguntes lo que ya
> está acá.

## Objetivo activo

**Conectarse al Mitsubishi Montero GLS 2004 (P-811BKJ) con el USB-Link.**
Es la meta que fijó Henry. No se declara imposible: se agota lo que falta probar.

## Estado del código

| | |
|---|---|
| Último commit | `b631531` |
| Producción | `v4.22.0-20260730` (nexuspro.cmtelecommgt.com) |
| Banco de pruebas | `npm test` → 12 suites, 252 pruebas, 0 fallidas |
| Pendiente de desplegar | nada |

## Lo próximo, concreto

**Correr `node tools/montero-usblink.js` con el Montero enchufado y encendido.**

Prueba las 88 combinaciones de device × protocolo que quedaron sin cubrir en la
tanda del 30/07, incluido el **device 146** (`USB-Link ATEC-160 Baud`) que nunca
se tocó, y los 9 protocolos del `.INI` que no se habían probado. Sale al minuto
si encuentra respuesta; ~12 min el peor caso.

Requiere el **puente corriendo en la misma PC donde está el adaptador**
(`%USERPROFILE%\NexusPro\puente-obd\iniciar-puente.bat`).

Si tampoco así contesta, queda **una** prueba y no es de software: medir con
multímetro la continuidad del **pin 7** entre el conector del vehículo y el del
USB-Link. Sin ese pin no hay programa que alcance el bus; con la medición se
sabe si el problema es el cable (reemplazable) o el adaptador.

## Trampa que ya nos costó tiempo dos veces

**Claude corre en la PC donde se abrió Claude Code, no donde está el adaptador.**
El 30/07 la sesión estaba en `DESKTOP-8OPVM2U` (usuario `USUARIO`) mientras el
USB-Link estaba enchufado a la otra máquina: el estado del adaptador daba
`Error RP1210 275` en todos los protocolos y Windows no lo listaba.

**Antes de cualquier prueba con vehículo, verificar:**

```powershell
Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match "USB-Link" }
```

Si no aparece, el adaptador está en otra computadora y ninguna prueba sirve.

## Vehículos: qué se logró y qué no

| Vehículo | Resultado |
|---|---|
| **Nissan Rogue 2017** | ✅ 14 módulos, **16 códigos reales** — TPMS (8, `C1707` era la trasera izquierda), ABS (6), tracción (1), carrocería (1). Verificado provocando una falla: infló una llanta y `C1704` apareció como delantera izquierda. |
| **Isuzu NPR 2008** | ✅ CAN, escaneado |
| **Montero 2004** | ❌ objetivo activo — ver arriba |
| **International DT466 2005** | ⏳ J1587 implementado, **escalas sin validar** contra ServiceMaxx |

## Pendientes de campo (necesitan vehículo)

1. **Montero + USB-Link** — el objetivo activo.
2. **Rogue, mapa de DIDs del ABS**: entrar a 📊 *Frenos / ABS*, girar una rueda a
   mano y anotar qué identificador cambia. Da el mapa de velocidad de rueda
   verificado en campo, no adivinado.
3. **Rogue, hipótesis del AWD**: la luz de 4x4 sería consecuencia de los códigos
   del ABS (`C1104`/`C1105`/`C1106`/`C1115` + `U1002`), no de un módulo propio.
   Se confirma reparando los sensores y viendo si se apagan las dos luces juntas.
4. **DT466**: contrastar las escalas J1587 contra ServiceMaxx en el mismo camión.
   El código guarda el byte crudo de cada parámetro justamente para eso.
5. **Barrido K-line**: escrito contra ISO 14230-3, **nunca probado enchufado**.

## Cobertura por hardware — lo que hay que decirle al cliente

El código **no está customizado por vehículo**: de 5.465 líneas del módulo OBD,
18 nombran una marca y casi todas son comentarios que documentan dónde se
verificó algo. Lo que se implementa son estándares (OBD-II, UDS, KWP2000,
J1939/J1587). La Rogue se resolvió sin una línea específica para Nissan.

El límite es **físico, del adaptador**:

| Adaptador | Cubre |
|---|---|
| USB-Link (NEXIQ) | camiones J1939/J1587 + livianos 2008 en adelante |
| ELM327 BLE (~Q200) | livianos 1996 en adelante, incluidos los pre-CAN |
| Los dos | prácticamente todo lo que entra al taller |

## Cómo trabajamos

- Henry hace `git push` cuando hace falta desde su lado; Claude hace push y deploy
  desde la PC donde tenga credenciales.
- **Las migraciones de base las aplica Henry** en el SQL Editor de Supabase:
  no hay MCP ni token guardado, y la anon key no puede hacer DDL.
- Cada cambio va con pruebas en `test/obd/` y `npm test` tiene que quedar en verde.
