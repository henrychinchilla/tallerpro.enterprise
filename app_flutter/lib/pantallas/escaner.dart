import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../bluetooth/puente_bt.dart';
import '../obd/elm.dart';

/* Escáner OBD-II.

   El orden de la pantalla es el orden del diagnóstico, y no es casual. Separa
   las tres cosas que "no conecta" confunde y que hacen perder tardes enteras:
     1. ¿el teléfono ve el dongle?          (la lista)
     2. ¿el dongle contesta?                (la sonda ATI, cruda en pantalla)
     3. ¿el vehículo contesta?              (0100 y el resto)

   Nada dice "conectado" hasta que el dongle haya hablado. Abrir un socket no
   prueba nada: abre igual contra unos audífonos. */
class PantallaEscaner extends StatefulWidget {
  const PantallaEscaner({super.key});
  @override
  State<PantallaEscaner> createState() => _PantallaEscanerState();
}

class _PantallaEscanerState extends State<PantallaEscaner> {
  final _elm = ELM();
  final _log = <String>[];

  bool _ocupado = false;
  bool _verAnonimos = false;
  List<Escaner> _lista = [];
  Escaner? _elegido;
  String? _protocolo;
  String? _vin;

  @override
  void initState() {
    super.initState();
    _elm.engancharse();
  }

  @override
  void dispose() {
    PuenteBT.desconectar();
    _elm.soltar();
    super.dispose();
  }

  void _p(String linea) {
    _elm.apuntar(linea);
    if (mounted) setState(() => _log.add(linea));
  }

