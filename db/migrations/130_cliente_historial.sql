-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 130
-- Historial de los datos del cliente, SIN acumular repetidos.
--
-- EL PROBLEMA: cuando alguien renueva el DPI o se cambia de casa, los datos
-- viejos se pisan y desaparecen. Y eso importa: una declaración jurada firmada
-- el año pasado dice el DPI y la dirección de ENTONCES. Si DIGECAM o la IVE
-- preguntan por qué el expediente no cuadra con el documento, hay que poder
-- mostrar qué decía la ficha ese día.
--
-- EL OTRO PROBLEMA, que es el que pidió Henry corregir: guardar una versión
-- en cada "Guardar" llenaría la tabla de filas idénticas. Alguien que abre el
-- cliente, corrige una coma en las notas y guarda tres veces no cambió nada
-- que importe. Por eso:
--
--   · El trigger sólo guarda si CAMBIÓ ALGUNO DE LOS CAMPOS VIGILADOS. Las
--     notas, el teléfono o el saldo de puntos no disparan una versión.
--   · Y compara contra la ÚLTIMA versión guardada, no sólo contra la fila
--     anterior: si alguien cambia la dirección y la devuelve al valor viejo,
--     no se guarda una tercera copia de lo mismo.
--
-- Se archiva el valor ANTERIOR (OLD), no el nuevo: el nuevo ya está en la
-- ficha. El historial responde "qué decía antes", que es la pregunta real.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.cliente_historial (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  datos       jsonb not null,          -- los valores ANTERIORES
  motivo      text,                    -- qué cambió, en castellano
  cambiado_por uuid references public.usuarios(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_cli_hist_tenant  on public.cliente_historial(tenant_id);
create index if not exists idx_cli_hist_cliente on public.cliente_historial(cliente_id, created_at desc);
create index if not exists idx_cli_hist_usuario on public.cliente_historial(cambiado_por);

comment on table public.cliente_historial is
  'Versiones anteriores de los datos de identificación del cliente. Sólo se guarda cuando cambia algo vigilado y sólo si difiere de la última versión: no acumula repetidos.';
comment on column public.cliente_historial.datos is
  'Los valores ANTERIORES (OLD). El nuevo ya vive en la ficha; el historial responde qué decía antes.';

grant select, insert, delete on public.cliente_historial to authenticated;

alter table public.cliente_historial enable row level security;

drop policy if exists cliente_historial_tenant on public.cliente_historial;
create policy cliente_historial_tenant on public.cliente_historial
  for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());

-- ── El guardián ─────────────────────────────────────────────────────────
create or replace function public.fn_cliente_historial()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ant  jsonb;
  v_nue  jsonb;
  v_ult  jsonb;
  v_cambios text[] := '{}';
  v_etiquetas constant jsonb := jsonb_build_object(
    'dpi', 'DPI', 'nombre', 'nombre', 'nit', 'NIT',
    'fecha_nacimiento', 'fecha de nacimiento', 'estado_civil', 'estado civil',
    'profesion', 'profesión', 'nacionalidad', 'nacionalidad', 'sexo', 'sexo',
    'direccion', 'dirección', 'vivienda', 'tipo de vivienda',
    'nacimiento_departamento', 'departamento de nacimiento',
    'nacimiento_municipio', 'municipio de nacimiento',
    'vecindad_departamento', 'departamento de vecindad',
    'vecindad_municipio', 'municipio de vecindad',
    'codigo_postal', 'código postal',
    'dpi_fecha_emision', 'emisión del DPI',
    'dpi_fecha_vencimiento', 'vencimiento del DPI',
    'dpi_numero_serie', 'serie del DPI', 'dpi_version', 'versión del DPI',
    'licencia_tipo', 'tipo de licencia', 'licencia_num', 'número de licencia',
    'licencia_vencimiento', 'vencimiento de la licencia',
    'armas_registradas', 'armas registradas');
  k text;
begin
  -- Sólo los campos de IDENTIFICACIÓN. El teléfono, las notas o el saldo de
  -- puntos cambian a diario y no son lo que respalda una declaración jurada.
  v_ant := jsonb_strip_nulls(to_jsonb(OLD) - array(
    select jsonb_object_keys(to_jsonb(OLD))
    except select jsonb_object_keys(v_etiquetas)));
  v_nue := jsonb_strip_nulls(to_jsonb(NEW) - array(
    select jsonb_object_keys(to_jsonb(NEW))
    except select jsonb_object_keys(v_etiquetas)));

  if v_ant = v_nue then
    return NEW;                       -- nada vigilado cambió
  end if;

  -- ¿Ya está guardada exactamente esta versión anterior? Pasa cuando alguien
  -- cambia un dato y lo devuelve al valor viejo: no hace falta una copia más.
  select datos into v_ult
    from public.cliente_historial
   where cliente_id = NEW.id
   order by created_at desc
   limit 1;

  if v_ult is not null and v_ult = v_ant then
    return NEW;
  end if;

  -- Qué cambió, para que el historial se lea sin comparar JSON a ojo.
  for k in select jsonb_object_keys(v_etiquetas) loop
    if coalesce(v_ant ->> k, '') is distinct from coalesce(v_nue ->> k, '') then
      v_cambios := v_cambios || (v_etiquetas ->> k);
    end if;
  end loop;

  insert into public.cliente_historial (tenant_id, cliente_id, datos, motivo, cambiado_por)
  values (NEW.tenant_id, NEW.id, v_ant,
          'Cambió: ' || array_to_string(v_cambios, ', '),
          auth.uid());

  return NEW;
end $$;

drop trigger if exists trg_cliente_historial on public.clientes;
create trigger trg_cliente_historial
  before update on public.clientes
  for each row execute function public.fn_cliente_historial();
