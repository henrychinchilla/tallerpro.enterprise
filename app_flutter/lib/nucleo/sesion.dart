import 'package:supabase_flutter/supabase_flutter.dart';

/* Sesión: quién entró, con qué rol y en qué comercio.

   Espeja lo que hace js/core/auth.js, porque del otro lado está la MISMA base
   con las MISMAS políticas RLS. Si esto se desviara del modelo de la web, los
   dos clientes leerían distinto de una sola verdad — y el que se equivoca no
   revienta, contesta mal. */

SupabaseClient get sb => Supabase.instance.client;

/// Estados posibles después de autenticar. El 2FA es una escalera, no un
/// booleano: se puede tener sesión y todavía no tener el nivel que la cuenta
/// exige (aal1 cuando hace falta aal2).
enum EstadoSesion {
  sinSesion,
  requiere2fa,   // hay factor verificado y esta sesión es aal1
  adentro,
}

class Sesion {
  static Map<String, dynamic>? usuario;
  static Map<String, dynamic>? comercio;

  static String get rol => (usuario?['rol'] ?? '') as String;
  static bool get esSuperadmin => rol == 'superadmin';

  /// El 2FA se puede PAUSAR desde la base (migración 099). No es el viejo
  /// `mfa_bypass` del navegador, que se eliminó: la pausa vive en la fila del
  /// usuario y solo se enciende con un código ya verificado.
  static bool get mfaPausado => usuario?['mfa_pausado'] == true;

  static void limpiar() {
    usuario = null;
    comercio = null;
  }

  /// Carga la fila de `usuarios` y su comercio. Se hace SIEMPRE después de
  /// autenticar: sin esto no se sabe el rol, y sin el rol no se sabe ni qué
  /// menú pintar ni si el 2FA está pausado.
  static Future<void> cargar() async {
    final uid = sb.auth.currentUser?.id;
    if (uid == null) throw Exception('No hay sesión activa.');

    final u = await sb.from('usuarios').select().eq('id', uid).maybeSingle();
    if (u == null) {
      throw Exception(
          'Tu usuario autenticó, pero no tiene ficha en el sistema. '
          'Avisale al administrador: falta la fila en "usuarios" para $uid.');
    }
    usuario = Map<String, dynamic>.from(u);

    final tid = usuario?['tenant_id'];
    if (tid != null) {
      final t = await sb.from('tenants').select().eq('id', tid).maybeSingle();
      if (t != null) comercio = Map<String, dynamic>.from(t);
    }
  }

  /// Decide a dónde va el usuario después de autenticar.
  ///
  /// Mismo orden que la web, y por la misma razón: si la cuenta tiene un factor
  /// verificado el reto es OBLIGATORIO, salvo que la pausa esté encendida en la
  /// base. Es *fail-closed* a propósito — ante la duda, NO se entra.
  static Future<EstadoSesion> resolver() async {
    if (sb.auth.currentSession == null) return EstadoSesion.sinSesion;

    await cargar();

    /* El nivel de 2FA se lee del PROPIO TOKEN, que es lo que el servidor firmó:
       `nextLevel == aal2` significa que esta cuenta tiene un factor verificado.
       Es una lectura local, sin red.

       Aquí NO se llama a `mfa.listFactors()`, y la razón no es de estilo: en el
       SDK de Dart ese método arranca con `await _client.refreshSession()`.
       Refrescar el token justo después de iniciar sesión choca con el refresco
       automático que ya hace supabase_flutter, y la sesión revienta con un
       AuthApiException — la app autenticaba bien y acto seguido se caía sola.
       En supabase-js (el sitio) listFactors NO refresca, así que portar la
       lógica literal del navegador metió un fallo que allá no existe.

       Se mantiene fail-closed: ante la duda, se pide el código. */
    final aal = sb.auth.mfa.getAuthenticatorAssuranceLevel();
    final tieneFactor = aal.nextLevel == AuthenticatorAssuranceLevels.aal2;
    final yaVerificado = aal.currentLevel == AuthenticatorAssuranceLevels.aal2;

    if (tieneFactor && !yaVerificado && !mfaPausado) {
      return EstadoSesion.requiere2fa;
    }

    await _marcarIngreso();
    return EstadoSesion.adentro;
  }

  /// `ultimo_login` lo escribe el cliente, igual que en la web. Que falle no
  /// puede dejar a nadie fuera: es un dato de auditoría, no una condición.
  static Future<void> _marcarIngreso() async {
    try {
      await sb
          .from('usuarios')
          .update({'ultimo_login': DateTime.now().toUtc().toIso8601String()})
          .eq('id', sb.auth.currentUser!.id);
    } catch (_) {/* no bloquea el ingreso */}
  }
}
