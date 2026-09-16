import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'nucleo/config.dart';
import 'nucleo/sesion.dart';
import 'pantallas/login.dart';
import 'pantallas/inicio.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: supabaseUrl, anonKey: supabaseAnonKey);
  runApp(const AppNexusPro());
}

/* Paleta corporativa: el mismo azul/gris del sitio. No es cosmética — un
   mecánico que salta del sitio en la PC a la app en el teléfono tiene que ver
   el mismo producto, no dos. */
const _azul = Color(0xFF1E88E5);

class AppNexusPro extends StatelessWidget {
  const AppNexusPro({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: nombreApp,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: _azul, brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: const CompuertaSesion(),
    );
  }
}

/* Decide qué pantalla toca: login, reto de 2FA o adentro.
   Se evalúa al arrancar y cada vez que cambia el estado de autenticación, para
   que cerrar sesión en cualquier pantalla devuelva al login sin que cada
   pantalla tenga que acordarse de hacerlo. */
class CompuertaSesion extends StatefulWidget {
  const CompuertaSesion({super.key});
  @override
  State<CompuertaSesion> createState() => _CompuertaSesionState();
}

class _CompuertaSesionState extends State<CompuertaSesion> {
  late Future<EstadoSesion> _futuro;

  @override
  void initState() {
    super.initState();
    _futuro = _resolver();
    sb.auth.onAuthStateChange.listen((_) {
      if (mounted) setState(() => _futuro = _resolver());
    });
  }

  /* Un fallo al resolver NO entra en silencio (fail-closed), pero tampoco se
     queda mudo: el motivo se muestra en pantalla. Que un ingreso fallido
     volviera al login sin decir por qué fue exactamente lo que dejó a Henry
     fuera del sistema sin forma de saber qué pasaba. */
  Future<EstadoSesion> _resolver() async {
    try {
      return await Sesion.resolver();
    } catch (e) {
      await sb.auth.signOut();
      Sesion.limpiar();
      _ultimoFallo = e.toString();
      return EstadoSesion.sinSesion;
    }
  }

  String? _ultimoFallo;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<EstadoSesion>(
      future: _futuro,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        switch (snap.data) {
          case EstadoSesion.adentro:
            return const PantallaInicio();
          case EstadoSesion.requiere2fa:
            return const PantallaLogin(retoMfa: true);
          default:
            return PantallaLogin(fallo: _ultimoFallo);
        }
      },
    );
  }
}
