const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vaultApi = require('../js/gift-vault.js');

function fresh() {
  return vaultApi.createVault(vaultApi.memoryStorage());
}

test('保存して別インスタンスで復元できる', function () {
  const store = vaultApi.memoryStorage();
  const a = vaultApi.createVault(store);
  const added = a.add({ link: 'https://gift.example.jp/a', faceYen: 10000, kind: 'kyash', account: '利用者A', expiry: '2026-12-31' });
  assert.equal(added.ok, true);
  const b = vaultApi.createVault(store);
  const rows = b.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].seq, 1);
  assert.equal(rows[0].link, 'https://gift.example.jp/a');
  assert.equal(rows[0].status, 'unused');
});

test('同じリンクは追記せず上書きしない', function () {
  const v = fresh();
  assert.equal(v.add({ link: 'https://gift.example.jp/a', faceYen: 10000, kind: 'au PAY', account: '利用者B' }).ok, true);
  const second = v.add({ link: 'https://gift.example.jp/a/', faceYen: 5000, kind: 'WAON', account: '利用者C' });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'duplicate');
  const rows = v.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'au PAY');
  assert.equal(rows[0].faceYen, 10000);
});

test('種類とアカウントと使用状態で絞れる', function () {
  const v = fresh();
  v.add({ link: 'https://gift.example.jp/1', faceYen: 10000, kind: 'kyash', account: '利用者A' });
  v.add({ link: 'https://gift.example.jp/2', faceYen: 10000, kind: 'majica', account: '利用者B' });
  v.setStatus(v.list()[1].id, 'used');
  assert.equal(v.list({ kind: 'kyash' }).length, 1);
  assert.equal(v.list({ account: '利用者B' }).length, 1);
  assert.equal(v.list({ status: 'used' }).length, 1);
  assert.equal(v.list({ status: 'unused', kind: 'majica' }).length, 0);
});

test('使用状態の変更は保管データだけで、連番は再利用しない', function () {
  const v = fresh();
  const first = v.add({ link: 'https://gift.example.jp/1', faceYen: 10000, kind: 'Vポイント', account: '利用者C' });
  v.setStatus(first.record.id, 'used');
  assert.equal(v.list()[0].status, 'used');
  v.remove(first.record.id);
  const second = v.add({ link: 'https://gift.example.jp/2', faceYen: 10000, kind: 'kyash', account: '利用者C' });
  assert.equal(second.record.seq, 2);
  assert.equal(v.readRaw().seq, 2);
});

test('期限が空なら未確認。壊れたURLやHTMLはリンクとして採用しない', function () {
  const v = fresh();
  const added = v.add({ link: 'https://gift.example.jp/e', faceYen: 10000, kind: '<img src=x>', account: '未確認', expiry: '' });
  assert.equal(added.ok, true);
  const vm = vaultApi.viewModel(added.record);
  assert.equal(vm.expiry, '未確認');
  assert.equal(vm.kind, '<img src=x>');
  assert.equal(vm.linkLabel, 'gift.example.jp');
  assert.equal(v.add({ link: 'javascript:alert(1)', faceYen: 10000, kind: 'kyash', account: '利用者A' }).code, 'bad_link');
  assert.equal(v.update(added.record.id, { expiry: '2026-02-31' }).code, 'bad_expiry');
});

test('既存JSONに未知項目があってもリンクは残し、重複は上書きしない', function () {
  const local = JSON.stringify([{
    id: 'old1', seq: 4, link: 'https://gift.example.jp/old', faceYen: 10000,
    kind: 'kyash', expiry: null, account: '利用者A', status: 'unused', extra: 'keep-me-out'
  }]);
  const remote = JSON.stringify([
    { id: 'old1b', seq: 4, link: 'https://gift.example.jp/old', faceYen: 1, kind: 'WAON', expiry: '2020-01-01', account: '利用者B', status: 'used' },
    { id: 'new2', seq: 9, link: 'https://gift.example.jp/new', faceYen: null, kind: 'majica', expiry: null, account: '未確認', status: 'unused' }
  ]);
  const merged = JSON.parse(vaultApi.mergeJson(local, remote));
  assert.equal(merged.length, 2);
  const old = merged.filter(function (r) { return r.link === 'https://gift.example.jp/old'; })[0];
  assert.equal(old.kind, 'kyash');
  assert.equal(old.status, 'unused');
  assert.equal(old.account, '利用者A');
  assert.equal(Object.prototype.hasOwnProperty.call(old, 'extra'), false);
});

test('既存ラベルは残し、セッションが違うメモは混ぜない', function () {
  const v = fresh();
  const key = 'a'.repeat(64);
  const other = 'b'.repeat(64);
  v.add({ link: 'https://gift.example.jp/old', faceYen: 500, kind: 'au PAY', account: '以前のメモ', allowEmptyFace: false });
  v.add({ link: 'https://gift.example.jp/now', faceYen: 200, kind: 'Kyash', account: 'ログイン中', sessionKey: key });
  v.add({ link: 'https://gift.example.jp/else', faceYen: 200, kind: 'Kyash', account: '別', sessionKey: other });
  assert.equal(v.list({ session: 'unknown' }).length, 1);
  assert.equal(v.list({ session: 'unknown' })[0].account, '以前のメモ');
  assert.equal(v.list({ session: 'current', sessionKey: '' }).length, 0);
  assert.equal(v.list({ session: 'current', sessionKey: key }).length, 1);
  assert.equal(v.list({ session: 'current', sessionKey: key })[0].link, 'https://gift.example.jp/now');
});

test('画面はinnerHTMLでリンクを埋め込まない', function () {
  const src = fs.readFileSync(require('node:path').join(__dirname, '../js/gift-vault-ui.js'), 'utf8');
  assert.equal(src.includes('innerHTML'), false);
  assert.equal(src.includes('利用済みにする'), true);
});
