/*
 * ログインページに中央案内を出し、ログイン完了が確認できたときだけホームへ戻す。
 * 資格情報は読まない。
 */
(function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  var S = root.GwStartupLogin;
  var G = root.GiftWallet;
  if (!S || !G || !G.loginRecoverPending || !root.document) return;
  var pending = '';
  try { pending = G.loginRecoverPending() || ''; } catch (e) { return; }
  if (pending !== '1') return;
  if (S.isLoginLocation(root.location && root.location.href)) S.mountLoginNotice(root.document);

  var n = 0;
  function tick() {
    if (root.__gwLoginRecoverSent) return;
    n++;
    var path = (root.location && root.location.pathname) || '';
    var text = '';
    try { text = root.document.body ? (root.document.body.innerText || '') : ''; } catch (e) { text = ''; }
    var hasPassword = false;
    try { hasPassword = !!root.document.querySelector('input[type="password"]'); } catch (e2) { hasPassword = false; }
    var loggedOut = S.pageLooksLoggedOut({ path: path, text: text, hasPassword: hasPassword });
    var hasCsv = false;
    var hasHistory = false;
    try {
      var nodes = root.document.querySelectorAll('button,a');
      for (var i = 0; i < nodes.length; i++) {
        var t = ((nodes[i].innerText || nodes[i].textContent || '') + '').replace(/\s+/g, ' ').trim();
        if (t === '利用実績CSVダウンロード') hasCsv = true;
      }
      hasHistory = text.indexOf('ポイント履歴') >= 0;
    } catch (e3) {}
    var done = S.loginCompletion({ loggedOut: loggedOut, hasCsvButton: hasCsv, hasHistory: hasHistory && !loggedOut });
    if (done.recovered) {
      root.__gwLoginRecoverSent = true;
      try { G.notifyLoginRecovered(); } catch (e4) {}
      return;
    }
    if (n < 40) setTimeout(tick, 1000);
  }
  setTimeout(tick, 800);
})();
