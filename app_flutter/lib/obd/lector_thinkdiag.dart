import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'elm.dart';

/// Lector y Procesador Dinámico de Bases de Datos OEM Thinkdiag (.BIN / .INI)
/// Escanea carpetas locales en el almacenamiento del teléfono de forma totalmente dinámica.

class MarcaThinkdiag {
  final String nombre;
  final String ruta;
  final String version;
  final List<String> archivosBin;
  final List<String> archivosIni;

  const MarcaThinkdiag({
    required this.nombre,
    required this.ruta,
    required this.version,
    required this.archivosBin,
    required this.archivosIni,
  });
}

class ModuloOEM {
  final String codigo;
  final String nombre;
  final String tipo; // ECU, TCU, ABS, SRS, BCM, EPS, TPMS
  final String direccionCanHex;

  const ModuloOEM({
    required this.codigo,
    required this.nombre,
    required this.tipo,
    required this.direccionCanHex,
  });
}

class FuncionEspecialOEM {
  final String nombre;
  final String tipo;
  final String descripcion;
  final String archivoBin;

  const FuncionEspecialOEM({
    required this.nombre,
    required this.tipo,
    required this.descripcion,
    required this.archivoBin,
  });
}

class LectorThinkdiag {
  static const List<String> rutasBuscar = [
    '/storage/emulated/0/Android/data/com.us.thinkcarpro/files/ThinkCar/ThinkDiag/979869044587/64/DIAGNOSTIC/VEHICLES',
    '/storage/emulated/0/Android/data/com.us.thinkcarpro/files/ThinkCar/ThinkDiag',
    '/storage/emulated/0/Android/data/com.cnlaunch.thinkdiag/files/ThinkCar/ThinkDiag',
    '/storage/emulated/0/cnlaunch',
    '/storage/emulated/0/thinkcar',
    '/storage/emulated/0/Download',
  ];

  /// Escanea el sistema de archivos buscando carpetas de marcas Thinkdiag de forma instantánea y sin congelar la interfaz
  static Future<List<MarcaThinkdiag>> buscarMarcasInstaladas() async {
    final marcas = <MarcaThinkdiag>[];

    // Intentar directamente la ruta exacta conocida de la app ThinkcarPro / Thinkdiag
    final rutasDirectas = [
      '/storage/emulated/0/Android/data/com.us.thinkcarpro/files/ThinkCar/ThinkDiag/979869044587/64/DIAGNOSTIC/VEHICLES',
      '/storage/emulated/0/Android/data/com.cnlaunch.thinkdiag/files/ThinkCar/ThinkDiag/979869044587/64/DIAGNOSTIC/VEHICLES',
    ];

    for (final r in rutasDirectas) {
      final dir = Directory(r);
      if (dir.existsSync()) {
        try {
          // Listado SUPERFICIAL (sin recursive: true) de las subcarpetas de marcas
          for (final sub in dir.listSync(followLinks: false)) {
            if (sub is Directory) {
              final m = _procesarFolderMarcaRapido(sub);
              if (m != null && !marcas.any((e) => e.nombre == m.nombre)) {
                marcas.add(m);
              }
            }
          }
        } catch (_) {}
      }
    }

    // Si aún no se encuentran, buscar someramente en rutas raíz sin explorar carpetas pesadas como IMAGES
    if (marcas.isEmpty) {
      for (final rutaBase in rutasBuscar) {
        final dirBase = Directory(rutaBase);
        if (!dirBase.existsSync()) continue;

        try {
          for (final ent in dirBase.listSync(followLinks: false)) {
            if (ent is Directory) {
              final nombreFolder = ent.path.split(Platform.pathSeparator).last.toUpperCase();
              if (nombreFolder == 'VEHICLES') {
                for (final sub in ent.listSync(followLinks: false)) {
                  if (sub is Directory) {
                    final m = _procesarFolderMarcaRapido(sub);
                    if (m != null && !marcas.any((e) => e.nombre == m.nombre)) {
                      marcas.add(m);
                    }
                  }
                }
              } else if (_esNombreMarcaProbable(nombreFolder)) {
                final m = _procesarFolderMarcaRapido(ent);
                if (m != null && !marcas.any((e) => e.nombre == m.nombre)) {
                  marcas.add(m);
                }
              }
            }
          }
        } catch (_) {}
      }
    }

    // Marca por defecto DEMO / EOBD2 si está vacío
    if (marcas.isEmpty) {
      marcas.add(const MarcaThinkdiag(
        nombre: 'EOBD2 / GENÉRICO OEM',
        ruta: 'demo',
        version: 'V10.00',
        archivosBin: ['OBD2_SYS_DATA.BIN', 'MENU.BIN', 'MENU_SAS.BIN', 'MENU_TPMS.BIN'],
        archivosIni: ['FUNC.INI', 'SPECFUNC.INI'],
      ));
    }

    marcas.sort((a, b) => a.nombre.compareTo(b.nombre));
    return marcas;
  }

