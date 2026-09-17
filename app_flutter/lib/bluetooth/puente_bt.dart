import 'dart:async';
import 'package:flutter/services.dart';

/* Puente Bluetooth: el lado Dart.

   Flutter NO trae Bluetooth clásico (SPP/RFCOMM). `flutter_blue_plus` es solo
   BLE y `flutter_bluetooth_serial` está sin mantenimiento hace años. Y el
   Bluetooth clásico no es opcional acá: el vLinker MS en modo MFi publica
   iAP + SPP y CERO BLE, así que sin SPP el escáner de Henry es inalcanzable.

   Por eso el transporte vive en Java, del otro lado de un platform channel, y
   es el MISMO código ya depurado contra hardware real el 2026-09-16. Lo que se
   aprendió ahí y no se vuelve a perder:
     · el canal SPP se pide por TRES caminos (SDP seguro, SDP inseguro y canal 1
       a mano), porque los clones ELM327 publican un registro SDP incompleto;
     · `requestMtu`/`discoverServices` devuelven boolean y no lanzan: ignorar el
       false deja el GATT conectado y mudo para siempre;
     · toda ruta de fallo EMITE un evento. Un catch vacío no produce un error,
       produce una espera de 30 segundos que apunta al lugar equivocado.

   Este objeto es una tubería tonta: mueve bytes. El protocolo OBD (ELM327,
   ISO-TP, DTC) va en Dart, arriba. */

/// Un aparato Bluetooth visible: emparejado (clásico) o anunciándose (BLE).
class Escaner {
  final String nombre;
  final String mac;
  final String tipo; // 'spp' | 'ble'
  final bool vinculado;
  final int rssi; // -1 si no se sabe (los emparejados no lo reportan)
  /// El puente dice explícitamente si el aparato NO tiene nombre, en vez de
  /// dejar que esto se adivine comparando el texto contra la MAC.
  final bool sinNombre;

  const Escaner({
    required this.nombre,
    required this.mac,
    required this.tipo,
    required this.vinculado,
    this.rssi = -1,
    this.sinNombre = false,
  });

  factory Escaner.desdeMapa(Map<dynamic, dynamic> m) => Escaner(
        nombre: (m['nombre'] ?? '') as String,
        mac: (m['mac'] ?? '') as String,
        tipo: (m['tipo'] ?? 'spp') as String,
        vinculado: m['vinculado'] == true,
        rssi: (m['rssi'] as int?) ?? -1,
        sinNombre: m['sin_nombre'] == true,
      );

  bool get esBle => tipo == 'ble';

  /// Un barrido BLE levanta todo lo que anuncia alrededor —llaveros, sensores
  /// de presión, audífonos— y la mayoría no publica nombre: el puente cae a la
  /// MAC. Reconocer esa sustitución es lo que permite no mezclarlos con los
  /// aparatos de verdad identificables.
  bool get anonimo {
    if (sinNombre) return true;
    final n = nombre.trim();
    if (n.isEmpty) return true;
    String hex(String t) => t.replaceAll(RegExp(r'[^0-9A-Fa-f]'), '').toUpperCase();
    return hex(n) == hex(mac);
  }

  /// Lo que se pinta en la lista. Un aparato sin nombre se muestra como lo que
  /// es —"(sin nombre)" y su MAC aparte— en vez de hacer pasar la MAC por
  /// nombre, que es lo que hacía creer que NINGÚN aparato tenía nombre.
  String get titulo => anonimo ? '(sin nombre)' : nombre.trim();

  static final _reOBD = RegExp(
      r'vlinker|vgate|obd|elm|obdlink|think|veepeak|konnwei|icar|viecar|panlong|scan',
      caseSensitive: false);

  bool get pareceOBD => _reOBD.hasMatch(nombre);

  /// Orden de probabilidad de ser EL escáner: primero los que se anuncian como
  /// tal, luego los emparejados, luego el resto, y al final los anónimos.
  int get rango => pareceOBD ? 0 : (anonimo ? 3 : (vinculado ? 1 : 2));
}

class EventoBT {
  final String evento; // 'conectado' | 'cerrado' | 'error'
  final String detalle;
  const EventoBT(this.evento, this.detalle);
}

class PuenteBT {
  static const _metodos = MethodChannel('nexuspro/bt');
  static const _entrada = EventChannel('nexuspro/bt/rx');
  static const _eventos = EventChannel('nexuspro/bt/evt');

  static Stream<String>? _rx;
  static Stream<EventoBT>? _evt;

  /// Bytes crudos que llegan del dongle, tal cual.
  static Stream<String> get rx =>
      _rx ??= _entrada.receiveBroadcastStream().map((e) => e as String);

  /// Conexión abierta / cerrada / fallida. Toda ruta de fallo pasa por acá.
  static Stream<EventoBT> get eventos => _evt ??= _eventos
      .receiveBroadcastStream()
      .map((e) => EventoBT(
            (e as Map)['evento'] as String,
            (e['detalle'] ?? '') as String,
          ));

  /// ¿Hay radio y está encendida?
  static Future<Map<String, dynamic>> estado() async {
    final r = await _metodos.invokeMapMethod<String, dynamic>('estado');
    return r ?? {'disponible': false, 'encendido': false};
  }

  /// Emparejados (clásicos) + lo que aparezca en un barrido BLE corto.
  /// Pide los permisos por su cuenta; si se niegan, lanza con el motivo real
  /// en vez de devolver una lista vacía que haría culpar al dongle.
  static Future<List<Escaner>> listar() async {
    final r = await _metodos.invokeListMethod<dynamic>('listar') ?? [];
    return r
        .map((e) => Escaner.desdeMapa(e as Map))
        .toList()
      ..sort((a, b) => a.rango.compareTo(b.rango));
  }

  static Future<void> conectar(Escaner d) =>
      _metodos.invokeMethod('conectar', {'mac': d.mac, 'tipo': d.tipo});

  static Future<void> escribir(String texto) =>
      _metodos.invokeMethod('escribir', {'texto': texto});

  static Future<void> desconectar() => _metodos.invokeMethod('desconectar');
}
