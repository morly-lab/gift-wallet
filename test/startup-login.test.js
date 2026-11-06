const test = require('node:test');
const assert = require('node:assert/strict');
const login = require('../js/startup-login.js');

test('未チャージの当日空白ではログインページを開かない', function () {
  const d = login.decideStartupLogin({ phase: 'done', auth: 'in', todayBlank: true, alreadyPrompted: false });
  assert.equal(d.show, false);
  assert.equal(d.reason, 'uncharged');
  assert.equal(login.todayIsBlank([]), true);
  assert.equal(login.todayIsBlank([1200]), false);
});

test('ログイン切れが確認できて当日が空白なら公式のsign_inを出す', function () {
  const d = login.decideStartupLogin({ phase: 'logged_out', auth: 'out', todayBlank: true, alreadyPrompted: false });
  assert.equal(d.show, true);
  assert.equal(d.message, 'ギフトウォレットにログインしてください');
  assert.equal(d.url, 'https://wallet.vaton.jp/sign_in');
  assert.equal(login.shouldNavigateToLogin('https://gift-wallet.pages.dev/', d), true);
  assert.equal(login.shouldNavigateToLogin('https://wallet.vaton.jp/sign_in', d), false);
  assert.equal(login.shouldNavigateToLogin('https://wallet.vaton.jp/login', d), false);
});

test('通信失敗や更新中や当日に記録があるときはログイン切れにしない', function () {
  assert.equal(login.decideStartupLogin({ phase: 'error', auth: 'unknown', todayBlank: true }).reason, 'not_confirmed');
  assert.equal(login.decideStartupLogin({ phase: 'updating', auth: 'unknown', todayBlank: true }).reason, 'updating');
  assert.equal(login.decideStartupLogin({ phase: 'logged_out', auth: 'out', todayBlank: false }).reason, 'has_today');
  assert.equal(login.decideStartupLogin({ phase: 'logged_out', auth: 'out', todayBlank: true, alreadyPrompted: true }).reason, 'already');
});

test('中央案内は二重に出さない', function () {
  const doc = fakeDoc();
  const first = login.mountLoginNotice(doc);
  const second = login.mountLoginNotice(doc);
  assert.equal(first.shown, true);
  assert.equal(first.text, 'ギフトウォレットにログインしてください');
  assert.equal(second.shown, false);
  assert.equal(second.reason, 'exists');
  assert.equal(doc.body.children.length, 1);
});

test('ログイン成功だけ再取得し、既存データは消さない。未確認の画面では戻らない', function () {
  const plan = login.afterLoginPlan({ pending: true, loggedIn: true, alreadyRefetched: false });
  assert.equal(plan.refetch, true);
  assert.equal(plan.goCalendar, true);
  assert.equal(plan.clearData, false);
  assert.equal(login.afterLoginPlan({ pending: true, loggedIn: true, alreadyRefetched: true }).refetch, false);
  assert.equal(login.loginCompletion({ loggedOut: false, hasCsvButton: true }).recovered, true);
  assert.equal(login.loginCompletion({ loggedOut: true, hasCsvButton: true }).recovered, false);
  assert.equal(login.loginCompletion({ loggedOut: false, hasCsvButton: false, hasHistory: false }).reason, 'unconfirmed');
  assert.equal(login.pageLooksLoggedOut({ path: '/sign_in', text: '', hasPassword: true }), true);
  assert.equal(login.pageLooksLoggedOut({ path: '/point/point_logs', text: '利用実績CSVダウンロード', hasPassword: false }), false);
});

function fakeDoc() {
  function node(tag) {
    return {
      tag: tag,
      id: '',
      children: [],
      textContent: '',
      setAttribute: function () {},
      appendChild: function (child) { this.children.push(child); }
    };
  }
  const body = node('body');
  const doc = {
    body: body,
    getElementById: function (id) {
      return body.children.filter(function (n) { return n.id === id; })[0] || null;
    },
    createElement: function (tag) { return node(tag); }
  };
  const orig = doc.createElement;
  doc.createElement = function (tag) {
    const n = orig(tag);
    const prev = n;
    return new Proxy(n, {
      set: function (target, key, value) {
        target[key] = value;
        return true;
      }
    });
  };
  return doc;
}
