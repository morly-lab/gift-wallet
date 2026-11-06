/*
 * 交換メニュー。種類と回数だけを受け、額面は10,000円。
 * 必要ポイントは画面で確認する。失敗後は残高と履歴を確認するまで再送しない。
 */
(function (root) {
  var Guard = root.GwExchangeGuard;
  if (!Guard) return;

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

  var sel = { account: '', kind: '', count: 1 };

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
      try { if (root.GiftWallet && root.GiftWallet.clearExchangeLock) root.GiftWallet.clearExchangeLock(); } catch (e) {}
      closeX();
      if (root.showToast) root.showToast('確認を保存しました。必要なら交換をやり直せます');
    };
  }

  function stepAccount() {
    var h = '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">どのアカウントで交換しますか？</div>';
    h += '<div style="font-size:12px;line-height:1.6;opacity:.8;margin-bottom:10px;">パスワードは保存しません。画面に同じ名前が出ているときだけ進めます。</div>';
    Guard.ACCOUNTS.forEach(function (name) {
      h += '<button type="button" data-acc="' + name + '" style="width:100%;margin-bottom:8px;border:1px solid #d4a843;background:transparent;color:#fff;border-radius:12px;padding:14px;font-size:16px;font-weight:800;">' + name + '</button>';
    });
    h += '<button type="button" id="gwExCancel" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">閉じる</button>';
    var o = shell(h);
    o.querySelectorAll('button[data-acc]').forEach(function (b) {
      b.onclick = function () { sel.account = b.getAttribute('data-acc'); stepKind(); };
    });
    o.querySelector('#gwExCancel').onclick = closeX;
  }

  function stepKind() {
    var h = '<div style="font-size:12px;opacity:.8;"></div><div style="font-size:16px;font-weight:800;color:#d4a843;margin:4px 0 10px;">種類（額面10,000円）</div>';
    h += '<div id="gwExAcc" style="font-size:12px;margin-bottom:8px;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    Guard.KINDS.forEach(function (k) {
      h += '<button type="button" data-kind="' + k.id + '" style="border:1px solid #d4a843;background:transparent;color:#fff;border-radius:12px;padding:14px 8px;font-size:14px;font-weight:800;">' + k.id + '</button>';
    });
    h += '</div><button type="button" id="gwExBack" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">もどる</button>';
    var o = shell(h);
    o.querySelector('#gwExAcc').textContent = sel.account;
    o.querySelectorAll('button[data-kind]').forEach(function (b) {
      b.onclick = function () { sel.kind = b.getAttribute('data-kind'); stepCount(); };
    });
    o.querySelector('#gwExBack').onclick = stepAccount;
  }

  function stepCount() {
    var h = '<div id="gwExSum" style="font-size:12px;opacity:.85;margin-bottom:6px;"></div>';
    h += '<div style="font-size:16px;font-weight:800;color:#d4a843;margin-bottom:8px;">10,000円分を何回交換しますか？</div>';
    h += '<div style="font-size:12px;line-height:1.6;opacity:.8;margin-bottom:8px;">必要ポイントは交換画面の表示で確認します。kyashやmajicaの報告値では押しません。足りない、または表示と違うときは止めます。</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    [1, 2, 3, 4, 5].forEach(function (n) {
      h += '<button type="button" data-n="' + n + '" style="flex:1;min-width:56px;min-height:48px;border:1px solid #d4a843;background:transparent;color:#fff;border-radius:12px;font-size:16px;font-weight:800;">' + n + '回</button>';
    });
    h += '</div><button type="button" id="gwExBack" style="width:100%;background:none;border:none;color:#aaa;padding:12px;">もどる</button>';
    var o = shell(h);
    o.querySelector('#gwExSum').textContent = sel.account + ' / ' + sel.kind;
    o.querySelectorAll('button[data-n]').forEach(function (b) {
      b.onclick = function () { sel.count = Number(b.getAttribute('data-n')); startJob(); };
    });
    o.querySelector('#gwExBack').onclick = stepKind;
  }

  function startJob() {
    var lock = readLock();
    if (lock) { lockSheet(lock); return; }
    var job = { account: sel.account, kind: sel.kind, count: sel.count, faceYen: Guard.FACE_YEN };
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
    stepAccount();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
