-- ── MIGRACIÓN 022: FOTO Y ALERGIAS/SALUD EN EMPLEADOS ──
-- Agregar columna foto si no existe
ALTER TABLE public.empleados ADD COLUMN IF NOT EXISTS foto TEXT;

-- Agregar columna alergias_salud si no existe
ALTER TABLE public.empleados ADD COLUMN IF NOT EXISTS alergias_salud TEXT;

-- Forzar recarga del caché de PostgREST para que Supabase reconozca las nuevas columnas de inmediato
NOTIFY pgrst, 'reload schema';
