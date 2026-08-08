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
      ok('el borrado dice POR QUÉ falló', /No se pudo eliminar: /.test(src));
      ok('...y el guardado también', /No se pudo guardar: /.test(src));
      ok('el aviso explica que el usuario queda Inactivo y no se borra la fila',
         /Inactivo/.test(src) && /auditor/i.test(src));
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

      /* Y el permiso por módulo ya lo daba: se comprueba que siga así, porque
         es la otra mitad de "el superadmin puede todo". */
      cctx.Auth = { user: { rol: 'superadmin' }, tenant: { modulos_activos: [] } };
      ['usuarios', 'inventario', 'armeria', 'contabilidad', 'venta_granos'].forEach(m => {
        ok(`el superadmin puede ELIMINAR en ${m}`, puedeAccion(m, 'eliminar') === true);
      });
      ok('...aunque el negocio no tenga el módulo en su plan', nivelAcceso('armeria') === 'total');
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

    console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
    process.exitCode = fallidas ? 1 : 0;
  })();
}