  Future<void> _buscar() async {
    if (_ocupado) return;
    setState(() { _ocupado = true; _lista = []; _elegido = null; });
    try {
      /* Los permisos los pide el puente, con el aparato enfrente y justo antes
         de usarlos; si se niegan, `listar` lanza con el motivo real en vez de
         devolver una lista vacía que haría culpar al dongle. */
      final est = await PuenteBT.estado();
      if (est['disponible'] != true) { _p('✗ Este teléfono no tiene Bluetooth.'); return; }
      if (est['encendido'] != true) { _p('✗ El Bluetooth está apagado. Encendelo y reintentá.'); return; }

      _p('Buscando escáneres (emparejados y BLE cercanos)…');
      final l = await PuenteBT.listar();
      setState(() => _lista = l);
      final identificables = l.where((d) => !d.anonimo).length;
      _p('${l.length} aparato(s) alrededor · $identificables con nombre.');
      if (l.every((d) => d.anonimo)) {
        _p('Ninguno publica nombre. Si tu escáner es de Bluetooth clásico, '
            'emparejalo primero en los ajustes del teléfono.');
      }
    } on PlatformException catch (e) {
      /* El puente manda el motivo real (permiso, radio apagada, barrido que no
         arrancó). Mostrarlo es la diferencia entre arreglarlo y adivinar. */
      _p('✗ ${e.message ?? e.code}');
    } catch (e) {
      _p('✗ $e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _conectarYProbar(Escaner d) async {
    if (_ocupado) return;
    setState(() { _ocupado = true; _elegido = d; });
    try {
      _p('Conectando a ${d.nombre} (${d.esBle ? 'BLE' : 'Bluetooth clásico'})…');

      /* El puente contesta por evento, no por retorno. El orden importa y es
         fácil de invertir: hay que quedarse ESCUCHANDO primero y recién después
         pedir la conexión. Al revés —esperar el evento y luego llamar a
         conectar— nadie dispara nada y la espera muere en el timeout.
         `eventos` es un stream de difusión, así que `.first` ya se suscribe al
         crear el futuro, aunque todavía no se lo espere.
         El timeout propio es el cinturón: el puente emite en TODA ruta de
         fallo, pero si algún día dejara de hacerlo, esto avisa en vez de dejar
         la pantalla colgada — que fue exactamente el bug de la app anterior. */
      final futuroEvento = PuenteBT.eventos.first
          .timeout(const Duration(seconds: 30), onTimeout: () =>
              const EventoBT('error', 'El puente Bluetooth no contestó a tiempo.'));
      await PuenteBT.conectar(d);
      final evt = await futuroEvento;
      if (evt.evento != 'conectado') { _p('✗ ${evt.detalle}'); return; }

      _p('Socket abierto. Preguntándole al escáner quién es (ATI)…');
      final sonda = await _elm.sondear();
      if (sonda.isEmpty) {
        _p('✗ Se abrió el Bluetooth con ${d.nombre}, pero no contestó ni a ATI ni a ATZ: '
            'NO hay enlace con un escáner OBD. Lo más común es haber elegido el aparato '
            'equivocado (manos libres, audífonos). Si es el correcto, desenchufalo del '
            'vehículo, volvé a enchufarlo y reintentá.');
        await PuenteBT.desconectar();
        return;
      }
      _p('✓ El escáner contesta: $sonda');

      _p('Poniendo a punto y buscando el protocolo del vehículo…');
      final proto = await _elm.iniciar(_p);
      setState(() => _protocolo = proto);
      _p('✓ Protocolo: $proto');

      final vin = await _elm.leerVIN();
      setState(() => _vin = vin);
      _p(vin != null ? 'VIN: $vin' : 'VIN no disponible en este vehículo.');

      final conf = await _elm.leerDTCs('03');
      final pend = await _elm.leerDTCs('07');
      _p('${conf.length} código(s) confirmado(s), ${pend.length} pendiente(s).');
      if (conf.isNotEmpty) _p('  Confirmados: ${conf.join(', ')}');
      if (pend.isNotEmpty) _p('  Pendientes: ${pend.join(', ')}');
      _p('✓ Escaneo terminado.');
    } catch (e) {
      _p('✗ $e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  void _copiarBitacora() {
    final txt = _elm.bitacora(
        protocolo: _protocolo, adaptador: _elegido?.nombre, vin: _vin);
    Clipboard.setData(ClipboardData(text: txt));
    ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitácora copiada — pegala en el chat de soporte')));
  }

  @override
  Widget build(BuildContext context) {
    final probables = _lista.where((d) => d.rango < 3).toList();
    final anonimos = _lista.where((d) => d.rango == 3).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Diagnóstico OBD-II'),
        actions: [
          /* El botón existe siempre, no solo cuando hubo diálogo con el
             vehículo: la falla más común es no llegar a conectar, y hasta hoy
             ese caso era justamente el que no dejaba nada que mandar. */
          IconButton(
            tooltip: 'Copiar bitácora técnica',
            icon: const Icon(Icons.receipt_long),
            onPressed: _copiarBitacora,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              onPressed: _ocupado ? null : _buscar,
              icon: const Icon(Icons.search),
              label: Text(_ocupado ? 'Trabajando…' : 'Buscar escáneres'),
            ),
          ),
          if (probables.isNotEmpty)
            ...probables.map(_fila),
          if (anonimos.isNotEmpty)
            ExpansionTile(
              title: Text('${anonimos.length} aparato(s) sin nombre'),
              subtitle: const Text(
                  'Solo publican su MAC. Casi siempre son llaveros o audífonos.',
                  style: TextStyle(fontSize: 11)),
              initiallyExpanded: _verAnonimos,
              onExpansionChanged: (v) => _verAnonimos = v,
              children: anonimos.map(_fila).toList(),
            ),
          const Divider(height: 1),
          Expanded(
            child: Container(
              width: double.infinity,
              color: Colors.black26,
              padding: const EdgeInsets.all(12),
              child: SingleChildScrollView(
                reverse: true,
                child: SelectableText(
                  _log.isEmpty ? 'Enchufá el escáner al vehículo, poné el switch en\ncontacto y tocá "Buscar escáneres".' : _log.join('\n'),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _fila(Escaner d) => ListTile(
        dense: true,
        leading: Icon(d.esBle ? Icons.bluetooth : Icons.settings_input_antenna,
            color: d.pareceOBD ? Colors.green : null),
        title: Text(d.anonimo ? '(sin nombre)' : d.nombre),
        subtitle: Text([
          d.esBle ? 'BLE' : 'Bluetooth clásico (SPP)',
          d.vinculado ? 'emparejado' : 'no emparejado',
          if (d.rssi != -1) '${d.rssi} dBm',
          d.mac,
        ].join(' · '), style: const TextStyle(fontSize: 11)),
        trailing: d.pareceOBD
            ? const Chip(label: Text('parece OBD', style: TextStyle(fontSize: 10)))
            : null,
        onTap: _ocupado ? null : () => _conectarYProbar(d),
      );
}
