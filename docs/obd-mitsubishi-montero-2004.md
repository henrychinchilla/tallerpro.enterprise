# Mitsubishi Montero GLS 2004 (P-811BKJ) — qué se puede escanear y qué no

Ficha del vehículo tal como está cargado en `vehiculos`:

| Campo | Valor |
|---|---|
| Placa | P-811BKJ |
| Marca / línea | MITSUBISHI · MONTERO GLS |
| Año | 2004 |
| VIN registrado | `JMVLVV77WM306540` — **16 caracteres** (un VIN son 17) |
| Motor | `6G72WM306` |
| Cilindrada | 3820 cc · 6 cilindros |
| Tipo | Pickup / Camioneta · Gasolina |

Es un Montero de 3ª generación (serie V70, 2001-2006).

---

## 1. Por dónde se le entra: K-line, no CAN

**CAN (ISO 15765-4) es obligatorio en EEUU desde el modelo 2008**, con entrada
gradual desde 2003. Un Mitsubishi 2004 diagnostica por **K-line, pin 7**:
ISO 9141-2 o ISO 14230-4 (KWP2000).

Consecuencia directa para el taller:

- **El USB-Link (RP1210) no sirve para este vehículo.** El camino USB de NexusPro
  abre CAN 500/250k, J1939 y J1708 — ninguno es K-line. Antes de este cambio el
  escaneo moría con *"No se detectó ningún bus… verificá el cable y el switch"*,
  que manda a revisar lo que está bien.
- **Hay que usar el dongle Bluetooth (ELM327/Vgate).** `ATSP0` autodetecta
  ISO 9141-2 y KWP2000, así que el motor sí responde por ahí.

Esto no es que "el Montero no habla OBD-II": lo habla, pero sobre otra capa
física. Los tres vehículos escaneados antes (Nissan Rogue 2017, Isuzu NPR HD 2008)
entraron todos en `CAN 11 bits / 500k` — eran post-mandato CAN. El Montero es el
primer pre-CAN del taller.

## 2. El techo de acceso a los módulos — es físico, no de software

Henry pidió llegar a **TPMS, ABS, 4x4, BCM, HVAC y TCM**. La realidad de esta
generación:

| Módulo | Cómo habla | ¿Se alcanza? |
|---|---|---|
| Motor (MPI/ECM) | OBD-II estándar, K-line pin 7 | ✅ por Bluetooth |
| Transmisión (CVT/TCM) | pin 7, junto al motor | ⚠️ sólo si responde KWP estándar |
| SRS / airbag | pin 7, MUT-II | ❌ |
| ABS, 4x4, HVAC, TPMS | MUT-II | ❌ |
| ETACS (BCM / carrocería) | **pin 9** | ❌ |

Dos paredes, y ninguna se arregla escribiendo código:

1. **MUT-II corre a 15625 baudios** con init a 5 baudios. Un ELM327 no puede
   generar ese baud rate — está fuera de sus protocolos. Los dongles que se
   anuncian como "MUT-II compatible" no lo son.
2. **El ETACS va por el pin 9 del conector.** Un ELM327 cablea 6/14 (CAN),
   7/15 (K/L-line) y 2/10 (J1850). El pin 9 no está conectado en ningún dongle,
   y el USB-Link por RP1210 tampoco lo expone.

**Para ABS / SRS / 4x4 / TPMS / ETACS hace falta MUT-III** (o un clon con su VCI),
o un multimarca que declare cobertura Mitsubishi de esta generación. No hay
software que lo sustituya con el hardware actual.

Lo que sí se hizo: el módulo ahora **lo dice antes de conectar** en vez de dejar
el vehículo con un solo módulo listado, que es el falso-limpio de siempre — un
módulo con fallas reales declarado sano porque nadie le preguntó.

## 3. EVAP y el olor fuerte a gasolina — esto es seguridad

El Montero Gen3 tiene **dos campañas de fábrica por fuga de combustible**, las dos
con riesgo de incendio:

- **SR-04-007 / NHTSA 04V312000** — el fitting de la manguera de retorno de la
  bomba de combustible mal moldeado; puede romperse y fugar. Se reemplaza la bomba.
