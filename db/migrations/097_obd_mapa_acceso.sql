-- 097_obd_mapa_acceso.sql
-- El MAPA DE ACCESO del vehículo: por dónde se le entra.
--
-- Al Nissan Rogue 2017 se le entró barriendo las direcciones 0x700-0x7EF con
-- Tester Present y preguntándole a cada módulo por UDS. Funcionó, pero ese
-- barrido se repite a ciegas en cada escaneo — ~240 direcciones, medio minuto —
-- y lo aprendido se tira apenas termina.
--
-- Guardar el mapa convierte ese barrido en conocimiento del taller:
--
--   · el próximo escaneo del mismo modelo pregunta primero a las direcciones
--     que ya se sabe que contestan, y muestra resultados en segundos;
--   · si un módulo que SIEMPRE contestó en ese modelo hoy no contesta, eso ya
--     no pasa desapercibido: es un módulo muerto, desconectado o sin
--     alimentación, y se avisa en vez de darlo por ausente;
--   · el taller termina con un mapa propio de qué vehículos puede escanear y
--     hasta dónde — que es lo que hoy no existe en ningún lado.
--
--   mapa_acceso { bits, baud, via, protocolo,
--                 modulos:[{req, resp, nombre, servicio, sesion, nuevo}] }
--
--   req/resp  ids CAN de ida y vuelta (la relación no es fija entre marcas)
--   servicio  el que de verdad entregó los códigos ('19 02', '19 02 ext'…)
--   nuevo     no estaba en el mapa conocido del modelo

alter table public.diagnosticos_obd
  add column if not exists mapa_acceso jsonb;

comment on column public.diagnosticos_obd.mapa_acceso is
  'Por donde se le entra al vehiculo: {bits,baud,via,modulos:[{req,resp,nombre,servicio}]}. Se reusa en el proximo escaneo del mismo modelo';
