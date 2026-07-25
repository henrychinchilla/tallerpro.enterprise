-- ═══════════════════════════════════════════════════════
-- 087 — Índice estacional de los precios MAGA (fase 2)
--
--   Devuelve, para cada producto y mes calendario, cuánto vale ese mes respecto
--   del promedio de su propio año (100 = promedio anual). Normalizar por año es
--   obligatorio: son series de hasta 28 años en quetzales nominales y sin eso la
--   inflación se come la señal estacional.
--
--   Medido sobre la serie real: papa 41% de brecha entre pico y valle, sandía
--   38%, mango 180%; el frijol negro apenas 14% — lo almacenable no tiene
--   ventana porque todos pueden esperar. Por eso también se devuelve la
--   dispersión: es la medida honesta de cuánta confianza darle al patrón.
--
--   Se calcula en la base y no en el navegador para poder responder "qué
--   productos entran en ventana este mes" sin bajar 35 mil precios al cliente.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.maga_estacionalidad(p_anios integer DEFAULT 5)
RETURNS TABLE (
  producto_id bigint,
  mes         smallint,
  indice      numeric,   -- 100 = promedio del año
  anios       integer,   -- cuántos años aportaron a ese mes
  dispersion  numeric    -- desviación entre años, en puntos del índice
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH base AS (
    -- un punto por producto/año/mes: si hay varios mercados se promedian, para
    -- que la serie no salte entre plazas con niveles de precio distintos
    SELECT p.producto_id,
           EXTRACT(YEAR  FROM p.fecha)::int AS anio,
           EXTRACT(MONTH FROM p.fecha)::int AS mes,
           avg(p.precio) AS precio
    FROM public.maga_precios p
    WHERE p.fecha >= (current_date - make_interval(years => greatest(p_anios, 1)))
    GROUP BY 1, 2, 3
  ),
  prom_anio AS (
    SELECT producto_id, anio, avg(precio) AS pa FROM base GROUP BY 1, 2
  ),
  idx AS (
    SELECT b.producto_id, b.mes, b.precio / pa.pa AS i
    FROM base b JOIN prom_anio pa USING (producto_id, anio)
    WHERE pa.pa > 0
  ),
  -- productos con muy poca historia dan patrones de ruido: se descartan
  suficientes AS (
    SELECT producto_id FROM base GROUP BY producto_id HAVING count(DISTINCT anio) >= 3
  )
  SELECT i.producto_id,
         i.mes::smallint,
         round(avg(i.i) * 100, 1),
         count(*)::int,
         round(coalesce(stddev_pop(i.i), 0) * 100, 1)
  FROM idx i JOIN suficientes s USING (producto_id)
  GROUP BY i.producto_id, i.mes
  ORDER BY i.producto_id, i.mes;
$$;

REVOKE ALL ON FUNCTION public.maga_estacionalidad(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.maga_estacionalidad(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.maga_estacionalidad(integer) IS
  'Índice estacional por producto y mes (100 = promedio del año). Incluye la dispersión entre años: sin ella, un patrón de ruido se ve igual que uno real.';