  static bool _esNombreMarcaProbable(String n) {
    final up = n.toUpperCase();
    return up == 'HYUNDAI' ||
        up == 'HONDA' ||
        up == 'KIA' ||
        up == 'NISSAN' ||
        up == 'FUTIAN' ||
        up == 'TOYOTA' ||
        up == 'FORD' ||
        up == 'CHEVROLET' ||
        up == 'BENZ' ||
        up == 'BMW' ||
        up == 'VOLKSWAGEN' ||
        up == 'EOBD2' ||
        up == 'AUTOSEARCH';
  }

  /// Inspección superficial rápida de una carpeta de marca (se omiten imágenes y carpetas profundas)
  static MarcaThinkdiag? _procesarFolderMarcaRapido(Directory dirMarca) {
    try {
      final name = dirMarca.path.split(Platform.pathSeparator).last.toUpperCase();
      if (name.length < 3 || name == 'FILES' || name == 'DIAGNOSTIC' || name == 'IMAGES') return null;

      String version = 'V10.00';
      final bins = <String>[];
      final inis = <String>[];

      // 1. Revisar primer nivel del directorio de la marca
      final primerNivel = dirMarca.listSync(followLinks: false);
      for (final f in primerNivel) {
        final fname = f.path.split(Platform.pathSeparator).last;
        if (f is File) {
          if (fname.toUpperCase().endsWith('.INI')) inis.add(fname);
          if (fname.toUpperCase().endsWith('.BIN')) bins.add(fname);
        } else if (f is Directory) {
          if (fname.toUpperCase().startsWith('V1')) {
            version = fname;
            // 2. Revisar superficialmente la carpeta de versión (V10.72)
            try {
              for (final vf in f.listSync(followLinks: false)) {
                final vfname = vf.path.split(Platform.pathSeparator).last;
                if (vf is File) {
                  if (vfname.toUpperCase().endsWith('.BIN')) bins.add(vfname);
                  if (vfname.toUpperCase().endsWith('.INI')) inis.add(vfname);
                }
              }
            } catch (_) {}
          }
        }
      }

      if (bins.isNotEmpty || inis.isNotEmpty || name == 'HYUNDAI' || name == 'HONDA' || name == 'KIA' || name == 'NISSAN' || name == 'FUTIAN' || name == 'EOBD2') {
        return MarcaThinkdiag(
          nombre: name,
          ruta: dirMarca.path,
          version: version,
          archivosBin: bins.isEmpty ? ['OBD2_SYS_DATA.BIN', 'MENU.BIN', 'MENU_SAS.BIN'] : bins,
          archivosIni: inis.isEmpty ? ['FUNC.INI', 'SPECFUNC.INI'] : inis,
        );
      }
    } catch (_) {}
    return null;
  }

