-- ═══════════════════════════════════════════════════════
-- 089 — Seguimiento de productos y alertas de ventana (fase 4)
--
--   Las fases 2 y 3 solo sirven si alguien abre la pantalla. La ventana de
--   compra dura semanas y se pasa: la alerta es lo que convierte el análisis en
--   una decisión a tiempo. El comercio marca los productos que le interesan y
--   una vez al mes recibe el aviso de cuáles entraron en su piso o en su pico.
--
--   La lista de seguimiento es por comercio (RLS); el cálculo de qué está en
--   ventana usa maga_estacionalidad, igual que la pantalla, para que el correo
--   y la app nunca digan cosas distintas.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.maga_seguimiento (
  tenant_id   uuid   NOT NULL,
  producto_id bigint NOT NULL REFERENCES public.maga_productos(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, producto_id)
);

ALTER TABLE public.maga_seguimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.maga_seguimiento;
CREATE POLICY tenant_isolation ON public.maga_seguimiento FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

REVOKE ALL ON TABLE public.maga_seguimiento FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.maga_seguimiento TO authenticated;
GRANT ALL ON TABLE public.maga_seguimiento TO service_role;

CREATE INDEX IF NOT EXISTS maga_seguimiento_tenant_idx ON public.maga_seguimiento (tenant_id);

-- ── Qué productos seguidos están en ventana este mes ──
-- SECURITY DEFINER porque la corre el enviador de alertas con service_role y
-- necesita recorrer todos los comercios; devuelve tenant_id para que el que
-- llama arme un correo por comercio. La app la usa filtrando por su tenant.
CREATE OR REPLACE FUNCTION public.maga_alertas_ventana(p_mes integer DEFAULT NULL, p_anios integer DEFAULT 5)
RETURNS TABLE (
  tenant_id   uuid,
  tenant_name text,
  email       text,
  producto_id bigint,
  producto    text,
  medida      text,
  tipo        text,      -- 'compra' (está en su piso) | 'venta' (en su pico)
  indice_mes  numeric,
  brecha      numeric,
  dispersion  numeric,
  meses_baratos smallint[],
  meses_caros   smallint[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mes AS (SELECT coalesce(p_mes, EXTRACT(MONTH FROM current_date)::int) AS m),
  e AS (SELECT * FROM public.maga_estacionalidad(p_anios)),
  resumen AS (
    SELECT e.producto_id,
           round((max(e.indice) / nullif(min(e.indice), 0) - 1) * 100, 1) AS brecha,
           round(avg(e.dispersion), 1) AS dispersion,
           count(*) AS n_meses,
           (array_agg(e.mes ORDER BY e.indice))[1:3]      AS baratos,
           (array_agg(e.mes ORDER BY e.indice DESC))[1:3] AS caros
    FROM e GROUP BY e.producto_id
  )
  SELECT s.tenant_id, t.name, t.email, p.id, p.nombre, p.medida,
         CASE WHEN (SELECT m FROM mes) = ANY(r.baratos) THEN 'compra' ELSE 'venta' END,
         (SELECT ee.indice FROM e ee WHERE ee.producto_id = p.id AND ee.mes = (SELECT m FROM mes)),
         r.brecha, r.dispersion, r.baratos, r.caros
  FROM public.maga_seguimiento s
  JOIN public.maga_productos p ON p.id = s.producto_id
  JOIN public.tenants t        ON t.id = s.tenant_id
  JOIN resumen r               ON r.producto_id = p.id
  -- mismos umbrales que la pantalla: sin esto el correo avisaría de patrones
  -- que la app declara "sin ventana", y se contradirían
  WHERE r.n_meses >= 6 AND r.brecha >= 20 AND r.dispersion <= 30
    AND ((SELECT m FROM mes) = ANY(r.baratos) OR (SELECT m FROM mes) = ANY(r.caros))
  ORDER BY s.tenant_id, r.brecha DESC;
$$;

REVOKE ALL ON FUNCTION public.maga_alertas_ventana(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.maga_alertas_ventana(integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.maga_alertas_ventana(integer, integer) IS
  'Productos seguidos que este mes estan en su piso (compra) o en su pico (venta), con los mismos umbrales que usa la pantalla.';
