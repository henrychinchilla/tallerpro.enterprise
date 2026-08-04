/* Cumplimiento DIGECAM del módulo de armería, en código puro.

   Lo que de verdad puede doler acá: vender un arma sin número de serie o
   sin licencia del comprador no es un typo, es lo que la Ley de Armas y
   Municiones castiga. _validar() espeja los mismos checks que la migración
   109 pone en la base de datos, para que el error se vea claro en el
   formulario y no como un 23514 de Postgres. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Modulos: {} };
ctx.window = ctx;
vm.createContext(ctx);
/* ley-armas.js primero: el módulo saca de ahí los topes legales. */
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'ley-armas.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'modulos', 'especializados', 'armeria.js'), 'utf8'), ctx);
const ARM = ctx.Modulos.armeria;

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

const base = { tipo: 'venta', cliente_id: 'c1', categoria: 'accesorio', cantidad: 1, precio_unit: 50 };

/* ── Serie obligatoria en armas ──────────────────────────────────────── */
ok('una funda (accesorio) no exige número de serie', ARM._validar({ ...base }).ok);
ok('una pistola SIN serie se rechaza', ARM._validar({ ...base, categoria: 'pistola', numero_serie: '', contraparte_licencia_num: 'L1', contraparte_dpi: 'D1' }).ok === false);
ok('una pistola CON serie, licencia y DPI pasa', ARM._validar({ ...base, categoria: 'pistola', numero_serie: 'ABC123', contraparte_licencia_num: 'L1', contraparte_dpi: 'D1' }).ok);
ok('un rifle sin serie da el mensaje de DIGECAM, no uno genérico',
   /serie/i.test(ARM._validar({ ...base, categoria: 'rifle', contraparte_licencia_num: 'L1', contraparte_dpi: 'D1' }).error || ''));

/* ── Licencia y DPI obligatorios al VENDER arma o munición (no accesorios) */
ok('vender munición sin licencia del comprador se rechaza',
   ARM._validar({ ...base, categoria: 'munición', contraparte_licencia_num: '', contraparte_dpi: 'D1' }).ok === false);
ok('vender munición con licencia pero SIN DPI se rechaza',
   ARM._validar({ ...base, categoria: 'munición', contraparte_licencia_num: 'TEN-1', contraparte_dpi: '' }).ok === false);
/* Munición necesita además NIT y dirección (art. 60) — ver el bloque de
   abajo dedicado a eso; acá sólo se comprueba el caso completo. */
ok('vender munición CON licencia, DPI, NIT y dirección pasa',
   ARM._validar({ ...base, categoria: 'munición', contraparte_licencia_num: 'TEN-1', contraparte_dpi: 'D1',
                  contraparte_nit: '123456-7', contraparte_direccion: 'Zona 1' }).ok);
ok('vender un accesorio NO exige licencia ni DPI (la ley no los pide)',
   ARM._validar({ ...base, categoria: 'accesorio', contraparte_licencia_num: '', contraparte_dpi: '' }).ok);
ok('COMPRAR (no vender) munición a un proveedor no exige licencia ni DPI',
   ARM._validar({ tipo: 'compra', proveedor_id: 'p1', categoria: 'munición', cantidad: 1, precio_unit: 10 }).ok);

/* ── Tope legal de munición por mes (art. 60, texto literal de la ley) ───
   "hasta doscientas cincuenta (250) unidades de munición POR CADA UNA de las
   armas debidamente registradas en su licencia de portación o doscientas
   (200) unidades con su registro de tenencia". El "por cada arma" es lo que
   la versión anterior tenía mal: trataba 250 como un tope plano. */
ok('tenencia: 200 cartuchos al mes', ARM._limiteMunicionMes('tenencia') === 200);
ok('portación con 1 arma: 250', ARM._limiteMunicionMes('portación', 1) === 250);
ok('portación con 2 armas: 500 (250 por cada una)', ARM._limiteMunicionMes('portación', 2) === 500);
ok('portación con 3 armas: 750', ARM._limiteMunicionMes('portación', 3) === 750);
ok('el art. 72 topa la licencia en 3 armas: pedir 9 no da 2250',
   ARM._limiteMunicionMes('portación', 9) === 750);
ok('tenencia NO se multiplica por armas (la ley sólo lo dice de portación)',
   ARM._limiteMunicionMes('tenencia', 3) === 200);
ok('sin licencia reconocida, tope 0 (no debería llegar aquí sin licencia)', ARM._limiteMunicionMes('') === 0);