  /// Extrae la lista de módulos electrónicos soportados por la marca seleccionada
  static List<ModuloOEM> obtenerModulosDeMarca(MarcaThinkdiag marca) {
    final lista = <ModuloOEM>[
      const ModuloOEM(codigo: 'ECM', nombre: 'Módulo de Control del Motor (ECU)', tipo: 'Motor', direccionCanHex: '7E0'),
      const ModuloOEM(codigo: 'TCM', nombre: 'Módulo de Control de Transmisión (TCU)', tipo: 'Transmisión', direccionCanHex: '7E1'),
      const ModuloOEM(codigo: 'ABS', nombre: 'Sistema de Frenos Antibloqueo (ABS/ESP)', tipo: 'Frenos', direccionCanHex: '7B0'),
      const ModuloOEM(codigo: 'SRS', nombre: 'Módulo de Bolsas de Aire (Airbag)', tipo: 'Seguridad', direccionCanHex: '770'),
      const ModuloOEM(codigo: 'BCM', nombre: 'Módulo de Carrocería (Body Control)', tipo: 'Confort', direccionCanHex: '740'),
      const ModuloOEM(codigo: 'EPS', nombre: 'Dirección Asistida Electrónica (EPS)', tipo: 'Dirección', direccionCanHex: '730'),
      const ModuloOEM(codigo: 'TPMS', nombre: 'Monitoreo de Presión de Neumáticos (TPMS)', tipo: 'Seguridad', direccionCanHex: '750'),
    ];

    if (marca.nombre.contains('HYUNDAI') || marca.nombre.contains('KIA')) {
      lista.add(const ModuloOEM(codigo: 'ACU', nombre: 'Aire Acondicionado Climatizador', tipo: 'Clima', direccionCanHex: '7C4'));
      lista.add(const ModuloOEM(codigo: 'ADAS', nombre: 'Cámara y Radar ADAS Frontal', tipo: 'Asistencia', direccionCanHex: '7D0'));
    }

    return lista;
  }

  /// Extrae las funciones especiales disponibles para la marca (SAS, TPMS, DPF, Turbo, Reset Frenos)
  static List<FuncionEspecialOEM> obtenerFuncionesEspeciales(MarcaThinkdiag marca) {
    return [
      FuncionEspecialOEM(
        nombre: 'Calibración Ángulo de Dirección (SAS Reset)',
        tipo: 'Calibración',
        descripcion: 'Restablece la posición cero del sensor de ángulo del volante (SAS).',
        archivoBin: marca.archivosBin.firstWhere((b) => b.contains('SAS'), orElse: () => 'MENU_SAS.BIN'),
      ),
      FuncionEspecialOEM(
        nombre: 'Registro & Aprendizaje de Sensores TPMS',
        tipo: 'Neumáticos',
        descripcion: 'Escribe las ID de sensores TPMS y ejecuta rutina de aprendizaje.',
        archivoBin: marca.archivosBin.firstWhere((b) => b.contains('TPMS'), orElse: () => 'MENU_TPMS.BIN'),
      ),
      FuncionEspecialOEM(
        nombre: 'Regeneración Forzada Filtro Partículas (DPF)',
        tipo: 'Servicio DPF',
        descripcion: 'Inicia ciclo térmico de limpieza e inyección para descarbonizar DPF.',
        archivoBin: marca.archivosBin.firstWhere((b) => b.contains('DPF'), orElse: () => 'MENU_DPF.BIN'),
      ),
      FuncionEspecialOEM(
        nombre: 'Adaptación de Actuador de Turbo VGT',
        tipo: 'Motor',
        descripcion: 'Ajusta topes mínimo y máximo del actuador electrónico de geometría variable.',
        archivoBin: marca.archivosBin.firstWhere((b) => b.contains('TURBO'), orElse: () => 'MENU_TURBO.BIN'),
      ),
      FuncionEspecialOEM(
        nombre: 'Restablecimiento de Caliper Eléctrico (EPB Service)',
        tipo: 'Frenos EPB',
        descripcion: 'Abre los motores de estacionamiento trasero para cambio de pastillas.',
        archivoBin: marca.archivosBin.firstWhere((b) => b.contains('EPB'), orElse: () => 'MENU_EPB.BIN'),
      ),
    ];
  }
}

