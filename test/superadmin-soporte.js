/* EL SUPERADMIN ES EL SOPORTE DE TODOS LOS NEGOCIOS.

   Henry entró a El Granjero en modo soporte y no pudo borrar usuarios. Eran
   DOS cosas distintas, y sólo una era de permisos:

   1) EL BLOQUEO DE VERDAD no era de permisos ni de RLS (la política de
      `usuarios` ya trae is_superadmin()). Era la capa de datos: "eliminar"
      llamaba a un UPSERT con sólo { id, activo:false }, y un upsert de
      PostgREST es un INSERT ... ON CONFLICT — la fila tiene que ser válida
      como INSERT COMPLETO. `usuarios` tiene nombre y email NOT NULL, así que
      Postgres respondía 23502 ANTES de llegar al ON CONFLICT. Verificado
      contra la base real. Le pasaba a CUALQUIERA, no sólo en modo soporte, y
      también a los otros tres llamadores que mandan un solo campo.

   2) Y aparte había listas de roles escritas a mano que se olvidaban de
      nombrar al superadmin. Cada lista nueva es otra oportunidad de dejarlo
      afuera, así que la regla pasa a vivir en una función.

   El caso peligroso que cuida esto: que un guardado parcial se convierta otra
   vez en upsert. Se ve idéntico en el código y sólo falla en producción. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const raiz = (...f) => path.join(__dirname, '..', ...f);
const leer = (...f) => fs.readFileSync(raiz(...f), 'utf8');

let pasadas = 0, fallidas = 0;
const ok = (n, c) => { if (c) { pasadas++; console.log('PASS — ' + n); } else { fallidas++; console.log('FAIL — ' + n); } };

/* ── 1. GUARDADO PARCIAL = UPDATE, NUNCA UPSERT ─────────────────────────── */
{
  /* Se corre db.js de verdad contra un Supabase simulado que ANOTA la
     operación: lo que importa no es lo que diga el código, sino qué llega a la
     base. */
  const ops = [];
  const query = {
    update(v) { ops.push({ op: 'update', v }); return this; },
    insert(v) { ops.push({ op: 'insert', v }); return this; },
    upsert(v) { ops.push({ op: 'upsert', v }); return this; },
    eq(c, v)  { ops.push({ op: 'eq', c, v }); return this; },
    select()  { return this; },
    then(res) { return res({ data: [], error: null }); },
  };
  const ctx = {
    console, Math, Date, JSON, String, Number, Object, Array, RegExp, isNaN, Promise, setTimeout,
    supabase: { createClient: () => ({ from: () => query }) },
    SUPABASE_URL: 'x', SUPABASE_KEY: 'y',
    localStorage: { getItem: () => null, setItem() {} },
  };
  ctx.window = ctx;
  ctx.Auth = { tenant: { id: 'tenant-granjero' }, user: { rol: 'superadmin' } };
  vm.createContext(ctx);
  vm.runInContext(leer('js', 'core', 'db.js') + '\nglobalThis.DB = DB;', ctx);
  const DB = ctx.DB;

  (async () => {
    ops.length = 0;
    const r = await DB.upsertUsuario({ id: 'u1', activo: false, updated_at: 'hoy' });
    const usadas = ops.map(o => o.op);
    ok('desactivar un usuario hace UPDATE, no upsert',
       usadas.includes('update') && !usadas.includes('upsert') && !usadas.includes('insert'));
    ok('...apuntando al usuario por id', ops.some(o => o.op === 'eq' && o.c === 'id' && o.v === 'u1'));
    const upd = ops.find(o => o.op === 'update');
    ok('...mandando sólo los campos que cambian', upd && upd.v.activo === false && upd.v.id === undefined);
    /* SI SE MANDARA tenant_id, el superadmin movería al usuario a SU comercio
       cada vez que lo edita desde el Panel SaaS. */
    ok('...y sin tocar el tenant_id (movería al usuario de negocio)',
       upd && upd.v.tenant_id === undefined);
    ok('devuelve el motivo del fallo, no sólo true/false',
       typeof r === 'object' && 'ok' in r && 'error' in r);

    /* Sin id sí es un alta: ahí el tenant_id es obligatorio. */
    ops.length = 0;
    await DB.upsertUsuario({ nombre: 'Nuevo', email: 'n@x.com' });
    const ins = ops.find(o => o.op === 'insert');
    ok('crear un usuario sí es INSERT', !!ins);
    ok('...y ahí sí lleva el tenant del negocio', ins && ins.v.tenant_id === 'tenant-granjero');

    /* ── 2. LA PANTALLA MUESTRA EL MOTIVO ───────────────────────────────── */
    {
      const src = leer('js', 'modulos', 'admin', 'usuarios.js');
      /* "Error al guardar" a secas escondió durante meses un 23502: sin el
         motivo no se puede ni reportar. */
      ok('el guardado dice POR QUÉ falló', /No se pudo guardar: /.test(src));
      ok('el cambio de estado también', /No se pudo cambiar: /.test(src));
      ok('y el borrado muestra el mensaje que devuelve el servidor',
         /r\.error \|\| 'No se pudo eliminar'/.test(src));
    }

    /* ── 3. EL SUPERADMIN ENTRA EN CUALQUIER LISTA DE ROLES ─────────────── */
    {
      const cctx = { console, Math, Object, Array, String, Number, JSON };
      cctx.window = cctx;
      vm.createContext(cctx);
      vm.runInContext(leer('js', 'core', 'config.js'), cctx);
      const { rolEnLista, nivelAcceso, puedeAccion } = cctx;

      cctx.Auth = { user: { rol: 'superadmin' }, tenant: {} };
      ok('el superadmin pasa una lista que no lo nombra',
         rolEnLista(['admin', 'gerente_fin', 'contador']) === true);
      ok('...incluso una lista vacía', rolEnLista([]) === true);
      ok('...y una lista que no existe', rolEnLista(undefined) === true);

      cctx.Auth = { user: { rol: 'mecanico' }, tenant: {} };
      ok('un mecánico NO pasa una lista que no lo nombra',
         rolEnLista(['admin', 'gerente_fin']) === false);
      ok('...pero sí una que sí', rolEnLista(['admin', 'mecanico']) === true);

      /* ── EL MENÚ ES DEL COMERCIO, LOS PERMISOS SON DE LA PERSONA ──────────
         Henry entró a un comercio en modo soporte y le salieron TODOS los
         módulos: "pareciera que nunca ingresé al negocio". Pasaba porque el
         superadmin se saltaba el filtro de módulos activos. Un negocio de
         granos tiene que verse como un negocio de granos — también para el
         dueño del SaaS. Lo que él conserva es poder hacer TODO adentro de lo
         que ese negocio sí tiene. */
      cctx.Auth = {
        user: { rol: 'superadmin' },
        tenant: { modulos_activos: ['venta_granos', 'inventario', 'pos'] },
      };
      ok('dentro de un comercio de granos, el superadmin VE granos',
         puedeAccion('venta_granos', 'ver') === true);
      ok('...y puede ELIMINAR ahí adentro (es el soporte)',
         puedeAccion('venta_granos', 'eliminar') === true);
      ok('...pero NO le aparece armería, que ese negocio no tiene',
         nivelAcceso('armeria') === 'no');
      ok('...ni refrigeración', nivelAcceso('refrigeracion') === 'no');
      ok('el Panel SaaS sigue siendo suyo y no depende del comercio',
         nivelAcceso('superadmin') === 'total');
      /* Los módulos de siempre (configuración, usuarios) no se filtran: son
         los que necesita para dar soporte en cualquier negocio. */
      ok('configuración sigue disponible', puedeAccion('configuracion', 'eliminar') === true);
      ok('usuarios también', puedeAccion('usuarios', 'eliminar') === true);

      /* Un comercio con TODO activo se ve completo, como antes. */
      cctx.Auth = { user: { rol: 'superadmin' }, tenant: { modulos_activos: ['armeria', 'venta_granos'] } };
      ok('en un comercio con armería, sí la ve', nivelAcceso('armeria') === 'total');

      /* Y el menú no puede tener su propio atajo: la regla vive en un lugar. */
      const app = leer('js', 'core', 'app.js');
      ok('el menú no pinta todo por ser superadmin',
         !/if \(rol === 'superadmin'\) return true;\s*\/\/ el dueño del SaaS ve todo/.test(app));
      ok('el botón de Nexus también respeta los módulos del comercio',
         !/rol !== 'superadmin' && !moduloEnPlan\('ia'\)/.test(app));
    }

    /* ── 4. NINGUNA LISTA DE ROLES DEJA AFUERA AL SUPERADMIN ────────────── */
    {
      /* La regla, no el caso: se busca cualquier filtro por rol que use
         .includes(rol) directo en vez de rolEnLista. */
      const archivos = ['js/core/app.js', 'js/modulos/admin/admin.js', 'js/core/config.js'];
      const crudos = [];
      archivos.forEach(rel => {
        const lineas = leer(...rel.split('/')).split('\n');
        lineas.forEach((linea, i) => {
          if (!/\.roles\.includes\(rol\)|\]\.includes\(rol\)/.test(linea)) return;
          if (/rolEnLista/.test(linea)) return;
          /* La lista que NOMBRA al superadmin está bien. */
          if (/superadmin/.test(linea)) return;
          /* Y la función que ya lo dejó pasar antes, también: se miran las
             cinco líneas anteriores buscando el corto circuito. */
          if (lineas.slice(Math.max(0, i - 5), i).some(l => /rol === 'superadmin'/.test(l))) return;
          /* Una función que RECIBE el rol como parámetro está clasificando a
             OTRA persona (ej. plantillaKpiRol, que arma los KPIs de un
             empleado), no decidiendo qué puede hacer quien está en sesión.
             Meterle rolEnLista ahí trataría a cualquier empleado como gerente
             sólo porque el que mira es el superadmin. */
          if (lineas.slice(Math.max(0, i - 8), i).some(l => /function \w+\(\s*rol\b/.test(l))) return;
          crudos.push(`${rel}:${i + 1}  ${linea.trim().slice(0, 60)}`);
        });
      });
      ok(`ningún filtro por rol se salta rolEnLista (quedan: ${crudos.length})`, crudos.length === 0);
      crudos.forEach(c => console.log('        ↳ ' + c));
    }

    /* ── 5. INACTIVAR NO ES ELIMINAR ────────────────────────────────────────
       Había UN botón, con bote de basura, que sólo inactivaba: el que quería
       borrar creía que había borrado. Ahora son dos acciones distintas. */
    {
      const src = leer('js', 'modulos', 'admin', 'usuarios.js');
      ok('existe INACTIVAR como acción propia', /async alternarActivo\(/.test(src));
      ok('...y se puede deshacer (activar de nuevo)', /Usuario activado ✓/.test(src));
      ok('...diciendo que NO se borra', /no se borra<\/b>/.test(src));
      ok('existe ELIMINAR como acción distinta', /async eliminar\(id, nombre\)/.test(src));
      ok('...que avisa que es de la base de datos y sin vuelta atrás',
         /base de datos/.test(src) && /No se puede deshacer/.test(src));
      ok('...y sugiere inactivar si es sólo temporal', /usá ⏸️ Inactivar/.test(src));
      ok('la lista tiene los dos botones separados',
         /alternarActivo\('\$\{u\.id\}'/.test(src) && /usuarios\.eliminar\('\$\{u\.id\}'/.test(src));

      /* El borrado real NO puede hacerse desde el navegador: borrar el auth
         user necesita la service role. Si sólo se borrara el perfil, la cuenta
         seguiría pudiendo iniciar sesión — un fantasma. */
      const auth = leer('js', 'core', 'auth.js');
      ok('eliminar va por la Edge Function', /functions\.invoke\('eliminar-usuario'/.test(auth));
      ok('...y si no está desplegada NO borra a medias',
         /Falta desplegar la función eliminar-usuario/.test(auth));

      const fn = leer('supabase', 'functions', 'eliminar-usuario', 'index.ts');
      ok('la función borra el perfil', /from\("usuarios"\)\.delete\(\)/.test(fn));
      ok('...y el acceso', /auth\.admin\.deleteUser/.test(fn));
      ok('...no deja que alguien se borre a sí mismo', /No podés eliminar tu propio usuario/.test(fn));
      ok('...ni que un admin borre fuera de su negocio', /Ese usuario no es de tu negocio/.test(fn));
      ok('...pero el superadmin sí puede en cualquiera', /esSuperadmin/.test(fn));
      ok('...y avisa si el perfil se fue pero el acceso no (borrado a medias)',
         /acceso_eliminado: false/.test(fn));

      /* La migración que hace posible el borrado completo. */
      const mig = leer('db', 'migrations', '135_eliminar_usuario_completo.sql');
      ok('el arqueo guarda el NOMBRE de quien lo hizo', /usuario_apertura_nombre/.test(mig));
      ok('...y se rellena solo con un trigger', /trg_cajas_pos_nombres/.test(mig));
      ok('la llave del usuario se suelta (SET NULL)', /on delete set null/.test(mig));
      /* El detalle que sólo apareció probando contra la base: la columna era
         NOT NULL, así que el SET NULL fallaba igual. */
      ok('...y la columna deja de ser NOT NULL, o el SET NULL fallaría igual',
         /alter column usuario_apertura_id drop not null/.test(mig));
    }

    /* ── 6. UN F5 NO TE SACA DEL COMERCIO QUE ESTÁS ATENDIENDO ───────────── */
    {
      const sa = leer('js', 'modulos', 'admin', 'superadmin.js');
      const app = leer('js', 'core', 'app.js');
      ok('al entrar a un comercio se deja marcado', /setItem\('tp_soporte_tenant'/.test(sa));
      ok('...y también a cuál volver', /setItem\('tp_soporte_volver'/.test(sa));
      ok('al arrancar la app se vuelve a entrar', /_restaurarSoporte/.test(app));
      ok('...sólo si es superadmin', /Auth\.user\?\.rol !== 'superadmin'/.test(app));
      /* El orden importa: si el menú se pinta antes de restaurar el comercio,
         se pinta con los módulos del tenant equivocado. */
      ok('...y antes de pintar el menú (los módulos dependen del comercio)',
         app.indexOf('await App._restaurarSoporte()') < app.indexOf('App._initSidebarToggle()'));
      ok('si el comercio ya no existe, se limpia la marca', /removeItem\('tp_soporte_tenant'\)/.test(app));
      ok('salir de soporte borra la marca', /removeItem\('tp_soporte_tenant'\)/.test(sa));
      ok('...y funciona aunque se haya recargado (recupera el comercio propio)',
         /tp_soporte_volver/.test(sa) && /getTenantPorId/.test(sa));
    }

    console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
    process.exitCode = fallidas ? 1 : 0;
  })();
}
