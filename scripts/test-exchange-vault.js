#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GE = require('../exchange-vault.js');
const VX = require('../vaton-exchange.js');

const root = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

function memStorage(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) { m[k] = String(v); },
    dump() { return m; }
  };
}

function job(extra) {
  return Object.assign({
    accountId: 'モーリー',
    displayName: '表示A',
    typeId: 'majica',
    count: 1,
    expectedFace: 10000
  }, extra || {});
}

function session(extra) {
  return Object.assign({
    loggedIn: true,
    displayName: '表示A',
    balance: 50000,
    text: 'アカウント名：表示A\n保有ポイント 50,000\nmajica',
    buttons: [{ text: 'majica', href: '' }],
    historyNew: null
  }, extra || {});
}

function offerSnap(points, extra) {
  return session(Object.assign({
    text: 'アカウント名：表示A\n保有ポイント 50,000\nmajica\n10,000円分\n' + points + 'ポイント',
    buttons: [
      { text: '10,000円分', href: '' },
      { text: '交換する', href: '' }
    ]
  }, extra || {}));
}

test('保存して復元できる', () => {
  const storage = memStorage();
  let store = GE.emptyStore();
  const added = GE.addLink(store, {
    url: 'https://example.test/g/one',
    faceYen: 10000,
    pointsShown: 9700,
    typeId: 'majica',
    accountId: 'めぱん',
    expiresText: '2026/12/31',
    source: 'manual'
  });
  assert.strictEqual(added.ok, true);
  GE.saveToStorage(storage, added.store);
  const loaded = GE.loadFromStorage(storage);
  assert.strictEqual(loaded.corrupt, undefined);
  assert.strictEqual(loaded.store.items.length, 1);
  assert.strictEqual(loaded.store.items[0].url, 'https://example.test/g/one');
  assert.strictEqual(loaded.store.items[0].accountId, 'めぱん');
  assert.strictEqual(loaded.store.items[0].faceYen, 10000);
  assert.strictEqual(loaded.store.nextSerial, 2);
});

test('種類・アカウント・使用状態で絞り込める', () => {
  let store = GE.emptyStore();
  store = GE.addLink(store, { url: 'https://example.test/g/a', typeId: 'kyash', accountId: 'モーリー', faceYen: 10000, source: 'manual' }).store;
  store = GE.addLink(store, { url: 'https://example.test/g/b', typeId: 'majica', accountId: 'めぱん', faceYen: 10000, source: 'manual' }).store;
  store = GE.setStatus(store, 2, 'used').store;
  assert.strictEqual(GE.filterItems(store, { typeId: 'kyash' }).length, 1);
  assert.strictEqual(GE.filterItems(store, { accountId: 'めぱん' }).length, 1);
  assert.strictEqual(GE.filterItems(store, { status: 'used' }).length, 1);
  assert.strictEqual(GE.filterItems(store, { status: 'unused' }).length, 1);
  assert.strictEqual(GE.filterItems(store, { typeId: 'majica', status: 'unused' }).length, 0);
});

test('同じリンクは追記せず既存を上書きしない', () => {
  const first = GE.addLink(GE.emptyStore(), {
    url: 'https://example.test/g/same',
    typeId: 'aupay',
    accountId: 'モリ母',
    faceYen: 10000,
    expiresText: '',
    source: 'manual'
  });
  const before = JSON.parse(JSON.stringify(first.store.items[0]));
  const dup = GE.addLink(first.store, {
    url: 'https://example.test/g/same',
    typeId: 'kyash',
    accountId: 'モーリー',
    faceYen: 5000,
    source: 'manual'
  });
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.duplicate, true);
  assert.strictEqual(dup.store.items.length, 1);
  assert.deepStrictEqual(dup.store.items[0], before);
  const second = GE.addLink(first.store, {
    url: 'https://example.test/g/other',
    typeId: 'kyash',
    accountId: 'モーリー',
    faceYen: 10000,
    source: 'manual'
  });
  assert.strictEqual(second.ok, true);
  assert.deepStrictEqual(second.store.items[0], before);
  assert.strictEqual(second.store.items[1].serial, 2);
});

test('使用状態はアプリ内だけで切り替わる', () => {
  let store = GE.addLink(GE.emptyStore(), {
    url: 'https://example.test/g/st',
    typeId: 'vpoint',
    accountId: 'モーリー',
    faceYen: 10000,
    source: 'manual'
  }).store;
  assert.strictEqual(store.items[0].status, 'unused');
  store = GE.setStatus(store, 1, 'used').store;
  assert.strictEqual(store.items[0].status, 'used');
  store = GE.setStatus(store, 1, 'unused').store;
  assert.strictEqual(store.items[0].status, 'unused');
  assert.strictEqual(store.items[0].url, 'https://example.test/g/st');
});

