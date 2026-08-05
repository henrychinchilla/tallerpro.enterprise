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

/* ── Modelos filtrados por marca ─────────────────────────────────────────
   El catálogo de modelos faltaba por completo en la mig 114: el <datalist>
   quedaba vacío y se veía como "el modelo no tiene dropdown". Además una
   lista plana no sirve — al elegir Glock no deben salir modelos Remington. */
{
  ARM._catalogo = {
    marca: ['Glock', 'Remington'],
    modelo: ['17', '19', '870', '700'],
    modeloPorMarca: { Glock: ['17', '19'], Remington: ['870', '700'] },
    calibre: ['9mm'], pais: ['Austria'],
  };
  ok('con Glock elegido, sólo salen modelos Glock',
     JSON.stringify(ARM._opcionesModelo('Glock')) === JSON.stringify(['17', '19']));
  ok('con Remington, sólo los suyos',
     JSON.stringify(ARM._opcionesModelo('Remington')) === JSON.stringify(['870', '700']));
  ok('sin marca elegida se ofrecen todos (mejor que un dropdown vacío)',
     ARM._opcionesModelo('').length === 4);
  ok('una marca nueva no deja el dropdown vacío: cae a la lista completa',
     ARM._opcionesModelo('MarcaQueNoExiste').length === 4);
  ok('espacios alrededor de la marca no rompen el filtro',
     JSON.stringify(ARM._opcionesModelo('  Glock  ')) === JSON.stringify(['17', '19']));
  ARM._catalogo = null;
}

