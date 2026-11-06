/*
 * 交換の判断だけを行う。ログイン中の画面から読めた額面・必要ポイント・残高以外では進めない。
 * 額面の候補一覧は、確認済みとして渡されたものか、認証済み画面の文面から読めたものだけ。
 * 未確認の種類に額面を推測して足さない。実サイトのDOMで成功したとは扱わない。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GwExchangeGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fixedOffers(faces) {
    return faces.map(function (face) { return { faceYen: face, points: face, officialFace: true }; });
  }
  // 2026-11-07 の公式商品一覧。固定額面だけをボタンにする。範囲商品の入力単位は未確認。
  var CONFIRMED_OFFERS = {
    'au PAY': {
      mode: 'fixed',
      options: fixedOffers([50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000]),
      note: {
        confirmedOn: '2026-11-07',
        itemsUrl: 'https://wallet.vaton.jp/point/brands/916f4fa7-60fd-4afb-a97b-abc969f09a9d/items',
        expiryRule: '交換から5か月後の月末',
        chargeLimitNote: '月間10万円はau PAYギフトカードのチャージ上限です。交換できる回数の上限ではありません。'
      }
    },
    'majica': {
      mode: 'fixed',
      inStock: false,
      options: fixedOffers([300, 500, 1000, 3000, 5000, 10000]),
      note: {
        confirmedOn: '2026-11-07',
        officialName: 'ドン・キホーテ、アピタ、ピアゴ',
        itemsUrl: 'https://wallet.vaton.jp/point/brands/1abacf75-d225-4688-9e11-2213fcc12a92/items',
        expiryRule: '交換から6カ月後の前日',
        rewardNote: '3%還元の表示は、必要ポイントの即時割引ではありません。1万円は10000ポイントです。'
      }
    },
    'Kyash': {
      mode: 'fixed',
      options: fixedOffers([200, 500, 1000, 10000]),
      note: {
        confirmedOn: '2026-11-07',
        itemsUrl: 'https://wallet.vaton.jp/point/brands/08d5d3be-760b-4746-9505-0846b240ba97/items'
      }
    },
    'Amazon': {
      mode: 'range',
      minPoints: 1,
      maxPoints: 10000,
      unitConfirmed: true,
      inputUnit: 'points',
      note: {
        confirmedOn: '2026-11-07',
        itemsUrl: 'https://wallet.vaton.jp/point/brands/4a1e8d0d-41ab-4c44-bac4-0a95661fde6a/items',
        detailUrl: 'https://wallet.vaton.jp/point/items/8c984412-68f1-44db-a0f2-ba740533ae6d',
        rewardNote: '1%還元の表示は、必要ポイントの割引ではありません。'
      }
    },
    'WAON': {
      mode: 'range',
      minPoints: 1,
      maxPoints: 10000,
      unitConfirmed: true,
      inputUnit: 'points',
      note: {
        confirmedOn: '2026-11-07',
        itemsUrl: 'https://wallet.vaton.jp/point/brands/53b28503-6b28-4441-9c16-6f912af88373/items',
        detailUrl: 'https://wallet.vaton.jp/point/items/a53c9863-5c99-4b32-a37e-cb2f68225230',
        officialName: 'WAON POINT eギフト'
      }
    }
  };
  var RANGE_PRESETS = [1000, 3000, 5000, 10000];
  var KINDS = [
    { id: 'au PAY', keys: ['au pay', 'aupay'], available: true },
    { id: 'majica', keys: ['majica', 'マジカ', 'ドン・キホーテ', 'アピタ', 'ピアゴ'], available: true },
    { id: 'Kyash', keys: ['kyash'], available: true },
    { id: 'Amazon', keys: ['amazon', 'アマゾン'], available: true },
    { id: 'Vポイント', keys: ['vポイント', 'vpoint'], available: false },
    { id: 'WAON', keys: ['waon', 'ワオン'], available: true }
  ];

  function kindInfo(kind) {
    var id = normalizeKind(kind);
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i];
    return null;
  }

  function kindAvailable(kind) {
    var info = kindInfo(kind);
    return !!(info && info.available !== false);
  }

  function normalizeKind(name) {
    var s = String(name || '').trim();
    var low = s.toLowerCase();
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      if (k.id === s || k.id.toLowerCase() === low) return k.id;
      for (var j = 0; j < k.keys.length; j++) {
        if (low.indexOf(k.keys[j]) >= 0) return k.id;
      }
    }
    return s;
  }

  function kindKeys(kind) {
    var id = normalizeKind(kind);
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].id === id) return KINDS[i].keys.slice();
    }
    return [String(kind || '').toLowerCase()];
  }

  function digits(n) {
    if (n == null || n === '') return null;
    if (typeof n === 'number' && isFinite(n)) return Math.round(n);
    var v = parseInt(String(n).replace(/[,，\s]/g, ''), 10);
    return isNaN(v) ? null : v;
  }

  function stop(code, message) {
    return { action: 'stop', code: code, message: message, points: null, faceYen: null };
  }

  function sessionContinuity(startKey, nowKey) {
    var start = startKey == null ? '' : String(startKey);
    var now = nowKey == null ? '' : String(nowKey);
    if (!start || !now) return { ok: false, identified: false, code: 'session_unknown' };
    if (start === now) return { ok: true, identified: true };
    return { ok: false, identified: false, code: 'session_changed' };
  }

  function authCookieMaterial(header) {
    if (!header) return '';
    var ignore = /^(?:_ga|_gid|_gat|_gcl|_clck|_clsk|__cf|cf_|clarity|sentry)/i;
    var auth = /session|sid|auth|token|jwt|remember/i;
    var chosen = [];
    String(header).split(';').forEach(function (part) {
      var bits = part.split('=');
      var name = (bits.shift() || '').trim();
      var value = bits.join('=').trim();
      if (!name || !value) return;
      if (ignore.test(name) || !auth.test(name)) return;
      chosen.push(name + '=' + value);
    });
    chosen.sort();
    return chosen.join('|');
  }

  function parseScreenOffers(text, kind) {
    var keys = kind ? kindKeys(kind) : [];
    var lines = String(text || '').split(/\n+/);
    var seen = {};
    var out = [];
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+/g, ' ').trim();
      if (!line || line.length > 80) return;
      if (keys.length) {
        var low = line.toLowerCase();
        var hit = false;
        for (var i = 0; i < keys.length; i++) if (low.indexOf(keys[i]) >= 0) hit = true;
        if (!hit) return;
      }
      var fm = line.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,7})\s*円/);
      if (!fm) return;
      var face = parseInt(fm[1].replace(/,/g, ''), 10);
      if (!face) return;
      var points = null;
      var pm = line.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,7})\s*(?:ポイント|pt|Ｐ)/i);
      if (pm) {
        var pts = parseInt(pm[1].replace(/,/g, ''), 10);
        if (pts > 0) points = pts;
      }
      if (seen[face]) return;
      seen[face] = 1;
      out.push({ faceYen: face, points: points });
    });
    return out;
  }

  function offerRecord(kind) {
    return CONFIRMED_OFFERS[normalizeKind(kind)] || null;
  }

  function faceChoices(kind, extra) {
    extra = extra || {};
    var id = normalizeKind(kind);
    if (!kindAvailable(id)) return { status: 'unavailable', options: [], presets: [] };
    var record = offerRecord(id);
    if (record && record.mode === 'fixed' && record.options && record.options.length) {
      if (record.inStock === false && extra.stockAvailable !== true) {
        return { status: 'out_of_stock', options: record.options.slice(), presets: [], note: record.note || null, canExecute: false };
      }
      return { status: 'confirmed', options: record.options.slice(), presets: [], note: record.note || null, canExecute: true };
    }
    if (record && record.mode === 'out_of_stock') {
      return { status: 'out_of_stock', options: [], presets: [], note: record.note || null };
    }
    if (record && record.mode === 'range') {
      var presets = [];
      if (record.unitConfirmed) {
        RANGE_PRESETS.forEach(function (n) {
          if (n >= record.minPoints && n <= record.maxPoints) presets.push({ points: n, officialFace: false });
        });
      }
      return {
        status: record.unitConfirmed ? 'range' : 'range_pending',
        options: [],
        presets: presets,
        range: { minPoints: record.minPoints, maxPoints: record.maxPoints },
        inputUnit: 'points',
        note: record.note || null
      };
    }
    if (extra.screenText && record && record.mode === 'fixed') {
      var parsed = parseScreenOffers(extra.screenText, id);
      if (parsed.length) return { status: 'screen', options: parsed, presets: [] };
    }
    return { status: 'waiting', options: [], presets: [] };
  }

  function parsePointAmount(raw, minPoints, maxPoints) {
    if (raw == null) return { ok: false, code: 'empty' };
    var s = String(raw).trim().replace(/[,\s，]/g, '').replace(/ポイント|pt|Ｐ/ig, '');
    if (!s) return { ok: false, code: 'empty' };
    if (!/^\d+$/.test(s)) return { ok: false, code: 'invalid' };
    var n = parseInt(s, 10);
    if (n < minPoints || n > maxPoints) return { ok: false, code: 'range' };
    return { ok: true, points: n };
  }

  function decideExchange(input) {
    input = input || {};
    var count = digits(input.count);
    var balance = input.balance == null || input.balance === '' ? null : digits(input.balance);
    var face = input.faceYen == null || input.faceYen === '' ? null : digits(input.faceYen);
    var selected = input.selectedFace == null || input.selectedFace === '' ? null : digits(input.selectedFace);
    var points = input.points == null || input.points === '' ? null : digits(input.points);
    var kind = normalizeKind(input.kind);
    if (!kindAvailable(kind)) {
      return stop('unavailable', 'この交換先はいま選べません。');
    }
    var choices = faceChoices(kind, { stockAvailable: input.stockAvailable === true });
    if (choices.status === 'unavailable' || choices.status === 'out_of_stock' || choices.status === 'waiting' || choices.status === 'range_pending') {
      return stop('face_waiting', 'この交換先はいま金額を確定できないので、交換を始めません。');
    }
    if (input.loggedIn !== true) {
      return stop('logged_out', 'アプリ内のギフトウォレットにログインできていません。交換を止めました。');
    }
    var cont = sessionContinuity(input.sessionStart, input.sessionNow);
    if (!cont.ok) {
      if (cont.code === 'session_unknown') {
        return stop('session_unknown', 'ログイン中のセッションを確認できないので、交換を止めました。アカウントの取り違えを防げない状態では始めません。');
      }
      return stop('session_changed', 'ログイン中のセッションが変わった可能性があるので、交換を止めました。入り直してから確認してください。');
    }
    if (!count || count < 1 || count > 20) {
      return stop('count_invalid', '交換の回数を確認できません。交換を止めました。');
    }
    if (choices.status === 'range') {
      var parsed = parsePointAmount(input.selectedPoints, choices.range.minPoints, choices.range.maxPoints);
      if (!parsed.ok) return stop('invalid_points', 'ポイントは1から10,000の整数で指定してください。');
      if (points == null || points <= 0) return stop('points_unknown', '画面のポイントを確認できません。交換を止めました。');
      if (points !== parsed.points) return stop('points_mismatch', '画面のポイントが入力した値と違います。交換を止めました。');
      if (balance == null) return stop('balance_unknown', '残高を確認できません。交換を止めました。');
      if (balance < points * count) return stop('balance_short', '残高が足りません。交換を止めました。');
      return { action: 'proceed', code: 'ok', message: '', points: points, faceYen: null, need: points * count, kind: kind, identified: cont.identified, count: count, inputUnit: 'points' };
    }
    if (choices.status !== 'confirmed') {
      return stop('face_waiting', 'この交換先の額面はまだ確定していません。交換を始めません。');
    }
    if (!selected) {
      return stop('face_unknown', '額面が選ばれていません。確認できるまで交換しません。');
    }
    if (face == null) {
      return stop('face_unknown', '画面の額面を確認できません。候補は出しません。');
    }
    if (face !== selected) {
      return stop('face_mismatch', '画面の額面が選んだ額面と違います。交換を止めました。');
    }
    if (points == null || points <= 0) {
      return stop('points_unknown', '画面の必要ポイントを確認できません。交換を止めました。');
    }
    var known = null;
    var knownList = (offerRecord(kind) && offerRecord(kind).options) || [];
    for (var ki = 0; ki < knownList.length; ki++) {
      if (digits(knownList[ki].faceYen) === face) known = knownList[ki];
    }
    if (!known) {
      return stop('face_unknown', '確認済みの額面にないため、交換を止めました。');
    }
    if (known && known.points != null && digits(known.points) !== points) {
      return stop('points_mismatch', '画面の必要ポイントが確認済みの値と違います。交換を止めました。');
    }
    if (balance == null) {
      return stop('balance_unknown', '残高を確認できません。交換を止めました。');
    }
    if (balance < points * count) {
      return stop('balance_short', '残高が足りません。交換を止めました。');
    }
    return {
      action: 'proceed',
      code: 'ok',
      message: '',
      points: points,
      faceYen: face,
      need: points * count,
      kind: kind,
      identified: cont.identified,
      count: count
    };
  }

  function lockFromFailure(info) {
    info = info || {};
    var pressed = !!info.pressed;
    var timedOut = !!info.timedOut;
    var phase = info.phase || '';
    var unknown = pressed || timedOut || phase === 'waitResult' || phase === 'openGift' || phase === 'afterClick';
    return {
      mode: unknown ? 'unknown' : 'hold',
      reason: String(info.reason || (unknown ? '結果が確認できません' : '交換を中断しました')),
      pressed: pressed,
      phase: phase
    };
  }

  function allowRestart(lock, confirm) {
    if (!lock) return { ok: true, code: 'clear' };
    confirm = confirm || {};
    if (!confirm.balanceChecked || !confirm.historyChecked) {
      return { ok: false, code: 'need_check' };
    }
    if (lock.mode === 'unknown' && confirm.manualResolved !== 'not_exchanged' && confirm.manualResolved !== 'exchanged') {
      return { ok: false, code: 'still_unknown' };
    }
    return { ok: true, code: 'cleared' };
  }

  var CLOSE_LABELS = { '閉じる': 1, 'とじる': 1, 'キャンセル': 1, '戻る': 1, '×': 1, '✕': 1 };

  function isMarkUsedLabel(label) {
    return /利用済みにする/.test(String(label || ''));
  }

  function dismissUsedDialog(buttons) {
    var list = buttons || [];
    var close = null;
    for (var i = 0; i < list.length; i++) {
      var raw = String(list[i] || '');
      if (isMarkUsedLabel(raw)) continue;
      var t = raw.replace(/\s+/g, '');
      if (CLOSE_LABELS[t]) close = raw;
    }
    return close;
  }

  function extractHttpsLinks(text, hrefs) {
    var out = [];
    function add(raw) {
      var s = String(raw || '').trim().replace(/[),。、．]+$/g, '');
      if (!/^https:\/\//i.test(s)) return;
      if (/[\s<>"']/.test(s)) return;
      var u;
      try { u = new URL(s); } catch (e) { return; }
      if (u.protocol !== 'https:') return;
      if (u.username || u.password) return;
      if (u.href.length > 2000) return;
      if (out.indexOf(u.href) < 0) out.push(u.href);
    }
    var list = hrefs || [];
    for (var i = 0; i < list.length; i++) add(list[i]);
    var found = String(text || '').match(/https:\/\/[^\s"'<>]+/g) || [];
    for (var j = 0; j < found.length; j++) add(found[j]);
    return out;
  }

  function redact(text) {
    return String(text || '')
      .replace(/https?:\/\/\S+/gi, '[link]')
      .replace(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2,}\b/g, '[code]')
      .replace(/(?<![0-9])[0-9]{12,20}(?![0-9])/g, '[code]');
  }

  function parseExpiry(text) {
    var s = String(text || '');
    if (!/有効期限|ご利用期限|利用期限|期限/.test(s)) return null;
    var m = s.match(/(20\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mo || dt.getDate() !== d) return null;
    return m[1] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }

  function cloneState(state) {
    return {
      phase: state.phase,
      pressed: !!state.pressed,
      index: state.index || 0,
      saved: (state.saved || []).slice(),
      points: state.points == null ? null : state.points,
      account: state.account,
      kind: state.kind,
      count: state.count,
      balanceLeft: state.balanceLeft == null ? null : state.balanceLeft,
      openedClick: !!state.openedClick,
      baseline: (state.baseline || []).slice(),
      brandsNav: !!state.brandsNav,
      faceYen: state.faceYen == null ? null : state.faceYen,
      sessionKey: state.sessionKey || '',
      inputUnit: state.inputUnit || ''
    };
  }

  function usableBalance(state, page) {
    var pageBal = page.balance == null || page.balance === '' ? null : digits(page.balance);
    if (state.balanceLeft == null) return pageBal;
    if (pageBal == null) return state.balanceLeft;
    return Math.min(pageBal, state.balanceLeft);
  }

  function isOwnGiftLink(url) {
    return !/wallet\.vaton\.jp|google\.|gstatic|sentry\.|clarity\.|facebook\.|doubleclick|youtube\.|apple\.com|play\.google/i.test(url);
  }

  function exchangeStep(state, page) {
    state = cloneState(state || {});
    page = page || {};
    var buttons = page.buttons || [];
    var text = String(page.text || '');

    var labels = buttons.map(function (b) { return String(b || '').replace(/\s+/g, ''); });
    var hasUsedButton = labels.some(function (t) { return isMarkUsedLabel(t); });
    var onlyUsedDialog = hasUsedButton && labels.length > 0 && labels.every(function (t) {
      return isMarkUsedLabel(t) || CLOSE_LABELS[t];
    });
    var usedConfirm = hasUsedButton && ((/利用済みに/.test(text) && /よろしいですか|確認しますか|本当に/.test(text)) || onlyUsedDialog);
    if (usedConfirm) {
      var close = dismissUsedDialog(buttons);
      if (close) return { state: state, actions: [{ type: 'click', label: close }] };
      return { state: state, actions: [{ type: 'closeDialog' }] };
    }

    if (state.phase === 'check') {
      var remaining = (state.count || 0) - (state.index || 0);
      var needFace = state.inputUnit !== 'points';
      if (page.loggedIn !== true || page.balance == null || page.points == null || (needFace && page.faceYen == null)) {
        if (page.timedOut) {
          return {
            state: Object.assign(state, { phase: 'stopped' }),
            actions: [{ type: 'fail', code: 'unreadable', message: '画面のログイン・残高・額面を確認できません。再送しません。', pressed: false }]
          };
        }
        if (!state.brandsNav) {
          state.brandsNav = true;
          return { state: state, actions: [{ type: 'goBrands' }] };
        }
        return { state: state, actions: [{ type: 'wait', reason: 'screen' }] };
      }
      var decision = decideExchange({
        kind: state.kind,
        count: remaining,
        balance: usableBalance(state, page),
        faceYen: page.faceYen,
        selectedFace: state.faceYen,
        selectedPoints: state.points,
        points: page.points,
        loggedIn: page.loggedIn === true,
        stockAvailable: page.stockAvailable === true,
        sessionStart: page.sessionStart || state.sessionKey,
        sessionNow: page.sessionNow
      });
      if (decision.action === 'stop') {
        return {
          state: Object.assign(state, { phase: 'stopped' }),
          actions: [{ type: 'fail', code: decision.code, message: decision.message, pressed: false }]
        };
      }
      state.phase = 'pick';
      state.inputUnit = decision.inputUnit || '';
      state.points = decision.points;
      state.balanceLeft = usableBalance(state, page);
      state.brandsNav = false;
      return { state: state, actions: [{ type: 'click', label: 'kind:' + decision.kind }] };
    }

    if (state.phase === 'pick') {
      if (state.inputUnit === 'points') {
        if (digits(page.points) !== digits(state.points)) {
          return {
            state: Object.assign(state, { phase: 'stopped' }),
            actions: [{ type: 'fail', code: 'points_mismatch', message: '画面のポイントが入力と違います。', pressed: false }]
          };
        }
      } else if (digits(page.faceYen) !== digits(state.faceYen) || digits(page.points) == null) {
        return {
          state: Object.assign(state, { phase: 'stopped' }),
          actions: [{ type: 'fail', code: 'face_unknown', message: '選んだ額面または必要ポイントを画面で確認できません。', pressed: false }]
        };
      }
      if (state.points != null && digits(page.points) !== state.points) {
        return {
          state: Object.assign(state, { phase: 'stopped' }),
          actions: [{ type: 'fail', code: 'points_mismatch', message: '画面の必要ポイントが変わりました。交換を止めました。', pressed: false }]
        };
      }
      state.phase = 'armed';
      state.points = digits(page.points);
      return { state: state, actions: [{ type: 'arm', label: '交換する' }] };
    }

    if (state.phase === 'armed') {
      state.phase = 'waitResult';
      state.pressed = true;
      return { state: state, actions: [{ type: 'click', label: '交換する' }] };
    }

    if (state.phase === 'waitResult') {
      if (page.completed) {
        state.phase = 'openGift';
        state.baseline = (page.hrefs || []).slice();
        state.openedClick = false;
        return { state: state, actions: [{ type: 'wait', reason: '取得中' }] };
      }
      if (page.timedOut) {
        state.phase = 'unknown';
        return {
          state: state,
          actions: [{ type: 'fail', code: 'timeout', message: '結果を確認できません。残高と履歴を見るまで再送しません。', pressed: true, timedOut: true }]
        };
      }
      return { state: state, actions: [{ type: 'wait', reason: 'result' }] };
    }

    if (state.phase === 'openGift') {
      if (page.fetching || /取得中/.test(text)) {
        return { state: state, actions: [{ type: 'wait', reason: '取得中' }] };
      }
      var links = extractHttpsLinks('', page.hrefs || []).filter(function (u) {
        return state.baseline.indexOf(u) < 0 && isOwnGiftLink(u);
      });
      if (!links.length) {
        var canOpen = page.canOpen || buttons.indexOf('ギフトを開く') >= 0;
        if (canOpen && !state.openedClick) {
          state.openedClick = true;
          return { state: state, actions: [{ type: 'click', label: 'ギフトを開く' }] };
        }
        if (page.timedOut) {
          state.phase = 'unknown';
          return {
            state: state,
            actions: [{ type: 'fail', code: 'link_unknown', message: '新しいギフトのリンクを確認できません。再送しません。', pressed: true, timedOut: true }]
          };
        }
        return { state: state, actions: [{ type: 'wait', reason: 'open' }] };
      }
      state.saved = state.saved.concat(links);
      var spent = state.points || 0;
      if (state.balanceLeft != null && spent) state.balanceLeft = state.balanceLeft - spent;
      state.index = (state.index || 0) + 1;
      state.openedClick = false;
      state.pressed = false;
      var actions = [{ type: 'saveLinks', links: links, expiryText: text }];
      if (state.index < state.count) {
        state.phase = 'check';
        state.brandsNav = false;
        actions.push({ type: 'goBrands' });
        return { state: state, actions: actions };
      }
      state.phase = 'done';
      actions.push({ type: 'done', count: state.saved.length });
      return { state: state, actions: actions };
    }

    return { state: state, actions: [] };
  }

  function sanitizeActions(actions) {
    var out = [];
    (actions || []).forEach(function (a) {
      if (a && a.type === 'click' && isMarkUsedLabel(a.label)) return;
      out.push(a);
    });
    return out;
  }

  function safeStep(state, page) {
    var r = exchangeStep(state, page);
    r.actions = sanitizeActions(r.actions);
    return r;
  }

  return {
    CONFIRMED_OFFERS: CONFIRMED_OFFERS,
    KINDS: KINDS,
    kindAvailable: kindAvailable,
    normalizeKind: normalizeKind,
    kindKeys: kindKeys,
    decideExchange: decideExchange,
    sessionContinuity: sessionContinuity,
    authCookieMaterial: authCookieMaterial,
    parseScreenOffers: parseScreenOffers,
    faceChoices: faceChoices,
    parsePointAmount: parsePointAmount,
    lockFromFailure: lockFromFailure,
    allowRestart: allowRestart,
    isMarkUsedLabel: isMarkUsedLabel,
    dismissUsedDialog: dismissUsedDialog,
    extractHttpsLinks: extractHttpsLinks,
    redact: redact,
    parseExpiry: parseExpiry,
    exchangeStep: safeStep
  };
});
