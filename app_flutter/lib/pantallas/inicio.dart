import 'package:flutter/material.dart';

import 'modulo_web.dart';

/* Pantalla principal de la App Nativa NexusPro Enterprise.
   Muestra directamente el Módulo Web Completo de Diagnóstico OBD-II & UDS Multimarca 
   con comunicación nativa Bluetooth (vLinker MS / Thinkcar 979869044587) 1:1 con la PC. */
class PantallaInicio extends StatelessWidget {
  const PantallaInicio({super.key});

  @override
  Widget build(BuildContext context) {
    return const PantallaModuloWeb(
      titulo: 'Diagnóstico OBD-II & UDS Multimarca',
      moduloId: 'diagnostico_obd',
    );
  }
}
