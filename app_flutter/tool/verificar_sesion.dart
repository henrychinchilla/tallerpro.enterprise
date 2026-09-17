/* Verificacion de la sesion contra el Supabase REAL, sin telefono.

   No es una prueba de widgets: ejecuta las MISMAS consultas que hace
   lib/nucleo/sesion.dart —autenticar, leer la fila de `usuarios`, leer su
   comercio y mirar los factores de 2FA— contra el proyecto de produccion.
   Si algo de eso falla por RLS, por una columna que no existe o por un permiso,
   se entera aqui y no el mecanico con el vehiculo enfrente.

   Usa el comercio de PRUEBAS (test/humo/credenciales.json, fuera de git), que
   es el mismo que usan las pruebas de humo del sitio. Solo LEE: no escribe nada.

   Uso:  dart run tool/verificar_sesion.dart
*/
import 'dart:convert';
import 'dart:io';

import 'package:supabase/supabase.dart';

import '../lib/nucleo/config.dart';

Future<void> main() async {
  final f = File('../test/humo/credenciales.json');
  if (!f.existsSync()) {
    stderr.writeln('No hay ../test/humo/credenciales.json — se salta la verificacion.');
    exit(0);
  }
  final cred = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;

  final sb = SupabaseClient(supabaseUrl, supabaseAnonKey);
  var fallos = 0;
  void ok(String nombre, bool cond, [String detalle = '']) {
    if (cond) {
      print('PASS — $nombre');
    } else {
      fallos++;
      print('FAIL — $nombre${detalle.isEmpty ? '' : '\n        -> $detalle'}');
    }
  }

  try {
    // 1. Autenticar, igual que PantallaLogin.
    final r = await sb.auth.signInWithPassword(
        email: cred['email'] as String, password: cred['password'] as String);
    ok('signInWithPassword devuelve sesion', r.session != null);
    ok('...y trae un usuario con id', r.user?.id != null);

    final uid = r.user!.id;

    // 2. La fila de `usuarios`, que es de donde sale el rol y la pausa de MFA.
    //    Si RLS no dejara leer la propia fila, la app entraria y se quedaria
    //    sin saber quien es — que es como se ve "no me deja entrar".
    final u = await sb.from('usuarios').select().eq('id', uid).maybeSingle();
    ok('se puede leer la propia fila de usuarios (RLS)', u != null);
    if (u != null) {
      ok('...trae rol', u['rol'] != null, 'rol=${u['rol']}');
      ok('...trae tenant_id', u['tenant_id'] != null);
      ok('...expone mfa_pausado (la app lo necesita para decidir el reto)',
          u.containsKey('mfa_pausado'));
    }

    // 3. El comercio.
    if (u?['tenant_id'] != null) {
      final t = await sb.from('tenants').select().eq('id', u!['tenant_id']).maybeSingle();
      ok('se puede leer el comercio del usuario (RLS)', t != null);
      ok('...trae nombre', t?['name'] != null, 'name=${t?['name']}');
    }

    // 4. Factores de 2FA: es lo que decide si se pide el codigo.
    final factores = await sb.auth.mfa.listFactors();
    ok('listFactors responde sin error', true,
        'totp=${factores.totp.length} todos=${factores.all.length}');

    await sb.auth.signOut();
    ok('signOut cierra la sesion', sb.auth.currentSession == null);
  } catch (e) {
    fallos++;
    print('FAIL — excepcion no esperada\n        -> $e');
  }

  print('\n${fallos == 0 ? 'todo en verde' : '$fallos fallo(s)'}');
  exit(fallos == 0 ? 0 : 1);
}