test('期限が無いときは未確認で、例の日付を入れない', () => {
  const added = GE.addLink(GE.emptyStore(), {
    url: 'https://example.test/g/exp',
    typeId: 'kyash',
    accountId: 'めぱん',
    faceYen: 10000,
    source: 'exchange'
  });
  assert.strictEqual(added.store.items[0].expiresText, '');
  assert.strictEqual(GE.expiresLabel(added.store.items[0]), '未確認');
  assert.strictEqual(GE.parseExpires('majica 10,000円分 9,700ポイント'), '');
  assert.strictEqual(GE.parseExpires('有効期限 2026/08/01'), '2026/08/01');
  assert.ok(!/2024|2030|12\/31/.test(JSON.stringify(added.store.items[0])));
});

test('途中失敗のあと交換ボタンを再送しない', () => {
  const frames = [
    session(),
    session({ text: 'アカウント名：表示A\n保有ポイント 50,000\nmajica' }),
    offerSnap(9700),
    offerSnap(9700),
    offerSnap(9700),
    { timedOut: true, balance: null, historyNew: null, acquiring: false, text: '', buttons: [{ text: '交換する', href: '' }] }
  ];
  const run = GE.runScenario(job(), frames);
  assert.strictEqual(run.log.exchangeClicks, 1);
  assert.strictEqual(run.state.held, true);
  assert.strictEqual(run.log.actions[run.log.actions.length - 1].retry, false);
  const again = GE.reduce(run.state, offerSnap(9700));
  assert.strictEqual(again.action.type, 'hold');
  assert.notStrictEqual(again.action.target, 'confirm-exchange');
  assert.ok(GE.terminalActions('hold').indexOf('start') < 0);
  assert.ok(GE.terminalActions('hold').indexOf('retry') < 0);
});

test('押す前の失敗では交換ボタンを押さない', () => {
  const run = GE.runScenario(job(), [
    session(),
    { disconnected: true, balance: null, historyNew: null, text: '', buttons: [] }
  ]);
  assert.strictEqual(run.log.exchangeClicks, 0);
  assert.strictEqual(run.state.aborted, true);
  assert.strictEqual(run.log.actions[run.log.actions.length - 1].retry, false);
});

test('残高不足と額面不一致とポイント未読は中断する', () => {
  const low = GE.runScenario(job(), [session({ balance: 1000, text: 'アカウント名：表示A\n保有ポイント 1,000' }), session(), offerSnap(9700, { balance: 1000 })]);
  assert.strictEqual(low.log.exchangeClicks, 0);
  assert.strictEqual(low.state.aborted, true);
  assert.ok(/残高/.test(low.state.abortReason));

  const mismatch = GE.parseOfferFromText('5,000円分\n4,850ポイント', 10000);
  assert.strictEqual(mismatch.ok, false);
  const noPt = GE.parseOfferFromText('10,000円分だけ', 10000);
  assert.strictEqual(noPt.ok, false);
  assert.ok(/必要ポイント/.test(noPt.reason));
});

test('画面に出た必要ポイントを額面と別に使う', () => {
  const majica = GE.parseOfferFromText('majica\n10,000円分\n9,700ポイント', 10000);
  assert.strictEqual(majica.ok, true);
  assert.strictEqual(majica.faceYen, 10000);
  assert.strictEqual(majica.points, 9700);
  const kyash = GE.parseOfferFromText('kyash\n10,000円分\n10,000pt', 10000);
  assert.strictEqual(kyash.ok, true);
  assert.strictEqual(kyash.points, 10000);
  assert.strictEqual(GE.assessOffer({ faceYen: 10000, points: 9700, balance: 9700, expectedFace: 10000 }).ok, true);
  assert.strictEqual(GE.assessOffer({ faceYen: 10000, points: 9700, balance: 9699, expectedFace: 10000 }).ok, false);
  const src = fs.readFileSync(path.join(root, 'exchange-vault.js'), 'utf8');
  assert.ok(!/9700|kyash\s*:\s*10000|majica\s*:\s*9/.test(src));
});

test('利用済みにするは押さず、確認は閉じる', () => {
  const frames = [
    session(),
    session(),
    offerSnap(10000),
    offerSnap(10000),
    offerSnap(10000),
    {
      acquiring: false,
      usedConfirm: true,
      text: '利用済みにしますか',
      buttons: [{ text: '利用済みにする', href: '' }, { text: '閉じる', href: '' }],
      loggedIn: true,
      displayName: '表示A',
      balance: 40000
    }
  ];
  const run = GE.runScenario(job({ typeId: 'kyash' }), frames);
  assert.strictEqual(run.log.usedClicks, 0);
  assert.ok(run.log.dismissClicks >= 1);
  assert.ok(run.log.actions.every(a => a.target !== 'mark-used'));
});