- **SR-04-008 / NHTSA 04V319000** — la **válvula de nivelación del tanque** no
  sella con el tanque lleno y el vehículo estacionado de trompa hacia arriba en
  pendiente, con calor: el combustible se fuga al suelo. Se reemplaza la válvula.

El detalle que conecta con el olor: en esa reparación **el cánister de carbón hay
que reemplazarlo si quedó empapado de combustible**. Un cánister saturado deja de
adsorber, empuja vapor (y líquido) hacia la purga y da olor fuerte a gasolina
cruda — además de tirar códigos de fuga EVAP que parecen "el tapón".

**Orden de revisión sugerido, afuera y sin fuentes de ignición:**

1. Buscar combustible **líquido** primero: tanque, tubo de llenado y su válvula de
   retención, válvula de nivelación, bomba y sus fittings.
2. Palpar/pesar el cánister. Si pesa o gotea, está saturado: se cambia, no se lava.
3. Sólo si no hay líquido: tapón, mangueras del cánister, prueba de humo.
4. Revisar las campañas por marca/modelo/año en la pestaña de campañas (por VIN no
   va a funcionar, ver punto 4).

El olor fuerte **dentro de la cabina** no se trata como código informativo. Por eso
`P0455` se subió de `informativa` a `atencion` en la guía, y se le agregó el
cánister saturado y la fuga del tubo de llenado como causas. También se agregaron
guías para `P0441`, `P0443`, `P0446` y `P0451`.

## 4. Datos del vehículo que hay que corregir

- **VIN de 16 caracteres.** `JMVLVV77WM306540` no puede decodificarse ni consultarse
  en NHTSA (un VIN son 17). Sin corregirlo, las campañas *por VIN* devuelven vacío y
  parece "este vehículo no tiene campañas". Las de marca/modelo/año sí funcionan.
  Hay que cotejarlo contra la tarjeta de circulación.
- **Motor vs cilindrada, no cuadran.** El campo dice `6G72` (que es 2972 cc) y la
  cilindrada dice 3820 cc, que corresponde al **6G75 (3.8 L V6)** — el motor del
  Montero 2003-2006 norteamericano. Uno de los dos está mal.
- **Sin boletines TSB.** El índice local de Mitsubishi tiene 16 modelos y ninguno es
  Montero, así que para este vehículo no hay TSB que mostrar.
- **TPMS confirmado:** el Montero 2003-2006 de EEUU sí trae TPMS de fábrica (el
  mandato federal completo fue en 2006). El módulo existe — el problema es sólo que
  se le habla por MUT-II.

## 5. Qué cambió en el código

- El barrido por módulo ahora **también existe en K-line** (ISO 14230/KWP2000):
  destino de 1 byte, cabecera `[0x80|largo][destino][0xF1]`, saludo con
  StartCommunication `0x81`, códigos con `18 00 FF 00`. Antes en un vehículo de
  K-line no había escaneo por módulo en absoluto.
- El mapa de acceso distingue `enlace: 'can' | 'kline'`, y un mapa de K-line **no
  se reutiliza** en el barrido por CAN (sus `req` son destinos de un byte, no IDs CAN).
- El botón *Probar adaptador* y el selector de adaptadores ahora muestran
  **ISO 9141-2 / ISO 14230**, que estaban fuera del filtro: un USB-Link que sí sabe
  K-line se veía como si sólo supiera CAN.
- Aviso previo por vehículo, con el año y la marca, antes de conectar.

> **Pendiente de verificación en vehículo.** El barrido en K-line está escrito
> contra la norma ISO 14230-3 pero **no se ha probado enchufado**. Cuando se pruebe,
> lo que hace falta es la 🧾 **Bitácora técnica** del escaneo, no un "no funcionó":
> ahí está el diálogo crudo con el vehículo.

### Dos defectos corregidos en la auditoría previa (2026-07-30)

Revisando el código **antes** de probarlo enchufado aparecieron dos problemas que
habrían dado un resultado engañoso en el primer intento:

