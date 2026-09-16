plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

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

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
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