test('取得中のあと新しいギフトを開くリンクだけ保存する', () => {
  const frames = [
    session({ buttons: [{ text: 'ギフトを開く', href: 'https://example.test/g/old' }] }),
    session(),
    offerSnap(9700),
    offerSnap(9700),
    offerSnap(9700),
    { acquiring: true, text: '取得中', loggedIn: true, displayName: '表示A', balance: 40300, buttons: [] },
    {
      acquiring: false,
      text: '有効期限：2027/01/02\nギフトを開く',
      loggedIn: true,
      displayName: '表示A',
      balance: 40300,
      buttons: [
        { text: 'ギフトを開く', href: 'https://example.test/g/old' },
        { text: 'ギフトを開く', href: 'https://example.test/g/new' },
        { text: '利用済みにする', href: '' }
      ]
    }
  ];
  const run = GE.runScenario(job(), frames);
  assert.strictEqual(run.state.phase, 'done');
  assert.strictEqual(run.state.captures.length, 1);
  assert.strictEqual(run.state.captures[0].url, 'https://example.test/g/new');
  assert.strictEqual(run.state.captures[0].expiresText, '2027/01/02');
  assert.strictEqual(run.state.captures[0].pointsShown, 9700);
  assert.strictEqual(run.state.captures[0].faceYen, 10000);
  assert.strictEqual(run.log.usedClicks, 0);
  assert.strictEqual(run.log.exchangeClicks, 1);
});

test('新しいリンクが複数なら再交換しない', () => {
  const frames = [
    session(),
    session(),
    offerSnap(9700),
    offerSnap(9700),
    offerSnap(9700),
    {
      text: 'ギフトを開く',
      loggedIn: true,
      displayName: '表示A',
      balance: 40000,
      buttons: [
        { text: 'ギフトを開く', href: 'https://example.test/g/1' },
        { text: 'ギフトを開く', href: 'https://example.test/g/2' }
      ]
    }
  ];
  const run = GE.runScenario(job(), frames);
  assert.strictEqual(run.state.held, true);
  assert.strictEqual(run.log.exchangeClicks, 1);
  assert.strictEqual(run.log.openClicks, 0);
});

test('表示名の不一致や未ログインでは押さない', () => {
  const mismatch = GE.runScenario(job(), [session({ displayName: '別人', text: 'アカウント名：別人\n保有ポイント 50,000' })]);
  assert.strictEqual(mismatch.log.exchangeClicks, 0);
  assert.strictEqual(mismatch.state.aborted, true);
  const loggedOut = GE.assessProbe({ accountId: 'めぱん', loggedIn: false, displayName: '', balance: null, boundName: '' });
  assert.strictEqual(loggedOut.ok, false);
  const unnamed = GE.assessProbe({ accountId: 'めぱん', loggedIn: true, displayName: '', balance: 10, boundName: '' });
  assert.strictEqual(unnamed.ok, false);
});

test('カレンダー・CSV・手入力の保存領域を触らない', () => {
  const storage = memStorage({
    charge_saved_months: '["2026-11"]',
    'charge_2026-11': '[{"yen":1}]',
    expense_saved_months: '[]',
    gwManualEntries: '[{"id":"m1","note":"手入力"}]',
    'memo_2026-11-06': '日メモ',
    exchange_results: '["残す"]'
  });
  const before = JSON.parse(JSON.stringify(storage.dump()));
  let store = GE.addLink(GE.emptyStore(), {
    url: 'https://example.test/g/iso',
    typeId: 'amazon',
    accountId: 'モリ母',
    faceYen: 10000,
    source: 'manual'
  }).store;
  GE.saveToStorage(storage, store);
  const after = storage.dump();
  Object.keys(before).forEach(k => assert.strictEqual(after[k], before[k], k));
  assert.ok(after[GE.STORE_KEY]);
  assert.ok(!after[GE.STORE_KEY].includes('手入力'));
});

test('壊れた保存は上書きせず、削除しても連番を再利用しない', () => {
  const storage = memStorage({ [GE.STORE_KEY]: '{壊' });
  const loaded = GE.loadFromStorage(storage);
  assert.strictEqual(loaded.corrupt, true);
  assert.strictEqual(storage.dump()[GE.STORE_KEY], '{壊');
  let store = GE.addLink(GE.emptyStore(), {
    url: 'https://example.test/g/del',
    typeId: 'waon',
    accountId: 'モーリー',
    faceYen: 10000,
    source: 'manual'
  }).store;
  const removed = GE.removeLink(store, 1);
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(removed.store.items.length, 0);
  assert.strictEqual(removed.store.nextSerial, 2);
  const again = GE.addLink(removed.store, {
    url: 'https://example.test/g/del2',
    typeId: 'waon',
    accountId: 'モーリー',
    faceYen: 10000,
    source: 'manual'
  });
  assert.strictEqual(again.store.items[0].serial, 2);
});

