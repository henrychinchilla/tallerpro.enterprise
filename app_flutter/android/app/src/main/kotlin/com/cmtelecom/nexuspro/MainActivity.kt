package com.cmtelecom.nexuspro

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/* Conecta el puente Bluetooth nativo con Dart.
 *
 * Tres canales y no uno: los comandos son petición/respuesta (MethodChannel),
 * pero los bytes del dongle y los cambios de conexión llegan cuando el aparato
 * quiere, sin que nadie los haya pedido — eso es un EventChannel. Meterlos en
 * el canal de métodos obligaría a hacer polling, y con un ELM327 eso pierde
 * tramas: el protocolo es una conversación, no una consulta.
 *
 * Esta Activity NO tiene lógica de Bluetooth. Traduce y nada más. */
class MainActivity : FlutterActivity() {

    private var puente: PuenteBluetooth? = null
    private var sinkBytes: EventChannel.EventSink? = null
    private var sinkEventos: EventChannel.EventSink? = null

    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        val messenger = engine.dartExecutor.binaryMessenger

        puente = PuenteBluetooth(this, object : PuenteBluetooth.Salida {
            override fun bytes(texto: String) {
                sinkBytes?.success(texto)
            }

            override fun evento(nombre: String, detalle: String?) {
                sinkEventos?.success(mapOf("evento" to nombre, "detalle" to (detalle ?: "")))
            }
        })

        EventChannel(messenger, "nexuspro/bt/rx").setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(args: Any?, sink: EventChannel.EventSink?) { sinkBytes = sink }
                override fun onCancel(args: Any?) { sinkBytes = null }
            })

        EventChannel(messenger, "nexuspro/bt/evt").setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(args: Any?, sink: EventChannel.EventSink?) { sinkEventos = sink }
                override fun onCancel(args: Any?) { sinkEventos = null }
            })

        MethodChannel(messenger, "nexuspro/bt").setMethodCallHandler { llamada, resultado ->
            val p = puente
            if (p == null) {
                resultado.error("SIN_PUENTE", "El puente Bluetooth no se inicializó.", null)
                return@setMethodCallHandler
            }
            when (llamada.method) {
                "estado" -> resultado.success(p.estado())

                /* El listado tarda (barrido BLE de 5 s) y puede fallar por
                 * permisos: se contesta por callback, y un fallo viaja como
                 * error del canal para que Dart lo pueda MOSTRAR, no como una
                 * lista vacía que haría culpar al dongle. */
                "listar" -> p.listar(object : PuenteBluetooth.Listado {
                    override fun listo(filas: MutableList<MutableMap<String, Any>>) {
                        runOnUiThread { resultado.success(filas) }
                    }
                    override fun error(codigo: String, mensaje: String) {
                        runOnUiThread { resultado.error(codigo, mensaje, null) }
                    }
                })

                "conectar" -> {
                    p.conectar(llamada.argument<String>("mac"), llamada.argument<String>("tipo"))
                    resultado.success(null)   // el resultado real llega por evento
                }

                "escribir" -> {
                    p.escribir(llamada.argument<String>("texto"))
                    resultado.success(null)
                }

                "desconectar" -> {
                    p.desconectar()
                    resultado.success(null)
                }

                "imprimir" -> {
                    val html = llamada.argument<String>("html") ?: ""
                    imprimirHtml(html)
                    resultado.success(null)
                }

                /* El tablero en vivo dibuja el recorrido con el GPS del
                 * teléfono (2026-09-22). La página lo pide con
                 * navigator.geolocation y el WebView se lo pregunta a Dart;
                 * acá se pide el permiso del sistema en ese momento, no al
                 * abrir la app. Contesta true si quedó concedido. */
                "pedirUbicacion" -> pedirUbicacion(resultado)

                else -> resultado.notImplemented()
            }
        }
    }

    private var respuestaUbicacion: MethodChannel.Result? = null

    private fun pedirUbicacion(resultado: MethodChannel.Result) {
        val permisos = arrayOf(
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        )
        val concedido = permisos.any {
            checkSelfPermission(it) == android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        if (concedido) { resultado.success(true); return }
        /* Una sola pregunta a la vez: si ya hay una en curso, la anterior
         * contesta false y queda la nueva. */
        respuestaUbicacion?.success(false)
        respuestaUbicacion = resultado
        requestPermissions(permisos, PIDE_UBICACION)
    }

    private fun imprimirHtml(html: String) {
        runOnUiThread {
            try {
                val webView = android.webkit.WebView(this)
                webView.webViewClient = object : android.webkit.WebViewClient() {
                    override fun onPageFinished(view: android.webkit.WebView, url: String) {
                        val printManager = getSystemService(android.content.Context.PRINT_SERVICE) as android.print.PrintManager
                        val printAdapter = view.createPrintDocumentAdapter("Reporte_Diagnostico_OBD")
                        val jobName = "NexusPro - Reporte OBD"
                        printManager.print(jobName, printAdapter, android.print.PrintAttributes.Builder().build())
                    }
                }
                webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /* El dialogo del sistema contesta aca. Sin reenviarlo, el puente se queda
     * esperando para siempre a una respuesta que ya llego — y la pantalla no
     * vuelve a decir nada, que es exactamente el modo de fallo que esta app
     * existe para no repetir. */
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PuenteBluetooth.PIDE_PERMISOS) {
            puente?.respuestaPermisos(grantResults)
        }
        if (requestCode == PIDE_UBICACION) {
            val alguno = grantResults.any { it == android.content.pm.PackageManager.PERMISSION_GRANTED }
            respuestaUbicacion?.success(alguno)
            respuestaUbicacion = null
        }
    }

    companion object {
        /* Distinto del de PuenteBluetooth para que cada respuesta vuelva a quien la pidió. */
        const val PIDE_UBICACION = 7702
    }

    override fun onDestroy() {
        puente?.cerrar()
        super.onDestroy()
    }
}
