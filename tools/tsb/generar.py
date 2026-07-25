#!/usr/bin/env python3
"""Genera el índice de boletines de fábrica (TSB) que consulta el módulo de diagnóstico.

Fuente: NHTSA "Manufacturer Communications" — los boletines que las marcas emiten
para fallas ya conocidas de un modelo. Dominio público (gobierno de EE.UU.).
https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_<tramo>.zip

Por qué archivos estáticos y no una tabla:
  el índice completo pesa ~40 MB y la base del proyecto está en plan free (500 MB).
  Servidos como assets por el Worker cuestan 0 de esa cuota, los cachea el CDN y
  el Service Worker los deja disponibles sin conexión.

Salida: data/tsb/<MARCA>/<INICIAL-DEL-MODELO>.json  (archivos chicos, se baja solo
el que se necesita) + data/tsb/indice.json con las marcas y el conteo.

Uso:  python tools/tsb/generar.py [--marcas TOYOTA,NISSAN] [--desde 2012]
"""
import argparse, io, json, os, sys, urllib.request, zipfile
from collections import defaultdict

# la consola de Windows es cp1252 y se atraganta con acentos y flechas
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

TRAMOS = ['2015-2019', '2020-2024']          # boletines emitidos en estos años
BASE = 'https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_{}.zip'

# Marcas que realmente circulan en Guatemala. Agregar aquí si hace falta otra:
# el costo es solo tamaño del repo, no de la base.
MARCAS_GT = ['TOYOTA', 'NISSAN', 'HYUNDAI', 'KIA', 'MITSUBISHI', 'HONDA', 'MAZDA',
             'SUZUKI', 'ISUZU', 'CHEVROLET', 'FORD', 'VOLKSWAGEN', 'HINO',
             'MITSUBISHI FUSO', 'FREIGHTLINER', 'INTERNATIONAL']

# "Other" se descarta: son comunicados administrativos sin valor de taller.
TIPOS = {'Service Bulletin/Repair Instructions', 'Service Campaign',
         'Warranty Program/Extension', 'Emissions'}

# Boletines cuyo resumen todavía no publicaron: ocupan lugar y no dicen nada.
VACIOS = ('SUMMARY TO BE PROVIDED', 'NO SUMMARY', 'TO BE PROVIDED ON A FUTURE DATE')

# Índices de columna del archivo TSV (ver TSBS.txt de NHTSA)
C_NHTSA_ID, C_DOC_ID, C_FECHA_MFR, C_TIPO = 0, 3, 4, 6
C_MARCA, C_MODELO, C_ANIO, C_COMPONENTES, C_RESUMEN = 7, 8, 9, 10, 13


def descargar(tramo, destino):
    ruta = os.path.join(destino, f'TSBS_{tramo}.zip')
    if os.path.exists(ruta):
        print(f'  ya estaba: {os.path.basename(ruta)}')
        return ruta
    url = BASE.format(tramo)
    print(f'  bajando {url} …')
    urllib.request.urlretrieve(url, ruta)
    return ruta


def carpeta_marca(marca):
    """MITSUBISHI FUSO -> MITSUBISHI-FUSO. La ruta se arma igual en el módulo JS
    (_tsbRuta), así que si esto cambia hay que cambiarlo allá también."""
    return ''.join(ch if ch.isalnum() else '-' for ch in marca.upper()).strip('-')