1. **El barrido tardaba hasta 6 minutos, no «~1 min».** Recorría los 255 destinos
   y en K-line cada puerta cerrada se paga con el timeout completo (1,2 s) más el
   `ATSH`. Justo el caso del Montero, donde casi nada contesta: la pantalla habría
   quedado quieta el tiempo suficiente para que cualquiera la diera por colgada.
   Ahora se prueban primero **30 destinos habituales** (motor, ABS, carrocería,
   airbag, transmisión, y la dirección funcional 0x33) y sólo si no aparece nadie
   se recorren los 255, avisando que va a tardar.

2. **La sesión KWP se cerraba antes de leer los códigos.** Se saludaba a los 255
   destinos primero y recién después se pedían los códigos: para entonces habían
   pasado minutos y en KWP2000 la sesión se cae sola sin tráfico. El módulo habría
   contestado `NO DATA` y habría quedado listado como «sin códigos» teniéndolos —
   el mismo falso-limpio, entrando por otra puerta. Ahora se **re-saluda a cada
   módulo justo antes** de pedirle los códigos, con un segundo intento si el
   primero se pierde, y el que saluda pero no entrega nada se marca
   `respondio: false` en vez de darse por sano.

Ocho pruebas nuevas cubren ambos casos (`test/obd/kline-modulos.js`).

## 6. Prueba con el USB-Link enchufado al vehículo (2026-07-30)

Se probó con el Montero enchufado, manejando el puente RP1210 **directo desde
Node** —sin navegador ni despliegue— para no depender de la app.

**Lo que el USB-Link SÍ hace:**

- Abre K-line sin chistar: `ISO9141`, `ISO14230`, `KWP2000`, `KW2000`, `OBDII`.
- El `.INI` trae **canales dedicados** por capa física, que hay que usar con su
  protocolo exacto o da `ERR_INVALID_DEVICE`:
  **70** = KWP2000 · **120** = KW2000 · **121** = ISO9141 · **134** = OBDII ·
  135/136 = Ford/GM J1850.
- **Transmite de verdad.** El comando **16 con `[01]`**
  (`Set_Echo_Transmitted_Messages`) devuelve copia de lo que sale:
  `00 21 4a bf | 01 | 82 33 f1 01 00 | 25` — timestamp, marca de eco, el mensaje,
  y el **checksum que el driver agrega solo**.
- **Formato de trama, descubierto por evidencia:** bajo `KWP2000` el driver
  valida el mensaje ISO 14230 completo. `82 33 F1 01 00` pasa; `68 6A F1 01 00`
  —mismo largo— da `ERR_MESSAGE_TOO_LONG`, porque lee el primer byte como
  formato/largo. O sea: `[0x80|largo][destino][origen=0xF1][datos]`, sin
  checksum (lo pone él).

**Lo que NO pasa: el vehículo no contesta nunca.** ~80 combinaciones — 5
protocolos, 4 canales dedicados, 7 direcciones de módulo (0x33, 0x10, 0x11,
0x01, 0x12, 0x18, 0x00), 10 comandos RP1210 como candidatos a init, protocolos
con parámetros, J1850 PWM/VPW, ALDL, con motor apagado **y** andando. En todas:
eco sí, respuesta no.

**El mismo conector le responde a un Thinkdiag al instante**, así que el pin 7
del vehículo está vivo y el puerto está sano.

**Conclusión:** el USB-Link es herramienta de camión y su K-line **no llega al
conector** — o el cable no trae el pin 7, o el clon no tiene el transceptor. Las
dos se ven idénticas desde el software y **ninguna se arregla con código**.

**Dato observado por Henry que respalda esto:** el LED ámbar **sí enciende**
cuando la app transmite en `OBD-II 11 bits / 500k` (CAN), y **no** en los pasos
de K-line.