/* ── Ficha del arma que se está vendiendo ────────────────────────────────
   Dos pistolas de la misma marca se distinguen sólo por el número de serie.
   Ver la foto y las características antes de entregar evita el error más
   caro que puede cometer una armería: entregar el arma equivocada. */
{
  ctx.UI = { esc: v => String(v ?? ''), q: v => 'Q' + Number(v || 0).toFixed(2) };
  const item = {
    id: 'i1', nombre: 'Glock 19 Gen5', codigo: 'ARM-001', codigo_barras: '7501',
    stock: 3, unidad_medida: 'pieza', precio_venta: 8500, categoria: 'Arma corta (pistola/revólver)',
    imagen_url: 'data:image/png;base64,AAA', descripcion: 'Pistola semiautomática',
    ubicacion: 'Vitrina 2',
    atributos: { tipo_arma: 'pistola', marca: 'Glock', modelo: '19', calibre: '9mm',
                 numero_serie: 'ABC123', pais_origen: 'Austria' },
  };
  const ficha = ARM._fichaInventarioHTML(item);
  ok('la ficha muestra la foto del inventario', /<img src="data:image\/png;base64,AAA"/.test(ficha));
  ok('muestra el nombre y el código', /Glock 19 Gen5/.test(ficha) && /ARM-001/.test(ficha));
  ok('muestra las características (marca, modelo, calibre, origen)',
     /Glock/.test(ficha) && /9mm/.test(ficha) && /Austria/.test(ficha));
  ok('muestra la ubicación física para ir a buscarla', /Vitrina 2/.test(ficha));
  ok('muestra el stock y el precio', /Stock: 3/.test(ficha) && /Q8500\.00/.test(ficha));

  /* Con 3 unidades del mismo modelo, cada arma tiene SU serie: la de la
     ficha es sólo referencia. Callarlo llevaría a registrar la venta con el
     número de serie de otra arma — y ese es el dato que va a DIGECAM. */
  ok('avisa que cada unidad tiene su propio número de serie', /PROPIO n[úu]mero de serie/.test(ficha));

  const unaSola = ARM._fichaInventarioHTML({ ...item, stock: 1 });
  ok('con una sola unidad no molesta con ese aviso', !/PROPIO n[úu]mero de serie/.test(unaSola));

  const accesorio = ARM._fichaInventarioHTML({
    ...item, stock: 5, atributos: { tipo_arma: 'accesorio', marca: 'Fobus' } });
  ok('un accesorio con varias unidades tampoco (no lleva serie)',
     !/PROPIO n[úu]mero de serie/.test(accesorio));

  const sinFoto = ARM._fichaInventarioHTML({ ...item, imagen_url: null });
  ok('sin foto usa un marcador, no una imagen rota', !/<img/.test(sinFoto) && /🎯/.test(sinFoto));

  const agotado = ARM._fichaInventarioHTML({ ...item, stock: 0 });
  ok('stock cero se marca en rojo', /badge-red/.test(agotado));
  ok('con stock disponible se marca en verde', /badge-green/.test(ficha));

  ok('sin artículo no revienta', ARM._fichaInventarioHTML(null) === '');
  ok('un artículo sin atributos tampoco',
     typeof ARM._fichaInventarioHTML({ nombre: 'X', stock: 1 }) === 'string');

  /* Color, acabado y material — lo que el cliente pregunta y lo que
     distingue dos armas del mismo modelo en la vitrina. */
  const completa = ARM._fichaInventarioHTML({ ...item, atributos: {
    ...item.atributos, color: 'Bicolor (two-tone)', acabado: 'Cromado',
    material: 'polímero', largo_canon: 4.02, capacidad_cargador: 15,
    conversiones_calibre: '.22LR con kit',
  }});
  ok('la ficha muestra el color', /Bicolor \(two-tone\)/.test(completa));
  ok('muestra el acabado (cromada, policromada...)', /Cromado/.test(completa));
  ok('muestra el material del armazón (polímero)', /pol[íi]mero/.test(completa));
  ok('muestra la capacidad del cargador', /15 cartuchos/.test(completa));

  /* Datos que la ley nombra por su nombre — arts. 63 (tarjeta de tenencia)
     y 72 a) 2 (solicitud de licencia de portación). El comprador los
     necesita para su trámite, así que el vendedor debe tenerlos a mano. */
  ok('muestra el largo del cañón con sus comillas de pulgadas (art. 63/72)', /4\.02"/.test(completa));
  ok('muestra las conversiones de calibre (art. 63/72)', /\.22LR con kit/.test(completa));

  /* Un arma sin esos datos no debe imprimir etiquetas vacías. */
  ok('sin color/acabado no aparecen esas etiquetas',
     !/Color:/.test(ficha) && !/Acabado:/.test(ficha));
  ok('sin largo de cañón no aparece un "undefined\\""', !/undefined/.test(ficha));
}

/* ── El largo del cañón llega al libro de registro ────────────────────────
   Es dato que un inspector puede pedir, así que el libro lo trae de la
   ficha del inventario cuando la operación está vinculada. */
{
  ctx.UI.fecha = v => String(v || '');
  const abierto = [];
  ctx.window.open = () => ({ document: { write: (h) => abierto.push(h), close() {} }, focus() {}, print() {} });
  ctx.setTimeout = (fn) => { try { fn(); } catch (_) {} };

  ARM._inventario = [{ id: 'i9', nombre: 'Glock 19', atributos: { largo_canon: 4.02 } }];
  ARM._data = [{ num: 'ARM-1', tipo: 'venta', categoria: 'pistola', marca: 'Glock',
                 modelo: '19', calibre: '9mm', numero_serie: 'S1', cantidad: 1,
                 total: 8500, inventario_id: 'i9', estado: 'entregado', fecha: '2026-08-04' }];
  ARM.imprimirLibro();
  const libro = abierto[0] || '';
  ok('el libro incluye la columna Cañón en la cabecera', /<th>Cañón<\/th>/.test(libro));
  ok('y el valor del largo del cañón de la ficha vinculada', /4\.02"/.test(libro));

  /* Una operación sin vincular no inventa el dato: pone guión. */
  ARM._data = [{ ...ARM._data[0], inventario_id: null }];
  abierto.length = 0;
  ARM.imprimirLibro();
  ok('sin artículo vinculado el libro no inventa el cañón', /<td>—<\/td>/.test(abierto[0] || ''));
  ARM._data = []; ARM._inventario = [];
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
