package net.giftwallet.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExchangeSafetyTest {
    @Test
    fun jobRequiresKnownAccountKindAndFace() {
        assertTrue(ExchangeSafety.acceptJob("モーリー", "kyash", 1, 10000))
        assertTrue(ExchangeSafety.acceptJob("めぱん", "majica", 2, 10000))
        assertTrue(ExchangeSafety.acceptJob("モリ母", "Vポイント", 5, 10000))
        assertFalse(ExchangeSafety.acceptJob("その他", "kyash", 1, 10000))
        assertFalse(ExchangeSafety.acceptJob("モーリー", "unknown-brand", 1, 10000))
        assertFalse(ExchangeSafety.acceptJob("モーリー", "kyash", 1, 9700))
        assertFalse(ExchangeSafety.acceptJob("モーリー", "kyash", 0, 10000))
    }

    @Test
    fun runningOrLockedExchangeCannotRestart() {
        assertEquals("running", ExchangeSafety.canStart(alreadyRunning = true, lockMode = null))
        assertEquals("locked", ExchangeSafety.canStart(alreadyRunning = false, lockMode = "unknown"))
        assertEquals("locked", ExchangeSafety.canStart(alreadyRunning = false, lockMode = "hold"))
        assertNull(ExchangeSafety.canStart(alreadyRunning = false, lockMode = null))
        assertNull(ExchangeSafety.canStart(alreadyRunning = false, lockMode = ""))
    }

    @Test
    fun unknownLockCannotBeWeakened() {
        assertNull(ExchangeSafety.mergeLockMode("unknown", "hold"))
        assertEquals("unknown", ExchangeSafety.mergeLockMode("hold", "unknown"))
        assertEquals("hold", ExchangeSafety.mergeLockMode(null, "hold"))
        assertNull(ExchangeSafety.mergeLockMode(null, "clear"))
    }

    @Test
    fun clearLockNeedsBalanceHistoryAndManualResult() {
        assertFalse(ExchangeSafety.allowClearLock("hold", balanceChecked = false, historyChecked = true, manualResolved = "not_exchanged"))
        assertFalse(ExchangeSafety.allowClearLock("hold", balanceChecked = true, historyChecked = false, manualResolved = "not_exchanged"))
        assertTrue(ExchangeSafety.allowClearLock("hold", balanceChecked = true, historyChecked = true, manualResolved = ""))
        assertFalse(ExchangeSafety.allowClearLock("unknown", balanceChecked = true, historyChecked = true, manualResolved = "unknown"))
        assertFalse(ExchangeSafety.allowClearLock("unknown", balanceChecked = true, historyChecked = true, manualResolved = ""))
        assertTrue(ExchangeSafety.allowClearLock("unknown", balanceChecked = true, historyChecked = true, manualResolved = "not_exchanged"))
        assertTrue(ExchangeSafety.allowClearLock("unknown", balanceChecked = true, historyChecked = true, manualResolved = "exchanged"))
    }

    @Test
    fun redactRemovesLinksAndCodes() {
        val text = ExchangeSafety.redact("失敗 https://gift.example.jp/a ABCD-EFGH-IJKL-MNOP 1234567890123456")
        assertFalse(text.contains("https://"))
        assertFalse(text.contains("ABCD-EFGH"))
        assertFalse(text.contains("1234567890123456"))
        assertTrue(text.contains("[link]"))
        assertTrue(text.contains("[code]"))
    }

    @Test
    fun giftUrlMustBeHttpsWithoutCredentials() {
        assertTrue(ExchangeSafety.isSafeHttpsGiftUrl("https://gift.example.jp/g/1"))
        assertFalse(ExchangeSafety.isSafeHttpsGiftUrl("http://gift.example.jp/g/1"))
        assertFalse(ExchangeSafety.isSafeHttpsGiftUrl("javascript:alert(1)"))
        assertFalse(ExchangeSafety.isSafeHttpsGiftUrl("https://user:pass@gift.example.jp/g/1"))
        assertFalse(ExchangeSafety.isSafeHttpsGiftUrl("https://localhost/g/1"))
        assertFalse(ExchangeSafety.isSafeHttpsGiftUrl("https://gift.example.jp/a b"))
    }

    @Test
    fun loginUrlIsOnlyOfficialHostAndPath() {
        assertTrue(ExchangeSafety.isOfficialVatonLogin(ExchangeSafety.LOGIN_URL))
        assertTrue(ExchangeSafety.isOfficialVatonLogin("https://wallet.vaton.jp/login"))
        assertFalse(ExchangeSafety.isOfficialVatonLogin("https://wallet.vaton.jp.evil.com/sign_in"))
        assertFalse(ExchangeSafety.isOfficialVatonLogin("https://evil.example/redirect?to=https://wallet.vaton.jp/sign_in"))
        assertFalse(ExchangeSafety.isOfficialVatonLogin("https://wallet.vaton.jp/point/point_logs"))
        assertFalse(ExchangeSafety.isOfficialVatonLogin("http://wallet.vaton.jp/sign_in"))
        assertFalse(ExchangeSafety.isOfficialVatonLogin("https://user:pass@wallet.vaton.jp/sign_in"))
    }
}
