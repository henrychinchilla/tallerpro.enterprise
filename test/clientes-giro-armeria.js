/* El cliente de armería es de la ARMERÍA, y su inventario sí se vende en el POS.

   Henry lo revisó en producción y pidió dos cosas que parecen opuestas:

   1) El perfil del cliente de armería tiene que vivir DENTRO de armería y ser
      independiente del resto de módulos — igual que el inventario. Antes el
      expediente ya era otra pantalla, pero se llegaba a él desde la lista de
      Clientes del comercio: el taller veía a los compradores de armas y la
      armería tenía que buscar a su comprador entre los clientes del taller.
      La solución copia la del inventario (mig 108): el cliente DECLARA SU
      GIRO en la misma tabla, y cada lista filtra lo suyo. No se parte la
      tabla porque órdenes, facturación, citas y el POS apuntan a clientes.id.

   2) El inventario de armería SÍ tiene que estar disponible en el POS, para
      vender los artículos de tienda (chalecos, camping, limpieza, ropa).
      Eso ya funcionaba —el POS lee `inventario` entero— pero abría un hueco
      que esta prueba cierra: en el mostrador también aparecían las armas y
      la munición, que NO se pueden cobrar ahí. El art. 59 obliga a remitir
      papeles a DIGECAM antes de entregar el arma y el art. 60 limita la
      munición al cupo del comprador con código de autorización en la factura.
      Cobrarlas en el POS salta los dos trámites y descuadra el libro del
      art. 58. Van por el módulo de Armería. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── 1. LA COLUMNA QUE SEPARA ───────────────────────────────────────────── */
{
  const mig = leer('db', 'migrations', '133_clientes_giro.sql');
  ok('la migración agrega clientes.giro', /alter table public\.clientes[\s\S]{0,80}add column if not exists giro/.test(mig));
  ok('...con índice por tenant (se filtra en cada lista)', /create index if not exists idx_clientes_giro/.test(mig));
  ok('...es idempotente', /if not exists/.test(mig));
  /* Clasificar lo viejo importa tanto como la columna: sin esto, los clientes
     que YA tienen expediente se quedarían en el alta general del comercio. */
  ok('clasifica como armería a los que ya tienen expediente',
     /set giro = 'armeria'/.test(mig) && /licencia_num|licencia_tipo|dpi/.test(mig));
  ok('...y no toca a los demás (siguen NULL = cliente común)', /where c\.giro is null/.test(mig));
}