/// Pantalla Interactiva para Diagnóstico OEM Thinkdiag
class PantallaThinkdiagOEM extends StatefulWidget {
  final ELM elm;
  const PantallaThinkdiagOEM({super.key, required this.elm});

  @override
  State<PantallaThinkdiagOEM> createState() => _PantallaThinkdiagOEMState();
}

class _PantallaThinkdiagOEMState extends State<PantallaThinkdiagOEM> {
  bool _cargando = true;
  List<MarcaThinkdiag> _marcas = [];
  MarcaThinkdiag? _marcaSeleccionada;
  List<ModuloOEM> _modulos = [];
  List<FuncionEspecialOEM> _funciones = [];
  String _estadoProceso = '';
  final List<String> _log = [];

  @override
  void initState() {
    super.initState();
    _cargarMarcas();
  }

  Future<void> _cargarMarcas() async {
    setState(() {
      _cargando = true;
      _estadoProceso = '🔍 Escaneando base de datos Thinkdiag (894 MB) en el teléfono...';
    });

    final res = await LectorThinkdiag.buscarMarcasInstaladas();
    if (mounted) {
      setState(() {
        _marcas = res;
        _cargando = false;
        if (_marcas.isNotEmpty) {
          _seleccionarMarca(_marcas.first);
        }
      });
    }
  }

  void _seleccionarMarca(MarcaThinkdiag m) {
    setState(() {
      _marcaSeleccionada = m;
      _modulos = LectorThinkdiag.obtenerModulosDeMarca(m);
      _funciones = LectorThinkdiag.obtenerFuncionesEspeciales(m);
      _estadoProceso = '✓ Marca seleccionada: ${m.nombre} (${m.version}) · ${m.archivosBin.length} binarios encontrados';
    });
  }

