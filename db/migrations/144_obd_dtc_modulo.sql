-- Catálogo de DTC por módulo, armado por el PROPIO vehículo (2026-09-22).
--
-- Henry pidió «el catálogo de los códigos que soportan los módulos, extraído
-- de manera automática». Existe el servicio para eso: UDS 19 0A
-- (reportSupportedDTC, ISO 14229-1) — el módulo devuelve TODOS los códigos que
-- es capaz de registrar, estén activos o no. La app ya lo preguntaba como
-- último recurso y tiraba la lista. Acá se guarda, por marca/modelo/módulo, y
-- con cada escaneo el mapa del modelo se completa solo.
--
-- Esto NO son fallas del vehículo: son los códigos POSIBLES de ese módulo. Las
-- fallas de cada escaneo siguen en diagnosticos_obd.por_modulo.
--
-- La descripción NO va acá: un B1xxx o C1xxx significa algo distinto en cada
-- fabricante, y el catálogo de descripciones es otro problema (paso 3).

create table if not exists public.obd_dtc_modulo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  marca text not null,
  modelo text not null default '',      -- '' = no se sabía el modelo (no null: la clave única lo necesita)
  req bigint not null,                  -- dirección de solicitud del módulo
  codigo text not null,                 -- 'C1102' (P/C/B/U + 4)
  ftb text not null default '',         -- tipo de falla ISO 14229 ('16'), '' si el módulo no lo usa
  fuente text not null default '19 0A', -- servicio del que salió
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  check (codigo ~ '^[PCBU][0-3][0-9A-F]{3}$'),
  check (ftb ~ '^([0-9A-F]{2})?$'),
  check (req >= 0 and req <= 536870911),
  check (fuente in ('19 0A', '19 02 FF'))
);

-- La clave de idempotencia: el mismo código del mismo módulo del mismo modelo
-- es UNA fila, se escanee cuantas veces sea (se actualiza ultima_vez).
create unique index if not exists obd_dtc_modulo_clave_idx
  on public.obd_dtc_modulo(tenant_id, marca, modelo, req, codigo, ftb);
create index if not exists obd_dtc_modulo_busqueda_idx
  on public.obd_dtc_modulo(tenant_id, marca, modelo, req);

alter table public.obd_dtc_modulo enable row level security;

-- El GRANT va ANTES que la política (sin él, RLS deja la tabla muda).
revoke all on public.obd_dtc_modulo from anon;
grant select, insert, update, delete on public.obd_dtc_modulo to authenticated;

drop policy if exists obd_dtc_modulo_tenant on public.obd_dtc_modulo;
create policy obd_dtc_modulo_tenant on public.obd_dtc_modulo for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());

comment on table public.obd_dtc_modulo is
  'Códigos que cada módulo DECLARA soportar (UDS 19 0A), por marca/modelo. No son fallas: son el catálogo posible del módulo, armado por el propio vehículo en cada escaneo.';
