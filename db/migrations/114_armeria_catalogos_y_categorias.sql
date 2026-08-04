-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 114
-- Armería: catálogos editables (marca/modelo/calibre/país), categorías que
-- la ley sí distingue, y verificación de domicilio del cliente.
--
-- 1) CATEGORÍAS NUEVAS — la mig 109 sólo contemplaba armas de fuego,
--    munición y accesorios. La Ley de Armas clasifica más cosas (art. 4) y
--    varias NO llevan licencia, así que meterlas como "arma" obligaría a
--    pedir papeles que la ley no exige:
--      · art. 12 + 68 — armas de acción por gases comprimidos (balines,
--        CO2) hasta 5.5mm / .22": tenencia SIN registro y traslado SIN
--        licencia. Es lo que Henry llamó "no son armas ofensivas".
--      · art. 11 — armas de fuego deportivas (competencia y cacería).
--      · art. 13 — armas blancas: la navaja de bolsillo de hoja ≤10cm es de
--        uso personal, pero la navaja AUTOMÁTICA de cualquier longitud es de
--        uso bélico y está prohibida a particulares (art. 13 c). La app lo
--        advierte al vender.
--
-- 2) CATÁLOGO EDITABLE — marca, modelo, calibre y país eran texto libre, así
--    que cada quien escribía "Glock", "GLOCK" y "glock". Ahora salen de un
--    catálogo por comercio que CRECE solo: si el usuario escribe uno que no
--    está, se agrega y queda disponible la próxima vez. Se siembra con lo
--    más común del mercado guatemalteco.
--
-- 3) DOMICILIO DEL CLIENTE — para vender un arma hay que saber dónde vive el
--    comprador (art. 59: el arma se traslada del local a "su residencia o
--    lugar de trabajo"; art. 60: la factura de munición lleva su dirección).
--    Se agrega si la vivienda es propia o rentada, que es dato de la
--    verificación de domicilio, y el recibo de servicios se sube como
--    documento del cliente (bucket 'documentos', mig 111).
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Categorías que la ley distingue ────────────────────────────
alter table public.armeria_operaciones drop constraint if exists armeria_operaciones_categoria_check;
alter table public.armeria_operaciones add constraint armeria_operaciones_categoria_check
  check (categoria = any (array[
    'pistola','revólver','rifle','escopeta',      -- armas de fuego (arts. 8-9)
    'deportiva',                                   -- art. 11
    'gas_comprimido',                              -- arts. 12 y 68 — sin licencia hasta 5.5mm
    'arma_blanca',                                 -- art. 13
    'munición','accesorio','no aplica'
  ]));

-- El número de serie sigue siendo obligatorio SOLO en armas de fuego. Una
-- pistola de balines o una navaja no llevan serie registrable ante DIGECAM.
alter table public.armeria_operaciones drop constraint if exists armeria_serie_si_es_arma;
alter table public.armeria_operaciones add constraint armeria_serie_si_es_arma check (
  categoria not in ('pistola','revólver','rifle','escopeta','deportiva')
  or coalesce(numero_serie, '') <> ''
);

-- Licencia + DPI sólo donde la ley los pide: armas de fuego (art. 59) y
-- munición (art. 60). Gas comprimido ≤5.5mm (art. 68), armas blancas y
-- accesorios NO requieren licencia — exigirla era un bug legal.
alter table public.armeria_operaciones drop constraint if exists armeria_licencia_si_venta_arma_o_municion;
alter table public.armeria_operaciones add constraint armeria_licencia_si_venta_arma_o_municion check (
  tipo <> 'venta'
  or categoria not in ('pistola','revólver','rifle','escopeta','deportiva','munición')
  or (coalesce(contraparte_licencia_num, '') <> '' and coalesce(contraparte_dpi, '') <> '')
);

-- ── 2) Catálogo editable por comercio ─────────────────────────────
create table if not exists public.armeria_catalogo (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  tipo       text not null check (tipo = any (array['marca','modelo','calibre','pais'])),
  valor      text not null check (length(trim(valor)) > 0),
  created_at timestamptz default now(),
  unique (tenant_id, tipo, valor)
);
create index if not exists idx_armeria_catalogo on public.armeria_catalogo(tenant_id, tipo);

alter table public.armeria_catalogo enable row level security;
drop policy if exists tenant_isolation on public.armeria_catalogo;
create policy tenant_isolation on public.armeria_catalogo
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
-- select/insert/update/delete solamente: TRUNCATE no pasa por RLS.
grant select, insert, update, delete on public.armeria_catalogo to authenticated;
revoke all on public.armeria_catalogo from anon;
drop trigger if exists trg_audit on public.armeria_catalogo;
create trigger trg_audit after insert or update or delete on public.armeria_catalogo
  for each row execute function public.fn_audit();

-- Siembra: se agrega a cada comercio que tenga armería activa. Son los
-- valores de arranque, no una lista cerrada — el usuario agrega los suyos.
do $$
declare
  t record;
  v text;
  marcas text[] := array[
    'Glock','Smith & Wesson','Beretta','Sig Sauer','Taurus','CZ','Colt','Ruger',
    'Springfield Armory','Heckler & Koch','Walther','Bersa','Canik','FN Herstal',
    'Remington','Mossberg','Winchester','Savage Arms','Marlin','Benelli',
    'Browning','Kel-Tec','Rossi','Zastava','Norinco','Gamo','Crosman','Umarex',
    'Hatsan','Benjamin','Victorinox','Gerber','Leatherman','Ka-Bar','Otro'
  ];
  calibres text[] := array[
    '9mm','.380 ACP','.40 S&W','.45 ACP','.38 Special','.357 Magnum','.22 LR',
    '.44 Magnum','10mm','5.56x45mm','.223 Rem','7.62x39mm','.308 Win','30-06',
    '.300 Blackout','12 gauge','16 gauge','20 gauge','.410 bore','4.5mm (.177)',
    '5.5mm (.22)','6.35mm (.25)','No aplica'
  ];
  paises text[] := array[
    'Estados Unidos','Austria','Alemania','Italia','Brasil','República Checa',
    'Bélgica','Turquía','Croacia','Serbia','España','Rusia','China','Argentina',
    'Israel','Suiza','Japón','Filipinas','México','Otro'
  ];
begin
  for t in select id from public.tenants where modulos_activos::jsonb ? 'armeria'
  loop
    foreach v in array marcas loop
      insert into public.armeria_catalogo (tenant_id, tipo, valor) values (t.id, 'marca', v)
      on conflict (tenant_id, tipo, valor) do nothing;
    end loop;
    foreach v in array calibres loop
      insert into public.armeria_catalogo (tenant_id, tipo, valor) values (t.id, 'calibre', v)
      on conflict (tenant_id, tipo, valor) do nothing;
    end loop;
    foreach v in array paises loop
      insert into public.armeria_catalogo (tenant_id, tipo, valor) values (t.id, 'pais', v)
      on conflict (tenant_id, tipo, valor) do nothing;
    end loop;
  end loop;
end $$;

-- ── 3) Verificación de domicilio del cliente ──────────────────────
alter table public.clientes add column if not exists vivienda text;
alter table public.clientes drop constraint if exists clientes_vivienda_check;
alter table public.clientes add constraint clientes_vivienda_check
  check (vivienda is null or vivienda = any (array['propia','rentada','familiar']));
