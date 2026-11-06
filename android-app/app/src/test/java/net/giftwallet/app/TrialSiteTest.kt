package net.giftwallet.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TrialSiteTest {
    @Test
    fun onlyExactProductionHostIsIntercepted() {
        assertTrue(TrialSite.isTrialHost("gift-wallet.pages.dev"))
        assertTrue(TrialSite.isTrialHost("Gift-Wallet.pages.dev"))
        assertFalse(TrialSite.isTrialHost("wallet.vaton.jp"))
        assertFalse(TrialSite.isTrialHost("127dcdde.gift-wallet.pages.dev"))
        assertFalse(TrialSite.isTrialHost(null))
    }

    @Test
    fun homeAndExtensionlessPagesMapToBundledHtml() {
        assertEquals("index.html", TrialSite.assetRelative("/"))
        assertEquals("index.html", TrialSite.assetRelative(""))
        assertEquals("index.html", TrialSite.assetRelative("/index.html"))
        assertEquals("js/exchange-ui.js", TrialSite.assetRelative("/js/exchange-ui.js"))
        assertEquals("install.html", TrialSite.assetRelative("/install"))
        assertEquals("guide.html", TrialSite.assetRelative("/guide.html"))
        assertEquals("manifest.json", TrialSite.assetRelative("/manifest.json"))
    }

    @Test
    fun parentPathsAreRejected() {
        assertNull(TrialSite.assetRelative("/../index.html"))
        assertNull(TrialSite.assetRelative("/js/../../index.html"))
        assertNull(TrialSite.assetRelative("/js/./exchange-ui.js"))
    }

    @Test
    fun productionApkPathsAreBlocked() {
        assertTrue(TrialSite.isApkPath("/dist/gift-wallet.apk"))
        assertTrue(TrialSite.isApkPath("/dist/gift-wallet-1.4.19.apk"))
        assertTrue(TrialSite.isApkPath("/dist/gift-wallet-1.4.18.apk"))
        assertFalse(TrialSite.isApkPath("/js/exchange-ui.js"))
        assertFalse(TrialSite.isApkPath("/install"))
        assertFalse(TrialSite.isApkPath("/"))
    }
}
