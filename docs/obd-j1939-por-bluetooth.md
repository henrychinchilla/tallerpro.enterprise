# Camiones J1939 por Bluetooth — sin USB-Link

Hasta ahora, escanear un camión exigía el **NEXIQ USB-Link por RP1210**: un
adaptador caro, atado a una PC con Windows y al puente local. Un ELM327 que
declare **SAE J1939** hace el mismo trabajo por Bluetooth.

## Por qué se puede

Un ELM327 con **protocolo A** pone el transceptor en **250 kbit/s con IDs de 29
bits**, que es exactamente el bus del camión. Desde ahí, `ATMA` vuelca todas las
tramas. El adaptador no entiende J1939 — sólo pasa las tramas — pero eso alcanza,
porque el decodificador J1939 de NexusPro (PGN, SPN, FMI, DM1/DM2, transporte
BAM, nombres de módulo) ya está escrito y funcionando para el camino USB.

**No se decodificó nada nuevo.** Lo único que se agregó es la traducción del
formato: se le da a la trama del ELM la misma forma que entrega el RP1210
—`[ts×4][pgn×3][prio][origen][destino][datos]`— y todo lo demás se reusa entero.

Se monitorea con **`ATMA`** (todo el bus) y no con **`AT DM1`** (sólo los códigos
activos) a propósito: el mismo volcado alimenta además los sensores del motor, el
Address Claim y el VIN multipaquete. Un camino en vez de tres.

## La regla que más se equivoca: PDU1 vs PDU2

El ID de 29 bits se parte así:

```
 prioridad(3) EDP(1) DP(1) PF(8) PS(8) SA(8)
```

- **PF ≥ 240 (PDU2)** — difusión. El **PS SÍ** es parte del PGN.
- **PF < 240 (PDU1)** — dirigido. El **PS es la dirección del destinatario** y
  **NO** va en el PGN.

Meterlo al revés inventa PGNs que no existen y pierde los que sí. Lo peor: el
transporte multipaquete (`TP.CM` = 0xEC, `TP.DT` = 0xEB) es **PDU1**, así que con
la regla mal el BAM no se rearma nunca — y sin BAM no hay VIN ni DM1 con más de
una falla. Hay 6 pruebas que se caen si esa línea se toca.

## Cómo se usa

En *Nuevo Escaneo* → **Conexión** → `🚚 Bluetooth — camión J1939 (dongle con
protocolo A)`.

Si el dongle no acepta `ATSPA`, el escaneo **falla diciendo por qué** en vez de
dejar creer que el camión está sano.

## Qué dongle sirve

Necesita declarar **SAE J1939** — la mayoría de los ELM327 baratos no lo hacen. Y
para camión hace falta además que aguante **24 V**:

| | Requisito | Por qué |
|---|---|---|
| ⚡ | Rango **12 V / 24 V** | Un adaptador de 12 V enchufado a 24 V enciende sus LED igual, pero no abre el bus y se puede dañar |
| 📡 | **BLE**, no sólo Bluetooth Classic | Web Bluetooth no alcanza Bluetooth Classic ni WiFi |
| 🚚 | Protocolo **A (SAE J1939)** | Es el que pone el bus en 250k / 29 bits |

El **Vgate vLinker MS** cumple los tres, con una salvedad: sale de fábrica en
modo **MFi (Bluetooth Classic)** y hay que pasarlo a **BLE** con la app
*VgateFwUpdate*. Sin ese paso NexusPro no lo ve.

## Límites, dichos y no disimulados

- **Conector.** Esto asume el **OBD-II de 16 pines**. Un camión con **Deutsch de
  9 pines** necesita cable adaptador — el dongle no entra físicamente.
- **Vgate declara "diésel de 6.5T o menos"** en su ficha comercial, lo que
  contradice su propia lista de protocolos. Técnicamente manda la lista, pero si
  un camión grande no contesta, ese disclaimer es la explicación.
- **`AT DM1` no se usa**, así que no importa si el firmware lo implementa.
- **El USB-Link sigue siendo el camino de referencia**: es el único probado
  contra vehículo real, y el único que además habla **J1708/J1587** para camión
  antiguo.

> **Pendiente de verificación en camión.** Escrito contra la norma **SAE
> J1939-21** y con 50 pruebas de lógica, pero **sin probar enchufado**. Cuando se
> pruebe hace falta la 🧾 **Bitácora técnica**, no un "no funcionó": ahí está el
> diálogo crudo, y si el volcado llega pero no se interpreta, el log imprime la
> trama tal cual para corregir el offset en una sola visita.

---

### Fuentes

- [ELM327 — hoja de datos (protocolo A, `AT MA`, `AT DM1`, `AT CP`, `AT SH`)](https://www.elmelectronics.com/wp-content/uploads/2016/07//ELM327DS.pdf)
- [J1939-73 Diagnostics Explained (DM1, DTCs) — CSS Electronics](https://www.csselectronics.com/pages/j1939-73-dm1-diagnostic-message-dtc)
- [J1939 DM1: Active Diagnostic Trouble Codes — Embedded Flakes](https://embeddedflakes.com/j1939-dm1-active-diagnostic-trouble-codes-dtcs/)
- [Vgate vLinker MS — ficha oficial (12 V / 24 V)](https://www.vgatemall.com/products-detail/i-79/)
- [Foro Vgate — pasar de MFi a BLE+BT con VgateFwUpdate](https://forum.vgatemall.com/showthread.php?tid=6705)
