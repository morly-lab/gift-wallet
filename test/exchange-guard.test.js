const test = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../js/exchange-guard.js');
const runner = require('../js/vaton-exchange.js');

function base(extra) {
  return Object.assign({
    kind: 'au PAY',
    count: 1,
    balance: 30000,
    faceYen: 50,
    selectedFace: 50,
    points: 50,
    loggedIn: true,
    sessionStart: 'sess-test',
    sessionNow: 'sess-test'
  }, extra || {});
}

test('表示名が無くてもログインと額面とポイントが合うと進める', function () {
  const d = guard.decideExchange(base());
  assert.equal(d.action, 'proceed');
  assert.equal(d.faceYen, 50);
  assert.equal(d.points, 50);
});

test('任意の表示名は不要で、名前不一致では止めない', function () {
  const d = guard.decideExchange(base({ displayName: '利用者A' }));
  assert.equal(d.action, 'proceed');
});

test('ログイン切れは止める', function () {
  const d = guard.decideExchange(base({ loggedIn: false }));
  assert.equal(d.code, 'logged_out');
});

test('au PAYの確認済み10種類だけボタンになり、1円=1pt', function () {
  const choice = guard.faceChoices('au PAY');
  assert.equal(choice.status, 'confirmed');
  assert.deepEqual(choice.options.map(function (r) { return r.faceYen; }), [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000]);
  choice.options.forEach(function (r) { assert.equal(r.points, r.faceYen); });
  assert.match(choice.note.chargeLimitNote, /チャージ上限/);
  assert.match(choice.note.chargeLimitNote, /交換できる回数の上限ではありません/);
});

test('画面のポイントが確認済みと違うau PAYは止める', function () {
  const d = guard.decideExchange(base({ faceYen: 100, selectedFace: 100, points: 90 }));
  assert.equal(d.code, 'points_mismatch');
});

test('majicaは確認済み6種類を表示し、在庫切れの間は実行しない', function () {
  const shown = guard.faceChoices('majica');
  assert.equal(shown.status, 'out_of_stock');
  assert.equal(shown.canExecute, false);
  assert.deepEqual(shown.options.map(function (r) { return r.faceYen; }), [300, 500, 1000, 3000, 5000, 10000]);
  assert.equal(shown.options[5].points, 10000);
  assert.equal(guard.decideExchange(base({ kind: 'majica', faceYen: 10000, selectedFace: 10000, points: 10000 })).code, 'face_waiting');
  const back = guard.faceChoices('majica', { stockAvailable: true });
  assert.equal(back.status, 'confirmed');
  assert.equal(guard.decideExchange(base({ kind: 'majica', faceYen: 10000, selectedFace: 10000, points: 9700, stockAvailable: true })).code, 'points_mismatch');
  assert.equal(guard.decideExchange(base({ kind: 'majica', faceYen: 10000, selectedFace: 10000, points: 10000, stockAvailable: true })).action, 'proceed');
});

test('Kyashは確認済み4種類', function () {
  const choice = guard.faceChoices('Kyash');
  assert.deepEqual(choice.options.map(function (r) { return r.faceYen; }), [200, 500, 1000, 10000]);
});

test('Vポイントは順序を残して選択不可', function () {
  assert.deepEqual(guard.KINDS.map(function (k) { return k.id; }), ['au PAY', 'majica', 'Kyash', 'Amazon', 'Vポイント', 'WAON']);
  assert.equal(guard.kindAvailable('Vポイント'), false);
  assert.equal(guard.faceChoices('Vポイント').status, 'unavailable');
  assert.equal(guard.decideExchange(base({ kind: 'Vポイント' })).code, 'unavailable');
});

