/**
 * 驗收測試：矽谷 $150k / 台北 200萬 / 德州 $80k
 * 用 Chromium 實際載入 index.html、操作 UI、讀取畫面上的數字並比對獨立計算的預期值。
 * 同時檢查 console error / pageerror，並輸出桌面與行動版截圖。
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const EXEC = '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome';
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = path.resolve(__dirname, '..', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

/* ---- 獨立於頁面實作的預期值（人工手算，作為交叉驗證） ---- */
const EXPECT = {
  sv: {  // 矽谷 San Jose, US$150,000, 單人
    monthlyNet: 8523.34, effectiveRate: 0.31813, coverage: 1.8056,
    savings: 3802.34, ppIndex: 10587, budget: 4721, totalTax: 47719.86, net: 102280.14
  },
  tpe: { // 台北 NT$2,000,000, 單人
    monthlyNet: 149345.00, effectiveRate: 0.10393, coverage: 2.9787,
    savings: 99206.33, ppIndex: 11801, budget: 50138.67, totalTax: 207860, net: 1792140
  },
  tx: {  // 德州 Austin, US$80,000, 單人
    monthlyNet: 5425.83, effectiveRate: 0.18613, coverage: 1.6971,
    savings: 2228.83, ppIndex: 9167, budget: 3197, totalTax: 14890, net: 65110
  }
};

const near = (a, b, tol) => Math.abs(a - b) <= tol;
let failures = 0;
const results = [];

/* 點擊預設組合前先把視窗捲回頂端並等待捲動動畫結束，
   避免 sticky 側欄在頁面捲動中位移，導致 Playwright 的點擊座標落在錯誤元素上。 */
async function clickPreset(page, key) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(150);
  await page.click(`.preset[data-preset="${key}"]`);
}

