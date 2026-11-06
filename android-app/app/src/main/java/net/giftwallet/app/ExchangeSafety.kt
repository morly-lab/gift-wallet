package net.giftwallet.app

import java.net.URI

/**
 * 交換の再送、ログインURL、ギフトURLの判断。画面操作とは分離してある。
 * 配布用の署名鍵やログインパスワードは扱わない。
 */
object ExchangeSafety {
    const val LOGIN_URL = "https://wallet.vaton.jp/sign_in"
    private val FIXED = mapOf(
        "au PAY" to setOf(50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000),
        "Kyash" to setOf(200, 500, 1000, 10000),
        "majica" to setOf(300, 500, 1000, 3000, 5000, 10000)
    )
    private val RANGE = setOf("Amazon", "WAON")

    val KNOWN_KINDS = setOf("au PAY", "majica", "Kyash", "Amazon", "Vポイント", "WAON")

    fun canonicalKind(kind: String): String {
        return when (kind.trim().lowercase()) {
            "kyash" -> "Kyash"
            "au pay", "aupay" -> "au PAY"
            "majica", "マジカ" -> "majica"
            else -> kind.trim()
        }
    }

    /** 在庫切れの majica は、画面で在庫ありと分かるまで受けない。 */
    fun acceptJob(kind: String, count: Int, faceYen: Int, points: Int, inputUnit: String, stockAvailable: Boolean): Boolean {
        if (count !in 1..20) return false
        val id = canonicalKind(kind)
        if (id == "Vポイント") return false
        if (inputUnit == "points") {
            if (id !in RANGE) return false
            return points in 1..10000
        }
        if (id == "majica" && !stockAvailable) return false
        val faces = FIXED[id] ?: return false
        return faceYen in faces
    }

    fun sessionContinuity(startKey: String?, nowKey: String?): Boolean {
        val start = startKey.orEmpty()
        val now = nowKey.orEmpty()
        if (start.isEmpty() && now.isEmpty()) return true
        return start.isNotEmpty() && start == now
    }

    fun authCookieMaterial(header: String?): String {
        if (header.isNullOrBlank()) return ""
        val ignore = Regex("^(?:_ga|_gid|_gat|_gcl|_clck|_clsk|__cf|cf_|clarity|sentry)", RegexOption.IGNORE_CASE)
        val auth = Regex("session|sid|auth|token|jwt|remember", RegexOption.IGNORE_CASE)
        val chosen = header.split(';').mapNotNull { part ->
            val bits = part.split('=', limit = 2)
            if (bits.size < 2) return@mapNotNull null
            val name = bits[0].trim()
            val value = bits[1].trim()
            if (name.isEmpty() || value.isEmpty()) return@mapNotNull null
            if (ignore.containsMatchIn(name) || !auth.containsMatchIn(name)) return@mapNotNull null
            "$name=$value"
        }.sorted()
        return chosen.joinToString("|")
    }

    fun sessionKey(header: String?): String {
        val material = authCookieMaterial(header)
        if (material.isEmpty()) return ""
        val md = java.security.MessageDigest.getInstance("SHA-256")
        return md.digest(material.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    /** 進行中、または未確認のロックが残っているときは新しい交換を始めない。 */
    fun canStart(alreadyRunning: Boolean, lockMode: String?): String? {
        if (alreadyRunning) return "running"
        if (lockMode == "hold" || lockMode == "unknown") return "locked"
        if (!lockMode.isNullOrBlank()) return "locked"
        return null
    }

    /**
     * 失敗ロックは弱められない。unknown を hold に戻すと、手動確認なしで再送できてしまう。
     * 受け付ける場合は保存すべきモードを返す。
     */
    fun mergeLockMode(current: String?, incoming: String): String? {
        if (incoming != "hold" && incoming != "unknown") return null
        if (current == "unknown" && incoming == "hold") return null
        return incoming
    }

    /** 残高と履歴の確認が揃うまでロックは外さない。不明な結果は手動の結論も要る。 */
    fun allowClearLock(
        mode: String,
        balanceChecked: Boolean,
        historyChecked: Boolean,
        manualResolved: String
    ): Boolean {
        if (!balanceChecked || !historyChecked) return false
        if (mode == "hold") return true
        if (mode == "unknown") {
            return manualResolved == "not_exchanged" || manualResolved == "exchanged"
        }
        return false
    }

    fun redact(text: String): String {
        return text
            .replace(Regex("https?://\\S+", RegexOption.IGNORE_CASE), "[link]")
            .replace(Regex("\\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2,}\\b"), "[code]")
            .replace(Regex("(?<![0-9])[0-9]{12,20}(?![0-9])"), "[code]")
    }

    fun isSafeHttpsGiftUrl(raw: String): Boolean {
        val s = raw.trim()
        if (s.length !in 12..2000) return false
        if (s.any { it.isWhitespace() || it == '<' || it == '>' || it == '"' || it == '\'' }) return false
        val uri = try {
            URI(s)
        } catch (_: Exception) {
            return false
        }
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        if (!uri.rawUserInfo.isNullOrEmpty()) return false
        val host = uri.host?.lowercase() ?: return false
        if (host.isBlank() || host == "localhost" || host.endsWith(".local")) return false
        if (uri.rawSchemeSpecificPart.contains('\\')) return false
        return true
    }

    /** 公式のログインページだけ。クエリにURLが入っていてもホストが違えば拒否する。 */
    fun isOfficialVatonLogin(raw: String): Boolean {
        val uri = try {
            URI(raw.trim())
        } catch (_: Exception) {
            return false
        }
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        if (!uri.host.equals("wallet.vaton.jp", ignoreCase = true)) return false
        if (!uri.rawUserInfo.isNullOrEmpty()) return false
        val path = uri.path ?: return false
        return path == "/sign_in" || path == "/login" || path == "/sign_in/" || path == "/login/"
    }
}
