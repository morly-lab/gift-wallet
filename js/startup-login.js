/*
 * 起動時の自動更新で「当日が空白」だったときのログイン案内。
 * ログインURLは 2026-11-06 の wallet.vaton.jp 本番バンドル
 * （gift-wallet-spa）で確認した。AUTHENTICATION_ERROR は H.SIGN_IN（/sign_in）へ
 * replace する。navigateLoginPage は /login。セッション切れの公式遷移先は /sign_in。
 * 空白・更新中・通信失敗だけではログイン切れにしない。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GwStartupLogin = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var LOGIN_URL = 'https://wallet.vaton.jp/sign_in';
  var MESSAGE = 'ギフトウォレットにログインしてください';

  function decideStartupLogin(input) {
    input = input || {};
    if (input.alreadyPrompted) return { show: false, navigate: false, reason: 'already' };
    if (input.phase === 'updating') return { show: false, navigate: false, reason: 'updating' };
    if (!input.todayBlank) return { show: false, navigate: false, reason: 'has_today' };
    if (input.phase === 'error' || input.auth === 'unknown') {
      return { show: false, navigate: false, reason: 'not_confirmed' };
    }
    if (input.auth === 'in') return { show: false, navigate: false, reason: 'uncharged' };
    if (input.auth === 'out') {
      return { show: true, navigate: true, reason: 'logged_out', url: LOGIN_URL, message: MESSAGE };
    }
    return { show: false, navigate: false, reason: 'not_confirmed' };
  }

  function todayIsBlank(dayAmounts) {
    if (!dayAmounts || !dayAmounts.length) return true;
    for (var i = 0; i < dayAmounts.length; i++) {
      if (Number(dayAmounts[i]) > 0) return false;
    }
    return true;
  }

  function isLoginLocation(url) {
    try {
      var u = new URL(url, 'https://wallet.vaton.jp');
      if (u.protocol !== 'https:' || u.hostname !== 'wallet.vaton.jp') return false;
      return u.pathname === '/sign_in' || u.pathname === '/login';
    } catch (e) {
      return false;
    }
  }

  function shouldNavigateToLogin(currentUrl, decision) {
    if (!decision || !decision.navigate) return false;
    if (isLoginLocation(currentUrl)) return false;
    return true;
  }

  function pageLooksLoggedOut(p) {
    p = p || {};
    var path = String(p.path || '').toLowerCase();
    if (path.indexOf('login') >= 0 || path.indexOf('sign_in') >= 0 || path.indexOf('signin') >= 0) return true;
    var t = String(p.text || '');
    if (t.indexOf('利用実績CSVダウンロード') >= 0) return false;
    if (p.hasPassword && (t.indexOf('ログイン') >= 0 || t.indexOf('メール') >= 0)) return true;
    if (t.indexOf('ログイン') >= 0 && t.indexOf('パスワード') >= 0) return true;
    return false;
  }

  function loginCompletion(p) {
    p = p || {};
    if (p.loggedOut) return { recovered: false, reason: 'logged_out' };
    if (p.hasCsvButton) return { recovered: true, reason: 'csv' };
    if (p.hasHistory) return { recovered: true, reason: 'history' };
    return { recovered: false, reason: 'unconfirmed' };
  }

  function afterLoginPlan(input) {
    input = input || {};
    if (!input.pending) return { refetch: false, goCalendar: false, clearData: false, reason: 'not_pending' };
    if (input.alreadyRefetched) return { refetch: false, goCalendar: false, clearData: false, reason: 'once' };
    if (!input.loggedIn) return { refetch: false, goCalendar: false, clearData: false, reason: 'not_logged_in' };
    return { refetch: true, goCalendar: true, clearData: false, reason: 'ok' };
  }

  function mountLoginNotice(doc) {
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') {
      return { shown: false, reason: 'no-doc' };
    }
    if (doc.getElementById('gwLoginCenter')) return { shown: false, reason: 'exists' };
    var parent = doc.body || doc.documentElement;
    if (!parent || typeof parent.appendChild !== 'function') return { shown: false, reason: 'no-body' };
    var wrap = doc.createElement('div');
    wrap.id = 'gwLoginCenter';
    if (wrap.setAttribute) {
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('style', 'position:fixed;left:12px;right:12px;top:50%;transform:translateY(-50%);z-index:2147483646;display:flex;justify-content:center;pointer-events:none;padding:0 4px;');
    }
    var card = doc.createElement('div');
    if (card.setAttribute) {
      card.setAttribute('style', 'pointer-events:none;max-width:420px;width:100%;background:#14141f;color:#fff;border:2px solid #d4a843;border-radius:18px;padding:22px 16px;text-align:center;font-size:18px;font-weight:800;line-height:1.6;box-shadow:0 12px 40px rgba(0,0,0,.55);');
    }
    card.textContent = MESSAGE;
    if (wrap.appendChild) wrap.appendChild(card);
    parent.appendChild(wrap);
    return { shown: true, text: card.textContent };
  }

  return {
    LOGIN_URL: LOGIN_URL,
    MESSAGE: MESSAGE,
    decideStartupLogin: decideStartupLogin,
    todayIsBlank: todayIsBlank,
    isLoginLocation: isLoginLocation,
    shouldNavigateToLogin: shouldNavigateToLogin,
    pageLooksLoggedOut: pageLooksLoggedOut,
    loginCompletion: loginCompletion,
    afterLoginPlan: afterLoginPlan,
    mountLoginNotice: mountLoginNotice
  };
});
