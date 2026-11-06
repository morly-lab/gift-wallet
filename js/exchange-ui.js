/*
 * 交換メニュー。ログイン中のギフトウォレットから、種類、確認済みの額面またはポイント、回数の順。
 * 在庫切れや未確定の交換先では始めない。失敗後は残高と履歴を確認するまで再送しない。
 */
(function (root) {
  var Guard = root.GwExchangeGuard;
  if (!Guard) return;

  function currentChoice(kind) {
    var stockAvailable = false;
    try {
      stockAvailable = !!(root.GiftWallet && root.GiftWallet.getOfferStock && root.GiftWallet.getOfferStock(kind) === 'in');
    } catch (e) {}
    return Guard.faceChoices(kind, { stockAvailable: stockAvailable });
  }

  function closeX() {
    var o = document.getElementById('gwExModal');
    if (o) o.remove();
  }

  function shell(inner) {
    closeX();
    var o = document.createElement('div');
    o.id = 'gwExModal';
    o.setAttribute('style', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;');
    var box = document.createElement('div');
    box.setAttribute('style', 'background:#14141f;border:1px solid #d4a843;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));width:100%;max-width:520px;color:#fff;max-height:88vh;overflow:auto;');
    box.innerHTML = inner;
    o.appendChild(box);
    o.addEventListener('click', function (e) { if (e.target === o) closeX(); });
    document.body.appendChild(o);
    return o;
  }

  function readLock() {
    try {
      if (root.GiftWallet && root.GiftWallet.getExchangeLock) {
        var raw = root.GiftWallet.getExchangeLock() || '';
        if (!raw) return null;
        return JSON.parse(raw);
      }
    } catch (e) {}
    return null;
  }


  function lockSheet(lock) {
    var unknown = lock && lock.mode === 'unknown';
    var h = '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">交換を止めています</div>';
    h += '<div id="gwExLockReason" style="font-size:13px;line-height:1.6;margin-bottom:10px;"></div>';
    h += '<div style="font-size:12px;line-height:1.6;opacity:.85;margin-bottom:10px;">残高とマイギフトの履歴を確認するまで、もう一度交換しません。</div>';
    h += '<label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px;"><input id="gwExBal" type="checkbox" style="width:20px;height:20px;">残高を確認した</label>';
    h += '<label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px;"><input id="gwExHist" type="checkbox" style="width:20px;height:20px;">履歴を確認した</label>';
    if (unknown) {
      h += '<div style="font-size:13px;margin:10px 0 6px;">どちらだったか（まだ分からないときはロックを外しません）</div>';
      h += '<label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="gwExRes" value="not_exchanged">未交換だった</label>';
      h += '<label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="gwExRes" value="exchanged">交換されていた</label>';
      h += '<label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="gwExRes" value="unknown" checked>まだ分からない</label>';
    }
    h += '<button type="button" id="gwExUnlock" style="width:100%;margin-top:12px;border:none;border-radius:999px;padding:12px;font-weight:800;background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;">確認を保存</button>';
    h += '<button type="button" id="gwExLook" style="width:100%;margin-top:8px;border:1px solid #d4a843;border-radius:999px;padding:12px;font-weight:800;background:none;color:#fff;">マイギフトを開く</button>';
    h += '<button type="button" id="gwExLockClose" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">閉じる</button>';
    var o = shell(h);
    o.querySelector('#gwExLockReason').textContent = (lock && lock.reason) || '結果を確認できません。';
    o.querySelector('#gwExLockClose').onclick = closeX;
    o.querySelector('#gwExLook').onclick = function () {
      if (root.GiftWallet && root.GiftWallet.openVatonVisible) root.GiftWallet.openVatonVisible();
    };
    o.querySelector('#gwExUnlock').onclick = function () {
      var resolved = 'not_exchanged';
      var radio = o.querySelector('input[name=gwExRes]:checked');
      if (radio) resolved = radio.value;
      var gate = Guard.allowRestart(lock, {
        balanceChecked: o.querySelector('#gwExBal').checked,
        historyChecked: o.querySelector('#gwExHist').checked,
        manualResolved: unknown ? resolved : 'not_exchanged'
      });
      if (!gate.ok) {
        if (root.showToast) root.showToast(gate.code === 'still_unknown' ? 'まだ分からないのでロックは外しません' : '残高と履歴の確認が必要です');
        return;
      }
      var cleared = '0';
      try {
        if (root.GiftWallet && root.GiftWallet.clearExchangeLock) {
          cleared = String(root.GiftWallet.clearExchangeLock(JSON.stringify({
            balanceChecked: !!o.querySelector('#gwExBal').checked,
            historyChecked: !!o.querySelector('#gwExHist').checked,
            manualResolved: unknown ? resolved : 'not_exchanged'
          })));
        }
      } catch (e) { cleared = '0'; }
      if (cleared !== '1') {
        if (root.showToast) root.showToast('確認が足りないため、ロックは外していません');
        return;
      }
      closeX();
      if (root.showToast) root.showToast('確認を保存しました。必要なら交換をやり直せます');
    };
  }

  var sel = { kind: '', faceYen: 0, points: null, count: 1 };

  function stepKind() {
    var h = '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">何に交換しますか？</div>';
    h += '<div style="font-size:12px;line-height:1.6;opacity:.8;margin-bottom:10px;">いまアプリ内でログインしているギフトウォレットだけを使います。ログイン情報はこのアプリに保存しません。</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    Guard.KINDS.forEach(function (k) {
      var off = k.available === false;
      h += '<button type="button" data-kind="' + k.id + '"' + (off ? ' disabled' : '') + ' style="border:1px solid #d4a843;background:transparent;color:' + (off ? '#777' : '#fff') + ';border-radius:12px;padding:14px 8px;font-size:14px;font-weight:800;min-height:52px;">' + k.id + (off ? '<br><span style="font-size:11px;font-weight:700;">現在選択不可</span>' : '') + '</button>';
    });
    h += '</div><button type="button" id="gwExCancel" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">閉じる</button>';
    var o = shell(h);
    o.querySelectorAll('button[data-kind]').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        sel.kind = b.getAttribute('data-kind');
        stepFace();
      };
    });
    o.querySelector('#gwExCancel').onclick = closeX;
  }

  function stepFace() {
    var choice = currentChoice(sel.kind);
    var h = '<div style="font-size:12px;opacity:.8;">' + sel.kind + '</div>';
    h += '<div style="font-size:16px;font-weight:800;color:#d4a843;margin:4px 0 8px;">額面を選びます</div>';
    h += '<div id="gwExFaceNote" style="font-size:12px;line-height:1.6;margin-bottom:8px;"></div>';
    h += '<div id="gwExFaces" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>';
    h += '<button type="button" id="gwExBack" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">もどる</button>';
    var o = shell(h);
    var note = o.querySelector('#gwExFaceNote');
    var box = o.querySelector('#gwExFaces');
    if (choice.status === 'confirmed') {
      note.textContent = '確認済みの額面です。消費ポイントは額面と別に表示し、交換画面でもう一度照合します。';
      if (choice.note && choice.note.chargeLimitNote) note.textContent += ' ' + choice.note.chargeLimitNote;
      if (choice.note && choice.note.expiryRule) note.textContent += ' 期限の目安: ' + choice.note.expiryRule + '。個別ギフトの日付が画面に無いときは未確認のままです。';
      if (choice.note && choice.note.rewardNote) note.textContent += ' ' + choice.note.rewardNote;
      choice.options.forEach(function (row) {
        var b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = 'border:1px solid #d4a843;background:transparent;color:#fff;border-radius:12px;padding:12px 8px;font-size:13px;font-weight:800;min-height:64px;';
        b.textContent = '額面 ' + Number(row.faceYen).toLocaleString('ja-JP') + '円\n消費 ' + (row.points == null ? '画面で確認' : Number(row.points).toLocaleString('ja-JP') + 'pt');
        b.style.whiteSpace = 'pre-line';
        b.onclick = function () { sel.inputUnit = ''; sel.faceYen = row.faceYen; sel.points = row.points; stepCount(); };
        box.appendChild(b);
      });
    } else if (choice.status === 'range') {
      note.textContent = '入力欄はポイントです。1〜' + choice.range.maxPoints.toLocaleString('ja-JP') + 'の整数だけ進めます。下のボタンは入力の目安で、固定額面の商品ではありません。円の額面と消費ポイントが同じとは表示しません。';
      if (choice.note && choice.note.rewardNote) note.textContent += choice.note.rewardNote;
      choice.presets.forEach(function (row) {
        var b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = 'border:1px solid #d4a843;background:transparent;color:#fff;border-radius:12px;padding:12px 8px;font-size:13px;font-weight:800;min-height:52px;';
        b.textContent = Number(row.points).toLocaleString('ja-JP') + 'ポイント\n目安';
        b.style.whiteSpace = 'pre-line';
        b.onclick = function () { sel.inputUnit = 'points'; sel.faceYen = 0; sel.points = row.points; stepCount(); };
        box.appendChild(b);
      });
      var lab = document.createElement('label');
      lab.style.cssText = 'grid-column:1 / -1;font-size:12px;color:#d4a843;font-weight:800;';
      lab.textContent = '任意のポイント';
      var input = document.createElement('input');
      input.inputMode = 'numeric';
      input.placeholder = '例 1234';
      input.style.cssText = 'display:block;width:100%;margin-top:4px;background:#0d0d16;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;font-size:16px;';
      lab.appendChild(input);
      box.appendChild(lab);
      var go = document.createElement('button');
      go.type = 'button';
      go.style.cssText = 'grid-column:1 / -1;border:none;border-radius:999px;padding:12px;font-weight:800;background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;';
      go.textContent = 'このポイントで進む';
      go.onclick = function () {
        var parsed = Guard.parsePointAmount(input.value, choice.range.minPoints, choice.range.maxPoints);
        if (!parsed.ok) { if (root.showToast) root.showToast('1〜10,000の整数で入力してください'); return; }
        sel.inputUnit = 'points'; sel.faceYen = 0; sel.points = parsed.points; stepCount();
      };
      box.appendChild(go);
    } else if (choice.status === 'out_of_stock') {
      note.textContent = '確認済みの額面です。いまは在庫切れのため表示だけで、交換は始めません。画面から在庫切れが消えたら実行できます。';
      if (choice.note && choice.note.expiryRule) note.textContent += ' 期限の表示: ' + choice.note.expiryRule + '。';
      if (choice.note && choice.note.rewardNote) note.textContent += choice.note.rewardNote;
      (choice.options || []).forEach(function (row) {
        var b = document.createElement('button');
        b.type = 'button';
        b.disabled = true;
        b.style.cssText = 'border:1px solid #555;background:transparent;color:#888;border-radius:12px;padding:12px 8px;font-size:13px;font-weight:800;min-height:64px;';
        b.style.whiteSpace = 'pre-line';
        b.textContent = '額面 ' + Number(row.faceYen).toLocaleString('ja-JP') + '円\n消費 ' + Number(row.points).toLocaleString('ja-JP') + 'pt\n在庫切れ';
        box.appendChild(b);
      });
    } else if (choice.status === 'unavailable') {
      note.textContent = '現在選択不可です。提供がないため交換は始めません。';
    } else {
      note.textContent = 'この交換先の額面はまだ確認できていません。誤った候補は出しません。';
    }
    o.querySelector('#gwExBack').onclick = stepKind;
  }

  function stepCount() {
    var h = '<div id="gwExSum" style="font-size:12px;opacity:.85;margin-bottom:6px;"></div>';
    h += '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">何回交換しますか？</div>';
    h += '<div style="font-size:12px;line-height:1.6;opacity:.8;margin-bottom:8px;">選んだ額面と、画面に出ている必要ポイントが違うときは止めます。</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    [1, 2, 3, 4, 5].forEach(function (n) {
      h += '<button type="button" data-n="' + n + '" style="flex:1;min-width:56px;min-height:48px;border:1px solid #d4a843;background:transparent;color:#fff;border-radius:12px;font-size:16px;font-weight:800;">' + n + '回</button>';
    });
    h += '</div><button type="button" id="gwExBack" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">もどる</button>';
    var o = shell(h);
    var summary = sel.inputUnit === 'points'
      ? (sel.kind + ' / ' + Number(sel.points).toLocaleString('ja-JP') + 'ポイント')
      : (sel.kind + ' / 額面 ' + Number(sel.faceYen).toLocaleString('ja-JP') + '円 / 消費 ' + (sel.points == null ? '画面で確認' : Number(sel.points).toLocaleString('ja-JP') + 'pt'));
    o.querySelector('#gwExSum').textContent = summary;
    o.querySelectorAll('button[data-n]').forEach(function (b) {
      b.onclick = function () { sel.count = Number(b.getAttribute('data-n')); startJob(); };
    });
    o.querySelector('#gwExBack').onclick = stepFace;
  }

  function startJob() {
    var lock = readLock();
    if (lock) { lockSheet(lock); return; }
    var choice = currentChoice(sel.kind);
    var job;
    if (sel.inputUnit === 'points') {
      if (choice.status !== 'range') { if (root.showToast) root.showToast('この交換先はまだ始められません'); return; }
      var parsed = Guard.parsePointAmount(sel.points, choice.range.minPoints, choice.range.maxPoints);
      if (!parsed.ok) { if (root.showToast) root.showToast('1〜10,000の整数で入力してください'); return; }
      job = { kind: sel.kind, count: sel.count, points: parsed.points, inputUnit: 'points' };
    } else if (choice.status !== 'confirmed' || !sel.faceYen) {
      if (root.showToast) root.showToast('額面が確定するまで交換しません');
      return;
    } else {
      job = { kind: sel.kind, count: sel.count, faceYen: sel.faceYen };
    }
    if (!(root.GiftWallet && root.GiftWallet.startExchangeJob)) {
      if (root.gwNeedUpdate) root.gwNeedUpdate();
      return;
    }
    closeX();
    root.GiftWallet.startExchangeJob(JSON.stringify(job));
  }

  root.gwExOverlay = function (msg) {
    var o = document.getElementById('gwExBusy');
    if (msg === null || msg === undefined) { if (o) o.remove(); return; }
    if (!o) {
      o = document.createElement('div');
      o.id = 'gwExBusy';
      o.setAttribute('style', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99995;background:rgba(0,0,0,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;text-align:center;padding:24px;');
      o.innerHTML = '<div style="width:44px;height:44px;border:4px solid rgba(255,255,255,.2);border-top-color:#d4a843;border-radius:50%;animation:gwExSpin 1s linear infinite;"></div><div style="font-size:16px;font-weight:800;color:#d4a843;">交換中…</div><div id="gwExMsg" style="font-size:13px;line-height:1.6;"></div><button type="button" id="gwExStopBtn" style="border:none;background:#e0443a;color:#fff;border-radius:999px;padding:10px 22px;font-size:14px;font-weight:800;">止める</button><style>@keyframes gwExSpin{to{transform:rotate(360deg)}}</style>';
      document.body.appendChild(o);
      o.querySelector('#gwExStopBtn').onclick = function () {
        if (root.GiftWallet && root.GiftWallet.stopExchange) root.GiftWallet.stopExchange();
      };
    }
    o.querySelector('#gwExMsg').textContent = msg;
  };

  root.gwExResult = function (payload) {
    var count = 0;
    var kind = '';
    try {
      var p = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        count = Number(p.count) || 0;
        kind = p.kind || '';
      } else if (Array.isArray(p)) count = p.length;
    } catch (e) {}
    var h = '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">交換の処理が終わりました</div>';
    h += '<div id="gwExDone" style="font-size:13px;line-height:1.6;"></div>';
    h += '<button type="button" id="gwExVault" style="width:100%;margin-top:12px;border:none;border-radius:999px;padding:12px;font-weight:800;background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;">保管メモを見る</button>';
    h += '<button type="button" id="gwExClose" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">閉じる</button>';
    var o = shell(h);
    o.querySelector('#gwExDone').textContent = (kind ? kind + ' ' : '') + 'リンクを保管メモに追加しました（' + count + '件）。コード番号は表示しません。';
    o.querySelector('#gwExVault').onclick = function () {
      closeX();
      if (root.goPage) root.goPage('links');
    };
    o.querySelector('#gwExClose').onclick = closeX;
  };

  root.gwExFail = function (msg) {
    var head = String(msg || '').split('\n\n[診断]\n')[0];
    try { if (root.GwExchangeGuard) head = root.GwExchangeGuard.redact(head); } catch (e) {}
    var h = '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">交換を止めました</div>';
    h += '<div id="gwExHead" style="font-size:13px;line-height:1.6;"></div>';
    h += '<div style="font-size:12px;opacity:.8;margin:8px 0;">再送はしません。残高とマイギフトを確認してください。</div>';
    h += '<button type="button" id="gwExLook" style="width:100%;border:none;border-radius:999px;padding:12px;font-weight:800;background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;">マイギフトを開く</button>';
    h += '<button type="button" id="gwExClose" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">閉じる</button>';
    var o = shell(h);
    o.querySelector('#gwExHead').textContent = head;
    o.querySelector('#gwExLook').onclick = function () {
      if (root.GiftWallet && root.GiftWallet.openVatonVisible) root.GiftWallet.openVatonVisible();
    };
    o.querySelector('#gwExClose').onclick = closeX;
  };

  root.gwExBlocked = function (raw) {
    var lock = null;
    try { lock = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { lock = { mode: 'unknown', reason: '結果が確認できません' }; }
    lockSheet(lock || { mode: 'unknown', reason: '結果が確認できません' });
  };

  root.openExchange = function () {
    var lock = readLock();
    if (lock) { lockSheet(lock); return; }
    stepKind();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
