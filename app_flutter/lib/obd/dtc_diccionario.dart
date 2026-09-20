/* Catálogo y diccionario de códigos de falla DTC (SAE J2012)
   Contiene descripciones, procedimientos de reparación y enlaces de guía de YouTube. */

class InfoDTC {
  final String codigo;
  final String titulo;
  final String descripcion;
  final String gravedad; // 'critico' | 'advertencia' | 'info'
  final String sistema;
  final String procedimiento;
  final String youtubeQuery;

  const InfoDTC({
    required this.codigo,
    required this.titulo,
    required this.descripcion,
    required this.gravedad,
    required this.sistema,
    required this.procedimiento,
    required this.youtubeQuery,
  });

  String get youtubeUrl =>
      'https://www.youtube.com/results?search_query=${Uri.encodeComponent(youtubeQuery)}';
}

class DiccionarioDTC {
  static const Map<String, InfoDTC> _baseDTC = {
    'P0420': InfoDTC(
      codigo: 'P0420',
      titulo: 'Eficiencia del Catalizador por Debajo del Umbral (Banco 1)',
      descripcion: 'El módulo ECM detectó que la eficiencia del convertidor catalítico en el Banco 1 es menor a los parámetros del fabricante.',
      gravedad: 'advertencia',
      sistema: 'Motor (ECM / Tren Motriz)',
      procedimiento: '1. Inspeccionar fugas en el tubo de escape antes del catalizador.\n2. Verificar voltaje de respuesta de sensores de oxígeno O2 B1S1 y B1S2.\n3. Probar si hay fallas de encendido (misfire) o mezcla rica/pobre que dañaron el sustrato del catalizador.\n4. Reemplazar o lavar catalizador y reprogramar adaptaciones de fuel trim.',
      youtubeQuery: 'reparar codigo P0420 catalizador hyundai accent',
    ),
    'C0004': InfoDTC(
      codigo: 'C0004',
      titulo: 'Circuito Solenoide de Control ABS / Chasis',
      descripcion: 'Falla o interrupción en el circuito de control del solenoide o válvula del módulo de frenos ABS.',
      gravedad: 'critico',
      sistema: 'Frenos y Chasis (ABS / ESC)',
      procedimiento: '1. Verificar la integridad del conector eléctrico del bloque hidráulico ABS.\n2. Medir resistencia en las bobinas de los solenoides ABS.\n3. Inspeccionar tierras del módulo ABS y fusibles de potencia en caja principal.\n4. Realizar prueba de purgado de actuadores mediante comando UDS.',
      youtubeQuery: 'reparar codigo C0004 ABS solenoide hyundai accent',
    ),
    'U2055': InfoDTC(
      codigo: 'U2055',
      titulo: 'Falla de Comunicación en Bus Red CAN (BCM / Módulos)',
      descripcion: 'Pérdida de paquetes de comunicación o cortocircuito en las líneas CAN High / Low que conectan los módulos del vehículo.',
      gravedad: 'critico',
      sistema: 'Red de Comunicación CAN (UDS / BCM)',
      procedimiento: '1. Desconectar batería y medir resistencia entre pin 6 y 14 del DLC OBD-II (debe dar 60 Ohmios).\n2. Inspeccionar arnés entre módulo de carrocería (BCM) y la red de vehículo.\n3. Verificar voltaje CAN-H (~2.5V - 3.5V) y CAN-L (~1.5V - 2.5V) con osciloscopio o multímetro.\n4. Aislar módulo con falla en la red.',
      youtubeQuery: 'reparar codigo U2055 red CAN bus comunicacion',
    ),
    'C1555': InfoDTC(
      codigo: 'C1555',
      titulo: 'Falla Interna / Relevador Módulo EPS (Dirección Asistida Electrónica)',
      descripcion: 'Falla de alimentación o rele interno de la unidad de control de la dirección electroasistida (EPS).',
      gravedad: 'critico',
      sistema: 'Dirección Asistida (EPS / MDPS)',
      procedimiento: '1. Verificar fusible de alta intensidad (40A/60A EPS) en caja del motor.\n2. Medir masa y +12V directo de batería en conector principal de la ECU EPS.\n3. Inspeccionar motor eléctrico de dirección y sensor de par/ángulo de volante.\n4. Reemplazar relevador de dirección asistida o tarjeta electrónica del módulo EPS.',
      youtubeQuery: 'reparar codigo C1555 direccion asistida EPS hyundai accent',
    ),
    'P02D1': InfoDTC(
      codigo: 'P02D1',
      titulo: 'Inyector de Combustible Cilindro 5 - Compensación al Límite Máximo',
      descripcion: 'El ECM alcanzó el límite de corrección de tiempo de inyección para el inyector del cilindro 5 (o desbalance de inyección).',
      gravedad: 'critico',
      sistema: 'Inyección de Combustible (ECM)',
      procedimiento: '1. Realizar balance de inyectores y prueba de entrega en laboratorio de ultrasonido.\n2. Medir resistencia de la bobina o piezoeléctrico del inyector (12-16 Ohmios inductivos o alta impedancia).\n3. Inspeccionar pulso de inyección desde la computadora ECM con lámpara lógica.\n4. Verificar compresión de cilindro y cambiar inyector defectuoso.',
      youtubeQuery: 'reparar codigo P02D1 inyector combustible hyundai accent',
    ),
  };

  static InfoDTC buscar(String codigo) {
    final c = codigo.toUpperCase().trim();
    if (_baseDTC.containsKey(c)) {
      return _baseDTC[c]!;
    }

    // Generador dinámico para códigos genéricos SAE J2012
    final l = c.isNotEmpty ? c[0] : 'P';
    String sis;
    switch (l) {
      case 'C': sis = 'Chasis / ABS / Suspensión'; break;
      case 'B': sis = 'Carrocería / BCM / Confort'; break;
      case 'U': sis = 'Red de Comunicación CAN / Red Módulos'; break;
      default: sis = 'Tren Motriz / Motor / Transmisión'; break;
    }

    return InfoDTC(
      codigo: c,
      titulo: 'Código de Falla DTC $c',
      descripcion: 'Código de falla estándar reportado por la ECU del vehículo ($sis).',
      gravedad: 'advertencia',
      sistema: sis,
      procedimiento: '1. Inspeccionar sensores y arneses eléctricos asociados a $sis.\n2. Verificar voltajes de referencia de 5V y tierras de la ECU.\n3. Borrar código y realizar prueba de manejo para comprobar reaparición.',
      youtubeQuery: 'como reparar codigo DTC $c diagnostico automotriz',
    );
  }
}
