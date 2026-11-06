/* wallet.vaton.jp 上で動く交換ランナー。
   押してよいかは GiftExchange.reduce が決め、ここではその結果だけを実行する。
   「利用済みにする」は押さない。コード番号は読まない。 */
(function (root, factory) {
  var GE = null;
  if (typeof module === 'object' && module.exports) GE = require('./exchange-vault.js');
  else if (root) GE = root.GiftExchange;
  var api = factory(GE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VatonExchange = api;
  if (typeof document !== 'undefined' && root && root.GiftWallet && api.boot) api.boot(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GE) {
  function textOf(el) {
    if (!el) return '';
    return String(el.innerText || el.textContent || el.getAttribute && el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  }

  function bodyText(doc) {
    try { return String((doc.body && (doc.body.innerText || doc.body.textContent)) || ''); }
    catch (e) { return ''; }
  }

  function scrape(doc) {
    doc = doc || {};
    var text = bodyText(doc);
    var buttons = [];
    var nodes = [];
    try { nodes = doc.querySelectorAll ? doc.querySelectorAll('a,button,[role="button"]') : []; } catch (e) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var t = textOf(el);
      if (!t || t.length > 80) continue;
      var href = '';
      try { href = el.href || (el.getAttribute && el.getAttribute('href')) || ''; } catch (e2) { href = ''; }
      var kind = 'other';
      if (t.indexOf('利用済みにする') >= 0) kind = 'used';
      else if (t.indexOf('ギフトを開く') >= 0) kind = 'open';
      else if (/^(閉じる|キャンセル|いいえ|×|✕)$/.test(t)) kind = 'dismiss';
      else if (/交換する|交換を確定/.test(t)) kind = 'exchange';
      buttons.push({ text: t, href: href, kind: kind, index: i });
    }
    var password = false;
    try { password = !!(doc.querySelector && doc.querySelector('input[type="password"]')); } catch (e3) { password = false; }
    var balance = GE.parseBalance(text);
    if (balance == null && doc.__gwBalanceHint != null && isFinite(doc.__gwBalanceHint)) balance = doc.__gwBalanceHint;
    var displayName = GE.parseDisplayName(text);
    var loggedIn = null;
    if (password) loggedIn = false;
    else if (displayName && balance != null) loggedIn = true;
    else if (/ログアウト/.test(text) && balance != null) loggedIn = true;
    else if (/ログインする/.test(text) && !/ログアウト/.test(text)) loggedIn = false;
    var href = '';
    try { href = String(doc.location && doc.location.href || ''); } catch (e4) { href = ''; }
    var locationGift = href && !/wallet\.vaton\.jp/i.test(href) ? href : '';
    return {
      text: text,
      buttons: buttons,
      usedConfirm: /利用済みにしますか|利用済みにしてよろしい|利用済みにします/.test(text),
      acquiring: /取得中/.test(text),
      loggedIn: loggedIn,
      displayName: displayName,
      balance: balance,
      locationGift: locationGift,
      historyNew: null,
      disconnected: false,
      timedOut: false
    };
  }

  function findButton(doc, pred) {
    var nodes = [];
    try { nodes = doc.querySelectorAll ? doc.querySelectorAll('a,button,[role="button"]') : []; } catch (e) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) {
      var t = textOf(nodes[i]);
      if (pred(t, nodes[i])) return nodes[i];
    }
    return null;
  }

  function fire(el) {
    if (!el) return false;
    try {
      if (typeof Event === 'function' && el.dispatchEvent) {
        el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
        return true;
      }
    } catch (e) {}
    try { if (el.click) { el.click(); return true; } } catch (e2) {}
    return false;
  }

  function perform(action, doc) {
    if (!action || action.type !== 'click') return false;
    if (action.target === 'mark-used' || action.target === 'used') return false;
    var el = null;
    if (action.target === 'dismiss-used') {
      el = findButton(doc, function (t) { return /^(閉じる|キャンセル|いいえ|×|✕)$/.test(t); });
    } else if (action.target === 'confirm-exchange') {
      el = findButton(doc, function (t) { return /交換する|交換を確定/.test(t) && t.indexOf('利用済み') < 0; });
    } else if (action.target === 'open-gift') {
      el = findButton(doc, function (t) { return t.indexOf('ギフトを開く') >= 0 && t.indexOf('利用済み') < 0; });
    } else if (action.target === 'brand') {
      var keys = action.keys || [];
      el = findButton(doc, function (t) {
        if (t.indexOf('利用済み') >= 0 || /交換する/.test(t)) return false;
        var l = t.toLowerCase();
        for (var i = 0; i < keys.length; i++) if (l.indexOf(String(keys[i]).toLowerCase()) >= 0) return true;
        return false;
      });
    } else if (action.target === 'offer') {
      el = findButton(doc, function (t) {
        return t.indexOf('利用済み') < 0 && /円分/.test(t) && t.replace(/,/g, '').indexOf(String(action.faceYen)) >= 0;
      });
    } else {
      return false;
    }
    if (!el) return false;
    if (textOf(el).indexOf('利用済み') >= 0) return false;
    return fire(el);
  }

  function say(G, msg) {
    try { if (G && G.exchangeProgress) G.exchangeProgress(String(msg || '')); } catch (e) {}
  }

  function boot(root) {
    if (!GE || !root || !root.GiftWallet || root.__gwSafeBooted) return;
    root.__gwSafeBooted = true;
    var G = root.GiftWallet;
    var probe = '';
    try { probe = G.getAccountProbe ? G.getAccountProbe() : ''; } catch (e) { probe = ''; }
    if (probe === '1') { probeLoop(root, G); return; }
    var raw = '';
    try { raw = G.getSafeExchangeJob ? G.getSafeExchangeJob() : ''; } catch (e2) { raw = ''; }
    if (!raw) return;
    runJob(root, G, raw);
  }

  function probeLoop(root, G) {
    var tries = 0;
    function tick() {
      if (root.__gwSafeStop) return;
      var snap = scrape(root.document);
      tries += 1;
      var ready = snap.displayName || snap.balance != null || snap.loggedIn === false || tries > 12;
      if (!ready) { setTimeout(tick, 500); return; }
      try {
        G.accountProbeResult(JSON.stringify({
          loggedIn: snap.loggedIn,
          displayName: snap.displayName || '',
          balance: snap.balance,
          timedOut: false
        }));
      } catch (e) {}
    }
    tick();
  }

  function runJob(root, G, raw) {
    var job = null;
    try { job = JSON.parse(raw); } catch (e) { return; }
    var state = GE.createRunState(job);
    if (!state.ok) {
      try { G.safeExchangeAbort(JSON.stringify({ reason: state.error || '指定を確認できません' })); } catch (e2) {}
      return;
    }
    try {
      var prev = JSON.parse(root.sessionStorage.getItem('gwSafeExState') || 'null');
      if (prev && prev.clickedExchange && !prev.roundCaptured) {
        state.clickedExchange = true;
        state.exchangeClicks = prev.exchangeClicks || 1;
        state.phase = 'after-click';
        state.baseline = prev.baseline || [];
        state.balanceBefore = prev.balanceBefore;
        state.expectedPoints = prev.expectedPoints;
        state.faceYen = prev.faceYen;
        state.done = prev.done || 0;
        state.captures = [];
      }
    } catch (e3) {}

    function persist() {
      try {
        root.sessionStorage.setItem('gwSafeExState', JSON.stringify({
          clickedExchange: state.clickedExchange,
          roundCaptured: state.roundCaptured,
          exchangeClicks: state.exchangeClicks,
          phase: state.phase,
          baseline: state.baseline,
          balanceBefore: state.balanceBefore,
          expectedPoints: state.expectedPoints,
          faceYen: state.faceYen,
          done: state.done
        }));
      } catch (e) {}
    }

    function finish(step) {
      persist();
      var action = step.action || {};
      try {
        if (action.type === 'hold') G.safeExchangeHold(JSON.stringify({ reason: action.reason || '' }));
        else if (action.type === 'abort') G.safeExchangeAbort(JSON.stringify({ reason: action.reason || '' }));
        else if (action.type === 'done') G.safeExchangeDone(JSON.stringify({ count: state.done }));
      } catch (e) {}
    }

    function tick() {
      if (state.held || state.aborted || state.phase === 'done') return;
      var snap = scrape(root.document);
      if (!snap.text && state.phase === 'probe' && !root.__gwSafeStop) {
        setTimeout(tick, 400);
        return;
      }
      if (root.__gwSafeStop === 'timeout') snap.timedOut = true;
      if (root.__gwSafeStop === 'disconnect' || root.__gwSafeStop === 'stop') snap.disconnected = true;
      var step = GE.reduce(state, snap);
      state = step.state;
      persist();
      if (step.action && step.action.type === 'click' && step.action.target === 'confirm-exchange') {
        try { if (G.markSafeExchangeClicked) G.markSafeExchangeClicked(); } catch (e) {}
      }
      if (step.action && step.action.reason) say(G, step.action.reason);
      if (step.action && step.action.type === 'click') perform(step.action, root.document);
      if (step.action && step.action.type === 'captured' && step.action.item) {
        try { G.safeExchangeCaptured(JSON.stringify(step.action.item)); } catch (e2) {}
      }
      if (step.action && (step.action.type === 'hold' || step.action.type === 'abort' || step.action.type === 'done')) {
        finish(step);
        return;
      }
      setTimeout(tick, 700);
    }
    tick();
  }

  return { scrape: scrape, perform: perform, boot: boot, textOf: textOf };
});
