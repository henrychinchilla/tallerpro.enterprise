/* Los giros que se pueden dar de alta al registrarse.

   El bug: la armería existía por todos lados —módulo en MODULOS, giro en
   giros.js, permisos por rol, tablas en la BD— pero el formulario de registro
   nunca la ofreció como "tipo de negocio". Un comercio nuevo simplemente no
   podía nacer como armería, y desde adentro no se veía nada roto: el módulo
   estaba ahí, sólo que ningún tenant lo tenía en modulos_activos.

   Por eso esto no prueba "¿está la armería?" sino la regla general: TODO
   módulo vertical (los grupos 'especializados' y 'agropecuaria') tiene que
   ser alcanzable desde el alta. Así el próximo vertical que se agregue sin
   ponerlo en el formulario falla aquí y no en producción.

   Se lee el archivo como texto a propósito: login.js es HTML embebido en
   plantillas y lo que importa es exactamente lo que ve el usuario. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(raiz, 'js', 'core', 'login.js'), 'utf8');
const config = fs.readFileSync(path.join(raiz, 'js', 'core', 'config.js'), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* Los verticales según el catálogo de módulos. */
const verticales = [...config.matchAll(/id:'(\w+)'[^}]*grupo:'(especializados|agropecuaria)'/g)]
  .map(m => m[1]);

/* Lo que el formulario de registro ofrece de verdad. */
const tiposOfrecidos = [...login.matchAll(/name="tipo"\s+value="(\w+)"/g)].map(m => m[1]);

/* El mapa tipo → módulos. Se toma el primero: los tres son idénticos y eso
   también se comprueba abajo. */
const bloqueMapa = login.match(/const modulos_map = \{[\s\S]*?\n  \};/);

/* ── El catálogo de verticales llegó completo ───────────────────────────── */
{
  ok('se encontraron los módulos verticales', verticales.length >= 6);
  ok('la armería está en el catálogo de módulos', verticales.includes('armeria'));
  ok('se encontró el mapa tipo → módulos', !!bloqueMapa);
  ok('el formulario ofrece varios tipos de negocio', tiposOfrecidos.length >= 8);
}

/* ── LA REGLA: todo vertical se puede dar de alta ───────────────────────── */
{
  verticales.forEach(id => {
    /* El tipo puede no llamarse igual que el módulo (agroservicio activa
       'agroservicio'), así que se busca por lo que el mapa ACTIVA. */
    const activanEste = tiposOfrecidos.filter(tipo => {
      const linea = bloqueMapa[0].match(new RegExp(`^\\s*${tipo}:.*$`, 'm'));
      return linea && new RegExp(`'${id}'`).test(linea[0]);
    });
    ok(`el vertical "${id}" se puede elegir al registrarse`, activanEste.length > 0);
  });
}

/* ── El caso que lo destapó ─────────────────────────────────────────────── */
{
  ok('"Armería" aparece como tipo de negocio', tiposOfrecidos.includes('armeria'));
  ok('...y se muestra con su nombre en pantalla', /🎯 Armer[íi]a/.test(login));

  const lineaArmeria = bloqueMapa[0].match(/^\s*armeria:.*$/m);
  ok('el tipo armería tiene su lista de módulos', !!lineaArmeria);

  /* Henry lo pidió explícito: "las armas deben influir en inventario,
     clientes, proveedores, cotizacion, y su propio modulo". */
  ['armeria', 'clientes', 'inventario', 'proveedores', 'cotizaciones'].forEach(mod => {
    ok(`la armería activa ${mod}`, lineaArmeria && lineaArmeria[0].includes(`'${mod}'`));
  });
}

/* ── Los tres mapas no pueden divergir ──────────────────────────────────── */
{
  /* login.js repite modulos_map en las tres rutas de alta (correo, Google y
     el selector post-login). Si una se actualiza y las otras no, el mismo
     negocio nace con módulos distintos según por dónde entró. */
  const mapas = [...login.matchAll(/const modulos_map = \{[\s\S]*?\n  \};/g)].map(m => m[0]);
  ok('siguen siendo tres rutas de alta', mapas.length === 3);
  ok('los tres mapas son idénticos', new Set(mapas).size === 1);
}

console.log(`   ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) process.exitCode = 1;
