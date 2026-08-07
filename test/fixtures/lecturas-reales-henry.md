# Lecturas reales vs. valor correcto — correcciones de Henry (2026-08-07)

Datos verificados **contra los documentos físicos**. Son la referencia para
medir si la lectura automática mejora o empeora: no se corrige "a ojo", se
compara contra esta tabla.

## DPI

| Campo | Lo que leyó la IA | Lo CORRECTO | Falla |
|---|---|---|---|
| `dpi_numero_serie` | `36455563` | `36456563` | dígito confundido (5 en vez de 6) |
| `pais_nacimiento` | *(no existía el campo)* | `GTM` | campo ausente en prompt, BD y formulario |
| `nacionalidad` | `GTM` | `GTM` | ✓ correcto |

El DPI trae **dos** campos distintos y contiguos en el anverso: `NACIONALIDAD`
y `PAÍS DE NAC.`. En un guatemalteco de nacimiento dicen lo mismo, por eso la
falta pasó desapercibida; en un naturalizado **no coinciden**.

## Tarjeta de tenencia

| Campo | Lo que leyó la IA | Lo CORRECTO | Falla |
|---|---|---|---|
| `marcaje_gua` | `816025 3773028 387597` | `816.025 3.773.028 387.597` | se comió los puntos |
| `num_tarjeta` | `2621570` | `2821570225570` | dígito confundido + número truncado |
| `arma_serie` | `ARZ20241` | `BHTT137` | **no se parece en nada** |

El caso de `arma_serie` es el más grave y cambia el diagnóstico: `ARZ20241` no
es una confusión de dígitos de `BHTT137` — distinto largo, distintas letras.
El modelo no leyó mal ese campo: leyó **otro renglón de la tarjeta**, o lo
inventó. Un número de serie equivocado en el inventario de una armería es un
arma que ante DIGECAM no cuadra con su tarjeta (art. 58).

El marcaje GUA va **tal como está troquelado** (art. 35). Quitarle los puntos
cambia el dato que se copia a un formulario de DIGECAM.

## Recibo de servicios

Reportado por Henry: no llenó la dirección, no archivó el documento y no
ajustó el tipo de vivienda. **Sin confirmar**: la prueba fue a las 20:41 y el
arreglo de la lectura del reverso salió a las 21:05, así que probó código
anterior. Hay que repetirla antes de diagnosticar.

## Qué implica

Dos clases de problema distintas y con arreglos distintos:

1. **Formato** (marcaje GUA sin puntos): se corrige en el prompt — decir que
   la puntuación se conserva literal.
2. **Lectura equivocada** (serie del DPI, número de tarjeta y sobre todo
   `arma_serie`): NO se arregla con instrucciones. Estos documentos se leen
   con `claude-haiku-4-5`, el modelo por defecto de toda la app — el más
   barato y el más flojo leyendo texto pequeño en un plástico con reflejo.
   `BHTT137` → `ARZ20241` no es ruido de OCR, es el modelo tomando otro campo.
   Para un documento que alimenta una declaración jurada y un trámite de
   DIGECAM, eso es un documento falso. Los modos de imagen tienen que correr
   con un modelo más fuerte (variable `AI_MODEL_DOCS`), aunque cueste más por
   lectura: son pocas lecturas y de mucho riesgo.

   **Medir, no suponer**: con esta tabla se puede comparar modelo contra
   modelo sobre los mismos documentos, en vez de "se ve mejor".

Y en los dos casos: **estos números hay que verificarlos contra el documento
físico antes de guardar**, que es lo que el aviso de pantalla ya dice — pero
conviene que los campos numéricos críticos (serie, marcaje, número de tarjeta)
se marquen visualmente como "verificar", en vez de quedar iguales al resto.