test('URL検証とHTML注入のエスケープ', () => {
  assert.strictEqual(GE.normalizeUrl('javascript:alert(1)'), null);
  assert.strictEqual(GE.normalizeUrl('data:text/html,hi'), null);
  assert.strictEqual(GE.normalizeUrl('https://user:pass@example.test/g'), null);
  assert.strictEqual(GE.normalizeUrl('https://example.test/g/ok?token=1'), 'https://example.test/g/ok?token=1');
  const esc = GE.escapeHtml('<img src=x onerror="alert(1)">');
  assert.ok(esc.indexOf('<') < 0);
  assert.ok(esc.indexOf('"') < 0);
  const bad = GE.addLink(GE.emptyStore(), {
    url: 'javascript:alert(1)',
    typeId: 'kyash',
    accountId: 'モーリー',
    faceYen: 10000
  });
  assert.strictEqual(bad.ok, false);
});

test('マージは既存レコードの額面を新しい値で潰さない', () => {
  const local = GE.addLink(GE.emptyStore(), {
    url: 'https://example.test/g/keep',
    typeId: 'majica',
    accountId: 'モーリー',
    faceYen: 10000,
    pointsShown: 9700,
    expiresText: '2026/01/01',
    source: 'exchange'
  }).store;
  local.savedAt = 10;
  local.items[0].statusAt = 10;
  const remote = JSON.parse(JSON.stringify(local));
  remote.savedAt = 5;
  remote.items[0].faceYen = 5000;
  remote.items[0].typeId = 'kyash';
  remote.items[0].status = 'used';
  remote.items[0].statusAt = 20;
  const merged = GE.mergeStores(local, remote);
  assert.strictEqual(merged.items.length, 1);
  assert.strictEqual(merged.items[0].faceYen, 10000);
  assert.strictEqual(merged.items[0].typeId, 'majica');
  assert.strictEqual(merged.items[0].status, 'used');
});

test('実行側は利用済みボタンを押さない', () => {
  const clicks = { used: 0, close: 0, open: 0, exchange: 0 };
  function btn(text, href) {
    const rec = { text: text, href: href || '', innerText: text, getAttribute() { return href || ''; } };
    rec.click = function () {
      if (text.indexOf('利用済み') >= 0) clicks.used += 1;
      if (text === '閉じる') clicks.close += 1;
      if (text.indexOf('ギフトを開く') >= 0) clicks.open += 1;
      if (text.indexOf('交換する') >= 0) clicks.exchange += 1;
    };
    return rec;
  }
  const buttons = [btn('利用済みにする'), btn('閉じる'), btn('ギフトを開く', 'https://example.test/g/z'), btn('交換する')];
  const doc = {
    body: { innerText: '利用済みにしますか\nアカウント名：表示A\n保有ポイント 50,000' },
    location: { href: 'https://wallet.vaton.jp/point/brands' },
    querySelector() { return null; },
    querySelectorAll() { return buttons; }
  };
  const snap = VX.scrape(doc);
  assert.strictEqual(snap.usedConfirm, true);
  assert.ok(!Object.prototype.hasOwnProperty.call(snap, 'code'));
  assert.strictEqual(VX.perform({ type: 'click', target: 'mark-used' }, doc), false);
  assert.strictEqual(VX.perform({ type: 'click', target: 'used' }, doc), false);
  assert.strictEqual(VX.perform({ type: 'click', target: 'dismiss-used' }, doc), true);
  assert.strictEqual(clicks.used, 0);
  assert.strictEqual(clicks.close, 1);
  const runner = fs.readFileSync(path.join(root, 'vaton-exchange.js'), 'utf8');
  assert.ok(!/\[A-Z0-9\]\{4\}/.test(runner));
  assert.ok(!/ギフトを使用する/.test(runner));
});

test('画面のHTMLは既存のカレンダーと手入力を残し、古い交換開始を呼ばない', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('function parseCSV'));
  assert.ok(html.includes('function renderCalendar'));
  assert.ok(html.includes('gwManualEntries'));
  assert.ok(html.includes('charge_saved_months'));
  assert.ok(html.includes('exchange-vault.js'));
  assert.ok(html.includes('openGiftMemo'));
  assert.ok(!/startExchange\(/.test(html));
  assert.ok(!html.includes('9700'));
});

console.log(passed + ' passed');