function check(name, actual, expected, tol, unit = '') {
  const ok = near(actual, expected, tol);
  if (!ok) failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: 實際 ${actual.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit} / 預期 ${expected.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit}`);
  return ok;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const errors = [];

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => {
    const u = r.url();
    if (!u.startsWith('file://')) errors.push('[external request] ' + u);
  });
  const externals = [];
  page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) externals.push(r.url()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('.stat .v');

  /* ---------- 讀取畫面上的統計卡 ---------- */
  async function readStats() {
    return page.$$eval('#stats .stat', els => els.map(e => ({
      k: e.querySelector('.k').textContent.trim(),
      v: e.querySelector('.v').textContent.trim(),
      d: e.querySelector('.d').textContent.trim()
    })));
  }
  async function readBreakRows() {
    return page.$$eval('#breakTable tbody tr', rows => rows.map(r => {
      const tds = r.querySelectorAll('td');
      return { label: tds[0].textContent.trim(), note: tds[1].textContent.trim(), value: tds[2].textContent.trim() };
    }));
  }
  const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, '')) || 0;
const rateOf = s => { const m = /有效稅率\s*([\d.]+)%/.exec(s); return m ? parseFloat(m[1]) : NaN; };

  /* ================= 測試 1：矽谷 $150k ================= */
  await clickPreset(page, 'sv');
  await page.waitForTimeout(400);
  let st = await readStats();
  let rows = await readBreakRows();
  const sv = EXPECT.sv;
  check('矽谷 稅後月收入', num(st[0].v), sv.monthlyNet, 1.0);
  check('矽谷 有效稅率', rateOf(st[0].d), sv.effectiveRate * 100, 0.02, '%');
  check('矽谷 購買力指數', num(st[1].v), sv.ppIndex, 3);
  check('矽谷 覆蓋倍數', num(st[2].v), sv.coverage, 0.01);
  check('矽谷 每月可儲蓄', num(st[3].v), sv.savings, 1.0);
  const svTotal = rows.find(r => r.label === '稅額合計');
  const svNet = rows.find(r => r.label === '稅後年收入');
  check('矽谷 稅額合計', num(svTotal.value), sv.totalTax, 2);
  check('矽谷 稅後年收入', num(svNet.value), sv.net, 2);
  results.push(`      註: 覆蓋倍數原文 "${st[2].v}", 稅額合計 "${svTotal.value}"`);

  /* ================= 測試 2：台北 200萬 ================= */
  await clickPreset(page, 'tpe');
  await page.waitForTimeout(400);
  st = await readStats();
  rows = await readBreakRows();
  const tpe = EXPECT.tpe;
  check('台北 稅後月收入', num(st[0].v), tpe.monthlyNet, 1.0);
  check('台北 有效稅率', rateOf(st[0].d), tpe.effectiveRate * 100, 0.02, '%');
  check('台北 購買力指數', num(st[1].v), tpe.ppIndex, 3);
  check('台北 覆蓋倍數', num(st[2].v), tpe.coverage, 0.01);
  check('台北 每月可儲蓄', num(st[3].v), tpe.savings, 1.0);
  const tpeTotal = rows.find(r => r.label === '稅額合計');
  const tpeNet = rows.find(r => r.label === '稅後年收入');
  check('台北 稅額合計', num(tpeTotal.value), tpe.totalTax, 2);
  check('台北 稅後年收入', num(tpeNet.value), tpe.net, 2);
  results.push(`      註: 覆蓋倍數原文 "${st[2].v}", 稅額合計 "${tpeTotal.value}"`);

  /* ================= 測試 3：德州 $80k ================= */
  await clickPreset(page, 'tx');
  await page.waitForTimeout(400);
  st = await readStats();
  rows = await readBreakRows();
  const tx = EXPECT.tx;
  check('德州 稅後月收入', num(st[0].v), tx.monthlyNet, 1.0);
  check('德州 有效稅率', rateOf(st[0].d), tx.effectiveRate * 100, 0.02, '%');
  check('德州 購買力指數', num(st[1].v), tx.ppIndex, 3);
  check('德州 覆蓋倍數', num(st[2].v), tx.coverage, 0.01);
  check('德州 每月可儲蓄', num(st[3].v), tx.savings, 1.0);
  const txTotal = rows.find(r => r.label === '稅額合計');
  const txNet = rows.find(r => r.label === '稅後年收入');
  check('德州 稅額合計', num(txTotal.value), tx.totalTax, 2);
  check('德州 稅後年收入', num(txNet.value), tx.net, 2);
  results.push(`      註: 覆蓋倍數原文 "${st[2].v}", 稅額合計 "${txTotal.value}"`);

  /* ================= 邊界情況 ================= */
  // 1) 高薪：加州百萬級（觸發最高級距與附加 Medicare）
  await page.click('button[data-cur="USD"]');
  await page.fill('#salary', '1000000');
  await page.selectOption('#region', 'sanjose');
  await page.click('#calcBtn');
  await page.waitForTimeout(200);
  const hi = await readStats();
  check('百萬年薪 稅後月收入為正且合理', num(hi[0].v) > 30000 && num(hi[0].v) < 60000 ? 1 : 0, 1, 0);
  results.push(`      百萬年薪 稅後月收入 = ${hi[0].v}, 有效稅率 = ${rateOf(hi[0].d)}%`);
  const hiRows = await readBreakRows();
  check('百萬年薪仍產生加州州稅列', hiRows.some(r => /加州州所得稅/.test(r.label)) ? 1 : 0, 1, 0);
  check('百萬年薪產生附加 Medicare 0.9%', hiRows.some(r => /附加 0\.9%/.test(r.label)) ? 1 : 0, 1, 0);

  // 2) 低薪：台灣 NT$300,000（月薪 25,000 低於勞保最低級距 29,500）
  await page.click('button[data-cur="TWD"]');
  await page.fill('#salary', '300000');
  await page.selectOption('#region', 'taipei');
  await page.click('#calcBtn');
  await page.waitForTimeout(200);
  const lo = await readStats();
  check('台灣低薪 稅後月收入為正', num(lo[0].v) > 0 ? 1 : 0, 1, 0);
  results.push(`      台灣 NT$300,000 → 稅後月收入 ${lo[0].v}, 有效稅率 ${rateOf(lo[0].d)}%`);
  const loRows = await readBreakRows();
  const liRow = loRows.find(r => /勞工保險/.test(r.label));
  check('台灣低薪 勞保投保薪資採最低級距 29,500', /29,500/.test(liRow ? liRow.note : '') ? 1 : 0, 1, 0);
  const twTaxRow = loRows.find(r => /綜合所得稅/.test(r.label));
  check('台灣 NT$300,000 綜合所得稅為 0', num(twTaxRow ? twTaxRow.value : 'x') === 0 ? 1 : 0, 1, 0);

  // 3) 已婚合併申報
  await page.click('button[data-cur="USD"]');
  await page.fill('#salary', '150000');
  await page.selectOption('#region', 'sanjose');
  await page.click('button[data-filing="married"]');
  await page.waitForTimeout(200);
  const m = await readStats();
  const mRate = rateOf(m[0].d);
  check('已婚合併申報有效稅率低於單人', mRate < 31.8 ? 1 : 0, 1, 0);
  results.push(`      已婚合併申報 有效稅率 = ${mRate}% (單人 31.8%)`);
  await page.click('button[data-filing="single"]');
  await page.waitForTimeout(150);

  // 4) 非法輸入：應顯示錯誤訊息且不崩潰
  await page.fill('#salary', '');
  await page.click('#calcBtn');
  await page.waitForTimeout(150);
  const errText = await page.$eval('#err', e => e.textContent.trim());
  check('空年薪顯示錯誤訊息', errText.length > 0 ? 1 : 0, 1, 0);
  results.push(`      非法輸入錯誤訊息：「${errText}」`);

  // 5) 幣別與地區不一致（TWD 輸入 + 美國地區）應自動換算
  //    NT$4,867,500 ÷ 32.45 = US$150,000 → 稅後月收入 $9,482.58
  await page.fill('#salary', '4867500');
  await page.click('button[data-cur="TWD"]');
  await page.selectOption('#region', 'austin');
  await page.click('#calcBtn');
  await page.waitForTimeout(200);
  const conv = await readStats();
  check('TWD 輸入換算美國地區後稅後月收入一致', num(conv[0].v), 9482.58, 1.0);
  results.push(`      NT$4,867,500 → 德州 = ${conv[0].v}（= US$150,000 換算後結果）`);

  // 6) 自訂生活成本覆寫
  await page.click('button[data-cur="USD"]');
  await page.selectOption('#region', 'austin');
  await page.fill('#salary', '80000');
  await page.fill('#budget', '2000');
  await page.click('#calcBtn');
  await page.waitForTimeout(200);
  const custom = await readStats();
  const customSav = num(custom[3].v);
  check('自訂生活成本後可儲蓄金額改變', Math.abs(customSav - (EXPECT.tx.monthlyNet - 2000)) < 1.5 ? 1 : 0, 1, 0);
  results.push(`      自訂生活成本 2,000 → 可儲蓄 ${custom[3].v}`);
  await page.click('#budgetReset');
  await page.waitForTimeout(150);

  /* ================= 結構檢查 ================= */
  const compareRows = await page.$$eval('#compareTable tbody tr', r => r.length);
  check('比較表列數', compareRows, 6, 0);
  const duelCards = await page.$$eval('#duel .side-card', r => r.length);
  check('對決卡片數', duelCards, 2, 0);
  const hasEq = await page.$eval('#duel', e => e.textContent.includes('等值薪資'));
  check('含等值薪資區塊', hasEq ? 1 : 0, 1, 0);

  /* ================= 截圖：桌面 ================= */
  await page.click('.preset[data-preset="sv"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'desktop.png'), fullPage: true });

  /* ================= 截圖：行動版 ================= */
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const mpage = await mctx.newPage();
  mpage.on('console', m => { if (m.type() === 'error') errors.push('[mobile console.error] ' + m.text()); });
  mpage.on('pageerror', e => errors.push('[mobile pageerror] ' + e.message));
  await mpage.goto(URL, { waitUntil: 'load' });
  await mpage.waitForSelector('.stat .v');
  await mpage.click('.preset[data-preset="tpe"]');
  await mpage.waitForTimeout(400);

  /* 行動版版面檢查：不可有水平捲動溢出 */
  const overflow = await mpage.evaluate(() => {
    const de = document.documentElement;
    const bad = [];
    document.querySelectorAll('body *').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.right > de.clientWidth + 1.5) {
        bad.push((e.tagName + '.' + (e.className || '')).slice(0, 60) + ' right=' + Math.round(r.right));
      }
    });
    return { docWidth: de.clientWidth, scrollWidth: de.scrollWidth, offenders: bad.slice(0, 8) };
  });
  check('行動版無水平溢出', overflow.scrollWidth <= overflow.docWidth + 1 ? 1 : 0, 1, 0);
  results.push(`      行動版 clientWidth=${overflow.docWidth} scrollWidth=${overflow.scrollWidth}`);
  if (overflow.offenders.length) results.push('      溢出元素: ' + overflow.offenders.join(' | '));

  const mstat = await mpage.$$eval('#stats .stat .v', e => e.map(x => x.textContent.trim()));
  check('行動版統計卡數量', mstat.length, 4, 0);
  check('行動版台北稅後月收入', num(mstat[0]), EXPECT.tpe.monthlyNet, 1.0);

  await mpage.screenshot({ path: path.join(SHOTS, 'mobile.png'), fullPage: true });

  /* 行動版：可讀尺寸的分段截圖 */
  await mpage.evaluate(() => window.scrollTo(0, 0));
  await mpage.waitForTimeout(200);
  await mpage.screenshot({ path: path.join(SHOTS, 'mobile-viewport-top.png') });
  await mpage.evaluate(() => document.getElementById('resultCard').scrollIntoView());
  await mpage.waitForTimeout(200);
  await mpage.screenshot({ path: path.join(SHOTS, 'mobile-viewport-stats.png') });

  /* 平板寬度（768px）也要無水平溢出 */
  const tctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const tpage = await tctx.newPage();
  tpage.on('pageerror', e => errors.push('[tablet pageerror] ' + e.message));
  await tpage.goto(URL, { waitUntil: 'load' });
  await tpage.waitForSelector('.stat .v');
  const tover = await tpage.evaluate(() => ({
    cw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth
  }));
  check('平板版無水平溢出', tover.sw <= tover.cw + 1 ? 1 : 0, 1, 0);
  results.push(`      平板版 clientWidth=${tover.cw} scrollWidth=${tover.sw}`);
  await tpage.screenshot({ path: path.join(SHOTS, 'tablet.png'), fullPage: true });
  await tctx.close();

  /* 行動版下半頁（比較表 + 對決）截圖 */
  await mpage.evaluate(() => document.getElementById('compareCard').scrollIntoView());
  await mpage.waitForTimeout(200);
  await mpage.screenshot({ path: path.join(SHOTS, 'mobile-lower.png') });

  /* 桌面版下半頁 */
  await page.evaluate(() => document.getElementById('duelCard').scrollIntoView());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-lower.png') });

  await browser.close();

  const report = [
    '=== 驗收測試結果 ===',
    ...results,
    '',
    `外部資源請求數: ${externals.length}${externals.length ? ' -> ' + externals.join(', ') : '（純前端，符合要求）'}`,
    `Console / Page 錯誤: ${errors.length}`,
    ...errors,
    '',
    `總結: ${failures === 0 && errors.length === 0 ? 'ALL PASS' : failures + ' 個數值失敗, ' + errors.length + ' 個錯誤'}`
  ].join('\n');

  console.log(report);
  fs.writeFileSync(path.resolve(__dirname, '..', 'verify-report.txt'), report + '\n');
  process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('RUNNER ERROR', e); process.exit(2); });
