-- La IA ya puede bautizar un módulo del escaneo, y su origen tiene que poder
-- decirse. Sin esto, TODO nombre puesto por la IA se rechaza con 23514 y el
-- mecánico ve la lista de direcciones igual que antes, sin un solo error a la
-- vista: el catálogo del negocio no se congela en un CHECK (misma lección que
-- las unidades de la migración 136 y los tipos de reset de la 140).
--
-- 'ia' NO es lo mismo que 'manual': un nombre que escribió el taller tenía el
-- vehículo enfrente y gana sobre cualquier búsqueda. Por eso se distinguen —
-- la app no pisa un 'manual' con un 'ia', y al revés sí.

alter table public.obd_modulos_vehiculo
  drop constraint if exists obd_modulos_vehiculo_origen_check;

alter table public.obd_modulos_vehiculo
  add constraint obd_modulos_vehiculo_origen_check
  check (origen in ('manual','escaneo','paquete','ia'));

comment on column public.obd_modulos_vehiculo.origen is
  'manual = lo escribio el taller (gana sobre todo lo demas) · escaneo = tomado de un barrido real · ia = la IA lo identifico por su numero de pieza, con la fuente en `nota` · paquete = vino cargado.';
