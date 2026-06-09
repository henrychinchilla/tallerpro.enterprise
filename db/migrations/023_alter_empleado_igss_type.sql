-- ── MIGRACIÓN 023: CAMBIAR TIPO DE COLUMNA IGSS A TEXT ──
-- Modificar el tipo de la columna igss de BOOLEAN a TEXT, convirtiendo los antiguos booleanos a NULL para poder escribir el número real de afiliación.
ALTER TABLE public.empleados ALTER COLUMN igss TYPE TEXT USING (
  CASE 
    WHEN igss = true THEN NULL
    WHEN igss = false THEN NULL
    ELSE NULL
  END
);

-- Forzar recarga del caché de PostgREST para que Supabase reconozca el nuevo tipo de la columna de inmediato
NOTIFY pgrst, 'reload schema';
