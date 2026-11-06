package net.giftwallet.app

import java.net.URI

/**
 * 交換の再送、ログインURL、ギフトURLの判断。画面操作とは分離してある。
 * 配布用の署名鍵やログインパスワードは扱わない。
 */
object ExchangeSafety {
    val ACCOUNTS = setOf("モーリー", "めぱん", "モリ母")
    val KINDS = setOf("au PAY", "majica", "Vポイント", "kyash", "Amazon", "WAON")
    const val FACE_YEN = 10000
    const val LOGIN_URL = "https://wallet.vaton.jp/sign_in"

    fun acceptJob(account: String, kind: String, count: Int, faceYen: Int): Boolean {
        if (account !in ACCOUNTS) return false
        if (kind !in KINDS) return false
        if (faceYen != FACE_YEN) return false
        if (count !in 1..20) return false
        return true
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
