/*
 * アプリ内のギフトリンク保管。スプレッドシートや他Botの保管庫は見ない。
 * リンクは資格情報として扱い、このモジュールは外部へ送らない。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GwGiftVault = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var KEY = 'gwGiftMemos';
  var SEQ = 'gwGiftMemoSeq';
  var ACCOUNTS = ['モーリー', 'めぱん', 'モリ母', '未確認'];
  var KINDS = ['au PAY', 'majica', 'Vポイント', 'kyash', 'Amazon', 'WAON'];

  function validateLink(raw) {
    var s = String(raw || '').trim();
    if (!s || /[\s<>"']/.test(s)) return { ok: false, code: 'bad_link' };
    if (!/^https:\/\//i.test(s)) return { ok: false, code: 'bad_link' };
    var u;
    try { u = new URL(s); } catch (e) { return { ok: false, code: 'bad_link' }; }
    if (u.protocol !== 'https:') return { ok: false, code: 'bad_link' };
    if (u.username || u.password) return { ok: false, code: 'bad_link' };
    if (u.href.length > 2000) return { ok: false, code: 'bad_link' };
    return { ok: true, url: u.href };
  }

  function linkKey(raw) {
    var v = validateLink(raw);
    if (!v.ok) return '';
    var u = new URL(v.url);
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'https:' && u.port === '443') || u.port === '') {
      /* keep default */
    }
    var path = u.pathname.replace(/\/+$/, '');
    if (!path) path = '';
    return 'https://' + u.hostname + (u.port && u.port !== '443' ? ':' + u.port : '') + path + u.search + u.hash;
  }

  function cleanText(value, max) {
    var s = String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim();
    if (s.length > max) s = s.slice(0, max);
    return s;
  }

  function normalizeExpiry(value) {
    if (value == null || value === '' || value === '未確認') return null;
    var m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { error: 'bad_expiry' };
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mo || dt.getDate() !== d) return { error: 'bad_expiry' };
    return { value: m[1] + '-' + m[2] + '-' + m[3] };
  }

  function normalizeAccount(value, fallback) {
    var s = cleanText(value, 20);
    if (!s) return fallback || '未確認';
    if (ACCOUNTS.indexOf(s) < 0) return { error: 'bad_account' };
    return s;
  }

  function normalizeKind(value) {
    var s = cleanText(value, 24);
    if (!s) return { error: 'bad_kind' };
    return s;
  }

  function normalizeFace(value, allowEmpty) {
    if (value == null || value === '') {
      return allowEmpty ? null : { error: 'bad_face' };
    }
    var n = parseInt(String(value).replace(/[,，\s円]/g, ''), 10);
    if (!n || n < 1 || n > 10000000) return { error: 'bad_face' };
    return n;
  }

  function sanitizeExisting(row) {
    if (!row || typeof row !== 'object') return null;
    var key = linkKey(row.link);
    if (!key) return null;
    var exp = normalizeExpiry(row.expiry);
    var account = normalizeAccount(row.account, '未確認');
    var kind = normalizeKind(row.kind || '未確認');
    if (account && account.error) account = '未確認';
    if (kind && kind.error) kind = '未確認';
    var face = normalizeFace(row.faceYen, true);
    if (face && face.error) face = null;
    var status = row.status === 'used' ? 'used' : 'unused';
    var seq = parseInt(row.seq, 10);
    if (!seq || seq < 1) return null;
    return {
      id: cleanText(row.id, 40) || ('g' + seq),
      seq: seq,
      link: new URL(row.link).href,
      faceYen: face,
      kind: kind,
      expiry: exp && exp.error ? null : (exp ? exp.value : null),
      account: account,
      status: status,
      createdAt: cleanText(row.createdAt, 40)
    };
  }

  function memoryStorage(seed) {
    var data = Object.assign({}, seed || {});
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); }
    };
  }

  function createVault(storage) {
    storage = storage || memoryStorage();

    function readRaw() {
      var text = '';
      try { text = storage.getItem(KEY) || '[]'; } catch (e) { text = '[]'; }
      var rows;
      try { rows = JSON.parse(text); } catch (e2) { rows = []; }
      if (!Array.isArray(rows)) rows = [];
      var records = [];
      var seen = {};
      rows.forEach(function (row) {
        var rec = sanitizeExisting(row);
        if (!rec) return;
        var key = linkKey(rec.link);
        if (seen[key]) return;
        seen[key] = 1;
        records.push(rec);
      });
      var seq = parseInt(storage.getItem(SEQ) || '0', 10) || 0;
      records.forEach(function (r) { if (r.seq > seq) seq = r.seq; });
      return { records: records, seq: seq };
    }

    function write(state) {
      storage.setItem(KEY, JSON.stringify(state.records));
      storage.setItem(SEQ, String(state.seq));
    }

    function list(filter) {
      filter = filter || {};
      return readRaw().records.filter(function (r) {
        if (filter.kind && filter.kind !== 'すべて' && r.kind !== filter.kind) return false;
        if (filter.account && filter.account !== 'すべて' && r.account !== filter.account) return false;
        if (filter.status && filter.status !== 'すべて' && r.status !== filter.status) return false;
        return true;
      });
    }

    function add(input) {
      input = input || {};
      var v = validateLink(input.link);
      if (!v.ok) return { ok: false, code: 'bad_link' };
      var state = readRaw();
      var key = linkKey(v.url);
      for (var i = 0; i < state.records.length; i++) {
        if (linkKey(state.records[i].link) === key) return { ok: false, code: 'duplicate' };
      }
      var kind = normalizeKind(input.kind);
      if (kind.error) return { ok: false, code: kind.error };
      var account = normalizeAccount(input.account, '未確認');
      if (account.error) return { ok: false, code: account.error };
      var face = normalizeFace(input.faceYen, !!input.allowEmptyFace);
      if (face && face.error) return { ok: false, code: face.error };
      var exp = normalizeExpiry(input.expiry);
      if (exp && exp.error) return { ok: false, code: exp.error };
      var status = input.status === 'used' ? 'used' : 'unused';
      var seq = state.seq + 1;
      var rec = {
        id: 'g' + seq + 'x' + Math.floor(Math.random() * 1000),
        seq: seq,
        link: v.url,
        faceYen: face,
        kind: kind,
        expiry: exp ? exp.value : null,
        account: account,
        status: status,
        createdAt: input.createdAt || new Date().toISOString()
      };
      state.records.push(rec);
      state.seq = seq;
      write(state);
      return { ok: true, record: rec };
    }

    function update(id, patch) {
      patch = patch || {};
      var state = readRaw();
      var idx = -1;
      for (var i = 0; i < state.records.length; i++) if (state.records[i].id === id) idx = i;
      if (idx < 0) return { ok: false, code: 'missing' };
      var cur = state.records[idx];
      var next = {
        id: cur.id,
        seq: cur.seq,
        link: cur.link,
        faceYen: cur.faceYen,
        kind: cur.kind,
        expiry: cur.expiry,
        account: cur.account,
        status: cur.status,
        createdAt: cur.createdAt
      };
      if (Object.prototype.hasOwnProperty.call(patch, 'link') && patch.link !== cur.link) {
        var v = validateLink(patch.link);
        if (!v.ok) return { ok: false, code: 'bad_link' };
        var key = linkKey(v.url);
        for (var j = 0; j < state.records.length; j++) {
          if (j !== idx && linkKey(state.records[j].link) === key) return { ok: false, code: 'duplicate' };
        }
        next.link = v.url;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
        var kind = normalizeKind(patch.kind);
        if (kind.error) return { ok: false, code: kind.error };
        next.kind = kind;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'account')) {
        var account = normalizeAccount(patch.account, '未確認');
        if (account.error) return { ok: false, code: account.error };
        next.account = account;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'faceYen')) {
        var face = normalizeFace(patch.faceYen, patch.faceYen === '' || patch.faceYen == null);
        if (face && face.error) return { ok: false, code: face.error };
        next.faceYen = face;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'expiry')) {
        var exp = normalizeExpiry(patch.expiry);
        if (exp && exp.error) return { ok: false, code: exp.error };
        next.expiry = exp ? exp.value : null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
        if (patch.status !== 'used' && patch.status !== 'unused') return { ok: false, code: 'bad_status' };
        next.status = patch.status;
      }
      state.records[idx] = next;
      write(state);
      return { ok: true, record: next };
    }

    function setStatus(id, status) {
      return update(id, { status: status });
    }

    function remove(id) {
      var state = readRaw();
      var before = state.records.length;
      state.records = state.records.filter(function (r) { return r.id !== id; });
      if (state.records.length === before) return { ok: false, code: 'missing' };
      write(state);
      return { ok: true, seq: state.seq };
    }

    function importNew(items) {
      var added = 0;
      var skipped = 0;
      (items || []).forEach(function (item) {
        var res = add(Object.assign({ allowEmptyFace: true, expiry: null, account: '未確認', status: 'unused' }, item || {}));
        if (res.ok) added++;
        else skipped++;
      });
      return { added: added, skipped: skipped };
    }

    return { list: list, add: add, update: update, setStatus: setStatus, remove: remove, importNew: importNew, readRaw: readRaw };
  }

  function mergeJson(localText, remoteText) {
    var localVault = createVault(memoryStorage());
    var remoteRows = [];
    var localRows = [];
    try { localRows = JSON.parse(localText || '[]'); } catch (e) { localRows = []; }
    try { remoteRows = JSON.parse(remoteText || '[]'); } catch (e2) { remoteRows = []; }
    if (!Array.isArray(localRows)) localRows = [];
    if (!Array.isArray(remoteRows)) remoteRows = [];
    var store = memoryStorage();
    store.setItem(KEY, JSON.stringify(localRows));
    var seq = 0;
    localRows.forEach(function (r) { var n = parseInt(r && r.seq, 10) || 0; if (n > seq) seq = n; });
    store.setItem(SEQ, String(seq));
    var vault = createVault(store);
    remoteRows.forEach(function (row) {
      var rec = sanitizeExisting(row);
      if (!rec) return;
      var res = vault.add({
        link: rec.link,
        faceYen: rec.faceYen,
        kind: rec.kind,
        expiry: rec.expiry,
        account: rec.account,
        status: rec.status,
        allowEmptyFace: true,
        createdAt: rec.createdAt
      });
      if (!res.ok && res.code === 'duplicate') {
        /* 既存レコードは上書きしない */
      }
    });
    return store.getItem(KEY);
  }

  function viewModel(record) {
    record = record || {};
    var host = '';
    try { host = new URL(record.link).hostname; } catch (e) { host = ''; }
    return {
      seq: record.seq ? String(record.seq) : '',
      kind: String(record.kind || ''),
      face: record.faceYen ? Number(record.faceYen).toLocaleString('ja-JP') + '円' : '未確認',
      account: String(record.account || '未確認'),
      expiry: record.expiry ? String(record.expiry) : '未確認',
      statusLabel: record.status === 'used' ? '使用済み' : '未使用',
      status: record.status === 'used' ? 'used' : 'unused',
      linkLabel: host || 'リンク'
    };
  }

  return {
    KEY: KEY,
    SEQ: SEQ,
    ACCOUNTS: ACCOUNTS,
    KINDS: KINDS,
    validateLink: validateLink,
    linkKey: linkKey,
    createVault: createVault,
    memoryStorage: memoryStorage,
    mergeJson: mergeJson,
    viewModel: viewModel,
    sanitizeExisting: sanitizeExisting
  };
});