/* ── Art. 60: la factura de munición necesita NIT y dirección ──────────── */
{
  const baseMun = { ...base, categoria: 'munición', contraparte_licencia_num: 'TEN-1', contraparte_dpi: 'D1' };
  ok('vender munición sin NIT ni dirección se rechaza', ARM._validar(baseMun).ok === false);
  ok('el mensaje cita el artículo 60', /art\.?\s*60/i.test(ARM._validar(baseMun).error || ''));
  ok('con NIT y dirección sí pasa',
     ARM._validar({ ...baseMun, contraparte_nit: '123456-7', contraparte_direccion: 'Zona 1' }).ok);
  ok('un arma NO exige NIT/dirección (el art. 60 es de munición)',
     ARM._validar({ ...base, categoria: 'pistola', numero_serie: 'X1', contraparte_licencia_num: 'L1', contraparte_dpi: 'D1' }).ok);
}

/* ── Contraparte según tipo ──────────────────────────────────────────── */
ok('una venta sin cliente se rechaza', ARM._validar({ ...base, cliente_id: '' }).ok === false);
ok('una compra sin cliente NI proveedor se rechaza',
   ARM._validar({ tipo: 'compra', categoria: 'accesorio', cantidad: 1, precio_unit: 10 }).ok === false);
ok('una compra a un proveedor (sin cliente) es válida',
   ARM._validar({ tipo: 'compra', proveedor_id: 'p1', categoria: 'accesorio', cantidad: 1, precio_unit: 10 }).ok);

/* ── Cantidades ──────────────────────────────────────────────────────── */
ok('cantidad cero se rechaza', ARM._validar({ ...base, cantidad: 0 }).ok === false);
ok('precio negativo se rechaza', ARM._validar({ ...base, precio_unit: -1 }).ok === false);

/* ── Clasificación de qué es "arma de fuego" ─────────────────────────── */
ok('pistola, revólver, rifle, escopeta y deportiva son armas de fuego',
   ['pistola', 'revólver', 'rifle', 'escopeta', 'deportiva'].every(c => ARM._esArma(c)));
ok('munición y accesorio NO son armas', !ARM._esArma('munición') && !ARM._esArma('accesorio'));
ok('el gas comprimido NO es arma de fuego (no lleva serie registrable)', !ARM._esArma('gas_comprimido'));
ok('una navaja tampoco', !ARM._esArma('arma_blanca'));

/* ── Lo que la ley EXIME de licencia ─────────────────────────────────────
   Art. 68: el gas comprimido hasta 5.5mm tiene "tenencia sin registro y
   traslado sin licencia". Art. 13: la navaja de uso personal tampoco lleva
   licencia. Pedirles papeles sería inventar un requisito legal — que es
   justo lo que hacía la versión anterior al tratar todo lo que no fuera
   accesorio como si necesitara licencia. */
{
  const sinPapeles = { tipo: 'venta', cliente_id: 'c1', cantidad: 1, precio_unit: 500,
                       contraparte_licencia_num: '', contraparte_dpi: '' };
  ok('vender balines/gas comprimido NO exige licencia ni DPI (art. 68)',
     ARM._validar({ ...sinPapeles, categoria: 'gas_comprimido' }).ok);
  ok('vender una navaja NO exige licencia ni DPI (art. 13)',
     ARM._validar({ ...sinPapeles, categoria: 'arma_blanca' }).ok);
  ok('un accesorio tampoco', ARM._validar({ ...sinPapeles, categoria: 'accesorio' }).ok);
  ok('gas comprimido tampoco exige número de serie',
     ARM._validar({ ...sinPapeles, categoria: 'gas_comprimido', numero_serie: '' }).ok);

  /* Pero el arma deportiva SÍ es arma de fuego (art. 11): serie + licencia. */
  ok('un arma deportiva SÍ exige licencia y DPI (es arma de fuego, art. 11)',
     ARM._validar({ ...sinPapeles, categoria: 'deportiva', numero_serie: 'S1' }).ok === false);
  ok('un arma deportiva SÍ exige número de serie',
     ARM._validar({ ...sinPapeles, categoria: 'deportiva', contraparte_licencia_num: 'L1',
                    contraparte_dpi: 'D1', numero_serie: '' }).ok === false);
  ok('deportiva completa pasa',
     ARM._validar({ ...sinPapeles, categoria: 'deportiva', numero_serie: 'S1',
                    contraparte_licencia_num: 'L1', contraparte_dpi: 'D1' }).ok);
}

/* ── Avisos legales por categoría ───────────────────────────────────────── */
{
  ok('el gas comprimido avisa que está exento por el art. 68',
     /art\.?\s*68/i.test(ARM._avisoCategoria('gas_comprimido')));
  ok('el aviso del gas menciona el límite de 5.5mm',
     /5\.5\s*mm/i.test(ARM._avisoCategoria('gas_comprimido')));
  ok('la navaja advierte que las automáticas están prohibidas',
     /autom[áa]tica/i.test(ARM._avisoCategoria('arma_blanca')));
  ok('la navaja menciona el límite de 10cm de hoja',
     /10\s*cm/i.test(ARM._avisoCategoria('arma_blanca')));
  ok('un accesorio no genera aviso', ARM._avisoCategoria('accesorio') === '');
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
