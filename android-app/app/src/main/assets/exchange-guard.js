/*
 * 交換の判断だけを行う。画面から読めた額面・必要ポイント・残高・アカウント以外では進めない。
 * kyash=10,000pt / majica=9,700pt は現場報告であり、クリック量の固定値には使わない。
 * 実サイトのDOMで成功したとは扱わない。値が取れなければ止める。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GwExchangeGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ACCOUNTS = ['モーリー', 'めぱん', 'モリ母'];
  var FACE_YEN = 10000;
  var FIELD_REPORT_POINTS = { kyash: 10000, majica: 9700 };
  var KINDS = [
    { id: 'au PAY', keys: ['au pay', 'aupay'] },
    { id: 'majica', keys: ['majica', 'マジカ'] },
    { id: 'Vポイント', keys: ['vポイント', 'vpoint'] },
    { id: 'kyash', keys: ['kyash'] },
    { id: 'Amazon', keys: ['amazon', 'アマゾン'] },
    { id: 'WAON', keys: ['waon', 'ワオン'] }
  ];

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

  function decideExchange(input) {
    input = input || {};
    var account = String(input.account || '');
    var seen = input.accountSeen == null ? '' : String(input.accountSeen);
    var count = digits(input.count);
    var balance = input.balance == null || input.balance === '' ? null : digits(input.balance);
    var face = input.faceYen == null || input.faceYen === '' ? null : digits(input.faceYen);
    var points = input.points == null || input.points === '' ? null : digits(input.points);
    var kind = normalizeKind(input.kind);
    if (ACCOUNTS.indexOf(account) < 0) {
      return stop('account_unknown', 'アカウントを確認できません。交換を止めました。');
    }
    if (!seen || seen !== account) {
      return stop('account_mismatch', '画面のアカウントが「' + account + '」と一致しません。交換を止めました。');
    }
    if (!count || count < 1 || count > 20) {
      return stop('count_invalid', '交換の回数を確認できません。交換を止めました。');
    }
    if (face == null) {
      return stop('face_unknown', '画面の額面を確認できません。固定値では交換しません。');
    }
    if (face !== FACE_YEN) {
      return stop('face_mismatch', '画面の額面が10,000円ではありません。交換を止めました。');
    }
    if (points == null || points <= 0) {
      return stop('points_unknown', '画面の必要ポイントを確認できません。交換を止めました。');
    }
    var report = Object.prototype.hasOwnProperty.call(FIELD_REPORT_POINTS, kind) ? FIELD_REPORT_POINTS[kind] : null;
    if (report != null && report !== points) {
      return stop('points_mismatch', '画面の必要ポイントがこれまでの報告と一致しません。交換を止めました。');
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
      account: account,
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
      brandsNav: !!state.brandsNav
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
      if (page.balance == null || page.faceYen == null || page.points == null || !page.accountSeen) {
        if (page.timedOut) {
          return {
            state: Object.assign(state, { phase: 'stopped' }),
            actions: [{ type: 'fail', code: 'unreadable', message: '画面の残高・額面・アカウントを確認できません。再送しません。', pressed: false }]
          };
        }
        if (!state.brandsNav) {
          state.brandsNav = true;
          return { state: state, actions: [{ type: 'goBrands' }] };
        }
        return { state: state, actions: [{ type: 'wait', reason: 'screen' }] };
      }
      var decision = decideExchange({
        account: state.account,
        accountSeen: page.accountSeen,
        kind: state.kind,
        count: remaining,
        balance: usableBalance(state, page),
        faceYen: page.faceYen,
        points: page.points
      });
      if (decision.action === 'stop') {
        return {
          state: Object.assign(state, { phase: 'stopped' }),
          actions: [{ type: 'fail', code: decision.code, message: decision.message, pressed: false }]
        };
      }
      state.phase = 'pick';
      state.points = decision.points;
      state.balanceLeft = usableBalance(state, page);
      state.brandsNav = false;
      return { state: state, actions: [{ type: 'click', label: 'kind:' + decision.kind }] };
    }

    if (state.phase === 'pick') {
      if (digits(page.faceYen) !== FACE_YEN || digits(page.points) == null) {
        return {
          state: Object.assign(state, { phase: 'stopped' }),
          actions: [{ type: 'fail', code: 'face_unknown', message: '額面または必要ポイントを画面で確認できません。', pressed: false }]
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
    ACCOUNTS: ACCOUNTS,
    FACE_YEN: FACE_YEN,
    FIELD_REPORT_POINTS: FIELD_REPORT_POINTS,
    KINDS: KINDS,
    normalizeKind: normalizeKind,
    kindKeys: kindKeys,
    decideExchange: decideExchange,
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
