import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../nucleo/config.dart';
import '../nucleo/sesion.dart';

/* Login y reto de 2FA.

   Regla que sale de haber dejado a Henry fuera del sistema sin pistas: un
   ingreso que falla SIEMPRE dice por qué, en pantalla y copiable. Un toast que
   se desvanece y devuelve al login es, desde un teléfono, indistinguible de
   "escribiste mal la contraseña" — y manda a buscar el problema donde no está.

   Acá no hay botón de Google a propósito, y no es un olvido: en el cascarón
   WebView anterior ese botón era un callejón sin salida (Google rechaza OAuth
   dentro de una WebView y la sesión se quedaba en el navegador). Siendo app
   nativa se puede hacer bien —OAuth por Custom Tab con deep link de vuelta— y
   se va a agregar así, no copiando el botón roto. */
class PantallaLogin extends StatefulWidget {
  final bool retoMfa;
  final String? fallo;
  const PantallaLogin({super.key, this.retoMfa = false, this.fallo});

  @override
  State<PantallaLogin> createState() => _PantallaLoginState();
}

class _PantallaLoginState extends State<PantallaLogin> {
  final _correo = TextEditingController();
  final _clave = TextEditingController();
  final _codigo = TextEditingController();

  bool _ocupado = false;
  bool _verClave = false;
  bool _recuperando = false;
  String? _error;
  String? _aviso;

  @override
  void initState() {
    super.initState();
    _error = widget.fallo;
  }

  @override
  void dispose() {
    _correo.dispose();
    _clave.dispose();
    _codigo.dispose();
    super.dispose();
  }

  /* "AuthApiException" a secas no le dice nada a nadie y no se puede depurar en
     remoto. Va el mensaje, el codigo y el estado HTTP: con eso se sabe si fue
     la contrasena, el token o el servidor. */
  void _fallar(Object e) {
    String txt;
    if (e is AuthApiException) {
      txt = [
        e.message,
        if (e.code != null) 'code=${e.code}',
        if (e.statusCode != null) 'http=${e.statusCode}',
      ].join('  ·  ');
    } else if (e is AuthException) {
      txt = e.message;
    } else {
      txt = e.toString();
    }
    setState(() => _error = txt);
  }

  Future<void> _entrar() async {
    if (_ocupado) return;
    setState(() { _ocupado = true; _error = null; });
    try {
      await sb.auth.signInWithPassword(
        email: _correo.text.trim(),
        password: _clave.text,
      );
      // La compuerta reacciona sola al cambio de estado de autenticación.
    } catch (e) {
      _fallar(e);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _verificarCodigo() async {
    if (_ocupado) return;
    setState(() { _ocupado = true; _error = null; });
    try {
      final factores = await sb.auth.mfa.listFactors();
      final f = factores.totp.firstWhere(
        (x) => x.status == FactorStatus.verified,
        orElse: () => throw Exception('Tu cuenta no tiene un 2FA verificado.'),
      );
      final reto = await sb.auth.mfa.challenge(factorId: f.id);
      await sb.auth.mfa.verify(
        factorId: f.id,
        challengeId: reto.id,
        code: _codigo.text.trim(),
      );
    } catch (e) {
      _fallar(e);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  /* Recuperar contrasena va por la MISMA Edge Function que usa el sitio
     ('recuperar-password', op 'solicitar'), no por resetPasswordForEmail de
     Supabase: esa funcion es la que manda el correo con la plantilla y el
     dominio correctos. Duplicar el mecanismo aqui habria dado dos correos
     distintos segun desde donde lo pidieras. */
  Future<void> _recuperar() async {
    final correo = _correo.text.trim();
    if (correo.isEmpty) {
      setState(() => _error = 'Escribí tu correo arriba y volvé a tocar "¿Olvidaste tu contraseña?".');
      return;
    }
    setState(() { _ocupado = true; _error = null; _aviso = null; });
    try {
      final r = await sb.functions.invoke('recuperar-password',
          body: {'op': 'solicitar', 'email': correo});
      final datos = r.data;
      final err = datos is Map ? datos['error'] : null;
      if (err != null) {
        setState(() => _error = err.toString());
      } else {
        setState(() {
          _recuperando = false;
          _aviso = 'Te enviamos el enlace de recuperación a $correo. Revisá tu correo.';
        });
      }
    } catch (e) {
      _fallar(e);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _salir() async {
    await sb.auth.signOut();
    Sesion.limpiar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.build_circle_outlined, size: 64),
                  const SizedBox(height: 12),
                  Text(nombreApp,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 24),
                  if (widget.retoMfa) ..._reto() else ..._credenciales(),
                  if (_aviso != null) _cajaAviso(),
                  if (_error != null) _cajaError(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _credenciales() => [
        TextField(
          controller: _correo,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(
            labelText: 'Correo',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.alternate_email),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _clave,
          obscureText: !_verClave,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _entrar(),
          decoration: InputDecoration(
            labelText: 'Contraseña',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(_verClave ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _verClave = !_verClave),
            ),
          ),
        ),
        const SizedBox(height: 18),
        FilledButton(
          onPressed: _ocupado ? null : _entrar,
          child: _ocupado
              ? const SizedBox(
                  height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Entrar'),
        ),
        TextButton(
          onPressed: _ocupado ? null : _recuperar,
          child: const Text('¿Olvidaste tu contraseña?'),
        ),
      ];

  List<Widget> _reto() => [
        const Text('Verificación 2FA',
            textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        const Text('Tu cuenta pide el código de tu app autenticadora.',
            textAlign: TextAlign.center),
        const SizedBox(height: 18),
        TextField(
          controller: _codigo,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 26, letterSpacing: 8),
          onSubmitted: (_) => _verificarCodigo(),
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            counterText: '',
            hintText: '000000',
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _ocupado ? null : _verificarCodigo,
          child: const Text('Verificar'),
        ),
        TextButton(onPressed: _salir, child: const Text('Cancelar y salir')),
      ];

  Widget _cajaAviso() => Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.green.shade400),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(_aviso!, style: const TextStyle(fontSize: 13)),
      );

  /* El error se queda en pantalla y se puede copiar: así llega entero por chat
     en vez de como "no me deja entrar". */
  Widget _cajaError() => Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.red.shade400),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('No se pudo entrar',
                style: TextStyle(color: Colors.red.shade300, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            SelectableText(_error!, style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copiar'),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: _error!));
                  ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(content: Text('Copiado')));
                },
              ),
            ),
          ],
        ),
      );
}
