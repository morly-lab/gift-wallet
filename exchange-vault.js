/* 交換リンクのメモ帳と、交換してよいかの判断。
   価格表は持たない。画面から読めた額面と必要ポイントだけを比べる。
   ギフトのコード番号は扱わない。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GiftExchange = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var STORE_KEY = 'gwGiftLinkMemo';
  var EXPECTED_FACE_YEN = 10000;
  var ACQUIRE_LIMIT = 40;
  var CONFIRM_WAIT_LIMIT = 15;
  var BRAND_WAIT_LIMIT = 15;
  var ACCOUNTS = [
    { id: 'モーリー', label: 'モーリー' },
    { id: 'めぱん', label: 'めぱん' },
    { id: 'モリ母', label: 'モリ母' }
  ];
  var TYPES = [
    { id: 'aupay', label: 'au PAY', keys: ['au pay', 'aupay', 'ａｕ　ｐａｙ'] },
    { id: 'majica', label: 'majica', keys: ['majica', 'マジカ', 'まじか'] },
    { id: 'vpoint', label: 'Vポイント', keys: ['vポイント', 'vpoint', 'ｖポイント'] },
    { id: 'kyash', label: 'kyash', keys: ['kyash', 'キャッシュ'] },
    { id: 'amazon', label: 'Amazon', keys: ['amazon', 'アマゾン'] },
    { id: 'waon', label: 'WAON', keys: ['waon', 'ワオン'] },
    { id: 'other', label: 'その他', keys: [] }
  ];

  function emptyStore() {
    return { v: 1, nextSerial: 1, savedAt: 0, deletedUrls: [], accounts: {}, items: [], hold: null };
  }

  function isPosInt(n) {
    return typeof n === 'number' && isFinite(n) && n > 0 && Math.floor(n) === n;
  }

  function accountById(id) {
    for (var i = 0; i < ACCOUNTS.length; i++) if (ACCOUNTS[i].id === id) return ACCOUNTS[i];
    return null;
  }

  function typeById(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUrl(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > 2000) return null;
    if (/[\u0000-\u001f\s]/.test(s)) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:/i.test(s)) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname || u.hostname === '') return null;
    return u.href;
  }

  function expiresLabel(item) {
    var t = item && typeof item.expiresText === 'string' ? item.expiresText.trim() : '';
    return t ? t : '未確認';
  }

  function parseExpires(text) {
    var m = String(text || '').match(/有効期限\s*[:：]?\s*([0-9]{4}[\/.年][0-9]{1,2}[\/.月][0-9]{1,2}日?(?:\s*[0-9]{1,2}:[0-9]{2})?)/);
    return m ? m[1].trim().slice(0, 40) : '';
  }

  function parseBalance(text) {
    var m = String(text || '').match(/(?:保有ポイント|所持ポイント|ポイント残高|現在のポイント|利用可能ポイント|利用可能|残高)\s*[:：]?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)/);
    if (!m) return null;
    var n = parseInt(m[1].replace(/,/g, ''), 10);
    return isFinite(n) ? n : null;
  }

  function parseDisplayName(text) {
    var m = String(text || '').match(/(?:アカウント名|ニックネーム|表示名|ユーザー名)\s*[:：]\s*([^\n]{1,40})/);
    if (!m) return null;
    var name = m[1].trim();
    if (!name || /:\/\//.test(name) || name.length > 40) return null;
    return name;
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var url = normalizeUrl(raw.url);
    if (!url) return null;
    var serial = parseInt(raw.serial, 10);
    if (!isPosInt(serial)) return null;
    return {
      serial: serial,
      url: url,
      faceYen: isPosInt(raw.faceYen) ? raw.faceYen : null,
      pointsShown: isPosInt(raw.pointsShown) ? raw.pointsShown : null,
      typeId: typeById(raw.typeId) ? raw.typeId : 'other',
      expiresText: typeof raw.expiresText === 'string' ? raw.expiresText.trim().slice(0, 40) : '',
      accountId: accountById(raw.accountId) ? raw.accountId : '',
      status: raw.status === 'used' ? 'used' : 'unused',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 40) : '',
      statusAt: typeof raw.statusAt === 'number' ? raw.statusAt : 0,
      source: raw.source === 'manual' ? 'manual' : 'exchange'
    };
  }

  function normalizeStore(data) {
    var base = emptyStore();
    if (!data) return base;
    var items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    var seen = {};
    var maxSerial = 0;
    items.forEach(function (raw) {
      var item = normalizeItem(raw);
      if (!item || seen[item.url]) return;
      seen[item.url] = true;
      base.items.push(item);
      if (item.serial > maxSerial) maxSerial = item.serial;
    });
    var next = data && !Array.isArray(data) ? parseInt(data.nextSerial, 10) : 0;
    base.nextSerial = Math.max(isPosInt(next) ? next : 1, maxSerial + 1);
    base.savedAt = data && !Array.isArray(data) && typeof data.savedAt === 'number' ? data.savedAt : 0;
    base.deletedUrls = [];
    var deleted = data && !Array.isArray(data) && Array.isArray(data.deletedUrls) ? data.deletedUrls : [];
    deleted.forEach(function (u) {
      var n = normalizeUrl(u);
      if (n && base.deletedUrls.indexOf(n) < 0) base.deletedUrls.push(n);
    });
    base.accounts = {};
    var acc = data && !Array.isArray(data) && data.accounts && typeof data.accounts === 'object' ? data.accounts : {};
    ACCOUNTS.forEach(function (a) {
      var row = acc[a.id];
      var name = row && typeof row.displayName === 'string' ? row.displayName.trim() : '';
      if (name && name.length <= 40 && !/:\/\//.test(name)) base.accounts[a.id] = { displayName: name };
    });
    if (data && !Array.isArray(data) && data.hold && typeof data.hold === 'object' && typeof data.hold.reason === 'string') {
      base.hold = {
        reason: data.hold.reason.slice(0, 300),
        at: typeof data.hold.at === 'number' ? data.hold.at : 0,
        accountId: accountById(data.hold.accountId) ? data.hold.accountId : '',
        typeId: typeById(data.hold.typeId) ? data.hold.typeId : ''
      };
    }
    return base;
  }

  function addLink(store, draft) {
    var cur = normalizeStore(store);
    var url = normalizeUrl(draft && draft.url);
    if (!url) return { ok: false, store: cur, error: 'リンクの形式を確認できません' };
    for (var i = 0; i < cur.items.length; i++) {
      if (cur.items[i].url === url) return { ok: false, duplicate: true, store: cur, error: '同じリンクは既にあります' };
    }
    var typeId = draft.typeId && typeById(draft.typeId) ? draft.typeId : '';
    if (!typeId) return { ok: false, store: cur, error: '種類を選んでください' };
    var accountId = draft.accountId && accountById(draft.accountId) ? draft.accountId : '';
    if (!accountId) return { ok: false, store: cur, error: 'アカウントを選んでください' };
    var face = draft.faceYen == null || draft.faceYen === '' ? null : Number(draft.faceYen);
    if (face != null && !isPosInt(face)) return { ok: false, store: cur, error: '額面は正の整数です' };
    var points = draft.pointsShown == null || draft.pointsShown === '' ? null : Number(draft.pointsShown);
    if (points != null && !isPosInt(points)) return { ok: false, store: cur, error: '必要ポイントは正の整数です' };
    var expires = typeof draft.expiresText === 'string' ? draft.expiresText.trim().slice(0, 40) : '';
    var now = Date.now();
    var item = {
      serial: cur.nextSerial,
      url: url,
      faceYen: face,
      pointsShown: points,
      typeId: typeId,
      expiresText: expires,
      accountId: accountId,
      status: draft.status === 'used' ? 'used' : 'unused',
      createdAt: new Date(now).toISOString(),
      statusAt: now,
      source: draft.source === 'manual' ? 'manual' : 'exchange'
    };
    cur.items.push(item);
    cur.nextSerial += 1;
    cur.savedAt = now;
    return { ok: true, store: cur, item: item };
  }

  function setStatus(store, serial, status) {
    var cur = normalizeStore(store);
    if (status !== 'used' && status !== 'unused') return { ok: false, store: cur, error: '状態が不正です' };
    var found = false;
    cur.items.forEach(function (it) {
      if (it.serial === serial) {
        it.status = status;
        it.statusAt = Date.now();
        found = true;
      }
    });
    if (!found) return { ok: false, store: cur, error: '見当たりません' };
    cur.savedAt = Date.now();
    return { ok: true, store: cur };
  }

  function removeLink(store, serial) {
    var cur = normalizeStore(store);
    var idx = -1;
    for (var i = 0; i < cur.items.length; i++) if (cur.items[i].serial === serial) idx = i;
    if (idx < 0) return { ok: false, store: cur, error: '見当たりません' };
    var url = cur.items[idx].url;
    cur.items.splice(idx, 1);
    if (cur.deletedUrls.indexOf(url) < 0) cur.deletedUrls.push(url);
    cur.savedAt = Date.now();
    return { ok: true, store: cur };
  }

  function filterItems(store, q) {
    q = q || {};
    return normalizeStore(store).items.filter(function (it) {
      if (q.typeId && q.typeId !== 'all' && it.typeId !== q.typeId) return false;
      if (q.accountId && q.accountId !== 'all' && it.accountId !== q.accountId) return false;
      if (q.status && q.status !== 'all' && it.status !== q.status) return false;
      return true;
    });
  }

  function rememberAccount(store, accountId, displayName) {
    var cur = normalizeStore(store);
    if (!accountById(accountId)) return { ok: false, store: cur, error: 'アカウントが不正です' };
    var name = String(displayName || '').trim();
    if (!name || name.length > 40 || /:\/\//.test(name) || /[\r\n]/.test(name)) {
      return { ok: false, store: cur, error: '表示名を確認できません' };
    }
    cur.accounts[accountId] = { displayName: name };
    cur.savedAt = Date.now();
    return { ok: true, store: cur };
  }

  function mergeStores(a, b) {
    var left = normalizeStore(a);
    var right = normalizeStore(b);
    var map = {};
    function take(item, side) {
      var prev = map[item.url];
      if (!prev) {
        map[item.url] = { item: item, sideAt: side.savedAt };
        return;
      }
      var kept = prev.item;
      var winner = item.statusAt >= kept.statusAt ? item : kept;
      var older = kept;
      if (item.createdAt && kept.createdAt && item.createdAt < kept.createdAt) older = item;
      map[item.url] = {
        sideAt: Math.max(prev.sideAt, side.savedAt),
        item: {
          serial: Math.min(kept.serial, item.serial),
          url: kept.url,
          faceYen: older.faceYen,
          pointsShown: older.pointsShown,
          typeId: older.typeId,
          expiresText: older.expiresText,
          accountId: older.accountId || winner.accountId,
          status: winner.status,
          createdAt: older.createdAt || winner.createdAt,
          statusAt: winner.statusAt,
          source: older.source
        }
      };
    }
    left.items.forEach(function (it) { take(it, left); });
    right.items.forEach(function (it) { take(it, right); });
    function deletedByNewer(url, holder, other) {
      if (holder.deletedUrls.indexOf(url) < 0) return false;
      return holder.savedAt >= other.savedAt;
    }
    var items = [];
    Object.keys(map).forEach(function (url) {
      if (deletedByNewer(url, left, right) || deletedByNewer(url, right, left)) return;
      items.push(map[url].item);
    });
    items.sort(function (x, y) { return x.serial - y.serial; });
    var maxSerial = 0;
    items.forEach(function (it) { if (it.serial > maxSerial) maxSerial = it.serial; });
    var accounts = {};
    ACCOUNTS.forEach(function (ac) {
      var l = left.accounts[ac.id];
      var r = right.accounts[ac.id];
      var pick = right.savedAt >= left.savedAt ? (r || l) : (l || r);
      if (pick) accounts[ac.id] = { displayName: pick.displayName };
    });
    var newer = right.savedAt >= left.savedAt ? right : left;
    var hold = newer.hold;
    return {
      v: 1,
      nextSerial: Math.max(left.nextSerial, right.nextSerial, maxSerial + 1),
      savedAt: Math.max(left.savedAt, right.savedAt),
      deletedUrls: left.deletedUrls.concat(right.deletedUrls).filter(function (u, i, arr) { return arr.indexOf(u) === i; }),
      accounts: accounts,
      items: items,
      hold: hold
    };
  }

  function saveToStorage(storage, store) {
    storage.setItem(STORE_KEY, JSON.stringify(normalizeStore(store)));
  }

  function loadFromStorage(storage) {
    var raw = null;
    try { raw = storage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (raw == null || raw === '') return { store: emptyStore(), missing: true };
    try { return { store: normalizeStore(JSON.parse(raw)), missing: false }; }
    catch (e) { return { store: emptyStore(), corrupt: true }; }
  }

  function assessProbe(p) {
    p = p || {};
    if (!accountById(p.accountId)) return { ok: false, reason: 'アカウントが不正です' };
    if (p.loggedIn === false) return { ok: false, reason: 'ログインしていません。ご自身でログインしてから、もう一度確認してください。' };
    if (p.loggedIn !== true) return { ok: false, reason: 'ログイン状態を確認できませんでした。' };
    if (!p.displayName) return { ok: false, reason: '表示名を画面から読めませんでした。実画面の位置は未確認のため、交換は始めません。' };
    if (p.balance == null || !isFinite(p.balance)) return { ok: false, reason: '残高を確認できませんでした。' };
    if (!p.boundName) {
      return { ok: false, needsBind: true, displayName: p.displayName, balance: p.balance, reason: 'この表示名を、選んだアカウントとして覚えると続けられます。' };
    }
    if (p.boundName !== p.displayName) {
      return { ok: false, mismatch: true, displayName: p.displayName, balance: p.balance, reason: 'ログイン中の表示名が、このアカウントで覚えている名前と違います。' };
    }
    return { ok: true, displayName: p.displayName, balance: p.balance };
  }

  function parseOfferFromText(text, expectedFace) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var found = [];
    var faceRe = /(\d{1,3}(?:,\d{3})+|\d+)\s*円分/g;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      faceRe.lastIndex = 0;
      var m;
      while ((m = faceRe.exec(line))) {
        var face = parseInt(m[1].replace(/,/g, ''), 10);
        var windowText = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n').replace(m[0], ' ');
        var pm = windowText.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:ポイント|pt|ｐｔ)/i);
        var points = pm ? parseInt(pm[1].replace(/,/g, ''), 10) : null;
        if (points != null && !isFinite(points)) points = null;
        found.push({ faceYen: face, points: points });
      }
    }
    if (!found.length) return { ok: false, reason: '画面に額面（円分）が見つかりませんでした' };
    var matched = found.filter(function (f) { return f.faceYen === expectedFace; });
    if (!matched.length) {
      return { ok: false, reason: '画面の額面が1回あたりの指定と違います', faceYen: found[0].faceYen, points: found[0].points };
    }
    var distinct = {};
    matched.forEach(function (f) { distinct[String(f.points)] = f; });
    var keys = Object.keys(distinct);
    if (keys.length > 1) return { ok: false, reason: '同じ額面が複数あり、必要ポイントを一つに決められません' };
    var pick = matched[0];
    if (pick.points == null) return { ok: false, reason: '必要ポイントを画面から読めませんでした', faceYen: pick.faceYen };
    return { ok: true, faceYen: pick.faceYen, points: pick.points };
  }

  function assessOffer(o) {
    o = o || {};
    if (o.faceYen !== o.expectedFace) return { ok: false, reason: '額面が指定と違います' };
    if (!isPosInt(o.points)) return { ok: false, reason: '必要ポイントを画面から読めませんでした' };
    if (o.balance == null || !isFinite(o.balance)) return { ok: false, reason: '残高を確認できませんでした' };
    if (o.balance < o.points) return { ok: false, reason: '残高が足りません' };
    return { ok: true };
  }

  function classifyAfterFailure(o) {
    o = o || {};
    if (o.linkCaptured) return { kind: 'save', retry: false, ambiguous: false, reason: '' };
    if (!o.clickedExchange) {
      return { kind: 'abort', retry: false, ambiguous: false, reason: '交換ボタンを押す前に止まったので、再交換はしません。' };
    }
    var balanceKnown = o.balanceBefore != null && o.balanceAfter != null;
    var same = balanceKnown && o.balanceAfter === o.balanceBefore;
    if (same && o.historyHasNew === false && !o.acquiring) {
      return { kind: 'abort', retry: false, ambiguous: false, reason: '残高と履歴に増減がなかったため、交換は反映されていないと判断しました。自動では再送しません。' };
    }
    return { kind: 'hold', retry: false, ambiguous: true, reason: '交換できたか判断できません。残高と履歴を確認してください。自動では再送しません。' };
  }

  function canStart(store) {
    var cur = normalizeStore(store);
    if (cur.hold) return { ok: false, reason: cur.hold.reason || '確認が終わるまで交換は始めません。' };
    return { ok: true };
  }

  function setHold(store, reason, meta) {
    var cur = normalizeStore(store);
    cur.hold = {
      reason: String(reason || '確認してください').slice(0, 300),
      at: Date.now(),
      accountId: meta && meta.accountId || '',
      typeId: meta && meta.typeId || ''
    };
    cur.savedAt = Date.now();
    return cur;
  }

  function clearHold(store) {
    var cur = normalizeStore(store);
    cur.hold = null;
    cur.savedAt = Date.now();
    return cur;
  }

  function terminalActions(kind) {
    if (kind === 'hold') return ['unlock'];
    if (kind === 'abort') return ['close'];
    if (kind === 'done') return ['memo'];
    return ['close'];
  }

  function openHrefs(snap) {
    var out = [];
    (snap && snap.buttons || []).forEach(function (b) {
      var t = String(b.text || '');
      if (t.indexOf('ギフトを開く') < 0 || t.indexOf('利用済み') >= 0) return;
      var n = normalizeUrl(b.href || '');
      if (n && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }

  function hasExchangeButton(snap) {
    return (snap && snap.buttons || []).some(function (b) {
      var t = String(b.text || '');
      return /交換する|交換を確定/.test(t) && t.indexOf('利用済み') < 0;
    });
  }

  function hasOpenButton(snap) {
    return (snap && snap.buttons || []).some(function (b) {
      var t = String(b.text || '');
      return t.indexOf('ギフトを開く') >= 0 && t.indexOf('利用済み') < 0;
    });
  }

  function createRunState(job) {
    job = job || {};
    var count = parseInt(job.count, 10);
    var err = null;
    if (!accountById(job.accountId)) err = 'アカウントが不正です';
    else if (!job.displayName) err = '表示名が未確認です';
    else if (!typeById(job.typeId) || job.typeId === 'other') err = '種類が不正です';
    else if (!(count >= 1 && count <= 10)) err = '回数は1から10です';
    else if (job.expectedFace != null && job.expectedFace !== EXPECTED_FACE_YEN) err = '額面の指定が違います';
    return {
      ok: !err,
      error: err,
      accountId: job.accountId,
      boundName: job.displayName,
      typeId: job.typeId,
      count: count,
      expectedFace: EXPECTED_FACE_YEN,
      phase: err ? 'abort' : 'probe',
      aborted: !!err,
      abortReason: err,
      held: false,
      holdReason: '',
      clickedExchange: false,
      roundCaptured: false,
      exchangeClicks: 0,
      done: 0,
      captures: [],
      baseline: [],
      balanceBefore: null,
      expectedPoints: null,
      faceYen: null,
      acquireTicks: 0,
      openedOnce: false,
      brandWait: 0,
      confirmWait: 0
    };
  }

  function hold(state, reason) {
    var s = Object.assign({}, state, { held: true, holdReason: reason, phase: 'hold' });
    return { state: s, action: { type: 'hold', reason: reason, retry: false, ambiguous: true } };
  }

  function abort(state, reason) {
    var s = Object.assign({}, state, { aborted: true, abortReason: reason, phase: 'abort' });
    return { state: s, action: { type: 'abort', reason: reason, retry: false, ambiguous: false } };
  }

  function withBaseline(state, snap) {
    if (state.clickedExchange && !state.roundCaptured) return state;
    var hrefs = openHrefs(snap);
    if (!hrefs.length) return state;
    var base = (state.baseline || []).slice();
    hrefs.forEach(function (h) { if (base.indexOf(h) < 0) base.push(h); });
    return Object.assign({}, state, { baseline: base });
  }

  function pickNewLink(state, snap) {
    var hrefs = openHrefs(snap);
    var base = state.baseline || [];
    var fresh = hrefs.filter(function (h) { return base.indexOf(h) < 0; });
    if (fresh.length > 1) return { ambiguous: true };
    if (fresh.length === 1) return fresh[0];
    if (!hrefs.length && snap && snap.locationGift) {
      var loc = normalizeUrl(snap.locationGift);
      if (loc && base.indexOf(loc) < 0) return loc;
    }
    return null;
  }

  function captureLink(state, url, snap) {
    var norm = normalizeUrl(url);
    if (!norm) return hold(state, 'リンクの形式を確認できないため保存しません。自動では再送しません。');
    var cap = {
      url: norm,
      faceYen: state.faceYen,
      pointsShown: state.expectedPoints,
      typeId: state.typeId,
      accountId: state.accountId,
      expiresText: parseExpires(snap && snap.text),
      source: 'exchange'
    };
    var captures = state.captures.concat([cap]);
    var done = state.done + 1;
    if (done >= state.count) {
      return {
        state: Object.assign({}, state, { captures: captures, done: done, phase: 'done', roundCaptured: true, clickedExchange: false }),
        action: { type: 'done', retry: false, captures: captures, item: cap }
      };
    }
    return {
      state: Object.assign({}, state, {
        captures: captures,
        done: done,
        phase: 'between',
        roundCaptured: true,
        clickedExchange: false,
        openedOnce: false,
        acquireTicks: 0
      }),
      action: { type: 'captured', retry: false, item: cap, reason: '1件保存しました。次の回数の前に残高を見ます' }
    };
  }

  function reduce(state, snap) {
    snap = snap || {};
    if (state.held) return { state: state, action: { type: 'hold', reason: state.holdReason, retry: false, ambiguous: true } };
    if (state.aborted) return { state: state, action: { type: 'abort', reason: state.abortReason, retry: false, ambiguous: false } };
    if (state.phase === 'done') return { state: state, action: { type: 'done', retry: false, captures: state.captures } };

    if (snap.usedConfirm) {
      return { state: state, action: { type: 'click', target: 'dismiss-used', reason: '利用済みの確認を閉じます', retry: false } };
    }

    if (!state.clickedExchange || state.roundCaptured) state = withBaseline(state, snap);

    if (snap.disconnected || snap.timedOut) {
      var classified = classifyAfterFailure({
        clickedExchange: !!(state.clickedExchange && !state.roundCaptured),
        balanceBefore: state.balanceBefore,
        balanceAfter: snap.balance,
        historyHasNew: snap.historyNew,
        linkCaptured: false,
        acquiring: !!snap.acquiring
      });
      if (classified.kind === 'hold') return hold(state, classified.reason);
      return abort(state, classified.reason);
    }

    if (state.phase === 'probe') {
      var assessed = assessProbe({
        accountId: state.accountId,
        boundName: state.boundName,
        loggedIn: snap.loggedIn,
        displayName: snap.displayName,
        balance: snap.balance
      });
      if (!assessed.ok) return abort(state, assessed.reason);
      return {
        state: Object.assign({}, state, { phase: 'pick-brand', balanceBefore: assessed.balance }),
        action: { type: 'wait', reason: 'ログインと残高を確認しました', retry: false }
      };
    }

    if (state.phase === 'pick-brand') {
      var early = parseOfferFromText(snap.text, state.expectedFace);
      if (early.ok || early.faceYen) {
        return reduce(Object.assign({}, state, { phase: 'check-offer' }), snap);
      }
      var type = typeById(state.typeId);
      if (!type) return abort(state, '種類が不正です');
      return {
        state: Object.assign({}, state, { phase: 'wait-brand', brandWait: 0 }),
        action: { type: 'click', target: 'brand', keys: type.keys, label: type.label, retry: false }
      };
    }

    if (state.phase === 'wait-brand') {
      var seen = parseOfferFromText(snap.text, state.expectedFace);
      if (seen.ok || seen.faceYen) return reduce(Object.assign({}, state, { phase: 'check-offer' }), snap);
      var waits = (state.brandWait || 0) + 1;
      if (waits > BRAND_WAIT_LIMIT) return abort(state, '種類の画面に進めませんでした。交換ボタンは押していません。');
      return { state: Object.assign({}, state, { brandWait: waits }), action: { type: 'wait', reason: '種類の画面を待っています', retry: false } };
    }

    if (state.phase === 'check-offer') {
      var offer = parseOfferFromText(snap.text, state.expectedFace);
      if (!offer.ok) return abort(state, offer.reason);
      var balanceNow = snap.balance != null ? snap.balance : state.balanceBefore;
      var check = assessOffer({ faceYen: offer.faceYen, points: offer.points, balance: balanceNow, expectedFace: state.expectedFace });
      if (!check.ok) return abort(state, check.reason);
      return {
        state: Object.assign({}, state, {
          phase: 'select-offer',
          expectedPoints: offer.points,
          faceYen: offer.faceYen,
          balanceBefore: balanceNow
        }),
        action: { type: 'wait', reason: '額面と必要ポイントを画面で確認しました', retry: false, faceYen: offer.faceYen, points: offer.points }
      };
    }

    if (state.phase === 'select-offer') {
      if (state.clickedExchange) return hold(state, 'すでに交換操作に入っています。自動では押し直しません。');
      return {
        state: Object.assign({}, state, { phase: 'confirm', confirmWait: 0 }),
        action: { type: 'click', target: 'offer', faceYen: state.faceYen, points: state.expectedPoints, retry: false }
      };
    }

    if (state.phase === 'confirm') {
      if (state.clickedExchange) return hold(state, '交換ボタンは押済みです。自動では再送しません。');
      if (snap.balance != null && state.expectedPoints != null && snap.balance < state.expectedPoints) {
        return abort(state, '押す直前の残高が足りません');
      }
      if (hasExchangeButton(snap)) {
        return {
          state: Object.assign({}, state, {
            clickedExchange: true,
            exchangeClicks: (state.exchangeClicks || 0) + 1,
            phase: 'after-click',
            roundCaptured: false,
            openedOnce: false,
            acquireTicks: 0
          }),
          action: { type: 'click', target: 'confirm-exchange', retry: false }
        };
      }
      var cw = (state.confirmWait || 0) + 1;
      if (cw > CONFIRM_WAIT_LIMIT) return abort(state, '確認ボタンが出ないため、押す前に止めました');
      return { state: Object.assign({}, state, { confirmWait: cw }), action: { type: 'wait', reason: '確認画面を待っています', retry: false } };
    }

    if (state.phase === 'after-click' || state.phase === 'acquiring' || state.phase === 'open') {
      if (state.exchangeClicks > state.done + 1) return hold(state, '交換操作が重なったため止めました。自動では再送しません。');
      if (snap.acquiring) {
        var ticks = (state.acquireTicks || 0) + 1;
        if (ticks > ACQUIRE_LIMIT) {
          return hold(Object.assign({}, state, { acquireTicks: ticks }), '取得中のまま終わらないため止めました。残高と履歴を確認してください。自動では再送しません。');
        }
        return {
          state: Object.assign({}, state, { phase: 'acquiring', acquireTicks: ticks }),
          action: { type: 'wait', reason: '取得中が終わるのを待っています', retry: false }
        };
      }
      var picked = pickNewLink(state, snap);
      if (picked && picked.ambiguous) {
        return hold(state, '新しいギフトを一つに決められません。残高と履歴を確認してください。自動では再送しません。');
      }
      if (typeof picked === 'string') return captureLink(state, picked, snap);
      if (!state.openedOnce && hasOpenButton(snap)) {
        return {
          state: Object.assign({}, state, { phase: 'open', openedOnce: true }),
          action: { type: 'click', target: 'open-gift', retry: false }
        };
      }
      if (state.openedOnce) {
        return hold(state, 'ギフトを開いたあとのリンクを確認できませんでした。自動では再送しません。');
      }
      return { state: state, action: { type: 'wait', reason: '交換結果を待っています', retry: false } };
    }

    if (state.phase === 'between') {
      if (snap.balance == null) return hold(state, '次の交換の前に残高を読めませんでした。自動では続けません。');
      var again = assessOffer({
        faceYen: state.faceYen,
        points: state.expectedPoints,
        balance: snap.balance,
        expectedFace: state.expectedFace
      });
      if (!again.ok) return abort(Object.assign({}, state, { clickedExchange: false }), again.reason);
      var offerAgain = parseOfferFromText(snap.text, state.expectedFace);
      if (!offerAgain.ok) return abort(state, offerAgain.reason);
      if (offerAgain.points !== state.expectedPoints || offerAgain.faceYen !== state.faceYen) {
        return abort(state, '次の画面の額面か必要ポイントが先ほどと違います');
      }
      return reduce(Object.assign({}, state, {
        phase: 'select-offer',
        clickedExchange: false,
        roundCaptured: false,
        openedOnce: false,
        acquireTicks: 0,
        balanceBefore: snap.balance,
        expectedPoints: offerAgain.points,
        faceYen: offerAgain.faceYen
      }), snap);
    }

    return abort(state, '内部状態が不正なため止めました');
  }

  function runScenario(job, frames) {
    var state = createRunState(job);
    var log = { exchangeClicks: 0, usedClicks: 0, dismissClicks: 0, openClicks: 0, brandClicks: 0, actions: [] };
    if (!state.ok) return { state: state, log: log };
    for (var i = 0; i < frames.length; i++) {
      var step = reduce(state, frames[i]);
      state = step.state;
      log.actions.push(step.action);
      if (step.action && step.action.target === 'mark-used') log.usedClicks += 1;
      if (step.action && step.action.type === 'click' && step.action.target === 'confirm-exchange') log.exchangeClicks += 1;
      if (step.action && step.action.type === 'click' && step.action.target === 'dismiss-used') log.dismissClicks += 1;
      if (step.action && step.action.type === 'click' && step.action.target === 'open-gift') log.openClicks += 1;
      if (step.action && step.action.type === 'click' && step.action.target === 'brand') log.brandClicks += 1;
      if (step.action && (step.action.type === 'hold' || step.action.type === 'abort' || step.action.type === 'done')) break;
    }
    return { state: state, log: log };
  }

  return {
    STORE_KEY: STORE_KEY,
    EXPECTED_FACE_YEN: EXPECTED_FACE_YEN,
    ACQUIRE_LIMIT: ACQUIRE_LIMIT,
    ACCOUNTS: ACCOUNTS,
    TYPES: TYPES,
    emptyStore: emptyStore,
    normalizeUrl: normalizeUrl,
    escapeHtml: escapeHtml,
    expiresLabel: expiresLabel,
    parseExpires: parseExpires,
    parseBalance: parseBalance,
    parseDisplayName: parseDisplayName,
    normalizeStore: normalizeStore,
    addLink: addLink,
    setStatus: setStatus,
    removeLink: removeLink,
    filterItems: filterItems,
    rememberAccount: rememberAccount,
    mergeStores: mergeStores,
    saveToStorage: saveToStorage,
    loadFromStorage: loadFromStorage,
    assessProbe: assessProbe,
    parseOfferFromText: parseOfferFromText,
    assessOffer: assessOffer,
    classifyAfterFailure: classifyAfterFailure,
    canStart: canStart,
    setHold: setHold,
    clearHold: clearHold,
    terminalActions: terminalActions,
    createRunState: createRunState,
    reduce: reduce,
    runScenario: runScenario,
    accountById: accountById,
    typeById: typeById
  };
});
