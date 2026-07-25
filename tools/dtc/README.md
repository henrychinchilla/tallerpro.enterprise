# Catálogo DTC — de dónde sale y cómo regenerarlo

El diccionario `_DTCS` de `js/modulos/operacion/diagnostico_obd.js` **se genera**, no se
escribe a mano. Este directorio tiene todo lo necesario para auditarlo o rehacerlo.

## Por qué existe

La tabla `dtc_catalogo` de la base (3,071 códigos, migración 075) está **corrida un lugar
desde ~P0170**: cada código muestra la descripción del anterior.

| Código | Lo que decía la tabla | Lo correcto |
|---|---|---|
| P0420 | Secondary Air Injection System Relay "B" (= P0419) | Eficiencia del catalizador bajo el umbral |
| P0455 | EVAP Pressure Sensor Intermittent (= P0454) | Fuga grande en el sistema EVAP |
| P0304 | Cylinder 3 Misfire (= P0303) | Fallo de encendido cilindro 4 |

Un mecánico con P0304 habría revisado el cilindro equivocado. Por eso el diccionario del
módulo manda sobre la tabla, y el texto de la tabla se muestra marcado como
*"sin verificar, confirmar en el manual"*.

## Fuente

`todrobbins/dtcdb` → `generic.csv` (licencia MIT), códigos genéricos SAE J2012.
Se eligió porque su alineación código↔descripción se verificó contra códigos conocidos
(P0171, P0300, P0420, P0442, P0455, P0500). **No** se usó `Wal33D/dtc-database` pese a
tener más códigos: sus 18,805 definiciones de fabricante no declaran procedencia, y la
migración 080 exige "solo referencias con derechos de uso verificados".

La fuente es comunitaria y trae defectos reales, que `limpiar.js` repara de forma
determinista (y descarta lo que no se puede reparar con certeza):

- líneas con dos códigos pegados (falta el salto de línea) — 9 casos
- líneas truncadas a media palabra: `...Low (Cam/R`
- OCR de dígitos: `02 Sensor`→`O2`, `Bank I`→`Bank 1`, `Cylinder S`→`Cylinder 5`, `Gear I`→`Gear 1`
- erratas: `Petal`→`Pedal`, `Stock On`→`Stuck On`
- líneas de encabezado (`DTC Codes - P0400-P0499 – ...`) coladas como si fueran códigos

## Regenerar

```sh
curl -sL https://raw.githubusercontent.com/todrobbins/dtcdb/master/generic.csv -o generic.csv
node prep.js      # extrae códigos (parte líneas pegadas, quita encabezados)
node limpiar.js   # repara defectos de la fuente; descarta lo dudoso
node gen-dtc.js   # traduce al español con diccionario de frases
node check.js     # FALLA si sobrevivió cualquier palabra en inglés
node revisar.js   # olores de traducción + muestra para revisión humana
node aplicar.js   # reescribe el bloque _DTCS del módulo
```

`aplicar.js` respeta las entradas escritas a mano que ya estaban en el módulo (son más
naturales que la traducción automática) y solo agrega las que faltaban.

## Qué NO hace

No traduce códigos de fabricante (P1xxx, y B/C/U que no sean X0xxx): su significado
cambia entre marcas y adivinar la marca es justo lo que produce diagnósticos errados.
Esos se muestran con el rango del sistema y "consultar manual del fabricante".
