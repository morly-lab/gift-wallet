/* 交換メニューと、アプリ内の交換リンクメモ帳。外部へは送らない。 */
(function () {
  var GE = window.GiftExchange;
  if (!GE) return;
  var STORE = null;
  var corrupt = false;
  var mode = 'exchange';
  var draft = { accountId: '', typeId: '', count: 1 };
  var probe = null;
  var probing = false;
  var filters = { typeId: 'all', accountId: 'all', status: 'all' };
  var message = '';
  var terminal = null;
  var terminalOnce = false;

  function $(tag, css, text) {
    var el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text != null) el.textContent = text;
    return el;
  }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }
  function hasSafeBridge() {
    return !!(window.GiftWallet && typeof GiftWallet.probeVatonAccount === 'function' && typeof GiftWallet.startSafeExchange === 'function');
  }
  function typeLabel(id) {
    var t = GE.typeById(id);
    return t ? t.label : 'その他';
  }
  function loadStore() {
    var local = GE.loadFromStorage(localStorage);
    if (local.corrupt) { corrupt = true; STORE = GE.emptyStore(); return; }
    corrupt = false;
    var nativeStore = GE.emptyStore();
    var nativeRaw = '';
    try { nativeRaw = window.GiftWallet && GiftWallet.getGiftLinkMemo ? GiftWallet.getGiftLinkMemo() : ''; } catch (e) { nativeRaw = ''; }
    if (nativeRaw) {
      try { nativeStore = GE.normalizeStore(JSON.parse(nativeRaw)); } catch (e2) { nativeStore = GE.emptyStore(); }
    }
    if (local.missing) {
      STORE = nativeStore;
      if (nativeStore.items.length || nativeStore.hold || Object.keys(nativeStore.accounts).length) {
        GE.saveToStorage(localStorage, STORE);
      }
    } else STORE = GE.mergeStores(local.store, nativeStore);
  }
  function persist() {
    if (corrupt) return;
    GE.saveToStorage(localStorage, STORE);
    try {
      if (window.GiftWallet && GiftWallet.saveGiftLinkMemo) GiftWallet.saveGiftLinkMemo(JSON.stringify(STORE));
    } catch (e) {}
  }
  function ensureStyle() {
    if (document.getElementById('gwGiftStyle')) return;
    var s = document.createElement('style');
    s.id = 'gwGiftStyle';
    s.textContent = [
      '#gwGiftSheet{position:fixed;inset:0;z-index:99996;background:#080810;color:#e8e8f0;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif;}',
      '#gwGiftSheet header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(212,168,67,.35);background:#12121e;}',
      '#gwGiftSheet header h2{flex:1;font-size:16px;color:#d4a843;margin:0;}',
      '#gwGiftSheet .body{flex:1;overflow:auto;padding:12px 12px calc(16px + env(safe-area-inset-bottom));}',
      '#gwGiftSheet button,#gwGiftSheet select,#gwGiftSheet input{font-family:inherit;}',
      '#gwGiftSheet .tap{min-height:48px;border-radius:12px;border:1px solid #d4a843;background:transparent;color:#fff;font-weight:800;font-size:15px;padding:10px 12px;}',
      '#gwGiftSheet .tap.on{background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;}',
      '#gwGiftSheet .primary{width:100%;min-height:48px;border:none;border-radius:999px;background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;font-weight:800;font-size:16px;}',
      '#gwGiftSheet .ghost{width:100%;min-height:44px;border:none;background:none;color:#aaa;font-size:13px;}',
      '#gwGiftSheet .row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;}',
      '#gwGiftSheet .note{font-size:12px;line-height:1.6;color:#b0b0c8;margin:6px 0 10px;}',
      '#gwGiftSheet .warn{font-size:13px;line-height:1.6;color:#ffd36b;background:#1a1408;border:1px solid rgba(212,168,67,.4);border-radius:12px;padding:10px;margin:8px 0;}',
      '#gwGiftSheet .card{background:#14141f;border:1px solid #252535;border-radius:14px;padding:10px;margin:8px 0;}',
      '#gwGiftSheet .url{font-size:12px;word-break:break-all;color:#d4a843;margin:6px 0;}',
      '#gwGiftSheet .meta{font-size:12px;line-height:1.55;color:#c8c4d0;}',
      '#gwGiftSheet input, #gwGiftSheet select{width:100%;box-sizing:border-box;background:#0d0d16;color:#fff;border:1px solid #444;border-radius:10px;padding:12px;font-size:15px;margin:4px 0 8px;}',
      '#gwGiftBusy{position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;text-align:center;padding:24px;}',
      '@keyframes gwExSpin{to{transform:rotate(360deg)}}'
    ].join('');
    document.head.appendChild(s);
  }
  function closeSheet() {
    var o = document.getElementById('gwGiftSheet');
    if (o) o.remove();
  }
  function sheet() {
    ensureStyle();
    closeSheet();
    var root = $('div');
    root.id = 'gwGiftSheet';
    var head = $('header');
    head.appendChild($('h2', '', mode === 'memo' ? '交換リンクのメモ帳' : '交換'));
    var tab = $('button', 'min-height:40px;border-radius:999px;border:1px solid #d4a843;background:none;color:#d4a843;font-weight:800;padding:0 12px;', mode === 'memo' ? '交換' : 'メモ帳');
    tab.type = 'button';
    tab.onclick = function () { mode = mode === 'memo' ? 'exchange' : 'memo'; terminal = null; render(); };
    var x = $('button', 'min-height:40px;border:none;background:none;color:#aaa;font-size:14px;', '閉じる');
    x.type = 'button';
    x.onclick = closeSheet;
    head.appendChild(tab);
    head.appendChild(x);
    root.appendChild(head);
    var body = $('div');
    body.className = 'body';
    root.appendChild(body);
    document.body.appendChild(root);
    return body;
  }
  function button(label, on, fn) {
    var b = $('button', '', label);
    b.type = 'button';
    b.className = 'tap' + (on ? ' on' : '');
    b.onclick = fn;
    return b;
  }
  function renderExchange(body) {
    body.appendChild($('p', '', '1回の額面は10,000円分だけ進めます。必要ポイントは画面に出た数字を使い、決まった点数は使いません。'));
    body.lastChild.className = 'note';
    body.appendChild($('p', '', 'パスワードは保存しません。ほかのBotの保管庫には入りません。いまこのアプリにログインしているギフトウォレットだけを見ます。'));
    body.lastChild.className = 'note';
    if (!hasSafeBridge()) {
      var w = $('div');
      w.className = 'warn';
      w.textContent = '自動交換はアプリ 1.4.19 の機能です。この更新のAPKはまだ公開していません。メモ帳はいま使えます。';
      body.appendChild(w);
    }
    if (STORE.hold) {
      var h = $('div');
      h.className = 'warn';
      h.textContent = STORE.hold.reason;
      body.appendChild(h);
      var unlock = $('button', '', '残高と履歴を確認したので解除');
      unlock.type = 'button';
      unlock.className = 'primary';
      unlock.onclick = function () {
        STORE = GE.clearHold(STORE);
        persist();
        message = '確認待ちを解除しました。交換は自動では始めません。';
        render();
      };
      body.appendChild(unlock);
    }
    body.appendChild($('div', 'font-size:13px;font-weight:800;color:#d4a843;margin-top:8px;', 'アカウント'));
    var row = $('div');
    row.className = 'row';
    GE.ACCOUNTS.forEach(function (a) {
      row.appendChild(button(a.label, draft.accountId === a.id, function () {
        draft.accountId = a.id;
        probe = null;
        message = '';
        render();
      }));
    });
    body.appendChild(row);
    var bound = draft.accountId && STORE.accounts[draft.accountId] && STORE.accounts[draft.accountId].displayName;
    if (bound) body.appendChild($('p', '', '覚えている表示名: ' + bound)).className = 'note';
    var probeBtn = $('button', '', probing ? '確認しています…' : 'ログインと残高を確認');
    probeBtn.type = 'button';
    probeBtn.className = 'primary';
    probeBtn.disabled = probing || !draft.accountId || !hasSafeBridge();
    probeBtn.onclick = function () {
      if (!hasSafeBridge() || !draft.accountId) return;
      probing = true;
      probe = null;
      message = '';
      render();
      try { GiftWallet.probeVatonAccount(); } catch (e) { probing = false; message = '確認を開始できませんでした。'; render(); }
    };
    body.appendChild(probeBtn);
    if (probe) {
      var box = $('div');
      box.className = 'card';
      var lines = $('div');
      lines.className = 'meta';
      lines.textContent = '表示名: ' + (probe.displayName || '読めませんでした') + '\n残高: ' + (probe.balance == null ? '未確認' : String(probe.balance));
      box.appendChild(lines);
      body.appendChild(box);
      var gate = GE.assessProbe({
        accountId: draft.accountId,
        boundName: bound || '',
        loggedIn: probe.loggedIn,
        displayName: probe.displayName || '',
        balance: probe.balance
      });
      if (gate.needsBind && probe.displayName) {
        var bind = $('button', '', 'この表示名を' + draft.accountId + 'として覚える');
        bind.type = 'button';
        bind.className = 'primary';
        bind.style.marginTop = '8px';
        bind.onclick = function () {
          var r = GE.rememberAccount(STORE, draft.accountId, probe.displayName);
          if (!r.ok) { message = r.error; render(); return; }
          STORE = r.store;
          persist();
          message = '表示名を覚えました。もう一度、ログインと残高を確認してください。';
          probe = null;
          render();
        };
        body.appendChild(bind);
      } else if (!gate.ok) {
        body.appendChild($('div', '', gate.reason)).className = 'warn';
      } else {
        body.appendChild($('div', '', 'ログインと残高を確認しました。必要ポイントは、このあと画面の表示で判断します。')).className = 'note';
      }
    }
    var sw = $('button', '', 'ログイン画面を開いて自分で切り替える');
    sw.type = 'button';
    sw.className = 'ghost';
    sw.onclick = function () {
      probe = null;
      try {
        if (window.GiftWallet && GiftWallet.openVatonVisible) GiftWallet.openVatonVisible();
        else location.href = 'https://wallet.vaton.jp/';
      } catch (e) {}
    };
    body.appendChild(sw);
    body.appendChild($('div', 'font-size:13px;font-weight:800;color:#d4a843;', '種類'));
    var types = $('div');
    types.className = 'row';
    GE.TYPES.forEach(function (t) {
      if (t.id === 'other') return;
      types.appendChild(button(t.label, draft.typeId === t.id, function () { draft.typeId = t.id; render(); }));
    });
    body.appendChild(types);
    body.appendChild($('div', 'font-size:13px;font-weight:800;color:#d4a843;', '回数'));
    var countRow = $('div');
    countRow.className = 'row';
    var minus = button('−', false, function () { draft.count = Math.max(1, draft.count - 1); render(); });
    var num = $('div', 'min-width:48px;text-align:center;font-size:20px;font-weight:800;line-height:48px;', String(draft.count));
    var plus = button('＋', false, function () { draft.count = Math.min(10, draft.count + 1); render(); });
    countRow.appendChild(minus);
    countRow.appendChild(num);
    countRow.appendChild(plus);
    body.appendChild(countRow);
    if (message) body.appendChild($('div', '', message)).className = 'warn';
    if (terminal && terminal.kind !== 'hold') {
      body.appendChild($('div', '', terminal.reason)).className = 'warn';
    }
    if (STORE.hold || (terminal && terminal.kind === 'hold')) return;
    var go = $('button', '', 'この内容で交換を始める');
    go.type = 'button';
    go.className = 'primary';
    go.onclick = startExchange;
    body.appendChild(go);
    body.appendChild($('p', '', '失敗したときは自動で押し直しません。表示名の読み取り位置は実画面では未確認です。読めない場合は中断します。')).className = 'note';
  }
  function startExchange() {
    message = '';
    terminal = null;
    terminalOnce = false;
    if (corrupt) { message = 'メモ帳の保存データが読めないため、交換は始めません。'; render(); return; }
    var gateStart = GE.canStart(STORE);
    if (!gateStart.ok) { message = gateStart.reason; render(); return; }
    if (!hasSafeBridge()) { message = '自動交換はアプリ 1.4.19 が必要です。古い交換処理には切り替えません。'; render(); return; }
    var bound = STORE.accounts[draft.accountId] && STORE.accounts[draft.accountId].displayName;
    var gate = GE.assessProbe({
      accountId: draft.accountId,
      boundName: bound || '',
      loggedIn: probe && probe.loggedIn,
      displayName: probe && probe.displayName || '',
      balance: probe && probe.balance
    });
    if (!gate.ok) { message = gate.reason || 'ログインと残高を確認してください。'; render(); return; }
    if (!draft.typeId) { message = '種類を選んでください。'; render(); return; }
    try {
      GiftWallet.startSafeExchange(JSON.stringify({
        accountId: draft.accountId,
        displayName: bound,
        typeId: draft.typeId,
        count: draft.count,
        expectedFace: GE.EXPECTED_FACE_YEN
      }));
    } catch (e) {
      message = '交換を開始できませんでした。';
      render();
      return;
    }
    showBusy('ログイン状態を確認しています…');
  }
  function renderMemo(body) {
    if (corrupt) {
      body.appendChild($('div', '', '保存データが読めないため、上書きしません。')).className = 'warn';
      return;
    }
    body.appendChild($('p', '', 'リンクはここだけに残します。開くとき以外は外へ送りません。使用済みの切替は、vatonの「利用済みにする」とは別です。')).className = 'note';
    var f1 = $('div');
    f1.className = 'row';
    f1.appendChild(filterChip('種類', 'typeId', [{ id: 'all', label: 'すべて' }].concat(GE.TYPES.map(function (t) { return { id: t.id, label: t.label }; }))));
    body.appendChild(f1);
    var f2 = $('div');
    f2.className = 'row';
    f2.appendChild(filterChip('アカウント', 'accountId', [{ id: 'all', label: 'すべて' }].concat(GE.ACCOUNTS.map(function (a) { return { id: a.id, label: a.label }; }))));
    body.appendChild(f2);
    var f3 = $('div');
    f3.className = 'row';
    [['all', 'すべて'], ['unused', '未使用'], ['used', '使用済み']].forEach(function (pair) {
      f3.appendChild(button(pair[1], filters.status === pair[0], function () { filters.status = pair[0]; render(); }));
    });
    body.appendChild(f3);
    var items = GE.filterItems(STORE, filters);
    if (!items.length) body.appendChild($('p', '', '該当するリンクはありません。')).className = 'note';
    items.forEach(function (it) { body.appendChild(card(it)); });
    body.appendChild($('div', 'font-size:13px;font-weight:800;color:#d4a843;margin-top:12px;', '手入力で追加'));
    body.appendChild(manualForm());
  }
  function filterChip(label, key, options) {
    var wrap = $('label', 'flex:1;min-width:140px;font-size:11px;color:#b0b0c8;', label);
    var sel = document.createElement('select');
    options.forEach(function (op) {
      var o = document.createElement('option');
      o.value = op.id;
      o.textContent = op.label;
      if (filters[key] === op.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { filters[key] = sel.value; render(); };
    wrap.appendChild(sel);
    return wrap;
  }
  function card(it) {
    var box = $('div');
    box.className = 'card';
    box.appendChild($('div', '', '連番 ' + it.serial + '  ' + typeLabel(it.typeId) + '  ' + (it.accountId || 'アカウント未設定'))).className = 'meta';
    var meta = $('div');
    meta.className = 'meta';
    meta.textContent = '額面: ' + (it.faceYen == null ? '未確認' : it.faceYen + '円')
      + '\n必要ポイント: ' + (it.pointsShown == null ? '未確認' : String(it.pointsShown))
      + '\n期限: ' + GE.expiresLabel(it)
      + '\n状態: ' + (it.status === 'used' ? '使用済み' : '未使用');
    box.appendChild(meta);
    var url = $('div');
    url.className = 'url';
    url.textContent = it.url;
    box.appendChild(url);
    var row = $('div');
    row.className = 'row';
    row.appendChild(button('開く', true, function () { openItem(it.url); }));
    row.appendChild(button(it.status === 'used' ? '未使用に戻す' : '使用済みにする', false, function () {
      var r = GE.setStatus(STORE, it.serial, it.status === 'used' ? 'unused' : 'used');
      if (!r.ok) return;
      STORE = r.store;
      persist();
      render();
    }));
    row.appendChild(button('削除', false, function () { askDelete(it); }));
    box.appendChild(row);
    return box;
  }
  function openItem(url) {
    var n = GE.normalizeUrl(url);
    if (!n) { toast('リンクを開けません'); return; }
    try {
      if (window.GiftWallet && typeof GiftWallet.openGiftLink === 'function') { GiftWallet.openGiftLink(n); return; }
    } catch (e) {}
    window.open(n, '_blank', 'noopener,noreferrer');
  }
  function askDelete(it) {
    var old = document.getElementById('gwGiftDel');
    if (old) old.remove();
    var o = $('div', 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;');
    o.id = 'gwGiftDel';
    var panel = $('div', 'background:#14141f;border:1px solid #d4a843;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));width:100%;max-width:520px;color:#fff;');
    panel.appendChild($('div', 'font-size:16px;font-weight:800;color:#d4a843;', 'メモ帳から削除します'));
    panel.appendChild($('p', 'font-size:13px;line-height:1.6;', '連番 ' + it.serial + ' を削除します。vatonの「利用済みにする」は押しません。'));
    var yes = $('button', '', '削除する');
    yes.type = 'button';
    yes.className = 'primary';
    yes.onclick = function () {
      var r = GE.removeLink(STORE, it.serial);
      if (r.ok) { STORE = r.store; persist(); }
      o.remove();
      render();
    };
    var no = $('button', '', 'やめる');
    no.type = 'button';
    no.className = 'ghost';
    no.onclick = function () { o.remove(); };
    panel.appendChild(yes);
    panel.appendChild(no);
    o.appendChild(panel);
    document.body.appendChild(o);
  }
  function field(label, input) {
    var wrap = $('label', 'display:block;font-size:12px;color:#b0b0c8;margin-top:6px;', label);
    wrap.appendChild(input);
    return wrap;
  }
  function manualForm() {
    var form = $('form');
    form.onsubmit = function (e) { e.preventDefault(); };
    var url = document.createElement('input');
    url.type = 'url';
    url.placeholder = 'https://';
    url.autocomplete = 'off';
    var face = document.createElement('input');
    face.inputMode = 'numeric';
    face.placeholder = '画面の額面';
    var points = document.createElement('input');
    points.inputMode = 'numeric';
    points.placeholder = '空なら未確認';
    var exp = document.createElement('input');
    exp.placeholder = '空なら未確認';
    var type = document.createElement('select');
    var account = document.createElement('select');
    function opt(sel, id, label) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = label;
      sel.appendChild(o);
    }
    opt(type, '', '種類を選ぶ');
    GE.TYPES.forEach(function (t) { opt(type, t.id, t.label); });
    opt(account, '', 'アカウントを選ぶ');
    GE.ACCOUNTS.forEach(function (a) { opt(account, a.id, a.label); });
    form.appendChild(field('リンク', url));
    form.appendChild(field('額面（円）', face));
    form.appendChild(field('必要ポイント', points));
    form.appendChild(field('有効期限', exp));
    form.appendChild(field('種類', type));
    form.appendChild(field('アカウント', account));
    var add = $('button', '', 'メモ帳に追加');
    add.type = 'button';
    add.className = 'primary';
    add.onclick = function () {
      var r = GE.addLink(STORE, {
        url: url.value,
        faceYen: face.value === '' ? null : Number(face.value),
        pointsShown: points.value === '' ? null : Number(points.value),
        expiresText: exp.value,
        typeId: type.value,
        accountId: account.value,
        source: 'manual'
      });
      if (!r.ok) { toast(r.error || '追加できません'); return; }
      STORE = r.store;
      persist();
      toast('追加しました');
      render();
    };
    form.appendChild(add);
    return form;
  }
  function render() {
    var body = sheet();
    if (mode === 'memo') renderMemo(body);
    else renderExchange(body);
  }
  function showBusy(msg) {
    ensureStyle();
    var o = document.getElementById('gwGiftBusy');
    if (!o) {
      o = $('div');
      o.id = 'gwGiftBusy';
      var spin = $('div', 'width:44px;height:44px;border:4px solid rgba(255,255,255,.2);border-top-color:#d4a843;border-radius:50%;animation:gwExSpin 1s linear infinite;');
      var title = $('div', 'font-size:16px;font-weight:800;color:#d4a843;', '交換中…');
      var m = $('div');
      m.id = 'gwGiftBusyMsg';
      m.style.cssText = 'font-size:13px;line-height:1.6;';
      var stop = $('button', 'border:none;background:#e0443a;color:#fff;border-radius:999px;padding:10px 22px;font-size:14px;font-weight:800;', '止める');
      stop.type = 'button';
      stop.onclick = function () {
        try { if (window.GiftWallet && GiftWallet.stopSafeExchange) GiftWallet.stopSafeExchange(); } catch (e) {}
      };
      o.appendChild(spin);
      o.appendChild(title);
      o.appendChild(m);
      o.appendChild(stop);
      document.body.appendChild(o);
    }
    var node = document.getElementById('gwGiftBusyMsg');
    if (node) node.textContent = msg || '';
  }
  function hideBusy() {
    var o = document.getElementById('gwGiftBusy');
    if (o) o.remove();
  }
  function showTerminal(kind, reason) {
    if (terminalOnce) return;
    terminalOnce = true;
    hideBusy();
    terminal = { kind: kind, reason: reason || '' };
    mode = 'exchange';
    message = '';
    render();
  }
  window.gwAccountProbeResult = function (data) {
    probing = false;
    probe = data || {};
    if (probe.busy) message = 'ほかの取り込み中です。終わってから確認してください。';
    else if (probe.timedOut) message = 'ログイン状態を時間内に読めませんでした。交換は始めません。';
    else message = '';
    if (document.getElementById('gwGiftSheet')) render();
  };
  window.gwSafeCaptured = function (item) {
    if (corrupt) return;
    var added = GE.addLink(STORE, item || {});
    if (!added.ok) {
      STORE = GE.setHold(STORE, added.duplicate ? '同じリンクが既にあるため止めました。自動では再送しません。' : 'リンクを保存できないため止めました。自動では再送しません。');
      persist();
      try { if (GiftWallet.stopSafeExchange) GiftWallet.stopSafeExchange(); } catch (e) {}
      showTerminal('hold', STORE.hold.reason);
      return;
    }
    STORE = added.store;
    persist();
    showBusy('リンクをメモ帳に保存しました。続きを確認しています…');
  };
  window.gwSafeHold = function (data) {
    var reason = (data && data.reason) || '交換できたか判断できません。残高と履歴を確認してください。自動では再送しません。';
    if (!corrupt) {
      STORE = GE.setHold(STORE, reason);
      persist();
    }
    showTerminal('hold', reason);
  };
  window.gwSafeAbort = function (data) {
    showTerminal('abort', (data && data.reason) || '交換は始めずに止めました。');
  };
  window.gwSafeDone = function () {
    hideBusy();
    mode = 'memo';
    terminal = null;
    render();
    toast('メモ帳に保存しました');
  };
  window.gwExOverlay = function (msg) {
    if (msg == null) { hideBusy(); return; }
    showBusy(msg);
  };
  window.gwExResult = function (list) {
    hideBusy();
    var urls = 0;
    (list || []).forEach(function (x) { if (GE.normalizeUrl(x)) urls += 1; });
    showTerminal('abort', urls ? '古い交換処理の結果です。コードは表示しません。リンクはメモ帳へ手入力してください。' : 'コードは表示しません。vatonのマイギフトで、開くリンクだけを確認してください。');
  };
  window.gwExFail = function (msg) {
    hideBusy();
    var head = String(msg || '').split('\n\n[診断]\n')[0];
    var ambiguous = /可能性|確認|マイギフト|時間/.test(head);
    if (ambiguous && !corrupt) {
      STORE = GE.setHold(STORE, (head || '確認してください') + ' 自動では再送しません。');
      persist();
      showTerminal('hold', STORE.hold.reason);
      return;
    }
    showTerminal('abort', head || 'うまく進めませんでした。自動では再送しません。');
  };
  window.openExchange = function () {
    loadStore();
    mode = 'exchange';
    terminal = null;
    terminalOnce = false;
    message = '';
    render();
  };
  window.openGiftMemo = function () {
    loadStore();
    mode = 'memo';
    terminal = null;
    render();
  };
  loadStore();
})();
