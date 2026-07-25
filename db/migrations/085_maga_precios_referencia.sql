-- ═══════════════════════════════════════════════════════
-- 085 — Precios de referencia MAGA (Sistema de Información de Mercados)
--
--   Fuente: https://precios.maga.gob.gt/otros/datos-abiertos/ (datos abiertos
--   del Ministerio de Agricultura). Serie mensual de precios mayoristas desde
--   1998, 161 productos, mercados La Terminal / CENMA / 21 Calle.
--
--   Para qué: comparar el precio de hoy contra su propia historia y detectar
--   las ventanas de compra y venta de cada producto. Medido sobre la serie
--   real: papa 41% de brecha pico/valle, sandía 38%, mango 180%; el frijol
--   apenas 14% porque lo almacenable no tiene ventana.
--
--   Notas de la fuente (verificadas sobre el archivo, no supuestas):
--     · Actor y Periodicidad son constantes ('Mayorista', 'Mensual') → no se guardan.
--     · 32 productos aparecen con más de una medida (libra y quintal, por ej.),
--       así que la medida forma parte de la identidad del producto.
--     · Aun con (producto, medida, mercado, fecha) quedan 182 grupos con dos
--       precios distintos: son lecturas repetidas del mismo mes y el importador
--       las promedia (0.4% de las filas).
--     · 22% de las celdas vienen sin precio: no se insertan, para no confundir
--       "sin dato" con "precio cero".
--
--   Los datos son públicos y globales (sin tenant): se leen desde cualquier
--   comercio y solo los escribe el importador (service_role).
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.maga_productos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       text NOT NULL,
  medida       text NOT NULL,
  categoria    text NOT NULL DEFAULT 'otro'
               CHECK (categoria IN ('fruta','grano','hortaliza','otro')),
  -- equivalencia en kilos para poder comparar productos entre sí y contra
  -- venta_granos.precio_kg; NULL cuando la medida no es convertible (docena,
  -- manojo, mazo: dependen del tamaño de la unidad)
  kg_equiv     numeric(10,4),
  primer_dato  date,
  ultimo_dato  date,
  n_datos      integer NOT NULL DEFAULT 0,
  CONSTRAINT maga_productos_nombre_medida_uk UNIQUE (nombre, medida)
);

CREATE TABLE IF NOT EXISTS public.maga_precios (
  producto_id  bigint NOT NULL REFERENCES public.maga_productos(id) ON DELETE CASCADE,
  mercado      text NOT NULL,
  fecha        date NOT NULL,
  precio       numeric(12,2) NOT NULL CHECK (precio > 0),
  precio_kg    numeric(12,4),
  PRIMARY KEY (producto_id, mercado, fecha)
);

CREATE INDEX IF NOT EXISTS maga_precios_prod_fecha_idx
  ON public.maga_precios (producto_id, fecha DESC);
CREATE INDEX IF NOT EXISTS maga_precios_fecha_idx
  ON public.maga_precios (fecha DESC);
CREATE INDEX IF NOT EXISTS maga_productos_categoria_idx
  ON public.maga_productos (categoria, nombre);

-- ── RLS: lectura para usuarios autenticados, escritura solo del importador ──
ALTER TABLE public.maga_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maga_precios   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maga_productos_lectura ON public.maga_productos;
CREATE POLICY maga_productos_lectura ON public.maga_productos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS maga_precios_lectura ON public.maga_precios;
CREATE POLICY maga_precios_lectura ON public.maga_precios
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE public.maga_productos FROM anon;
REVOKE ALL ON TABLE public.maga_precios   FROM anon;
GRANT SELECT ON TABLE public.maga_productos TO authenticated;
GRANT SELECT ON TABLE public.maga_precios   TO authenticated;
GRANT ALL    ON TABLE public.maga_productos TO service_role;
GRANT ALL    ON TABLE public.maga_precios   TO service_role;

-- Resumen de cobertura por producto, para no graficar huecos como si fueran
-- ceros y para poder avisar cuándo MAGA dejó de medir algo.
CREATE OR REPLACE FUNCTION public.maga_refrescar_cobertura() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.maga_productos p SET
    primer_dato = s.min_f, ultimo_dato = s.max_f, n_datos = s.n
  FROM (
    SELECT producto_id, min(fecha) AS min_f, max(fecha) AS max_f, count(*) AS n
    FROM public.maga_precios GROUP BY producto_id
  ) s
  WHERE s.producto_id = p.id;
$$;

REVOKE ALL ON FUNCTION public.maga_refrescar_cobertura() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.maga_refrescar_cobertura() TO service_role;

COMMENT ON TABLE public.maga_productos IS
  'Catálogo de productos del Sistema de Información de Mercados del MAGA. La medida forma parte de la identidad: el mismo producto se publica en libra y en quintal.';
COMMENT ON TABLE public.maga_precios IS
  'Serie mensual de precios mayoristas del MAGA desde 1998. Datos públicos; los escribe solo la Edge Function maga-sync.';
