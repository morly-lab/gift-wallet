const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../js/exchange-guard.js');

const base = {
  account: 'モーリー',
  accountSeen: 'モーリー',
  kind: 'kyash',
  count: 1,
  balance: 30000,
  faceYen: 10000,
  points: 10000
};

test('kyashは画面の10,000ptと一致すれば進める', function () {
  const d = guard.decideExchange(base);
  assert.equal(d.action, 'proceed');
  assert.equal(d.points, 10000);
});

test('majicaは画面の9,700ptなら進める', function () {
  const d = guard.decideExchange(Object.assign({}, base, { kind: 'マジカ', points: 9700, balance: 9700 }));
  assert.equal(d.action, 'proceed');
  assert.equal(d.kind, 'majica');
});

test('現場報告と画面のポイントが違えば止める', function () {
  const d = guard.decideExchange(Object.assign({}, base, { kind: 'majica', points: 10000 }));
  assert.equal(d.action, 'stop');
  assert.equal(d.code, 'points_mismatch');
});

test('ポイントが画面に無ければ固定値で進めない', function () {
  const d = guard.decideExchange(Object.assign({}, base, { kind: 'au PAY', points: null }));
  assert.equal(d.action, 'stop');
  assert.equal(d.code, 'points_unknown');
});

test('額面が10,000円でなければ止める', function () {
  const d = guard.decideExchange(Object.assign({}, base, { faceYen: 5000, points: 5000 }));
  assert.equal(d.action, 'stop');
  assert.equal(d.code, 'face_mismatch');
});

test('残高不足は止める', function () {
  const d = guard.decideExchange(Object.assign({}, base, { balance: 9999, count: 1 }));
  assert.equal(d.action, 'stop');
  assert.equal(d.code, 'balance_short');
});

test('アカウント不一致は止める', function () {
  const d = guard.decideExchange(Object.assign({}, base, { accountSeen: 'めぱん' }));
  assert.equal(d.action, 'stop');
  assert.equal(d.code, 'account_mismatch');
});

test('通信失敗やタイムアウトのあと確認前は再送できない', function () {
  const lock = guard.lockFromFailure({ pressed: true, timedOut: true, phase: 'waitResult', reason: 'timeout' });
  assert.equal(lock.mode, 'unknown');
  assert.equal(guard.allowRestart(lock, { balanceChecked: true, historyChecked: true, manualResolved: 'unknown' }).ok, false);
  assert.equal(guard.allowRestart(lock, { balanceChecked: false, historyChecked: true, manualResolved: 'not_exchanged' }).ok, false);
  assert.equal(guard.allowRestart(lock, { balanceChecked: true, historyChecked: true, manualResolved: 'not_exchanged' }).ok, true);
});

test('押す前の失敗も残高と履歴の確認まで再送しない', function () {
  const lock = guard.lockFromFailure({ pressed: false, phase: 'check', reason: '画面' });
  assert.equal(lock.mode, 'hold');
  assert.equal(guard.allowRestart(lock, {}).ok, false);
  assert.equal(guard.allowRestart(lock, { balanceChecked: true, historyChecked: true }).ok, true);
});

test('コード番号は拾わずhttpsリンクだけ残す', function () {
  const text = 'コード ABCD-EFGH-IJKL-MNOP 番号 1234567890123456 https://gift.example.jp/g/1 javascript:alert(1)';
  const links = guard.extractHttpsLinks(text, ['http://insecure.example/a', 'https://user:pass@gift.example.jp/x']);
  assert.deepEqual(links, ['https://gift.example.jp/g/1']);
});

test('期限は画面の日付だけ。無ければ未確認', function () {
  assert.equal(guard.parseExpiry('ありがとうございました'), null);
  assert.equal(guard.parseExpiry('有効期限 2026年12月31日まで'), '2026-12-31');
  assert.equal(guard.parseExpiry('2026/12/31'), null);
});

