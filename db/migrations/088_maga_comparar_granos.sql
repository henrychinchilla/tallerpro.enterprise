-- ═══════════════════════════════════════════════════════
-- 088 — Cruce de las compras/ventas del comercio contra el precio MAGA (fase 3)
--
--   La referencia sola dice "el mercado estaba a Q X". Cruzada con lo que el
--   comercio realmente pagó o cobró, dice algo más útil: "compraste 12% arriba
--   del mercado ese mes". Eso es lo que convierte el dato en margen.
--
--   Mapeo por comercio y no global: venta_granos usa tipos genéricos (maiz,
--   frijol, sorgo…) y el MAGA publica variedades (Maíz blanco/amarillo, de
--   primera/segunda, Frijol negro/rojo/blanco). Cuál es "el" precio de
--   referencia depende de qué comercia cada quien, así que lo elige el usuario.
--
--   Cobertura verificada sobre el catálogo cargado: maíz, frijol, sorgo y
--   cebada tienen serie; TRIGO no lo publica el MAGA, y eso hay que decirlo en
--   pantalla en vez de dejar la comparación en blanco sin explicación.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.maga_mapeo_grano (
  tenant_id   uuid   NOT NULL,
  tipo_grano  text   NOT NULL,
  producto_id bigint NOT NULL REFERENCES public.maga_productos(id) ON DELETE CASCADE,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tipo_grano)
);

ALTER TABLE public.maga_mapeo_grano ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.maga_mapeo_grano;
CREATE POLICY tenant_isolation ON public.maga_mapeo_grano FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

REVOKE ALL ON TABLE public.maga_mapeo_grano FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.maga_mapeo_grano TO authenticated;
GRANT ALL ON TABLE public.maga_mapeo_grano TO service_role;

-- ── Comparación transacción por transacción ──
-- SECURITY INVOKER a propósito: así el RLS de venta_granos sigue mandando y
-- cada comercio solo ve lo suyo.
CREATE OR REPLACE FUNCTION public.maga_comparar_granos(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  num           text,
  fecha         date,
  es_compra     boolean,
  tipo_grano    text,
  cantidad_kg   numeric,
  precio_kg     numeric,
  total         numeric,
  referencia    text,
  fecha_ref     date,
  precio_ref_kg numeric,
  dif_pct       numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT v.id, v.num, v.fecha, v.es_compra, v.tipo_grano,
         v.cantidad_kg, v.precio_kg, v.total,
         p.nombre,
         r.fecha,
         round(r.precio_kg, 4),
         CASE WHEN r.precio_kg > 0 AND v.precio_kg > 0
              THEN round((v.precio_kg / r.precio_kg - 1) * 100, 1) END
  FROM public.venta_granos v
  LEFT JOIN public.maga_mapeo_grano g
         ON g.tenant_id = v.tenant_id AND g.tipo_grano = v.tipo_grano
  LEFT JOIN public.maga_productos p ON p.id = g.producto_id
  -- El MAGA publica con un mes de retraso, así que se toma el último mes
  -- disponible que no sea posterior a la transacción; si se usara solo el mes
  -- exacto, todo lo reciente saldría sin referencia.
  LEFT JOIN LATERAL (
    SELECT mp.fecha, avg(mp.precio_kg) AS precio_kg
    FROM public.maga_precios mp
    WHERE mp.producto_id = g.producto_id
      AND mp.precio_kg IS NOT NULL
      AND mp.fecha <= date_trunc('month', v.fecha)::date
    GROUP BY mp.fecha
    ORDER BY mp.fecha DESC
    LIMIT 1
  ) r ON true
  WHERE (p_desde IS NULL OR v.fecha >= p_desde)
    AND (p_hasta IS NULL OR v.fecha <= p_hasta)
  ORDER BY v.fecha DESC, v.num;
$$;

REVOKE ALL ON FUNCTION public.maga_comparar_granos(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.maga_comparar_granos(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.maga_comparar_granos(date, date) IS
  'Compara cada compra/venta de granos contra el precio mayorista MAGA del mes (o del último mes publicado antes de la transacción). dif_pct > 0 = por encima del mercado.';
