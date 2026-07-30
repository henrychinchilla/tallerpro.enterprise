-- 096_obd_comparacion_visita.sql
-- Comparación del escaneo contra la VISITA ANTERIOR del mismo vehículo.
--
-- La primera pregunta del taller al conectar el escáner no es "qué códigos
-- tiene" sino "¿volvió lo que reparamos la vez pasada?". Eso no lo contesta el
-- escaneo de hoy solo: hace falta el de la visita anterior, que ya está
-- guardado. Se persiste el resultado calculado y no solo el enlace al escaneo
-- previo, para que el reporte impreso siga diciendo lo mismo aunque después se
-- borre aquel registro.
--
--   comparacion  { previo_id, fecha, dias, n,
--                  reincidentes[{codigo,modulo}],   volvieron tras la visita
--                  nuevos[{codigo,modulo}],         aparecieron después
--                  resueltos[{codigo,modulo}],      estaban y ya no
--                  borrados_antes, mil_antes }
--
-- reincidente es el dato caro: decide si la reparación aguantó y si la
-- garantía la paga el taller.

alter table public.diagnosticos_obd
  add column if not exists comparacion jsonb;

comment on column public.diagnosticos_obd.comparacion is
  'Diff contra la visita anterior del mismo vehiculo: {previo_id,fecha,dias,reincidentes,nuevos,resueltos}';

-- La comparación consulta los escaneos de UN vehículo ordenados por fecha. Ya
-- existe un índice por vehiculo_id, pero sin la fecha adentro el orden se
-- resuelve aparte en cada escaneo.
create index if not exists diagnosticos_obd_veh_fecha_idx
  on public.diagnosticos_obd(tenant_id, vehiculo_id, created_at desc);
