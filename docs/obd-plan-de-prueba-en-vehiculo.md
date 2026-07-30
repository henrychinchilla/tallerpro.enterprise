# Plan de prueba en vehículo — escáner OBD

Todo lo que se agregó entre los PR #16 y #26 está probado **en simulación**: 138 pruebas que
verifican parsers, direccionamientos y restauración de estado, pero **ninguna toca un bus
real**. Lo que sigue es lo que hay que hacer frente al vehículo para convertir eso en
evidencia.

Está escrito para ejecutarse sin mí: cada bloque dice **qué hacer**, **qué tiene que pasar**
y **qué mandar si no pasa**.

> **Regla general:** si algo falla, no describas el síntoma — abrí el escaneo guardado,
> *Ver* → **🧾 Bitácora técnica**, y mandá ese texto. Trae protocolo, bits, baud y cada
> módulo con su dirección, su servicio y sus códigos. Con eso se diagnostica sin el
> vehículo enfrente; con un "no funcionó" no.

---

## 0. Antes de empezar

- Switch en contacto (no hace falta el motor encendido salvo donde se indique).
- Si es por USB: `iniciar-puente.bat` corriendo, ventana abierta.
- Anotá con qué adaptador probás: **USB-Link (RP1210)** o **dongle Bluetooth**.

---

## 1. Nissan Rogue 2017 — el caso de referencia

Es el vehículo con el que se validó el barrido por módulo (16 códigos donde el modo 03
reportaba cero). Ahora hay que verificar lo que se le agregó encima.

**Hacé:** escaneo completo por USB. Guardá.

**Tiene que pasar:**

| # | Qué mirar | Esperado |
|---|---|---|
| 1.1 | Los 16 códigos | Cada uno con su **tipo de falla** al lado ("circuito abierto", "corto a tierra"…). Los que no se reconocen dicen `tipo de falla 0xNN — ver manual` |
| 1.2 | Lista de módulos | Los que antes salían como `Módulo 0x7AA` ahora deberían mostrar **el nombre que el módulo se da a sí mismo** |
| 1.3 | Motor y transmisión | Siguen diciendo `Motor (ECM)` / `Transmisión (TCM)`, **no** una cadena interna del ECU |
| 1.4 | Tarjeta 🗺 **Mapa de acceso** | Aparece, con los módulos y sus direcciones |
| 1.5 | Sensores en vivo | Funcionan **después** del barrido (esto verifica el fix del PR #26) |

**Contraste importante (1.1):** los tipos de falla se leen según ISO 14229. Hay marcas que
usan ese byte a su manera. Si un tipo no cuadra con el manual Nissan, **mandalo** — es dato
para saber si Nissan lo usa distinto.

### 1.b El mapa, en la segunda pasada

**Hacé:** volvé a escanear el mismo Rogue (o cualquier otro Rogue).

**Tiene que pasar:** en el log aparece `Mapa conocido de Nissan Rogue 2017: N módulo(s)…` y
los primeros resultados salen **en segundos**, antes del barrido completo.

**Si no aparece:** el mapa no se guardó. Mandá la bitácora de los dos escaneos.

---

## 2. Barrido en 29 bits — un vehículo que hoy da cero módulos

**Cuál sirve:** cualquiera donde el escaneo por módulo diga *"Ningún módulo respondió al
barrido"* pero el de emisiones sí funcione. Ese es el caso exacto para el que se hizo.

**Tiene que pasar:** en el log, `Pocos modulos en 11 bits — probando direccionamiento de 29
bits...` y después `N modulo(s) en 29 bits`. En el mapa esos módulos dicen **29 bits**.

**Si sigue en cero:** puede ser que de verdad no tenga más módulos accesibles. La bitácora
lo distingue: muestra si hubo respuesta a alguna dirección.

---

## 3. KWP2000 — algo de ~2003 a 2010

**Cuál sirve:** un vehículo de esa época donde el barrido **encuentra** módulos pero todos
salen *"respondió, sin códigos"*. Ese era el falso-limpio.

**Tiene que pasar:** los códigos aparecen, con la marca **"estado no reportado"**.

**Ojo con esto:** el número del código es fiable; el byte de estado de KWP **no se
interpreta a propósito** porque varía entre implementaciones. Si tenés cómo contrastar
contra el manual si esa falla estaba activa o guardada, **mandalo** — con dos o tres casos
reales se puede decidir si vale la pena decodificarlo.

---

## 4. Bluetooth — el que más gente va a usar

**Hacé:** escaneá con el dongle BLE un vehículo CAN de 11 bits.

**Tiene que pasar:** después del escaneo de emisiones arranca el barrido por módulo (tarda
~60 s por Bluetooth) y salen los módulos igual que por USB.

**Puede pasar legítimamente:** `El dongle Bluetooth no acepta ATSH`. Los clones baratos
varían; en ese caso el escaneo de emisiones sigue funcionando normal. **Anotá qué dongle es.**

**Lo crítico a verificar (4.b):** después del barrido, **probá el monitor en vivo y el
borrado de códigos**. Si la cabecera no volvió a la difusión, esas dos cosas le hablarían al
último módulo consultado en vez de al motor. Debe funcionar normal.

---

## 5. Comparación con la visita anterior

**Hacé:** escaneá un vehículo que ya se escaneó antes.

**Tiene que pasar:** tarjeta 📆 con reincidentes / nuevos / resueltos. Si en la visita
anterior se borraron códigos, tiene que aclarar que un código ausente **todavía no confirma
la reparación**.

---

## Qué mandar en cada caso

1. La **🧾 Bitácora técnica** (siempre, salga bien o mal).
2. Marca, modelo, año y con qué adaptador.
3. Si algo no cuadró con el manual de la marca: qué decía el manual.

Con eso alcanza para cerrar el bloque que corresponda o corregirlo.
