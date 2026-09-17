-- Módulos declarados a mano por el taller, para CUALQUIER vehículo.
--
-- El barrido automático solo encuentra lo que contesta un Tester Present en
-- 0x700-0x7EF. Eso deja fuera tres casos reales y frecuentes:
--   · el módulo vive fuera de ese rango (29 bits, o direcciones propias);
--   · el módulo está en otra red (MS-CAN, K-line) a la que el barrido no entra;
--   · el módulo contestó una vez y hoy no, y sin declararlo nadie sabe que
--     debería estar ahí — se lo da por inexistente en vez de por ausente.
-- Y aunque conteste, el nombre salía como "Módulo 0x745": el taller sabe que
-- ese es el airbag de ESE modelo, y hasta ahora no tenía dónde escribirlo.
--
-- Esto NO es la capa OEM. Acá no hay nada que transmita: una declaración es un
-- nombre y una dirección a la que preguntar con 3E 00 (Tester Present), que es
-- de solo lectura. Por eso puede escribirla cualquier usuario del taller: es la
-- libreta del mecánico, no una definición ejecutable. Lo que transmite sigue
-- viviendo en obd_oem_definiciones, con su escalera de verificación.

create table if not exists public.obd_modulos_vehiculo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  marca text not null,
  modelo text,                       -- null = toda la marca
  anio_desde int, anio_hasta int,
  nombre text not null,              -- "Airbag / SRS", como lo llama el taller
  sistema text not null default 'otro',
  req bigint not null,               -- dirección de solicitud
  resp bigint,                       -- null: el ELM327 no revela desde dónde contesta
  ext boolean not null default false,-- direccionamiento de 29 bits
  red text not null default 'hs',
  protocolo text not null default 'uds',
  nota text,
  origen text not null default 'manual',
  activo boolean not null default true,
  creado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sistema in ('ecm','tcm','abs','srs','eps','bcm','ipc','hvac','awd','immo',
                     'gateway','adas','tpms','suspension','carga','otro')),
  check (red in ('hs','ms','sw','ch','ls','kline')),
  check (protocolo in ('uds','kwp2000','obd2','j1939','iso9141','fabricante')),
  check (origen in ('manual','escaneo','paquete')),
  -- Una dirección de 11 bits entra en 0x000-0x7FF; una de 29 bits llega a
  -- 0x1FFFFFFF. El rango se valida acá para que una dirección imposible no
  -- llegue nunca al barrido: preguntar por ella es tiempo tirado en cada
  -- escaneo de ese modelo, para siempre.
  check (req >= 0 and req <= 536870911),
  check (resp is null or (resp >= 0 and resp <= 536870911)),
  check (ext or req <= 2047),
  check (anio_desde is null or anio_desde between 1980 and 2200),
  check (anio_hasta is null or anio_hasta between 1980 and 2200),
  check (anio_desde is null or anio_hasta is null or anio_desde <= anio_hasta),
  check (length(btrim(nombre)) > 0 and length(nombre) <= 60)
);

create index if not exists obd_mod_veh_busqueda_idx
  on public.obd_modulos_vehiculo(tenant_id, marca, modelo);
-- Un modelo no puede declarar dos veces la MISMA dirección: serían dos nombres
-- para el mismo módulo y el barrido lo preguntaría dos veces.
create unique index if not exists obd_mod_veh_clave_idx on public.obd_modulos_vehiculo
  (tenant_id, marca, coalesce(modelo,''), req, ext);

alter table public.obd_modulos_vehiculo enable row level security;

-- El GRANT va ANTES que la política: sin él, RLS no alcanza y la tabla queda
-- muda para los usuarios logueados (pasó con 6 tablas el 2026-07-27).
revoke all on public.obd_modulos_vehiculo from anon;
grant select, insert, update, delete on public.obd_modulos_vehiculo to authenticated;

drop policy if exists obd_mod_veh_tenant on public.obd_modulos_vehiculo;
create policy obd_mod_veh_tenant on public.obd_modulos_vehiculo for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());

comment on table public.obd_modulos_vehiculo is
  'Libreta del taller: qué módulos trae un modelo y en qué dirección contestan. Solo se usa para PREGUNTAR (Tester Present, lectura). Lo que transmite vive en obd_oem_definiciones.';
comment on column public.obd_modulos_vehiculo.resp is
  'Puede ser null: por ELM327 el dongle no revela desde qué dirección contesta el módulo. Null significa "no se sabe", no cero.';
