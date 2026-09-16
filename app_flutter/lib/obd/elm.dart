import 'dart:async';
import '../bluetooth/puente_bt.dart';

/* Driver ELM327 sobre el puente Bluetooth.

   Todo lo que llega del dongle entra por UN solo lugar (`_recibir`) venga de
   SPP o de BLE. Está así a propósito: cuando esta lógica vivía dentro del
   listener de un transporte, cada transporte nuevo tenía que copiarla, y una
   copia desincronizada de esto no falla — CONTESTA MAL, que es peor.

   La bitácora no es un extra ni se enciende con un flag: se llena siempre. La
   falla más común de un escáner en el taller es no llegar a conectar, y hasta
   hoy ese caso era justamente el que no dejaba nada que mandar a soporte. */

class EntradaTraza {
  final String? peticion;
  final String? respuesta;
  final String? nota;
  const EntradaTraza.dialogo(this.peticion, this.respuesta) : nota = null;
  const EntradaTraza.apunte(this.nota) : peticion = null, respuesta = null;

  @override
  String toString() => nota != null ? '# $nota' : '> $peticion\n< $respuesta';
}

class ELM {
  StreamSubscription<String>? _subRx;
  StreamSubscription<EventoBT>? _subEvt;

  String _buf = '';
  Completer<String>? _esperando;
  bool _ocupado = false;
  bool conectado = false;

  /// Tope a propósito: un barrido son cientos de direcciones y volcarlas todas
  /// ahoga lo único que importa.
  static const _topeTraza = 400;
  final List<EntradaTraza> traza = [];

  void _trazar(String q, String r) {
    if (traza.length >= _topeTraza) return;
    traza.add(EntradaTraza.dialogo(q, r.replaceAll(RegExp(r'[\r\n]+'), ' | ').trim()));
  }

  void apuntar(String nota) {
    if (traza.length < _topeTraza) traza.add(EntradaTraza.apunte(nota));
  }

  void engancharse() {
    _subRx ??= PuenteBT.rx.listen(_recibir);
    _subEvt ??= PuenteBT.eventos.listen((e) {
      if (e.evento == 'conectado') conectado = true;
      if (e.evento == 'cerrado' || e.evento == 'error') conectado = false;
    });
  }

  Future<void> soltar() async {
    await _subRx?.cancel();
    await _subEvt?.cancel();
    _subRx = null;
    _subEvt = null;
    conectado = false;
  }

  void _recibir(String texto) {
    _buf += texto;
    /* El ELM327 termina cada respuesta con el prompt '>'. Es lo único que
       marca "ya terminé de hablar": esperar por tiempo en vez de por el prompt
       parte las respuestas largas a la mitad. */
    if (_buf.contains('>') && _esperando != null && !_esperando!.isCompleted) {
      final c = _esperando!;
      _esperando = null;
      c.complete(_buf.replaceAll('>', '').trim());
    }
  }

  /// Manda un comando y espera la respuesta completa.
  Future<String> cmd(String c, {Duration limite = const Duration(seconds: 6)}) async {
    try {
      final r = await _cmdCrudo(c, limite);
      _trazar(c, r);
      return r;
    } catch (e) {
      _trazar(c, 'ERROR: $e');
      rethrow;
    }
  }

  Future<String> _cmdCrudo(String c, Duration limite) async {
    if (!conectado) throw Exception('El escáner no está conectado.');
    /* Uno a la vez: dos comandos encimados mezclan sus respuestas en el mismo
       buffer y el segundo se lee como continuación del primero. */
    while (_ocupado) {
      await Future<void>.delayed(const Duration(milliseconds: 40));
    }
    _ocupado = true;
    _buf = '';
    try {
      final completer = Completer<String>();
      _esperando = completer;
      await PuenteBT.escribir('$c\r');
      return await completer.future.timeout(limite, onTimeout: () {
        _esperando = null;
        throw TimeoutException('Sin respuesta a $c');
      });
    } finally {
      _ocupado = false;
    }
  }

  /// Sonda inocua: le habla al DONGLE, no al vehículo, así que no toca ninguna
  /// ECU. Es lo único que separa "hay enlace" de "parece que hay enlace" —
  /// abrir el socket no prueba nada: abre igual contra unos audífonos.
  Future<String> sondear() async {
    var r = await cmd('ATI', limite: const Duration(seconds: 4)).catchError((_) => '');
    if (r.trim().isEmpty) {
      r = await cmd('ATZ', limite: const Duration(seconds: 5)).catchError((_) => '');
    }
    return r.replaceAll(RegExp(r'[\r\n>]+'), ' ').trim();
  }