def slug(texto):
    """Nombre de archivo seguro. Debe coincidir con _tsbSlug() del módulo JS."""
    s = ''.join(ch if ch.isalnum() else '-' for ch in texto.upper()).strip('-')
    while '--' in s:
        s = s.replace('--', '-')
    return s or '_'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--marcas', default=','.join(MARCAS_GT))
    ap.add_argument('--desde', type=int, default=2012, help='año-modelo mínimo')
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(__file__), '.cache'))
    args = ap.parse_args()

    marcas = {m.strip().upper() for m in args.marcas.split(',') if m.strip()}
    raiz = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    salida = os.path.join(raiz, 'data', 'tsb')
    os.makedirs(args.cache, exist_ok=True)

    print('Descargando fuentes NHTSA:')
    zips = [descargar(t, args.cache) for t in TRAMOS]

    # clave: (doc_id, marca, modelo) → un boletín por modelo, con los años colapsados
    agr = {}
    leidas = 0
    for z in zips:
        print(f'Procesando {os.path.basename(z)} …')
        with zipfile.ZipFile(z) as zf:
            nombre = zf.namelist()[0]
            with zf.open(nombre) as f:
                for linea in f:
                    leidas += 1
                    p = linea.decode('utf-8', 'replace').split('\t')
                    if len(p) <= C_RESUMEN:
                        continue
                    marca = p[C_MARCA].strip().upper()
                    if marca not in marcas or p[C_TIPO].strip() not in TIPOS:
                        continue
                    anio = p[C_ANIO].strip()
                    if not anio.isdigit():
                        continue
                    anio = int(anio)
                    if anio < args.desde or anio > 2035:
                        continue
                    resumen = ' '.join(p[C_RESUMEN].split())
                    if len(resumen) < 15 or any(v in resumen.upper() for v in VACIOS):
                        continue
                    modelo = p[C_MODELO].strip().upper()[:40]
                    doc = p[C_DOC_ID].strip()[:40]
                    clave = (doc, marca, modelo)
                    if clave in agr:
                        r = agr[clave]
                        r['d'] = min(r['d'], anio)
                        r['h'] = max(r['h'], anio)
                        comp = p[C_COMPONENTES].strip()[:60]
                        if comp and comp not in r['c']:
                            r['c'] = (r['c'] + '; ' + comp)[:120]
                    else:
                        agr[clave] = {
                            'n': doc,                                   # número de boletín
                            'm': modelo,
                            'd': anio, 'h': anio,                       # desde / hasta
                            'c': p[C_COMPONENTES].strip()[:60],         # componente
                            't': resumen[:220],                         # título/resumen corto
                            'f': p[C_FECHA_MFR].strip()[:8],            # fecha del fabricante
                            'i': p[C_NHTSA_ID].strip(),                 # id NHTSA (para el enlace)
                        }
    print(f'líneas leídas: {leidas:,} → boletines únicos: {len(agr):,}')

    # Un archivo por marca+modelo: el taller consulta un modelo a la vez y así baja
    # decenas de KB, no los 7 MB que pesaba agrupar por inicial (GM publica miles).
    archivos = defaultdict(list)
    for (doc, marca, modelo), v in agr.items():
        archivos[(marca, slug(modelo))].append(v)

    if os.path.isdir(salida):
        for d in os.listdir(salida):
            sub = os.path.join(salida, d)
            if os.path.isdir(sub):
                for f in os.listdir(sub):
                    os.remove(os.path.join(sub, f))
    os.makedirs(salida, exist_ok=True)

    total_bytes, por_marca, mayor = 0, defaultdict(int), 0
    modelos_por_marca = defaultdict(list)
    for (marca, mod), filas in sorted(archivos.items()):
        filas.sort(key=lambda r: -r['d'])
        carpeta = os.path.join(salida, carpeta_marca(marca))
        os.makedirs(carpeta, exist_ok=True)
        datos = json.dumps(filas, ensure_ascii=False, separators=(',', ':'))
        with io.open(os.path.join(carpeta, f'{mod}.json'), 'w', encoding='utf-8') as fh:
            fh.write(datos)
        n = len(datos.encode('utf-8'))
        total_bytes += n
        mayor = max(mayor, n)
        por_marca[marca] += len(filas)
        modelos_por_marca[marca].append(mod)

    # índice de modelos por marca: el taller escribe "Corolla XLI 1.8" y hay que
    # resolverlo a "COROLLA" antes de saber qué archivo pedir
    for marca, mods in modelos_por_marca.items():
        ruta = os.path.join(salida, carpeta_marca(marca), '_modelos.json')
        with io.open(ruta, 'w', encoding='utf-8') as fh:
            json.dump(sorted(mods), fh, ensure_ascii=False, separators=(',', ':'))

    indice = {
        'fuente': 'NHTSA Manufacturer Communications (dominio público)',
        'url': 'https://static.nhtsa.gov/odi/ffdd/tsbs/',
        'tramos': TRAMOS,
        'anio_desde': args.desde,
        'marcas': {m: n for m, n in sorted(por_marca.items())},
        'total': sum(por_marca.values()),
    }
    with io.open(os.path.join(salida, 'indice.json'), 'w', encoding='utf-8') as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=1)

    print(f'escritos {sum(len(v) for v in archivos.values()):,} boletines '
          f'en {len(archivos)} archivos · {total_bytes/1048576:.1f} MB '
          f'· archivo mayor {mayor/1024:.0f} KB')
    for m, n in sorted(por_marca.items(), key=lambda x: -x[1]):
        print(f'  {m:<18} {n:>7,}')


if __name__ == '__main__':
    sys.exit(main())
