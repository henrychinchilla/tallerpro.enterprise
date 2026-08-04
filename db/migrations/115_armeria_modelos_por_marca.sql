-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 115
-- Armería: el catálogo de MODELOS, que faltaba, ligado a su marca.
--
-- La mig 114 sembró marca, calibre y país pero NO modelo, así que el campo
-- tenía su <datalist> vacío: se veía como "no tiene dropdown". Se siembra
-- ahora, pero con una diferencia: el modelo se guarda con su marca (`padre`),
-- porque una lista plana que mezcle "Glock 19" con "Remington 870" es ruido —
-- al elegir Glock sólo deben salir modelos Glock.
--
-- La unicidad pasa a (tenant, tipo, valor, padre): dos marcas pueden tener un
-- modelo con el mismo nombre (Winchester y Savage ambos tienen un "Model 70"
-- en el imaginario del vendedor) y bloquear el segundo sería un bug.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.armeria_catalogo add column if not exists padre text;

-- La unique vieja (tenant, tipo, valor) impediría el mismo modelo en dos
-- marcas distintas. Se reemplaza por una que incluya la marca.
alter table public.armeria_catalogo drop constraint if exists armeria_catalogo_tenant_id_tipo_valor_key;
drop index if exists armeria_catalogo_unico;
create unique index if not exists armeria_catalogo_unico
  on public.armeria_catalogo (tenant_id, tipo, valor, coalesce(padre, ''));

create index if not exists idx_armeria_catalogo_padre
  on public.armeria_catalogo(tenant_id, tipo, padre) where padre is not null;

-- ── Siembra de modelos por marca ──────────────────────────────────
-- Modelos reales y conocidos del mercado. Es el punto de arranque, no una
-- lista cerrada: lo que el usuario escriba y no exista se agrega solo.
do $$
declare
  t record;
  par text[];
  pares text[][] := array[
    ['Glock','17'],['Glock','19'],['Glock','19X'],['Glock','20'],['Glock','21'],
    ['Glock','22'],['Glock','23'],['Glock','26'],['Glock','27'],['Glock','30'],
    ['Glock','34'],['Glock','43'],['Glock','43X'],['Glock','45'],['Glock','48'],
    ['Smith & Wesson','M&P9 Shield'],['Smith & Wesson','M&P9 M2.0'],['Smith & Wesson','M&P40'],
    ['Smith & Wesson','Model 686'],['Smith & Wesson','Model 642'],['Smith & Wesson','SD9 VE'],
    ['Smith & Wesson','Governor'],
    ['Beretta','92FS'],['Beretta','92X'],['Beretta','APX'],['Beretta','PX4 Storm'],
    ['Beretta','M9'],['Beretta','1301 Tactical'],
    ['Sig Sauer','P226'],['Sig Sauer','P229'],['Sig Sauer','P320'],['Sig Sauer','P365'],
    ['Sig Sauer','P938'],['Sig Sauer','M17'],['Sig Sauer','M18'],
    ['Taurus','G2C'],['Taurus','G3'],['Taurus','G3C'],['Taurus','PT111'],['Taurus','TH9'],
    ['Taurus','Judge'],['Taurus','856'],['Taurus','605'],
    ['CZ','75 B'],['CZ','75 SP-01'],['CZ','P-07'],['CZ','P-09'],['CZ','P-10 C'],['CZ','Shadow 2'],
    ['Colt','1911 Government'],['Colt','Python'],['Colt','King Cobra'],['Colt','Combat Elite'],
    ['Ruger','LCP'],['Ruger','LC9s'],['Ruger','EC9s'],['Ruger','Security-9'],
    ['Ruger','10/22'],['Ruger','Mini-14'],['Ruger','GP100'],['Ruger','Wrangler'],
    ['Springfield Armory','XD'],['Springfield Armory','XD-M'],['Springfield Armory','Hellcat'],
    ['Springfield Armory','1911 Ronin'],
    ['Heckler & Koch','VP9'],['Heckler & Koch','USP'],['Heckler & Koch','P30'],['Heckler & Koch','P2000'],
    ['Walther','PPQ'],['Walther','PPS'],['Walther','PDP'],['Walther','P22'],['Walther','PPK'],
    ['Bersa','Thunder 380'],['Bersa','TPR9'],['Bersa','BP9CC'],
    ['Canik','TP9SF'],['Canik','TP9 Elite'],['Canik','METE SFT'],
    ['FN Herstal','FNS-9'],['FN Herstal','FNX-45'],['FN Herstal','509'],['FN Herstal','FN 502'],
    ['Remington','870'],['Remington','700'],['Remington','1100'],['Remington','V3'],['Remington','7600'],
    ['Mossberg','500'],['Mossberg','590'],['Mossberg','835'],['Mossberg','Maverick 88'],['Mossberg','Patriot'],
    ['Winchester','SXP'],['Winchester','Model 70'],['Winchester','SX4'],['Winchester','1300'],
    ['Savage Arms','Axis'],['Savage Arms','110'],['Savage Arms','64'],['Savage Arms','Mark II'],
    ['Marlin','336'],['Marlin','1895'],['Marlin','60'],['Marlin','795'],
    ['Benelli','M4'],['Benelli','Nova'],['Benelli','Super Black Eagle'],['Benelli','M2'],
    ['Browning','BAR'],['Browning','A5'],['Browning','Buck Mark'],['Browning','X-Bolt'],
    ['Kel-Tec','PMR-30'],['Kel-Tec','Sub-2000'],['Kel-Tec','KSG'],['Kel-Tec','P-11'],
    ['Rossi','RS22'],['Rossi','Circuit Judge'],['Rossi','R92'],
    ['Zastava','M70'],['Zastava','PAP M92'],['Zastava','ZPAP'],
    ['Norinco','NP-22'],['Norinco','Type 54'],['Norinco','JW-2000'],
    -- Aire / gas comprimido (art. 12): marcas y modelos que sí se venden acá
    ['Gamo','Swarm Magnum'],['Gamo','Big Cat'],['Gamo','Whisper'],['Gamo','Shadow'],['Gamo','Coyote'],
    ['Crosman','1377'],['Crosman','2240'],['Crosman','Vigilante'],['Crosman','Optimus'],['Crosman','Fire'],
    ['Umarex','Glock 17 CO2'],['Umarex','Beretta APX CO2'],['Umarex','Ruger Impact'],['Umarex','Octane'],
    ['Hatsan','Mod 125'],['Hatsan','Striker'],['Hatsan','Flashpup'],['Hatsan','AT44'],
    ['Benjamin','Marauder'],['Benjamin','Trail NP2'],['Benjamin','392'],['Benjamin','Bulldog'],
    -- Armas blancas / herramienta (art. 13 a: uso personal o trabajo)
    ['Victorinox','Swiss Army Classic'],['Victorinox','Huntsman'],['Victorinox','Spartan'],['Victorinox','Rangergrip'],
    ['Gerber','StrongArm'],['Gerber','Paraframe'],['Gerber','Suspension'],['Gerber','Gator'],
    ['Leatherman','Wave+'],['Leatherman','Surge'],['Leatherman','Skeletool'],['Leatherman','Wingman'],
    ['Ka-Bar','USMC Fighting Knife'],['Ka-Bar','Becker BK2'],['Ka-Bar','Dozier']
  ];
begin
  for t in select id from public.tenants where modulos_activos::jsonb ? 'armeria'
  loop
    foreach par slice 1 in array pares loop
      insert into public.armeria_catalogo (tenant_id, tipo, valor, padre)
      values (t.id, 'modelo', par[2], par[1])
      on conflict do nothing;
    end loop;
  end loop;
end $$;
