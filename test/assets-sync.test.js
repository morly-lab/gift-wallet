const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const names = ['exchange-guard.js', 'gift-vault.js', 'startup-login.js', 'vaton-exchange.js', 'login-return.js'];

test('Androidへ入れるスクリプトはWebと同じ内容', function () {
  names.forEach(function (name) {
    const web = fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
    const asset = fs.readFileSync(path.join(__dirname, '../android-app/app/src/main/assets', name), 'utf8');
    assert.equal(asset, web, name);
  });
});
