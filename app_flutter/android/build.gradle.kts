allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
/* El SDK Manager de esta maquina instalo la plataforma 37 en
   `platforms/android-37.0`, pero AGP la busca como `android-37` y falla con
   "Failed to find target with hash string 'android-37'". No es un problema de
   nuestro codigo ni de la version de Flutter: es el nombre de la carpeta.
   En vez de duplicar medio giga renombrando dentro del SDK —que es compartido
   con otros proyectos de Henry— se fija la plataforma instalada y sana.
   Si algun dia un plugin necesita de verdad una API de la 37, la salida es
   reinstalar esa plataforma con el nombre correcto, no subir esto a ciegas.

   Va ANTES de evaluationDependsOn y en el MISMO bloque: ese metodo fuerza la
   evaluacion del subproyecto, y despues de eso un afterEvaluate ya no se puede
   registrar ("Cannot run Project.afterEvaluate when the project is already
   evaluated"). El orden aqui no es estetico, es lo que hace que funcione. */
subprojects {
    afterEvaluate {
        extensions.findByName("android")?.let { ext ->
            (ext as com.android.build.gradle.BaseExtension).compileSdkVersion(36)
        }
    }
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
