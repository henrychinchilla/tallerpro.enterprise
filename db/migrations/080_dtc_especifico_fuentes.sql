-- 080 — Catálogo extensible de DTC específicos por vehículo/equipo.
-- Solo contiene referencias con derechos de uso verificados; no se importan
-- manuales OEM ni contenido comercial sin licencia explícita.

CREATE TABLE IF NOT EXISTS public.dtc_catalogo_especifico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL CHECK (protocolo IN ('obd2', 'j1939')),
  codigo text NOT NULL,
  spn integer,
  fmi smallint CHECK (fmi BETWEEN 0 AND 31),
  marca text,
  modelo text,
  anio_desde smallint CHECK (anio_desde BETWEEN 1886 AND 2200),
  anio_hasta smallint CHECK (anio_hasta BETWEEN 1886 AND 2200),
  motor text,
  tipo_equipo text NOT NULL DEFAULT 'vehiculo'
    CHECK (tipo_equipo IN ('vehiculo', 'camion', 'bus', 'agricola', 'construccion', 'industrial')),
  descripcion_es text NOT NULL,
  severidad text NOT NULL DEFAULT 'informativa'
    CHECK (severidad IN ('informativa', 'atencion', 'alta', 'critica')),
  fuente text NOT NULL,
  licencia text NOT NULL,
  referencia_url text,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'verificado', 'retirado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dtc_catalogo_especifico_anio_rango
    CHECK (anio_hasta IS NULL OR anio_desde IS NULL OR anio_hasta >= anio_desde),
  CONSTRAINT dtc_catalogo_especifico_j1939_campos
    CHECK ((protocolo = 'j1939' AND spn IS NOT NULL AND fmi IS NOT NULL) OR protocolo = 'obd2'),
  CONSTRAINT dtc_catalogo_especifico_codigo_unico
    UNIQUE NULLS NOT DISTINCT (protocolo, codigo, marca, modelo, anio_desde, anio_hasta, motor, tipo_equipo, fuente)
);

CREATE INDEX IF NOT EXISTS dtc_catalogo_especifico_lookup_idx
  ON public.dtc_catalogo_especifico (protocolo, codigo, estado);

ALTER TABLE public.dtc_catalogo_especifico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dtc_catalogo_especifico_lectura ON public.dtc_catalogo_especifico;
CREATE POLICY dtc_catalogo_especifico_lectura
  ON public.dtc_catalogo_especifico FOR SELECT TO authenticated
  USING (estado = 'verificado');

REVOKE ALL ON TABLE public.dtc_catalogo_especifico FROM anon;
GRANT SELECT ON TABLE public.dtc_catalogo_especifico TO authenticated;
GRANT ALL ON TABLE public.dtc_catalogo_especifico TO service_role;