**Confirmación en dos fases — HECHA el 2026-07-30, con el vehículo enchufado.**
Dos tandas de 20 s de K-line puro (`ISO14230`, device 1), 187 peticiones
transmitidas en total, eco apagado. Henry observando el adaptador:
**el LED ámbar no encendió ninguna de las dos veces**, y no volvió ni una trama.
Con el ámbar encendiendo en CAN y apagado en K-line, queda cerrado: el
transceptor de K-line del USB-Link no llega al conector. **No hay nada más que
probar por software.** Al Montero se entra por el dongle Bluetooth.

Dos cosas más de esa sesión, para no repetirlas:

- **El barrido del 30/07 no midió nada.** Sus ~80 combinaciones dieron
  `Error RP1210 275` — el adaptador estaba colgado y ninguna petición salió.
  **El 275 se cura desenchufando y volviendo a enchufar el USB-Link**; después
  del reenchufe los 22 protocolos abren. Cualquier tanda con 275 en todo hay que
  descartarla, no interpretarla.
- **Device 146 (`ATEC-160 Baud`) queda cerrado**: sólo abre con el protocolo
  `ATEC160BAUD` —los otros 21 dan `Error RP1210 134`, ID inválido— y tampoco
  responde. Era una de las vías marcadas como "nunca se tocó".

**De paso se encontró un defecto real:** el puente instalado en la PC estaba
**9,5 KB desactualizado** (13.428 vs 22.885 bytes) y no conocía la operación
`apis` — por eso la app no listaba adaptadores y daba un aviso equivocado sobre
K-line. Se actualizó y se verificó corriendo.

## 7. La captura de USB — qué hace la app, trama por trama (2026-07-30)

Henry escaneó la camioneta **dos veces** con Wireshark grabando el bus USB. El
archivo está en el repo: `docs/capturas/montero-2026-07-30.pcapng` — 1023 tramas,
189,7 s (21:34:50 → 21:38:00), USBPcap, sin truncar.

Esto ya no es "lo que creemos que manda la app": es lo que salió por el cable.

**El adaptador**, por su propio string de identificación:
`0f3f:f005` · `NEXIQ Technologies,Inc.- USB Link v02.500134\AE`. Cuatro endpoints
bulk: `0x03`/`0x82` para identificarse, `0x05`/`0x84` para datos.

### Los dos escaneos son `_detectarVia()`, paso por paso

| t (s) | Protocolo | Qué hizo | Duración |
|---|---|---|---|
| 95,1 | `CAN:Baud=500` | 2 envíos | 5,1 s |
| 101,9 | `CAN:Baud=250` | 2 envíos | 5,2 s |
| 110,5 | `J1939:Baud=250` | sólo escuchar | 2,3 s (= `_hayTrafico(2200)`) |
| 116,5 | `J1939:Baud=500` | sólo escuchar | 2,4 s |
| 121,2 | `J1708` | sólo escuchar | hasta el error en pantalla |

El segundo intento (t=149 a 189) repite los cinco pasos idénticos. La captura
termina con el `J1708` todavía abierto.

De paso quedó descifrado el byte del mensaje de conexión: **es el baudaje, no el
protocolo** — `0xEA`=500k, `0xE9`=250k, `0xFE`=J1708. Por eso `CAN:Baud=500` y
`J1939:Baud=500` comparten `0xEA`.

### El LED ámbar, identificado: son estos cuatro envíos

Los únicos 8 mensajes de datos en 190 s son 2 intentos × 2 baudajes × 2 anchos de
ID. El formato interno del USB-Link es
`[canal][00 00][ID de 4 bytes little-endian][8 bytes de datos]`:

```
01 ff 0f 00 70 00 00 | 00 00 df 07 | 02 01 00 00 00 00 00 00   → ID 0x7DF
01 ff 0f 00 70 00 00 | f1 33 db 98 | 02 01 00 00 00 00 00 00   → ID 0x18DB33F1
```

`0x7DF` es la petición funcional OBD-II de 11 bits, `0x18DB33F1` la de 29 bits
(el `0x98` lleva el bit 31, la marca de ID extendido) — exactamente lo que arma
`_canTx()`. **El LED ámbar que vio Henry son los envíos de CAN 11 bits / 500k**,
en t=95,08 y t=149,02. Queda confirmado a nivel de USB que el adaptador transmite
CAN de verdad.

