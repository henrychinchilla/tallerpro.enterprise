/* LOS CAMINOS DE LA PRIMERA VEZ, que son los que se rompen.

   Todo lo que le pasó a El Granjero es de esta familia: pantallas que sólo se
   ven una vez, cuando un usuario o un negocio son nuevos. Nadie las prueba
   porque para verlas hay que empezar de cero — y por eso llegan rotas al
   cliente:

     · El cambio obligatorio de contraseña no tenía salida. Como la sesión ya
       estaba abierta, recargar volvía a caer ahí y NO se podía entrar con otro
       usuario en el mismo navegador.
     · El POS sin terminal decía "pedíselo al administrador"… y el
       administrador no tenía dónde crearla en toda la app.

   Se prueban pintando esas pantallas directamente: son estados, no rutas, y
   forzarlos es la única forma de verlos sin borrar datos de verdad. */
import { abrirSesion, marcador, cerrar, BASE } from './ayuda.mjs';

const sesion = await abrirSesion();
if (!sesion) { console.log('⚠️  Sin credenciales o sin poder entrar — no se prueban los caminos nuevos.'); process.exit(0); }
const { pagina, errores } = sesion;
const { estado, ok } = marcador();

try {
  /* ── EL POS SIN TERMINAL ────────────────────────────────────────────── */
  await pagina.goto(BASE + '/pos.html', { waitUntil: 'load' });
  /* Hay que esperar al PERFIL, no sólo a que exista POS: la pantalla decide qué
     ofrecer según el rol, y con Auth.user todavía en null trata a cualquiera
     como desconocido. Esperar sólo a POS medía otra cosa. */
  await pagina.waitForFunction(() => typeof POS !== 'undefined' && Auth?.user?.rol, null, { timeout: 25000 });

  const sinTerminal = await pagina.evaluate(() => {
    POS.renderSinTerminal();
    const txt = document.getElementById('pos-root').innerText;
    return {
      texto: txt.replace(/\s+/g, ' '),
      tieneBotonCrear: /Crear la terminal principal/i.test(txt),
      mandaAPedirla: /pedí|pedi|administrador del taller/i.test(txt),
    };
  });
  ok('el POS sin terminal ofrece CREARLA a quien administra', sinTerminal.tieneBotonCrear, sinTerminal.texto);
  ok('...y ya no es un callejón sin salida', !sinTerminal.mandaAPedirla || sinTerminal.tieneBotonCrear);
  ok('...y le habla al negocio, no a un "taller"', !/taller/i.test(sinTerminal.texto), sinTerminal.texto);

  /* Quien NO administra sí tiene que pedirla, pero sabiendo a quién. */
  const cajero = await pagina.evaluate(() => {
    const antes = Auth.user.rol;
    Auth.user.rol = 'vendedor';
    POS.renderSinTerminal();
    const txt = document.getElementById('pos-root').innerText;
    Auth.user.rol = antes;
    return txt.replace(/\s+/g, ' ');
  });
  ok('a un cajero NO se le ofrece crear terminales', !/Crear la terminal principal/i.test(cajero), cajero);
  ok('...pero se le explica quién puede', /administra el negocio/i.test(cajero), cajero);

  /* ── EL CAMBIO OBLIGATORIO DE CONTRASEÑA ────────────────────────────── */
  await pagina.goto(BASE + '/', { waitUntil: 'load' });
  await pagina.waitForFunction(() => typeof renderLogin === 'function', null, { timeout: 20000 });

  const cambio = await pagina.evaluate(() => {
    renderLogin('cambiar-pass');
    const txt = document.getElementById('login-screen').innerText;
    return {
      texto: txt.replace(/\s+/g, ' '),
      tieneSalida: /Salir y volver al inicio de sesión/i.test(txt),
      avisa: /no vas a poder entrar/i.test(txt),
      tieneGuardar: /Guardar y Entrar/i.test(txt),
    };
  });
  ok('el cambio obligatorio de contraseña TIENE salida', cambio.tieneSalida, cambio.texto);
  ok('...y avisa que sin cambiarla no se entra', cambio.avisa, cambio.texto);
  ok('...sin perder el botón de guardar', cambio.tieneGuardar);

  /* Y la salida tiene que CERRAR SESIÓN: si sólo repintara el login, la sesión
     del primero seguiría viva y el problema volvería igual. */
  const salida = await pagina.evaluate(async () => {
    await loginSalirCambioPass();
    const { data } = await getSB().auth.getSession();
    return {
      sesion: data?.session?.user?.email || null,
      enLogin: /Iniciar Sesión/i.test(document.getElementById('login-screen')?.innerText || ''),
    };
  });
  ok('salir CIERRA la sesión (si no, no se podría entrar con otro usuario)',
     salida.sesion === null, 'quedó ' + salida.sesion);
  ok('...y devuelve al formulario de inicio de sesión', salida.enLogin);

  ok('los caminos nuevos no tiraron errores de JavaScript', errores.length === 0, errores[0]);
} catch (e) {
  ok('los caminos de la primera vez se pudieron probar', false, e.message);
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallidas} fallidas`);
await cerrar(sesion, estado.fallidas);
process.exit(estado.fallidas ? 1 : 0);
