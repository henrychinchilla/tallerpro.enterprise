/* Prueba la lógica real de ai-assistant/index.ts (modulosPermitidosPorRol,
   buildBetoPersona) sin necesitar una sesión de usuario ni gastar cuota de
   Claude — es la única forma de verificar el gating por rol sin tocar
   producción. El archivo es TypeScript (Deno); se extrae el bloque de
   lógica y se le quitan a mano las anotaciones de tipo conocidas (no es un
   transpilador general — si el archivo cambia de forma, esta prueba debe
   fallar de forma RUIDOSA, no silenciosa, por eso valida que cada
   `.replace()` haya encontrado su texto exacto). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const tsSource = fs.readFileSync(raiz('supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');

const inicio = tsSource.indexOf('const MOD_CONOCIMIENTO: Record<string, string> = {');
const fin = tsSource.indexOf('\n/* Persona base');
if (inicio === -1 || fin === -1) {
  console.log('FAIL — no se encontró el bloque de lógica en index.ts (cambió de forma, ajustar la extracción)');
  process.exit(1);
}
let bloque = tsSource.slice(inicio, fin);

const reemplazos = [
  ['const MOD_CONOCIMIENTO: Record<string, string> = {', 'const MOD_CONOCIMIENTO = {'],
  ['const PERMISOS_MIN: Record<string, string[]> = {', 'const PERMISOS_MIN = {'],
  ['function modulosPermitidosPorRol(rol: string | undefined, modulosActivos: string[]): string[] {', 'function modulosPermitidosPorRol(rol, modulosActivos) {'],
  ['function buildBetoPersona(nombre: string, modulos: string[], sinRestriccion = false): string {', 'function buildBetoPersona(nombre, modulos, sinRestriccion = false) {'],
  ['const tiene = (m: string) => sinRestriccion || modulos.includes(m);', 'const tiene = (m) => sinRestriccion || modulos.includes(m);'],
  ['let identidad: string;', 'let identidad;'],
];

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

for (const [buscar, cambiar] of reemplazos) {
  ok(`la extracción de TS encuentra: "${buscar.slice(0, 50)}..."`, bloque.includes(buscar));
  bloque = bloque.replace(buscar, cambiar);
}
ok('no queda sintaxis TypeScript sin quitar (Record</string\\[\\]/: string)', !/Record<|: string(\[\])?[\s,)=]|: undefined/.test(bloque));

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(bloque + '\nthis.MOD_CONOCIMIENTO = MOD_CONOCIMIENTO; this.modulosPermitidosPorRol = modulosPermitidosPorRol; this.buildBetoPersona = buildBetoPersona;', ctx);
const { modulosPermitidosPorRol, buildBetoPersona } = ctx;

/* ── El caso que motivó todo esto: mecánico no debe ver armería ─────────── */
{
  const tenant = ['ordenes', 'armeria']; // taller + armería activos
  const modsMecanico = modulosPermitidosPorRol('mecanico', tenant);
  const modsRecepcion = modulosPermitidosPorRol('recepcionista', tenant);
  ok('mecánico: el filtro le quita armería', !modsMecanico.includes('armeria'));
  ok('recepcionista: el filtro le deja armería', modsRecepcion.includes('armeria'));

  const personaMecanico = buildBetoPersona('Beto', modsMecanico, false);
  const personaRecepcion = buildBetoPersona('Beto', modsRecepcion, false);
  ok('la persona del mecánico NO menciona DIGECAM', !/DIGECAM/i.test(personaMecanico));
  ok('la persona del mecánico SÍ trae el límite de alcance', /LÍMITE DE ALCANCE/.test(personaMecanico));
  ok('la persona de recepción SÍ menciona DIGECAM', /DIGECAM/i.test(personaRecepcion));
}

/* ── Rol sin ninguna área asignada: NO debe caer al "experto en todo" ────── */
{
  const modsLimpieza = modulosPermitidosPorRol('limpieza', ['ordenes', 'armeria', 'venta_granos']);
  ok('limpieza se queda sin ningún módulo', modsLimpieza.length === 0);
  const personaLimpieza = buildBetoPersona('Beto', modsLimpieza, false);
  ok('limpieza NO recibe la persona "experto en todo"', !/experto en mecánica automotriz y en todos los servicios/.test(personaLimpieza));
  ok('limpieza recibe el aviso de "ninguna área asignada"', /ninguna área de conocimiento/.test(personaLimpieza));
}

/* ── Tenant legacy sin multi-negocio configurado: sigue dando acceso total ── */
{
  const personaLegacy = buildBetoPersona('Beto', [], true);
  ok('tenant legacy (sinRestriccion) SÍ es "experto en todo" sin importar el rol',
     /experto en mecánica automotriz y en todos los servicios/.test(personaLegacy));
  ok('el legacy NO trae el límite de alcance (no tiene sentido ahí)', !/LÍMITE DE ALCANCE/.test(personaLegacy));
}

/* ── Identidad dedicada cuando armería/granos es el único giro del rol ──── */
{
  const soloArmeria = buildBetoPersona('Beto', ['armeria'], false);
  ok('con solo armería, la identidad es la de armería', /experto en armería/.test(soloArmeria));
  const soloGranos = buildBetoPersona('Beto', ['venta_granos'], false);
  ok('con solo granos, la identidad es la de agro/granos', /experto en agro y venta de granos/.test(soloGranos));
}

/* ── superadmin/admin: '*' no restringe nada más allá del tenant ─────────── */
{
  const tenant = ['ordenes', 'armeria', 'venta_granos'];
  ok('superadmin ve TODO lo que el tenant activó', JSON.stringify(modulosPermitidosPorRol('superadmin', tenant)) === JSON.stringify(tenant));
  ok('un rol desconocido no revienta (cae a recepcionista)', Array.isArray(modulosPermitidosPorRol('rol_que_no_existe', tenant)));
}

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
process.exitCode = fallidas ? 1 : 0;