test('AmazonとWAONはポイント範囲で、固定額面とは表示しない', function () {
  ['Amazon', 'WAON'].forEach(function (kind) {
    const choice = guard.faceChoices(kind);
    assert.equal(choice.status, 'range');
    assert.equal(choice.options.length, 0);
    assert.ok(choice.presets.length > 0);
    choice.presets.forEach(function (p) { assert.equal(p.officialFace, false); });
    assert.equal(choice.range.minPoints, 1);
    assert.equal(choice.range.maxPoints, 10000);
  });
  assert.match(guard.faceChoices('Amazon').note.rewardNote, /割引ではありません/);
  assert.equal(guard.parsePointAmount('1,234', 1, 10000).points, 1234);
  assert.equal(guard.parsePointAmount('50', 1, 10000).points, 50);
  assert.equal(guard.parsePointAmount('0', 1, 10000).ok, false);
  assert.equal(guard.parsePointAmount('10001', 1, 10000).ok, false);
  assert.equal(guard.parsePointAmount('12.5', 1, 10000).ok, false);
  const ok = guard.decideExchange({ kind: 'Amazon', count: 1, balance: 5000, selectedPoints: 1234, points: 1234, loggedIn: true, sessionStart: 'sess-test', sessionNow: 'sess-test' });
  assert.equal(ok.action, 'proceed');
  assert.equal(ok.faceYen, null);
  const bad = guard.decideExchange({ kind: 'Amazon', count: 1, balance: 5000, selectedPoints: 1234, points: 1200, loggedIn: true, sessionStart: 'sess-test', sessionNow: 'sess-test' });
  assert.equal(bad.code, 'points_mismatch');
});

test('セッションが変わったら中断し、同じキーなら続ける', function () {
  assert.equal(guard.sessionContinuity('aaa', 'bbb').ok, false);
  assert.equal(guard.sessionContinuity('', 'aaa').code, 'session_unknown');
  assert.equal(guard.sessionContinuity('', '').code, 'session_unknown');
  assert.equal(guard.sessionContinuity('aaa', 'aaa').identified, true);
  const unknown = guard.decideExchange(base({ sessionStart: '', sessionNow: '' }));
  assert.equal(unknown.code, 'session_unknown');
  assert.equal(unknown.action, 'stop');
  const changed = guard.decideExchange(base({ sessionStart: 'aaa', sessionNow: 'bbb' }));
  assert.equal(changed.code, 'session_changed');
  const same = guard.decideExchange(base({ sessionStart: 'aaa', sessionNow: 'aaa' }));
  assert.equal(same.action, 'proceed');
});

test('認証クッキー以外ではセッションを同一扱いしない', function () {
  assert.equal(guard.authCookieMaterial('_ga=1; clarity=x'), '');
  assert.equal(guard.authCookieMaterial('session=alpha; _ga=1'), 'session=alpha');
});

test('利用済みにするは押さない', function () {
  const step = guard.exchangeStep(
    { phase: 'openGift', kind: 'au PAY', faceYen: 50, count: 1 },
    { text: '利用済みにします。よろしいですか', buttons: ['利用済みにする', '閉じる'] }
  );
  assert.deepEqual(step.actions.map(function (a) { return a.label || a.type; }), ['閉じる']);
  const ctx = { guard: guard, buttons: ['利用済みにする'], click: function () { throw new Error('clicked'); }, refused: 0 };
  runner.executeAction({ type: 'click', label: '利用済みにする' }, ctx);
  assert.equal(ctx.refused, 1);
});

test('取得中は開かず、タイムアウトでは再交換しない', function () {
  const waiting = guard.exchangeStep(
    { phase: 'openGift', kind: 'Kyash', faceYen: 200, count: 1, index: 0, saved: [], baseline: [], openedClick: false },
    { text: '取得中', buttons: ['ギフトを開く'], fetching: true, hrefs: [] }
  );
  assert.equal(waiting.actions[0].reason, '取得中');
  const stalled = guard.exchangeStep(
    { phase: 'waitResult', kind: 'au PAY', faceYen: 50, count: 1, pressed: true },
    { text: '', timedOut: true, buttons: ['交換する'] }
  );
  assert.equal(stalled.actions[0].type, 'fail');
  assert.equal(stalled.actions.some(function (a) { return a.label === '交換する'; }), false);
});
