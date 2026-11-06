plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "net.giftwallet.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "net.giftwallet.app"
        minSdk = 24
        targetSdk = 34
        // 導入済み 1.4.19 と同じ versionCode。上書きでも公式 1.4.19 へ戻すときもアンインストール不要。
        // versionName は画面の機能判定が 1.4.20 になるようにする。
        versionCode = 35
        versionName = "1.4.20"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/trial-assets"))
}

val copyTrialWeb = tasks.register<Copy>("copyTrialWeb") {
    val webRoot = rootProject.projectDir.parentFile
    into(layout.buildDirectory.dir("generated/trial-assets/trial-www"))
    from(webRoot) {
        include(
            "index.html",
            "install.html",
            "manifest.json",
            "favicon.ico",
            "favicon-192.png",
            "favicon-512.png",
            "apple-touch-icon.png",
            "guide.html",
            "update_notes.html",
            "cushin-setup.html",
            "error-userids.html",
            "apn.html"
        )
    }
    from(webRoot.resolve("js")) {
        include(
            "exchange-guard.js",
            "exchange-ui.js",
            "gift-vault.js",
            "gift-vault-ui.js",
            "startup-login.js"
        )
        into("js")
    }
}

tasks.configureEach {
    if (name == "preBuild" || (name.startsWith("merge") && name.endsWith("Assets"))) {
        dependsOn(copyTrialWeb)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.11.0")
    testImplementation("junit:junit:4.13.2")
}
