/*
 * vaton画面での交換操作。判断は GwExchangeGuard に任せ、ここは押すだけ。
 * 「利用済みにする」は押さない。コード番号は拾わない。
 * 実サイトの見た目がこの読み取りと違う場合は、成功させずに止める。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GwVatonExchange = api;
  if (root && root.document && root.GiftWallet && root.GwExchangeGuard && root.GwGiftVault) {
    try { api.start(root); } catch (e) {}
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function linesOf(text) {
    return String(text || '').split(/\n+/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  }

  function accountSeen(text, accounts) {
    var hits = [];
    (accounts || []).forEach(function (name) {
      if (String(text || '').indexOf(name) >= 0) hits.push(name);
    });
    return hits.length === 1 ? hits[0] : '';
  }

  function readBalance(text) {
    var m = String(text || '').match(/(?:保有ポイント|ポイント残高|所持ポイント|残高)[^0-9]{0,16}([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,9})/);
    if (!m) return null;
    var n = parseInt(m[1].replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function readOffer(text, kindKeys) {
    var lines = linesOf(text);
    var face = null;
    var points = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.length > 80) continue;
      var fm = line.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,7})\s*円/);
      if (!fm) continue;
      var low = line.toLowerCase();
      var kindHit = false;
      for (var k = 0; k < kindKeys.length; k++) if (low.indexOf(kindKeys[k]) >= 0) kindHit = true;
      var pm = line.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})\s*(?:ポイント|pt|Ｐ)/i);
      if (!pm) continue;
      var pts = parseInt(pm[1].replace(/,/g, ''), 10);
      if (isNaN(pts)) continue;
      face = parseInt(fm ? fm[1].replace(/,/g, '') : '0', 10) || null;
      points = pts;
      if (kindHit) break;
    }
    return { faceYen: face, points: points };
  }

  function snapshotFromText(text, buttons, job, hrefs) {
    var guard = (typeof globalThis !== 'undefined' && globalThis.GwExchangeGuard) || null;
    var keys = job && job.kind ? (guard ? guard.kindKeys(job.kind) : [String(job.kind).toLowerCase()]) : [];
    var offer = readOffer(text, keys);
    var body = String(text || '');
    var balance = readBalance(body);
    var loggedOut = /パスワード/.test(body) && /ログイン/.test(body);
    return {
      text: body,
      buttons: buttons || [],
      hrefs: hrefs || [],
      loggedIn: !loggedOut && balance != null,
      stockAvailable: !/在庫切れ/.test(body),
      balance: balance,
      faceYen: offer.faceYen,
      points: offer.points,
      fetching: /取得中/.test(String(text || '')),
      completed: /ギフトを交換しました/.test(String(text || '')),
      canOpen: (buttons || []).indexOf('ギフトを開く') >= 0
    };
  }

  function executeAction(action, ctx) {
    if (!action || !ctx) return;
    var guard = ctx.guard;
    if (action.type === 'click') {
      if (guard && guard.isMarkUsedLabel(action.label)) {
        ctx.refused = (ctx.refused || 0) + 1;
        return;
      }
      if (ctx.click) ctx.click(action.label);
      return;
    }
    if (action.type === 'closeDialog') {
      var label = guard && ctx.buttons ? guard.dismissUsedDialog(ctx.buttons) : null;
      if (label && ctx.click) ctx.click(label);
      else ctx.closed = (ctx.closed || 0) + 1;
      return;
    }
    if (action.type === 'goBrands' && ctx.goBrands) ctx.goBrands();
    if (action.type === 'saveLinks' && ctx.saveLinks) ctx.saveLinks(action.links || [], action.expiryText || '');
    if (action.type === 'fail' && ctx.fail) ctx.fail(action);
    if (action.type === 'done' && ctx.done) ctx.done(action);
  }

  function bridgeStorage(G, Vault) {
    return {
      getItem: function (k) {
        try {
          if (k === Vault.KEY && G.getGiftMemos) return G.getGiftMemos() || '[]';
          if (k === Vault.SEQ && G.getGiftMemoSeq) return G.getGiftMemoSeq() || '0';
        } catch (e) {}
        return null;
      },
      setItem: function (k, v) {
        try {
          if (k === Vault.KEY && G.saveGiftMemos) G.saveGiftMemos(v);
          if (k === Vault.SEQ && G.saveGiftMemoSeq) G.saveGiftMemoSeq(v);
        } catch (e) {}
      }
    };
  }

  function start(env) {
    var doc = env.document;
    var G = env.GiftWallet;
    var guard = env.GwExchangeGuard;
    var Vault = env.GwGiftVault;
    if (!doc || !G || !guard || !G.getExchangeJob) return;
    if (env.__gwExPageStarted) return;
    env.__gwExPageStarted = true;
    var raw = '';
    try { raw = G.getExchangeJob() || ''; } catch (e) { return; }
    if (!raw) return;
    var job = null;
    try { job = JSON.parse(raw); } catch (e2) { return; }
    if (!job || !job.kind || !job.count || !(Number(job.faceYen) > 0 || job.inputUnit === 'points')) {
      try { G.clearExchangeJob(); } catch (e3) {}
      return;
    }
    if (job.at && Date.now() - Number(job.at) > 1800000) {
      try { G.clearExchangeJob(); } catch (e4) {}
      return;
    }
    if (doc.body && doc.getElementById('gw-ex-runner')) return;
    var mark = doc.createElement('i');
    mark.id = 'gw-ex-runner';
    mark.style.display = 'none';
    if (doc.body) doc.body.appendChild(mark);

    var state = { phase: 'check', kind: job.kind, count: Number(job.count), faceYen: job.faceYen || null, points: job.points || null, inputUnit: job.inputUnit || '', sessionKey: job.sessionKey || '', index: 0, saved: [] };
    var stall = 0;
    var lastPhase = '';

    function buttonLabels() {
      var nodes = doc.querySelectorAll ? doc.querySelectorAll('button,a,[role="button"]') : [];
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var t = ((nodes[i].innerText || nodes[i].textContent || '') + '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 40 && out.indexOf(t) < 0) out.push(t);
      }
      return out;
    }

    function hrefs() {
      var nodes = doc.querySelectorAll ? doc.querySelectorAll('a[href]') : [];
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var h = nodes[i].href || nodes[i].getAttribute('href') || '';
        if (out.indexOf(h) < 0) out.push(h);
      }
      return out;
    }

    function clickLabel(label) {
      if (guard.isMarkUsedLabel(label)) return;
      var nodes = doc.querySelectorAll ? doc.querySelectorAll('button,a,[role="button"],div,span') : [];
      var wantKind = label.indexOf('kind:') === 0 ? guard.kindKeys(label.slice(5)) : null;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var t = ((el.innerText || el.textContent || '') + '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 40 || guard.isMarkUsedLabel(t)) continue;
        var hit = false;
        if (wantKind) {
          var low = t.toLowerCase();
          for (var k = 0; k < wantKind.length; k++) if (low.indexOf(wantKind[k]) >= 0) hit = true;
        } else if (t === label) hit = true;
        if (!hit) continue;
        try { el.click(); } catch (e) {}
        return;
      }
    }

    function tick() {
      if (env.__gwExStop) return;
      var text = doc.body ? (doc.body.innerText || doc.body.textContent || '') : '';
      var page = snapshotFromText(text, buttonLabels(), job, hrefs());
      page.sessionNow = '';
      try { if (G.currentSessionKey) page.sessionNow = G.currentSessionKey() || ''; } catch (eKey) {}
      if (job.sessionKey) page.sessionStart = job.sessionKey;
      try {
        if (G.setOfferStock && /1abacf75-d225-4688-9e11-2213fcc12a92/.test(location.href)) {
          G.setOfferStock('majica', /在庫切れ/.test(text) ? 'out' : 'in');
        }
      } catch (eStock) {}
      if (state.phase === lastPhase) stall++;
      else { stall = 0; lastPhase = state.phase; }
      if (stall > 40) page.timedOut = true;
      var step = guard.exchangeStep(state, page);
      state = step.state;
      var ctx = {
        guard: guard,
        buttons: page.buttons,
        click: clickLabel,
        goBrands: function () {
          try { env.location.href = 'https://wallet.vaton.jp/point/brands'; } catch (e) {}
        },
        saveLinks: function (links, expiryText) {
          try {
            var v = Vault.createVault(bridgeStorage(G, Vault));
            var expiry = guard.parseExpiry(expiryText);
            links.forEach(function (link) {
              v.add({
                link: link,
                faceYen: job.faceYen || null,
                kind: job.kind,
                expiry: expiry,
                account: job.account,
                status: 'unused'
              });
            });
          } catch (e) {}
        },
        fail: function (action) {
          var lock = guard.lockFromFailure({
            pressed: !!action.pressed || !!state.pressed,
            timedOut: !!action.timedOut,
            phase: action.pressed ? 'afterClick' : state.phase,
            reason: action.message
          });
          try { if (G.setExchangeLock) G.setExchangeLock(JSON.stringify(lock)); } catch (e) {}
          try { if (G.exchangeFailed) G.exchangeFailed(guard.redact(action.message || '交換を止めました')); } catch (e2) {}
          env.__gwExStop = true;
        },
        done: function (action) {
          try {
            if (G.exchangeDone) G.exchangeDone(JSON.stringify({ count: action.count || state.saved.length, kind: job.kind }));
          } catch (e) {}
          env.__gwExStop = true;
        }
      };
      (step.actions || []).forEach(function (action) { executeAction(action, ctx); });
      if (!env.__gwExStop) setTimeout(tick, 800);
    }

    function boot() { setTimeout(tick, 400); }
    if (doc.body) boot();
    else doc.addEventListener('DOMContentLoaded', boot);
  }

  return {
    snapshotFromText: snapshotFromText,
    executeAction: executeAction,
    readBalance: readBalance,
    readOffer: readOffer,
    accountSeen: accountSeen,
    start: start
  };
});