/* ── 2. EL FILTRO DE VERDAD, CONTRA UN SUPABASE SIMULADO ────────────────── */
{
  /* Se corre db.js de verdad con un cliente falso que ANOTA lo que se le pide:
     lo que importa no es que el código diga "armeria", sino qué consulta sale. */
  const llamadas = [];
  const query = {
    select() { return this; },
    order()  { return this; },
    eq(col, val)  { llamadas.push(['eq', col, val]); return this; },
    or(expr)      { llamadas.push(['or', expr]); return this; },
    then(res)     { return res({ data: [] }); },
  };
  const ctx = {
    console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN, Promise, setTimeout,
    supabase: { createClient: () => ({ from: () => query }) },
    SUPABASE_URL: 'x', SUPABASE_KEY: 'y',
  };
  ctx.window = ctx;
  ctx.Auth = { tenant: { id: 't1' }, user: {} };
  vm.createContext(ctx);
  /* db.js declara `const DB`, que en un vm no queda en el contexto: se expone
     a mano para poder llamar a la función de verdad. */
  vm.runInContext(leer('js', 'core', 'db.js') + '\nglobalThis.DB = DB;', ctx);
  const DB = ctx.DB;

  const pedir = async (...args) => { llamadas.length = 0; await DB.getClientes(...args); return llamadas; };

  (async () => {
    let l = await pedir();
    ok('sin giro, la consulta sale igual que siempre (POS y facturación ven a todos)',
       !l.some(c => c[1] === 'giro' || (c[0] === 'or' && /giro/.test(c[1]))));

    l = await pedir(null, 'armeria');
    ok('con giro armería, filtra por esa columna',
       l.some(c => c[0] === 'eq' && c[1] === 'giro' && c[2] === 'armeria'));

    l = await pedir(null, 'general');
    const orGeneral = l.find(c => c[0] === 'or' && /giro/.test(c[1]));
    ok('el alta general pide los comunes', !!orGeneral);
    /* Los clientes que existían antes de la migración tienen giro NULL: si el
       filtro no los incluyera, el comercio abriría Clientes y no vería a NADIE. */
    ok('...incluyendo los de antes de la migración (giro NULL)',
       !!orGeneral && /giro\.is\.null/.test(orGeneral[1]));
    ok('...y sin traerse los de armería',
       !!orGeneral && !/giro\.eq\.armeria/.test(orGeneral[1]));

    /* ── 3. CADA PANTALLA PIDE LO SUYO ─────────────────────────────────── */
    {
      const cli = leer('js', 'modulos', 'operacion', 'clientes.js');
      const arm = leer('js', 'modulos', 'especializados', 'armeria.js');
      const cliArm = leer('js', 'modulos', 'especializados', 'clientes-armeria.js');
      const dec = leer('js', 'modulos', 'especializados', 'armeria-declaraciones.js');

      ok('el alta general del comercio pide sólo los comunes',
         /getClientes\([^)]*'general'\)/.test(cli));
      /* Se busca la LLAMADA, no la palabra: el encabezado del archivo nombra
         al módulo para explicar dónde vive el expediente, y buscar el texto
         pelado daba rojo por el comentario. */
      ok('...y ya no abre el expediente de armería desde ahí',
         !/clientesArmeria\s*[.?]/.test(cli));

      ok('armería pide sólo los suyos', /getClientes\(null, 'armeria'\)/.test(arm));
      ok('las declaraciones también', /getClientes\(null, 'armeria'\)/.test(dec));
      ok('el expediente tiene su propia lista', /^\s{2}async render\(busca/m.test(cliArm));
      ok('...que pide sólo los de armería', /getClientes\(busca \|\| null, 'armeria'\)/.test(cliArm));
      ok('...y el cliente nuevo nace marcado como de armería', /giro: 'armeria'/.test(cliArm));
      ok('se llega a la lista desde la pestaña de Armería',
         /b\('clientes'/.test(arm) && /clientesArmeria\.render\(\)/.test(arm));

      /* CRUD completo (regla 1 de CLAUDE.md): lo que más se olvida es editar
         y eliminar, y una lista sin eliminar deja expedientes muertos. */
      ok('la lista trae Ver', /btnAccion\('ver'/.test(cliArm));
      ok('...Editar', /btnAccion\('editar'/.test(cliArm));
      ok('...Eliminar', /btnAccion\('eliminar'/.test(cliArm));
      ok('...y Crear', /Nuevo cliente/.test(cliArm));
      ok('el eliminar usa el helper estándar', /eliminarRegistro\('clientes'/.test(cliArm));
    }

    /* ── 4. QUÉ SE PUEDE COBRAR EN EL MOSTRADOR ────────────────────────── */
    {
      const gctx = { console, Math, Object, Array, String, Number, isFinite };
      gctx.window = gctx;
      vm.createContext(gctx);
      vm.runInContext(leer('js', 'core', 'giros.js'), gctx);
      const reg = gctx.articuloRegulado;

      const art = (o) => Object.assign({ tipo_item: 'armeria' }, o);

      ok('un chaleco de la armería SÍ se vende en el POS',
         reg(art({ categoria: 'Chalecos y protección' })) === false);
      ok('una carpa de camping también', reg(art({ categoria: 'Camping y aventura' })) === false);
      ok('un kit de limpieza también', reg(art({ categoria: 'Limpieza y mantenimiento' })) === false);
      /* Art. 68: el gas comprimido ≤5.5mm no pide licencia. Bloquearlo sería
         inventarle un requisito a la tienda. */
      ok('los balines de aire comprimido también (art. 68, exentos)',
         reg(art({ categoria: 'Aire/gas comprimido (balines)' })) === false);
      /* Art. 13: la navaja de uso personal tampoco pide licencia. */
      ok('una navaja de uso personal también (art. 13)',
         reg(art({ categoria: 'Arma blanca (navajas/cuchillos)' })) === false);

      ok('una pistola NO se cobra en el POS (art. 59)',
         reg(art({ categoria: 'Arma corta (pistola/revólver)' })) === true);
      ok('un rifle tampoco', reg(art({ categoria: 'Arma larga (rifle/escopeta)' })) === true);
      ok('un arma deportiva tampoco (es arma de fuego, art. 11)',
         reg(art({ categoria: 'Arma deportiva' })) === true);
      ok('la munición tampoco (art. 60: cupo y código de DIGECAM)',
         reg(art({ categoria: 'Munición' })) === true);

      /* La categoría la elige quien carga el artículo y puede quedar vacía;
         el tipo de arma lo pide el formulario del giro. Con uno basta. */
      ok('sin categoría, el tipo de arma alcanza para bloquearlo',
         reg(art({ categoria: '', atributos: { tipo_arma: 'pistola' } })) === true);
      ok('...y no se confunde con un accesorio',
         reg(art({ categoria: '', atributos: { tipo_arma: 'accesorio' } })) === false);

      /* La regla es de la armería: un artículo de otro giro no se toca. */
      ok('un artículo de otro giro no queda bloqueado por su categoría',
         reg({ tipo_item: 'mecanico', categoria: 'Munición' }) === false);
      ok('un artículo sin giro tampoco', reg({ categoria: 'Munición' }) === false);
      ok('null no revienta', reg(null) === false);
    }

    /* ── 5. EL POS APLICA LA REGLA EN LA PUERTA DEL CARRITO ────────────── */
    {
      const avisos = [];
      const pctx = {
        console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN, Promise, setTimeout, isFinite,
        UI: { esc: v => String(v ?? ''), toast: (m) => avisos.push(String(m)), q: v => String(v), jsAttr: v => String(v ?? '') },
        DB: {}, Auth: { tenant: {}, user: {} },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
      };
      pctx.window = pctx;
      vm.createContext(pctx);
      vm.runInContext(leer('js', 'core', 'giros.js'), pctx);
      vm.runInContext(leer('js', 'pos', 'pos.js') + '\nglobalThis.POS = POS;', pctx);
      const POS = pctx.POS;
      POS._pintarCart = () => {};

      POS._prod = [
        { id: 'a1', nombre: 'Chaleco táctico', precio_venta: 500, stock: 4, tipo_item: 'armeria', categoria: 'Chalecos y protección' },
        { id: 'a2', nombre: 'Pistola Glock 19', precio_venta: 9000, stock: 2, tipo_item: 'armeria', categoria: 'Arma corta (pistola/revólver)' },
        { id: 'a3', nombre: 'Caja 9mm x50', precio_venta: 300, stock: 30, tipo_item: 'armeria', categoria: 'Munición' },
      ];

      POS._cart = [];
      POS.addToCart('a1');
      ok('el POS sí vende el artículo de tienda de la armería', POS._cart.length === 1);

      POS._cart = []; avisos.length = 0;
      POS.addToCart('a2');
      ok('el POS NO deja meter un arma al carrito', POS._cart.length === 0);
      ok('...y dice por qué (no falla en silencio)', /Armer[íi]a/i.test(avisos.join(' ')));

      POS._cart = []; avisos.length = 0;
      POS.addToCart('a3');
      ok('el POS tampoco deja meter munición', POS._cart.length === 0);

      /* El escáner de código de barras entra por addToCart, así que la regla
         lo cubre también: es el único portón del carrito. */
      const pos = leer('js', 'pos', 'pos.js');
      ok('la regla vive en addToCart (un solo portón, no un if por pantalla)',
         /addToCart\(id\) \{[\s\S]{0,400}articuloRegulado/.test(pos));
      ok('la tarjeta lo avisa antes de que la toquen', /Solo Armer[íi]a/.test(pos));
    }

    console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
    process.exitCode = fallidas ? 1 : 0;
  })();
}
