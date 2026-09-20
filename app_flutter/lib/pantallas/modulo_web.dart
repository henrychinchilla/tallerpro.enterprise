import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../nucleo/config.dart';

/* Pantalla genérica para cargar cualquier módulo de NexusPro Enterprise.
   Garantiza que la App Nativa tenga acceso al 100% de los 34+ módulos sin excepción. */
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

  @override
  void initState() {
    super.initState();
    final urlBase = widget.urlEspecifica ?? '$urlSitioWeb/#${widget.moduloId}';
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent('NexusProNativeApp/5.15.7 (Android)')
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
          },
        ),
      )
      ..loadRequest(Uri.parse(urlBase));
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