  /// Puesta a punto y detección del protocolo del vehículo.
  /// Devuelve el nombre del protocolo que reportó el adaptador.
  Future<String> iniciar(void Function(String) log) async {
    log('Reiniciando adaptador (ATZ)…');
    await cmd('ATZ', limite: const Duration(seconds: 8));
    /* ATE0 apaga el eco. Sin eso, cada respuesta viene con el comando pegado
       adelante, y como un comando OBD es hexadecimal (0100, 0902…), el lector
       lo toma por datos del vehículo y los mezcla con la respuesta real. */
    for (final c in ['ATE0', 'ATL0', 'ATS0', 'ATH0']) {
      await cmd(c);
    }
    await cmd('ATSP0'); // autoprotocolo

    log('Buscando el protocolo del vehículo…');
    var r = '';
    for (var intento = 1; intento <= 2; intento++) {
      r = await cmd('0100', limite: const Duration(seconds: 20));
      final limpio = r.replaceAll(RegExp(r'\s'), '');
      if (!RegExp(r'UNABLE|ERROR|NO DATA', caseSensitive: false).hasMatch(r) ||
          limpio.contains('4100')) {
        break;
      }
      /* Las ECU viejas (ISO/KWP) suelen contestar recién al segundo intento. */
      if (intento == 1) {
        log('Sin respuesta, reintentando…');
        await cmd('ATSP0');
      }
    }
    final limpio = r.replaceAll(RegExp(r'\s'), '');
    if (RegExp(r'UNABLE|ERROR|NO DATA', caseSensitive: false).hasMatch(r) &&
        !limpio.contains('4100')) {
      throw Exception(
          'El escáner responde, pero el vehículo no contesta. Revisá el switch en '
          'contacto y que el dongle esté bien metido en el conector de diagnóstico.');
    }
    final dp = await cmd('ATDP');
    return dp.replaceAll(RegExp(r'AUTO,?\s*', caseSensitive: false), '').trim();
  }

  /// Deja solo las líneas hexadecimales, quitando los prefijos de trama
  /// multilínea ('0:', '1:'…) que usa el ELM para respuestas largas.
  List<String> _hexLineas(String resp) => resp
      .split(RegExp(r'[\r\n]+'))
      .map((l) => l
          .trim()
          .replaceAll(RegExp(r'^[0-9A-F]{1,2}:', caseSensitive: false), '')
          .replaceAll(RegExp(r'[^0-9A-Fa-f]'), '')
          .toUpperCase())
      .where((l) => l.length >= 2)
      .toList();

  Future<String?> leerVIN() async {
    try {
      final hex = _hexLineas(await cmd('0902', limite: const Duration(seconds: 8))).join();
      final i = hex.indexOf('4902');
      if (i < 0) return null;
      final sb = StringBuffer();
      // +6 salta '4902' más el número de secuencia.
      for (var p = i + 6; p + 1 < hex.length; p += 2) {
        final ch = String.fromCharCode(int.parse(hex.substring(p, p + 2), radix: 16));
        if (RegExp(r'[A-HJ-NPR-Z0-9]').hasMatch(ch)) sb.write(ch);
      }
      final vin = sb.toString();
      return vin.length >= 17 ? vin.substring(0, 17) : (vin.isEmpty ? null : vin);
    } catch (_) {
      return null;
    }
  }

  /// Códigos de falla. `modo` es '03' (confirmados) o '07' (pendientes).
  Future<List<String>> leerDTCs(String modo) async {
    final resp = await cmd(modo, limite: const Duration(seconds: 10)).catchError((_) => '');
    final hex = _hexLineas(resp).join();
    final marca = modo == '03' ? '43' : '47';
    final i = hex.indexOf(marca);
    if (i < 0) return [];
    final codigos = <String>[];
    for (var p = i + 2; p + 3 < hex.length; p += 4) {
      final crudo = hex.substring(p, p + 4);
      if (crudo == '0000') continue;
      final c = _decodificarDTC(crudo);
      if (c != null && !codigos.contains(c)) codigos.add(c);
    }
    return codigos;
  }

  /// Dos bytes → 'P0301'. Los 2 bits más altos dicen el sistema y los 2
  /// siguientes el primer dígito; es el formato de SAE J2012.
  String? _decodificarDTC(String crudo) {
    if (crudo.length != 4) return null;
    final n = int.tryParse(crudo, radix: 16);
    if (n == null) return null;
    const sistemas = ['P', 'C', 'B', 'U'];
    final letra = sistemas[(n >> 14) & 0x03];
    final d1 = (n >> 12) & 0x03;
    final resto = (n & 0x0FFF).toRadixString(16).toUpperCase().padLeft(3, '0');
    return '$letra$d1$resto';
  }

  /// Texto plano a propósito: se pega en WhatsApp o en un correo sin romperse,
  /// que es como va a llegar desde el taller.
  String bitacora({String? protocolo, String? adaptador, String? vin}) {
    final l = <String>[
      'NexusPro — bitácora técnica del escaneo',
      'fecha: ${DateTime.now().toIso8601String()}',
      'adaptador: ${adaptador ?? '?'}  protocolo: ${protocolo ?? '?'}',
      'VIN: ${vin ?? '—'}',
      '',
      '--- diálogo (${traza.length} entradas) ---',
      ...traza.map((t) => t.toString()),
    ];
    if (traza.length >= _topeTraza) l.add('# (cortado en el tope)');
    return l.join('\n');
  }
}
