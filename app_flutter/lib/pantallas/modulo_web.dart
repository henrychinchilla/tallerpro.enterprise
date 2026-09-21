import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../bluetooth/puente_bt.dart';
import '../nucleo/config.dart';

/* Pantalla genérica para cargar cualquier módulo de NexusPro Enterprise.
   Garantiza que la App Nativa tenga acceso al 100% de los 34+ módulos sin excepción
   y puentea la radio Bluetooth nativa (SPP + BLE) a window.NexusBT. */
class PantallaModuloWeb extends StatefulWidget {
  final String titulo;
  final String moduloId;
  final String? urlEspecifica;

  const PantallaModuloWeb({
    super.key,
    required this.titulo,
    required this.moduloId,
    this.urlEspecifica,
  });

  @override
  State<PantallaModuloWeb> createState() => _PantallaModuloWebState();
}

class _PantallaModuloWebState extends State<PantallaModuloWeb> {
  late final WebViewController _controller;
  bool _cargando = true;
  double _progreso = 0.0;
  StreamSubscription<String>? _subRx;
  StreamSubscription<EventoBT>? _subEvt;

  static const _metodos = MethodChannel('nexuspro/bt');

  @override
  void initState() {
    super.initState();
    final urlBase = widget.urlEspecifica ?? '$urlSitioWeb/#${widget.moduloId}';

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent('NexusProNativeApp/5.15.7 (Android)')
      ..addJavaScriptChannel(
        'NexusBTPuente',
        onMessageReceived: (JavaScriptMessage msg) async {
          try {
            final payload = jsonDecode(msg.message) as Map<String, dynamic>;
            final accion = payload['accion'] as String;

            if (accion == 'listar') {
              try {
                final r = await _metodos.invokeListMethod<dynamic>('listar') ?? [];
                final jsonStr = jsonEncode(r);
                _controller.runJavaScript(
                    'if (window.NexusBT_lista) window.NexusBT_lista(${jsonEncode(jsonStr)});');
              } catch (e) {
                final errJson = jsonEncode({"evento": "error", "detalle": e.toString()});
                _controller.runJavaScript(
                    'if (window.NexusBT_evt) window.NexusBT_evt(${jsonEncode(errJson)});');
              }
            } else if (accion == 'conectar') {
              final mac = payload['mac'] as String;
              final tipo = payload['tipo'] as String;
              try {
                await _metodos.invokeMethod('conectar', {'mac': mac, 'tipo': tipo});
              } catch (e) {
                final errJson = jsonEncode({"evento": "error", "detalle": e.toString()});
                _controller.runJavaScript(
                    'if (window.NexusBT_evt) window.NexusBT_evt(${jsonEncode(errJson)});');
              }
            } else if (accion == 'escribir') {
              final txt = payload['txt'] as String;
              await _metodos.invokeMethod('escribir', {'texto': txt});
            } else if (accion == 'desconectar') {
              await _metodos.invokeMethod('desconectar');
            }
          } catch (_) {}
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progreso = p / 100.0);
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _cargando = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _cargando = false);
            _inyectarlasFuncionesNexusBT();
          },
        ),
      )
      ..loadRequest(Uri.parse(urlBase));

    // Suscribir eventos de recepción de bytes e hilo de eventos Bluetooth
    _subRx = PuenteBT.rx.listen((datos) {
      if (mounted) {
        _controller.runJavaScript(
            'if (window.NexusBT_rx) window.NexusBT_rx(${jsonEncode(datos)});');
      }
    });

    _subEvt = PuenteBT.eventos.listen((evt) {
      if (mounted) {
        final errJson = jsonEncode({"evento": evt.evento, "detalle": evt.detalle});
        _controller.runJavaScript(
            'if (window.NexusBT_evt) window.NexusBT_evt(${jsonEncode(errJson)});');
      }
    });
  }

  void _inyectarlasFuncionesNexusBT() {
    const jsBridge = '''
      window.NexusBT = {
        estado: function() {
          return JSON.stringify({disponible: true, encendido: true, version: "5.15.7"});
        },
        listar: function() {
          window.NexusBTPuente.postMessage(JSON.stringify({accion: "listar"}));
        },
        conectar: function(mac, tipo) {
          window.NexusBTPuente.postMessage(JSON.stringify({accion: "conectar", mac: mac, tipo: tipo}));
        },
        escribir: function(txt) {
          window.NexusBTPuente.postMessage(JSON.stringify({accion: "escribir", txt: txt}));
        },
        desconectar: function() {
          window.NexusBTPuente.postMessage(JSON.stringify({accion: "desconectar"}));
        }
      };
    ''';
    _controller.runJavaScript(jsBridge);
  }

  @override
  void dispose() {
    _subRx?.cancel();
    _subEvt?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.titulo),
        actions: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 18),
            onPressed: () async {
              if (await _controller.canGoBack()) {
                await _controller.goBack();
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => _controller.reload(),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_cargando)
            LinearProgressIndicator(value: _progreso > 0 ? _progreso : null),
          Expanded(child: WebViewWidget(controller: _controller)),
        ],
      ),
    );
  }
}