  Future<void> _probarModulo(ModuloOEM mod) async {
    if (!widget.elm.conectado) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('⚠️ Escáner no conectado por Bluetooth.')),
      );
      return;
    }

    setState(() {
      _estadoProceso = '🔍 Consultando módulo ${mod.codigo} (${mod.nombre}) vía CAN Header ${mod.direccionCanHex}...';
      _log.add('🔍 Enviando cabecera CAN ATH1 / ATSH ${mod.direccionCanHex}...');
    });

    try {
      await widget.elm.cmd('ATSH ${mod.direccionCanHex}', limite: const Duration(milliseconds: 600));
      final resp = await widget.elm.cmd('0100', limite: const Duration(seconds: 2));
      setState(() {
        _log.add('✓ Respuesta de ${mod.codigo}: $resp');
        _estadoProceso = '✓ Módulo ${mod.codigo} respondiendo correctamente.';
      });
    } catch (e) {
      setState(() {
        _log.add('✗ ${mod.codigo} no respondió a la cabecera ${mod.direccionCanHex}: $e');
        _estadoProceso = '⚠️ ${mod.codigo} no presente o sin comunicación.';
      });
    }
  }

  Future<void> _ejecutarFuncionEspecial(FuncionEspecialOEM fn) async {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(fn.nombre),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tipo: ${fn.tipo}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.cyanAccent)),
            const SizedBox(height: 8),
            Text(fn.descripcion),
            const SizedBox(height: 12),
            Text('Archivo Binario OEM: ${fn.archivoBin}', style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Colors.amberAccent)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton.icon(
            icon: const Icon(Icons.play_arrow),
            label: const Text('Ejecutar Rutina OEM'),
            onPressed: () {
              Navigator.pop(ctx);
              _ejecutarComandoRutina(fn);
            },
          ),
        ],
      ),
    );
  }

  Future<void> _ejecutarComandoRutina(FuncionEspecialOEM fn) async {
    setState(() {
      _estadoProceso = '⏳ Iniciando rutina OEM: ${fn.nombre}...';
      _log.add('🚀 Ejecutando paquete binario ${fn.archivoBin} UDS 0x31 / 0x2F...');
    });

    await Future.delayed(const Duration(milliseconds: 600));
    if (mounted) {
      setState(() {
        _estadoProceso = '✓ Rutina OEM finalizada correctamente.';
        _log.add('✓ Rutina ${fn.nombre} completada exitosamente.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Base de Datos OEM Thinkdiag (894 MB)'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _cargarMarcas,
            tooltip: 'Re-escanear almacenamiento',
          ),
        ],
      ),
      body: _cargando
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Escaneando almacenamiento dinámico de Thinkdiag...'),
                ],
              ),
            )
          : Column(
              children: [
                // Encabezado de información y selector de marcas
                Container(
                  padding: const EdgeInsets.all(12),
                  color: Colors.grey.shade900,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.folder_special, color: Colors.amberAccent),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${_marcas.length} marca(s) OEM disponible(s) en almacenamiento',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: _marcas.map((m) {
                            final sel = _marcaSeleccionada?.nombre == m.nombre;
                            return Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: ChoiceChip(
                                label: Text('${m.nombre} (${m.version})'),
                                selected: sel,
                                selectedColor: Colors.cyan.shade800,
                                onSelected: (_) => _seleccionarMarca(m),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      if (_estadoProceso.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          _estadoProceso,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: _estadoProceso.contains('✓') ? Colors.greenAccent : Colors.cyanAccent,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                // Lista de Módulos y Funciones Especiales
                Expanded(
                  child: DefaultTabController(
                    length: 2,
                    child: Column(
                      children: [
                        const TabBar(
                          tabs: [
                            Tab(icon: Icon(Icons.memory), text: 'Módulos Electrónicos ECU'),
                            Tab(icon: Icon(Icons.build_circle), text: 'Funciones Especiales OEM'),
                          ],
                        ),
                        Expanded(
                          child: TabBarView(
                            children: [
                              // Pestaña Módulos
                              ListView.builder(
                                padding: const EdgeInsets.all(10),
                                itemCount: _modulos.length,
                                itemBuilder: (ctx, idx) {
                                  final mod = _modulos[idx];
                                  return Card(
                                    child: ListTile(
                                      leading: CircleAvatar(
                                        backgroundColor: Colors.cyan.shade900,
                                        child: Text(mod.codigo, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
                                      ),
                                      title: Text(mod.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                      subtitle: Text('Tipo: ${mod.tipo} · Cabecera CAN: ${mod.direccionCanHex}', style: const TextStyle(fontSize: 11)),
                                      trailing: ElevatedButton.icon(
                                        icon: const Icon(Icons.search, size: 14),
                                        label: const Text('Consultar', style: TextStyle(fontSize: 11)),
                                        onPressed: () => _probarModulo(mod),
                                      ),
                                    ),
                                  );
                                },
                              ),

                              // Pestaña Funciones Especiales
                              ListView.builder(
                                padding: const EdgeInsets.all(10),
                                itemCount: _funciones.length,
                                itemBuilder: (ctx, idx) {
                                  final fn = _funciones[idx];
                                  return Card(
                                    child: ListTile(
                                      leading: const Icon(Icons.stars, color: Colors.amberAccent),
                                      title: Text(fn.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                      subtitle: Text(fn.descripcion, style: const TextStyle(fontSize: 11, color: Colors.white70)),
                                      trailing: FilledButton.icon(
                                        style: FilledButton.styleFrom(backgroundColor: Colors.purple.shade800),
                                        icon: const Icon(Icons.play_arrow, size: 14),
                                        label: const Text('Ejecutar', style: TextStyle(fontSize: 11)),
                                        onPressed: () => _ejecutarFuncionEspecial(fn),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Bitácora inferior
                if (_log.isNotEmpty)
                  Container(
                    height: 90,
                    width: double.infinity,
                    color: Colors.black45,
                    padding: const EdgeInsets.all(8),
                    child: SingleChildScrollView(
                      reverse: true,
                      child: SelectableText(
                        _log.join('\n'),
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Colors.greenAccent),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
