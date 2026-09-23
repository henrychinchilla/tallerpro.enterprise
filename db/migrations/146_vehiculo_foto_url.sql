-- 146: Foto de perfil de vehículo (web o subida)
ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS foto_url text;
COMMENT ON COLUMN public.vehiculos.foto_url IS 'URL de la foto de perfil del vehículo (búsqueda web, catálogo o archivo)';
