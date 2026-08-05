-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 116
-- Armería: catálogos de color y acabado, para describir el arma como
-- realmente se describe en el mostrador.
--
-- Henry pidió poder registrar el color y características como "de polímero,
-- cromada, policromada". Al agregarlo aparecieron DOS DATOS QUE LA LEY
-- NOMBRA EXPRESAMENTE y que no estaban en ningún lado:
--
--   · "largo del cañón o cañones"  — art. 63 (lo lleva la tarjeta de
--     tenencia que extiende DIGECAM) y art. 72 a) 2 (lo pide la solicitud
--     de licencia de portación).
--   · "conversiones de calibres que tuviere" — mismos dos artículos.
--
-- Son datos que el comprador necesita para tramitar su licencia y que el
-- vendedor debería tener a mano. Se agregan como atributos del artículo en
-- el inventario (ahí es donde el arma se describe una sola vez), no como
-- columnas de la operación: la operación los toma de la ficha.
--
-- El color y el acabado van a `armeria_catalogo` como los demás, para que
-- crezcan solos y no queden "Negro", "negro" y "NEGRO".
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.armeria_catalogo drop constraint if exists armeria_catalogo_tipo_check;
alter table public.armeria_catalogo add constraint armeria_catalogo_tipo_check
  check (tipo = any (array['marca','modelo','calibre','pais','color','acabado']));

do $$
declare
  t record;
  v text;
  colores text[] := array[
    'Negro','Gris','Grafito','Plateado','Cromado','Niquelado','Bicolor (two-tone)',
    'FDE (Flat Dark Earth)','Coyote','Verde OD','Verde oliva','Café','Tan',
    'Azul','Rojo','Rosado','Camuflaje','Blanco','Bronce','Titanio'
  ];
  acabados text[] := array[
    'Pavonado (blued)','Cromado','Niquelado','Acero inoxidable satinado',
    'Acero inoxidable pulido','Cerakote','Parkerizado','Anodizado','Duracoat',
    'Melonite / Tenifer','Policromado','Camuflaje hidrográfico','Mate','Brillante'
  ];
begin
  for t in select id from public.tenants where modulos_activos::jsonb ? 'armeria'
  loop
    foreach v in array colores loop
      insert into public.armeria_catalogo (tenant_id, tipo, valor) values (t.id, 'color', v)
      on conflict do nothing;
    end loop;
    foreach v in array acabados loop
      insert into public.armeria_catalogo (tenant_id, tipo, valor) values (t.id, 'acabado', v)
      on conflict do nothing;
    end loop;
  end loop;
end $$;
