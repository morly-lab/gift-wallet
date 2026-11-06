/*
 * リンク保管メモの画面。リンク全文は一覧に出さない。開くのはボタンを押したときだけ。
 * 使用状態はこのアプリのメモであり、vatonの「利用済みにする」は押さない。
 */
(function (root) {
  var Vault = root.GwGiftVault;
  if (!Vault) return;

  function bridgeStorage() {
    return {
      getItem: function (k) {
        var local = null;
        try { local = root.localStorage.getItem(k); } catch (e) { local = null; }
        if (k === Vault.KEY && root.GiftWallet && root.GiftWallet.getGiftMemos) {
          var remote = '';
          try { remote = root.GiftWallet.getGiftMemos() || ''; } catch (e2) { remote = ''; }
          var merged = Vault.mergeJson(local || '[]', remote || '[]');
          if (merged !== (local || '[]')) {
            try { root.localStorage.setItem(k, merged); } catch (e3) {}
          }
          if (merged !== (remote || '[]') && root.GiftWallet.saveGiftMemos) {
            try { root.GiftWallet.saveGiftMemos(merged); } catch (e4) {}
          }
          return merged;
        }
        if (k === Vault.SEQ && root.GiftWallet && root.GiftWallet.getGiftMemoSeq) {
          var a = parseInt(local || '0', 10) || 0;
          var b = 0;
          try { b = parseInt(root.GiftWallet.getGiftMemoSeq() || '0', 10) || 0; } catch (e5) { b = 0; }
          var m = String(Math.max(a, b));
          return m;
        }
        return local;
      },
      setItem: function (k, v) {
        try { root.localStorage.setItem(k, v); } catch (e) {}
        try {
          if (k === Vault.KEY && root.GiftWallet && root.GiftWallet.saveGiftMemos) root.GiftWallet.saveGiftMemos(v);
          if (k === Vault.SEQ && root.GiftWallet && root.GiftWallet.saveGiftMemoSeq) root.GiftWallet.saveGiftMemoSeq(v);
        } catch (e2) {}
      }
    };
  }

  function vault() {
    return Vault.createVault(bridgeStorage());
  }

  function el(tag, css, text) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function option(sel, value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    sel.appendChild(o);
  }

  function selectBox(values, current) {
    var sel = el('select', 'width:100%;background:#0d0d16;color:#fff;border:1px solid #d4a843;border-radius:10px;padding:10px;font-size:14px;');
    values.forEach(function (v) { option(sel, v, v); });
    if (current) sel.value = current;
    return sel;
  }

  function field(label, node) {
    var wrap = el('label', 'display:block;margin:0 0 10px;font-size:12px;color:#d4a843;font-weight:800;');
    wrap.appendChild(document.createTextNode(label));
    node.style.marginTop = '4px';
    wrap.appendChild(node);
    return wrap;
  }

  function importLegacy(v) {
    if (!root.GiftWallet || !root.GiftWallet.getExchangeResults || !root.GwExchangeGuard) return;
    var raw = '';
    try { raw = root.GiftWallet.getExchangeResults() || '[]'; } catch (e) { return; }
    var rows;
    try { rows = JSON.parse(raw); } catch (e2) { return; }
    if (!Array.isArray(rows)) return;
    var items = [];
    rows.forEach(function (line) {
      var text = String(line || '');
      root.GwExchangeGuard.extractHttpsLinks(text, []).forEach(function (link) {
        var kind = root.GwExchangeGuard.normalizeKind(text);
        if (!kind || kind === text) kind = '未確認';
        items.push({
          link: link,
          kind: kind,
          faceYen: /10[,，]?000\s*円/.test(text) ? 10000 : null,
          expiry: null,
          account: '未確認',
          status: 'unused',
          allowEmptyFace: true
        });
      });
    });
    if (items.length) v.importNew(items);
  }

  function render() {
    var host = document.getElementById('gwVaultApp');
    if (!host) return;
    var v = vault();
    importLegacy(v);
    var sessionKey = '';
    try { if (root.GiftWallet && root.GiftWallet.currentSessionKey) sessionKey = root.GiftWallet.currentSessionKey() || ''; } catch (e) {}
    var filter = root.__gwVaultFilter || { kind: 'すべて', session: sessionKey ? 'current' : 'unknown', status: 'すべて' };
    filter.sessionKey = sessionKey;
    var editing = root.__gwVaultEdit || null;
    clear(host);

    host.appendChild(el('div', 'font-size:13px;line-height:1.6;color:#b0b0c8;margin-bottom:10px;', 'リンクはこの端末のメモです。使用済みにしても、vatonの「利用済みにする」は押しません。'));

    var filters = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;');
    function tinySelect(key, values) {
      var sel = selectBox(values, filter[key]);
      sel.style.padding = '8px 4px';
      sel.style.fontSize = '12px';
      sel.addEventListener('change', function () {
        filter[key] = sel.value;
        root.__gwVaultFilter = filter;
        render();
      });
      return sel;
    }
    filters.appendChild(tinySelect('kind', ['すべて'].concat(Vault.KINDS).concat(['未確認'])));
    filters.appendChild(tinySelect('session', ['current', 'unknown']));
    filters.appendChild(tinySelect('status', ['すべて', 'unused', 'used']));
    var statusSel = filters.lastChild;
    Array.prototype.forEach.call(statusSel.options, function (o) {
      if (o.value === 'unused') o.textContent = '未使用';
      if (o.value === 'used') o.textContent = '使用済み';
      if (o.value === 'すべて') o.textContent = '状態';
    });
    Array.prototype.forEach.call(filters.children[1].options, function (o) {
      if (o.value === 'current') o.textContent = 'このログイン';
      if (o.value === 'unknown') o.textContent = '未確認';
    });
    host.appendChild(filters);

    var list = v.list(filter);
    if (!list.length) {
      host.appendChild(el('div', 'padding:18px 8px;text-align:center;color:#888;font-size:13px;', '保管しているリンクはありません'));
    }
    list.forEach(function (rec) {
      var vm = Vault.viewModel(rec);
      var card = el('div', 'background:#14141f;border:1px solid rgba(212,168,67,.45);border-radius:14px;padding:12px;margin-bottom:10px;');
      card.appendChild(el('div', 'display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#d4a843;font-weight:800;', ''));
      var head = card.lastChild;
      head.appendChild(el('span', '', 'No.' + vm.seq + '  ' + vm.kind));
      head.appendChild(el('span', '', vm.statusLabel));
      card.appendChild(el('div', 'margin-top:6px;font-size:14px;font-weight:800;', vm.face + ' / ' + vm.account));
      card.appendChild(el('div', 'margin-top:4px;font-size:12px;color:#b0b0c8;', '期限 ' + vm.expiry));
      card.appendChild(el('div', 'margin-top:4px;font-size:12px;color:#888;', vm.linkLabel));
      var bar = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;');
      function btn(label, bg, color, fn) {
        var b = el('button', 'border:none;border-radius:999px;padding:10px 12px;font-size:13px;font-weight:800;cursor:pointer;min-height:44px;', label);
        b.type = 'button';
        b.style.background = bg;
        b.style.color = color;
        b.addEventListener('click', fn);
        bar.appendChild(b);
        return b;
      }
      btn('開く', 'linear-gradient(135deg,#f5d070,#d4a843)', '#000', function () {
        var check = Vault.validateLink(rec.link);
        if (!check.ok) {
          if (root.showToast) root.showToast('リンクを開けません');
          return;
        }
        if (root.GiftWallet && root.GiftWallet.openGiftLink) root.GiftWallet.openGiftLink(check.url);
        else root.open(check.url, '_blank', 'noopener,noreferrer');
      });
      btn(rec.status === 'used' ? '未使用に戻す' : '使用済みにする', '#2a2a3a', '#fff', function () {
        v.setStatus(rec.id, rec.status === 'used' ? 'unused' : 'used');
        render();
      });
      btn('修正', '#2a2a3a', '#fff', function () {
        root.__gwVaultEdit = rec.id;
        render();
      });
      btn('削除', '#3a1a1a', '#ffb4b4', function () {
        root.__gwVaultDelete = rec.id;
        render();
      });
      card.appendChild(bar);
      if (root.__gwVaultDelete === rec.id) {
        var ask = el('div', 'margin-top:8px;font-size:13px;line-height:1.5;', 'このメモを削除しますか？');
        var yes = el('button', 'margin-right:8px;border:none;border-radius:999px;padding:8px 12px;font-weight:800;background:#e0443a;color:#fff;min-height:40px;', '削除する');
        yes.type = 'button';
        yes.addEventListener('click', function () {
          v.remove(rec.id);
          root.__gwVaultDelete = null;
          render();
        });
        var no = el('button', 'border:1px solid #666;border-radius:999px;padding:8px 12px;font-weight:800;background:none;color:#fff;min-height:40px;', 'やめる');
        no.type = 'button';
        no.addEventListener('click', function () {
          root.__gwVaultDelete = null;
          render();
        });
        ask.appendChild(document.createElement('div'));
        ask.lastChild.style.marginTop = '6px';
        ask.lastChild.appendChild(yes);
        ask.lastChild.appendChild(no);
        card.appendChild(ask);
      }
      host.appendChild(card);
    });

    var form = el('div', 'background:#101018;border:1px solid rgba(212,168,67,.35);border-radius:14px;padding:12px;margin-top:6px;');
    form.appendChild(el('div', 'font-weight:800;color:#d4a843;margin-bottom:8px;', editing ? 'メモを修正' : '手で追加'));
    var linkInput = el('input', 'width:100%;background:#0d0d16;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;font-size:14px;');
    linkInput.placeholder = 'https://';
    var faceInput = el('input', 'width:100%;background:#0d0d16;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;font-size:14px;');
    faceInput.inputMode = 'numeric';
    faceInput.placeholder = '10000';
    var expInput = el('input', 'width:100%;background:#0d0d16;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;font-size:14px;');
    expInput.placeholder = '空欄は未確認';
    var kindSel = selectBox(['au PAY', 'majica', 'Kyash', 'Amazon', 'Vポイント', 'WAON'], 'au PAY');
    var accInput = el('input', 'width:100%;background:#0d0d16;color:#fff;border:1px solid #444;border-radius:10px;padding:10px;font-size:14px;');
    accInput.placeholder = '空欄は未確認';
    if (editing) {
      var found = v.list().filter(function (r) { return r.id === editing; })[0];
      if (found) {
        linkInput.value = found.link;
        faceInput.value = found.faceYen || '';
        expInput.value = found.expiry || '';
        kindSel.value = found.kind;
        accInput.value = found.account === '未確認' ? '' : (found.account || '');
      }
    }
    form.appendChild(field('リンク', linkInput));
    form.appendChild(field('額面（円）', faceInput));
    form.appendChild(field('種類', kindSel));
    form.appendChild(field('期限（画面で見た日付だけ。不明は空欄）', expInput));
    form.appendChild(field('メモ名（任意）', accInput));
    var save = el('button', 'width:100%;border:none;border-radius:999px;padding:12px;font-size:15px;font-weight:800;background:linear-gradient(135deg,#f5d070,#d4a843);color:#000;min-height:48px;', editing ? '修正を保存' : '追加する');
    save.type = 'button';
    save.addEventListener('click', function () {
      var payload = {
        link: linkInput.value,
        faceYen: faceInput.value,
        kind: kindSel.value,
        expiry: expInput.value,
        account: accInput.value,
        sessionKey: sessionKey
      };
      var res = editing ? v.update(editing, payload) : v.add(payload);
      if (!res.ok) {
        var msg = res.code === 'duplicate' ? '同じリンクは既にあります' : '内容を確認してください';
        if (root.showToast) root.showToast(msg);
        return;
      }
      root.__gwVaultEdit = null;
      render();
    });
    form.appendChild(save);
    if (editing) {
      var cancel = el('button', 'width:100%;margin-top:6px;border:none;background:none;color:#aaa;padding:8px;', '修正をやめる');
      cancel.type = 'button';
      cancel.addEventListener('click', function () { root.__gwVaultEdit = null; render(); });
      form.appendChild(cancel);
    }
    host.appendChild(form);
  }

  root.gwRenderVault = render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
