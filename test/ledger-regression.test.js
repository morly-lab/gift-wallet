const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

test('カレンダー、CSV、手入力の入口が残っている', function () {
  ['renderCalendar', 'parseCSV', 'directAggregate', 'gwManualAdd', 'gwManualList', 'importGiftWalletCsvText', 'handleCalFileSelect'].forEach(function (name) {
    assert.ok(html.includes('function ' + name) || html.includes('window.' + name), name);
  });
  assert.ok(html.includes('charge_saved_months'));
  assert.ok(html.includes('gwManualEntries'));
  assert.ok(html.includes("cls+=' today'"));
  assert.ok(html.includes('has-charge'));
});

test('CSVの種別判定とブランド分類が以前と同じ', function () {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extractFunction('splitLine') + '\n' + extractFunction('parseCSV') + '\n' + extractFunction('classifyExpenseBrand'), context);
  const csv = '日付,種別,チャージポイント,ブランド名,商品名,円換算額\n2026/11/06,チャージ,1500,au PAY,x,1500\n2026/11/06,交換,0,majica,商品,9700\n';
  const parsed = context.parseCSV(csv);
  assert.equal(parsed.type, 'eraberu');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]['種別'], 'チャージ');
  assert.equal(context.classifyExpenseBrand('au PAY', ''), 'au PAY');
  assert.equal(context.classifyExpenseBrand('', 'majica'), 'majica');
  assert.equal(context.classifyExpenseBrand('Vポイント', ''), 'Vポイント');
  const paypay = context.parseCSV('取引日,出金金額,取引内容,取引方法,入金金額\n2026/11/06,0,チャージ,ギフトカード,100\n');
  assert.equal(paypay.type, 'paypay');
  assert.equal(paypay.rows[0]['取引方法'], 'ギフトカード');
});

test('手入力は手入力の保存だけを増やし、チャージ保存は消さない', function () {
  const memory = {
    charge_saved_months: '["2026/11"]',
    'charge_2026/11': '[{"amount":500}]'
  };
  const storage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; },
    setItem: function (k, v) { memory[k] = String(v); },
    removeItem: function (k) { delete memory[k]; }
  };
  const context = {
    localStorage: storage,
    currentDayKey: '2026-11-06',
    showToast: function () {},
    gwManualRefresh: function () {},
    document: {
      getElementById: function (id) {
        if (id === 'gwManualAmt') return { value: '1800' };
        return null;
      }
    },
    window: { __gwManualKind: 'Vポイント' },
    fmt: function (n) { return String(n); }
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('gwManualList') + '\n' + extractFunction('gwManualAdd') + '\ngwManualAdd();', context);
  const manual = JSON.parse(memory.gwManualEntries);
  assert.equal(manual.length, 1);
  assert.equal(manual[0].kind, 'Vポイント');
  assert.equal(manual[0].amount, 1800);
  assert.equal(memory.charge_saved_months, '["2026/11"]');
  assert.equal(memory['charge_2026/11'], '[{"amount":500}]');
});