test('利用済み確認は閉じるだけで、そのボタンは押さない', function () {
  const step = guard.exchangeStep(
    { phase: 'openGift', account: 'モーリー', kind: 'kyash', count: 1 },
    { text: '利用済みにします。よろしいですか', buttons: ['利用済みにする', '閉じる'] }
  );
  assert.deepEqual(step.actions.map(function (a) { return a.label || a.type; }), ['閉じる']);
  const ctx = { guard: guard, buttons: ['利用済みにする', '閉じる'], click: function (label) { ctx.clicked = label; }, refused: 0 };
  guard && require('../js/vaton-exchange.js');
});

test('実行器は利用済みにするを拒否する', function () {
  const runner = require('../js/vaton-exchange.js');
  const ctx = { guard: guard, buttons: ['利用済みにする'], click: function () { throw new Error('clicked'); }, refused: 0 };
  runner.executeAction({ type: 'click', label: '利用済みにする' }, ctx);
  assert.equal(ctx.refused, 1);
  const closed = { guard: guard, buttons: ['利用済みにする', 'キャンセル'], click: function (label) { closed.clicked = label; } };
  runner.executeAction({ type: 'closeDialog' }, closed);
  assert.equal(closed.clicked, 'キャンセル');
});

test('取得中はギフトを開かず、消えたら一度だけ開く', function () {
  const state = { phase: 'openGift', account: 'めぱん', kind: 'majica', count: 1, index: 0, saved: [], baseline: [], openedClick: false };
  const waiting = guard.exchangeStep(state, { text: '取得中', buttons: ['ギフトを開く'], fetching: true, hrefs: [] });
  assert.equal(waiting.actions[0].reason, '取得中');
  const opening = guard.exchangeStep(waiting.state, { text: '準備できました', buttons: ['ギフトを開く'], canOpen: true, hrefs: [] });
  assert.equal(opening.actions[0].label, 'ギフトを開く');
  const again = guard.exchangeStep(opening.state, { text: '準備できました', buttons: ['ギフトを開く'], canOpen: true, hrefs: [] });
  assert.equal(again.actions[0].type, 'wait');
});

test('新しいリンクだけ保管し、タイムアウトでは交換を押さない', function () {
  const opened = guard.exchangeStep(
    { phase: 'openGift', account: 'モリ母', kind: 'au PAY', count: 1, index: 0, saved: [], points: 10000, balanceLeft: 20000, baseline: ['https://wallet.vaton.jp/point/brands'], openedClick: true },
    { text: '有効期限 2027/01/02', hrefs: ['https://wallet.vaton.jp/point/brands', 'https://gift.example.jp/new'], buttons: [] }
  );
  assert.equal(opened.actions[0].type, 'saveLinks');
  assert.deepEqual(opened.actions[0].links, ['https://gift.example.jp/new']);
  const stalled = guard.exchangeStep(
    { phase: 'waitResult', account: 'モリ母', kind: 'au PAY', count: 1, pressed: true },
    { text: '', timedOut: true, buttons: ['交換する'] }
  );
  assert.equal(stalled.actions[0].type, 'fail');
  assert.equal(stalled.actions[0].pressed, true);
  assert.equal(stalled.actions.some(function (a) { return a.label === '交換する'; }), false);
});

test('画面の行から額面とポイントを読む。無ければnull', function () {
  const runner = require('../js/vaton-exchange.js');
  const text = 'モーリー\n残高 20,000\nkyash 10,000円 10,000ポイント';
  const snap = runner.snapshotFromText(text, ['ギフトを開く'], { kind: 'kyash' }, []);
  assert.equal(snap.accountSeen, 'モーリー');
  assert.equal(snap.balance, 20000);
  assert.equal(snap.faceYen, 10000);
  assert.equal(snap.points, 10000);
  const missing = runner.snapshotFromText('残高\n商品一覧', [], { kind: 'kyash' }, []);
  assert.equal(missing.faceYen, null);
  assert.equal(missing.points, null);
  assert.equal(missing.accountSeen, '');
});
