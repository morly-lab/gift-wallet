package net.giftwallet.app

/**
 * 非公開試験で、公開中の gift-wallet.pages.dev の代わりに同梱ファイルを返すための判断。
 * オリジンは https://gift-wallet.pages.dev のままにする。Cookie の保管場所は分けない。
 * wallet.vaton.jp はここを通さず、これまで通りネットワークへ出す。
 */
object TrialSite {
    const val HOST = "gift-wallet.pages.dev"
    const val UI_MARK = "1.4.20-trial"

    fun isTrialHost(host: String?): Boolean {
        return host.equals(HOST, ignoreCase = true)
    }

    /** 本番APKの取得は試験版では返さない。 */
    fun isApkPath(path: String?): Boolean {
        val value = (path ?: "").substringBefore('?').substringBefore('#').lowercase()
        return value.startsWith("/dist/") && value.endsWith(".apk")
    }

    /**
     * WebView のパスを同梱ファイルの相対パスにする。
     * 拡張子の無い案内ページは .html を補う。外へ出るパスは null。
     */
    fun assetRelative(path: String?): String? {
        val raw = (path ?: "/").substringBefore('?').substringBefore('#')
        if (raw.contains('\\') || raw.contains('\u0000')) return null
        val trimmed = raw.trim()
        val withSlash = if (trimmed.isEmpty() || trimmed == "/") "/" else trimmed
        if (!withSlash.startsWith("/")) return null
        val parts = withSlash.split('/').filter { it.isNotEmpty() }
        if (parts.any { it == ".." || it == "." }) return null
        val joined = if (parts.isEmpty()) "index.html" else parts.joinToString("/")
        val file = if (!joined.substringAfterLast('/').contains('.')) "$joined.html" else joined
        if (file.endsWith("/.html")) return "index.html"
        return file
    }

    fun mime(relative: String): String {
        val name = relative.lowercase()
        return when {
            name.endsWith(".html") -> "text/html"
            name.endsWith(".js") -> "application/javascript"
            name.endsWith(".json") -> "application/json"
            name.endsWith(".css") -> "text/css"
            name.endsWith(".png") -> "image/png"
            name.endsWith(".ico") -> "image/x-icon"
            name.endsWith(".svg") -> "image/svg+xml"
            else -> "application/octet-stream"
        }
    }

    fun isText(relative: String): Boolean {
        val name = relative.lowercase()
        return name.endsWith(".html") || name.endsWith(".js") || name.endsWith(".json") ||
            name.endsWith(".css") || name.endsWith(".svg")
    }
}
