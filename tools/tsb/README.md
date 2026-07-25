# Boletines de fábrica (TSB) — de dónde salen y cómo actualizarlos

Un **boletín de servicio** es una falla que la propia marca ya reconoció para un
modelo, con su procedimiento. Antes de diagnosticar desde cero conviene ver si el
síntoma ya está descrito: si lo está, el camino corto es el del fabricante.

## Fuente

NHTSA publica las **Manufacturer Communications** que recibe de las marcas desde
1995, como archivos planos de **dominio público** (gobierno de EE.UU.):

    https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_<tramo>.zip

Se usan los tramos `2015-2019` y `2020-2024`. El layout de campos está en
`https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS.txt`.

Lo que se importa es el **índice**: número de boletín, modelo, años, componente y
el resumen corto. El documento completo lo publica la marca y es suyo — se pide
por su número en la agencia. No se copia aquí.

## Por qué archivos estáticos y no una tabla

El índice pesa ~48 MB. La base del proyecto está en **plan free de Supabase
(500 MB, 22 MB usados)**: meterlo ahí se comería un tercio de la cuota. Como
assets del Worker cuesta **0** de esa cuota, lo cachea el CDN y el Service Worker
lo deja disponible **sin conexión** — que es justo cuando un taller lo necesita.

## Estructura

    data/tsb/indice.json              marcas y conteos
    data/tsb/<MARCA>/_modelos.json    modelos con boletines de esa marca
    data/tsb/<MARCA>/<MODELO>.json    boletines de ese modelo

Un archivo por modelo, no por marca: GM publica decenas de miles de boletines y
agrupar por inicial daba archivos de 7 MB. Así se bajan decenas de KB.

Campos (abreviados a propósito, son 162 mil registros):
`n` número · `m` modelo · `d`/`h` año desde/hasta · `c` componente ·
`t` resumen corto · `f` fecha del fabricante · `i` id NHTSA.

## Regenerar

    python tools/tsb/generar.py                      # marcas de Guatemala, 2012+
    python tools/tsb/generar.py --marcas BMW,VOLVO   # agregar otras
    python tools/tsb/generar.py --desde 2015         # recortar años

Los zips quedan cacheados en `tools/tsb/.cache/` (62 MB, fuera de git). Conviene
correrlo una o dos veces al año: NHTSA agrega boletines nuevos continuamente.

Si cambia el nombre de los archivos hay que cambiar también `_tsbSlug()` en
`js/modulos/operacion/diagnostico_obd.js`, que arma la misma ruta.

## Límite importante

NHTSA cubre el **mercado de EE.UU.**. Modelos que no se venden allá no tienen
boletines: el **Toyota Hilux** —de los más comunes en Guatemala— no aparece, y lo
mismo pasa con buena parte de lo importado de Japón o Corea. La pantalla lo dice
cuando no encuentra nada, para que nadie interprete "sin boletines" como "sin
fallas conocidas".