### El vehículo no contestó nada, y eso ahora es un dato medido

Las 375 tramas de entrada están todas clasificadas y no queda ninguna sin
explicar: latido del adaptador cada 250 ms (`0a 00 · 01 00 · 03`), estado de 30
bytes cada 1 s, acuses de conexión, y el eco de la propia transmisión. **Cero
tramas del bus.**

Que un Montero 2004 no conteste en CAN era lo esperado por el año. Ahora está
**medido**: no hay CAN en los pines 6/14 de este vehículo. Deja de ser deducción.

### Lo que la captura deja al descubierto

**1. Por USB nunca se intenta K-line.** En 190 segundos y dos escaneos completos,
los únicos protocolos abiertos fueron CAN, J1939 y J1708. `_detectarVia()` prueba
esos cinco y tira el error. Para este vehículo el escaneo por USB **no puede
funcionar por construcción**: nunca hace la pregunta correcta. Ya estaba dicho en
la sección 1; acá se ve trama por trama.

**2. Defecto real — la petición de 29 bits no vuelve nunca.** Los 4 envíos de 11
bits (`0x7DF`) recibieron eco del adaptador a los **0,5 ms**, con marca de tiempo.
Los 4 de 29 bits (`0x18DB33F1`) **no recibieron nada**: ni eco, ni error. 4 de 4,
en los dos intentos y en los dos baudajes.

La trama sale bien armada desde `_canTx()` — el ID y el flag de extendido están
correctos en los bytes crudos del USB. O sea que el problema está del adaptador
para adentro: lo más probable es que un canal `CAN` abierto sin configuración de
ID extendido descarte la transmisión en silencio. **Al Montero no le afecta**
(no es CAN), pero en un vehículo que sí sea **CAN de 29 bits el escaneo por USB
diría «no responde» sin haber preguntado nunca**.

Chequeo barato que lo confirma sin tocar código: en el próximo escaneo por USB,
**contar los destellos del LED en cada baudaje**. Si es uno solo, y no dos
separados por ~2,5 s, la petición de 29 bits no está saliendo al cable.

### Qué NO es esta captura

No es la corrida de `tools/montero-usblink.js` de la sección 6. Es el escaneo
normal de la app. Las dos tandas de K-line puro con el LED apagado siguen siendo
evidencia aparte, no registrada en este archivo.

---

### Fuentes

- [Mitsubishi OBD-II diagnostic connector pinout — PinoutGuide](https://pinoutguide.com/CarElectronics/mitsubishi_obd2_daig_pinout.shtml) (pin 7 = MPI/CVT/SRS/inmovilizador, pin 9 = ETACS)
- [OBD2 protocols — obdtester.com](https://www.obdtester.com/obd2_protocols)
- [Legacy OBD2 Protocols Guide: KWP2000, ISO9141 & CAN](https://obd-cable.com/legacy-obd2-protocols-guide/)
- [Mitsubishi CAN, MUT, GDI Diagnostics for Android ELM327 — Mitsubishi Forums](https://www.mitsubishi-forums.com/threads/mitsubishi-can-mut-gdi-diagnostics-for-android-elm327.71706/) (MUT: init 5 baudios + 15625 baud, imposible con ELM327)
- [Mitsubishi Recall SR-04-008 / 04V319000 — fuga por válvula de nivelación](https://www.carcomplaints.com/Mitsubishi/Montero/2003/recalls/mitsubishi-fuel-leakage-04v319000.shtml)
- [Recall 04V312000 — fitting de manguera de retorno de la bomba](https://repairpal.com/recall/04V312000)
- [Gen3 Montero: fuga de combustible en pendiente o con calor — Expedition Portal](https://forum.expeditionportal.com/threads/so-your-gen3-montero-is-leaking-fuel-when-parked-uphill-going-up-an-obstacle-or-when-it-is-hot-outside.223055/)
- [Mitsubishi Montero TPMS 2003-2006 — Go-Parts](https://www.go-parts.com/garage/ps-2000-2009-mitsubishi-montero-tire-pressure-monitoring-system-tpms-programmabl)
