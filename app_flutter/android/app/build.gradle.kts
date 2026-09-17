import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

/* Credenciales de firma: viven en android/keystore.properties, FUERA de git.
   Son las mismas que usa la app anterior (nexuspro-2026.keystore, RSA 4096).
   Usarlas aqui es seguro aunque el applicationId sea distinto: la firma no
   colisiona, identifica. */
val propsFirma = Properties()
val archivoFirma = rootProject.file("keystore.properties")
if (archivoFirma.exists()) {
    archivoFirma.inputStream().use { propsFirma.load(it) }
}
val hayFirma = propsFirma.getProperty("storeFile") != null

android {
    namespace = "com.cmtelecom.nexuspro"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        /* ID DISTINTO al de la app hibrida instalada (com.cmtelecom.nexuspro),
         * a proposito: mientras la nativa no cubra todos los modulos, Henry
         * tiene que poder conservar la que ya usa y tener esta al lado para
         * comparar. Instalar encima con el mismo ID le quitaria el POS, el
         * inventario y la facturacion de un golpe.
         * Cuando la nativa este completa, esto vuelve a "com.cmtelecom.nexuspro"
         * y se firma con nexuspro-2026.keystore para que actualice en su lugar. */
        applicationId = "com.cmtelecom.nexuspro.nativa"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hayFirma) {
            create("release") {
                storeFile = rootProject.file(propsFirma.getProperty("storeFile"))
                storePassword = propsFirma.getProperty("storePassword")
                keyAlias = propsFirma.getProperty("keyAlias")
                keyPassword = propsFirma.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            /* Firmar con la llave de DEPURACION no es "temporal sin costo": un
               APK firmado asi no se puede actualizar despues con uno firmado de
               verdad — Android rechaza el cambio de firma y solo dice
               "aplicacion no instalada". Quien lo instale hoy tendria que
               desinstalar manana. Por eso se firma bien desde la primera. */
            signingConfig = if (hayFirma) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
