-- ═══════════════════════════════════════════════════════
-- 132 — País de nacimiento del cliente (+ el historial que se quedó corto)
--
-- El anverso del DPI guatemalteco trae DOS campos distintos, y sólo se
-- guardaba uno:
--   · NACIONALIDAD  (ej. GTM) — la que ostenta hoy
--   · PAÍS DE NAC.  (ej. GTM) — dónde nació
-- En un guatemalteco de nacimiento coinciden, y por eso pasó desapercibido.
-- NO coinciden en un naturalizado (nacionalidad guatemalteca, nacido en otro
-- país), que es justo el caso donde la declaración jurada del art. 55 a) tiene
-- que decir la verdad. Con un solo campo ese expediente salía mal.
-- Se guarda como el DPI lo imprime (ISO-3, 'GTM'); la app lo traduce al
-- mostrarlo, igual que ya hace con la nacionalidad.
--
-- De paso se reparan tres campos que el historial dejó de vigilar: la
-- migración 131 agregó registro_libro/folio/pagina a la tabla pero NO los
-- añadió a la lista del trigger, así que cambiarlos no dejaba versión. El
-- asiento del registro civil es dato de identificación: si se corrige, hay que
-- poder mostrar qué decía cuando se firmó una declaración anterior.
-- ═══════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists pais_nacimiento text;

comment on column public.clientes.pais_nacimiento is
  'Campo PAÍS DE NAC. del anverso del DPI, como código ISO-3 (GTM). Distinto de nacionalidad: difieren en personas naturalizadas.';

-- Misma función de la migración 130, con cuatro etiquetas más. Se reescribe
-- entera (create or replace) porque la lista de campos vigilados y el
-- diccionario de etiquetas son el MISMO objeto: no se puede extender por fuera.
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
    'profesion', 'profesión', 'nacionalidad', 'nacionalidad',
    'pais_nacimiento', 'país de nacimiento', 'sexo', 'sexo',
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
    'armas_registradas', 'armas registradas',
    'registro_libro', 'libro del registro civil',
    'registro_folio', 'folio del registro civil',
    'registro_pagina', 'página del registro civil');
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
