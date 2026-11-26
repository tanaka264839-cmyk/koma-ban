// 画面の確かめ：裏で Chrome を立て、本物のマウスと指の動きで駒を動かして、守る動作を見る。
// 動かし方：node 確かめ/画面の確かめ.mjs
// 画面は組んだ物（gas/盤.html）をそのまま開き、google.script.run の代わりに 作り物の口（中身は本物の仕組み＋作り物の表）を入れる。
// 入れる道具は無し（Node の WebSocket と、この PC の Chrome か Edge）。写しは 確かめ/写し/ に出る。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ここ = dirname(fileURLToPath(import.meta.url));
const 根 = join(ここ, '..');
const 写す先 = join(ここ, '写し');
mkdirSync(写す先, { recursive: true });

const 組んだ = spawnSync(process.execPath, [join(根, '道具', '組む.js')], { encoding: 'utf8' });
if (組んだ.status !== 0) throw new Error('組めませんでした：' + 組んだ.stderr);
const 盤のURL = pathToFileURL(join(根, 'gas', '盤.html')).href;
const 差し込み = ['芯/芯.js', '仕組み/仕組み.js', '確かめ/作り物の表.js', '確かめ/作り物の口.js']
  .map((p) => readFileSync(join(根, p), 'utf8')).join('\n;\n');

const ブラウザ = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
const 置き場 = mkdtempSync(join(tmpdir(), 'koma-ban-gamen-'));
const 立てた = spawn(ブラウザ, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${置き場}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const 寝る = (ms) => new Promise((r) => setTimeout(r, ms));
let 港 = null;
for (let i = 0; i < 100 && !港; i++) {
  await 寝る(100);
  try { 港 = readFileSync(join(置き場, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { /* まだ */ }
}
let 頁 = null;
for (let i = 0; i < 50 && !頁; i++) {
  try { 頁 = (await (await fetch(`http://127.0.0.1:${港}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* まだ */ }
  if (!頁) await 寝る(100);
}
const ws = new WebSocket(頁.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let 番 = 0;
const 待ち = new Map();
const 聞き手 = new Set();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && 待ち.has(m.id)) {
    const { 済, 失 } = 待ち.get(m.id);
    待ち.delete(m.id);
    if (m.error) 失(new Error(JSON.stringify(m.error))); else 済(m.result);
  } else if (m.method) {
    for (const l of 聞き手) l(m);
  }
});
const 送る = (method, params = {}) => new Promise((済, 失) => {
  const i = ++番;
  待ち.set(i, { 済, 失 });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const 起きるまで = (名前, ms = 15000) => new Promise((済, 失) => {
  const t = setTimeout(() => { 聞き手.delete(l); 失(new Error('待ちきれない ' + 名前)); }, ms);
  const l = (m) => { if (m.method === 名前) { clearTimeout(t); 聞き手.delete(l); 済(m.params); } };
  聞き手.add(l);
});
const 式 = async (js) => {
  const r = await 送る('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};
async function 待つまで(js, 秒 = 5, 説明 = js) {
  const 終わり = Date.now() + 秒 * 1000;
  for (;;) {
    if (await 式(js)) return;
    if (Date.now() > 終わり) throw new Error('待ちきれない：' + 説明);
    await 寝る(40);
  }
}
const 幅を決める = (幅, 高さ, スマホ = false) => 送る('Emulation.setDeviceMetricsOverride', { width: 幅, height: 高さ, deviceScaleFactor: 1, mobile: スマホ });
const 写す = async (名前) => {
  const 絵 = await 送る('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(写す先, 名前 + '.png'), Buffer.from(絵.data, 'base64'));
};

await 送る('Page.enable');
await 送る('Runtime.enable');
await 送る('Page.addScriptToEvaluateOnNewDocument', { source: 差し込み });
await 幅を決める(1280, 900);

async function 開く(細工 = {}, 読めたしるし = "document.getElementById('様子').textContent === '表を読みました'") {
  let 読めた = 起きるまで('Page.loadEventFired');
  await 送る('Page.navigate', { url: 'about:blank' });
  await 読めた;
  読めた = 起きるまで('Page.loadEventFired');
  await 送る('Page.navigate', { url: 盤のURL + '#' + encodeURIComponent(JSON.stringify(細工)) });
  await 読めた;
  if (読めたしるし) await 待つまで(読めたしるし, 5, '開いて表を読む');
}

// 座標（画面の上の点）
const 駒の点 = (番号, 段目 = 0) => 式(`(() => {
  const e = document.querySelector('.駒[data-番号="${番号}"]');
  const r = e.getBoundingClientRect();
  const 寸 = 予定の盤.寸();
  return [r.left + r.width / 2, r.top - 2 + (${段目} + 0.5) * 寸.段の高さ];
})()`);
const マスの点 = (担当, 段) => 式(`(() => {
  const 枠 = document.getElementById('盤').getBoundingClientRect();
  const 寸 = 予定の盤.寸();
  const 列 = 芯.担当の列(${JSON.stringify(担当)});
  return [枠.left + 3 + 寸.時刻の幅 + (列 + 0.5) * 寸.列の幅, 枠.top + 3 + 寸.見出しの高さ + (${段} + 0.5) * 寸.段の高さ];
})()`);
const ボタンの点 = (id) => 式(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const タブの点 = (日) => 式(`(() => { const r = document.querySelector('#日のタブ button[data-日="${日}"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const 駒の場所 = (番号) => 式(`(() => { const k = 予定の盤.駒たち().find((k) => k.番号 === ${番号}); return k ? k.担当 + ' ' + k.段 : null; })()`);
const 駒のいる日 = (番号) => 式(`予定の盤.駒たち().find((k) => k.番号 === ${番号}).日`);
const 表示の日 = () => 式('予定の盤.表示の日()');
const 様子 = () => 式("document.getElementById('様子').textContent");
const 書いた様子 = "document.getElementById('様子').textContent.startsWith('表に書きました')";
const 一覧の行 = (番号) => 式(`作り物.表.中.一覧.find((r) => r[0] === '${番号}')`);
const 棋譜の数 = () => 式('作り物.表.中.棋譜.length');
const 書く頼みの数 = () => 式("作り物.呼んだ.filter((c) => c.口 !== '開く' && c.口 !== '盤を読む').length");

const マウス = (type, [x, y], ほか = {}) => 送る('Input.dispatchMouseEvent', {
  type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...ほか,
});
async function 引きずる(元, 先, { 離さない = false, 刻み = 8 } = {}) {
  await マウス('mouseMoved', 元, { buttons: 0, button: 'none' });
  await マウス('mousePressed', 元);
  for (let i = 1; i <= 刻み; i++) {
    await マウス('mouseMoved', [元[0] + ((先[0] - 元[0]) * i) / 刻み, 元[1] + ((先[1] - 元[1]) * i) / 刻み]);
  }
  if (!離さない) await マウス('mouseReleased', 先);
}
async function 続けて動かす(元, 先, 刻み = 6) {
  for (let i = 1; i <= 刻み; i++) {
    await マウス('mouseMoved', [元[0] + ((先[0] - 元[0]) * i) / 刻み, 元[1] + ((先[1] - 元[1]) * i) / 刻み]);
  }
}
async function 押す(点) {
  await マウス('mouseMoved', 点, { buttons: 0, button: 'none' });
  await マウス('mousePressed', 点);
  await マウス('mouseReleased', 点);
}
async function 鍵盤(key, code, 数, 修飾 = 0) {
  await 送る('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: 数, modifiers: 修飾 });
  await 送る('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: 数, modifiers: 修飾 });
}
async function 指で引きずる(元, 先, 刻み = 8) {
  await 送る('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 元[0], y: 元[1], id: 1 }] });
  for (let i = 1; i <= 刻み; i++) {
    await 送る('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 元[0] + ((先[0] - 元[0]) * i) / 刻み, y: 元[1] + ((先[1] - 元[1]) * i) / 刻み, id: 1 }] });
  }
  await 送る('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const 結果 = [];
async function 確かめる(番号, 名前, 中身) {
  try {
    await 中身();
    結果.push({ 番号, 名前, 合否: '合格' });
  } catch (e) {
    結果.push({ 番号, 名前, 合否: '不合格', 訳: String(e && e.message) });
    try { await 写す('落ちた_' + 番号); } catch { /* 写せなくても続ける */ }
    try { await マウス('mouseReleased', [5, 5]); } catch { /* 放す */ }
  }
}
function 同じ(実際, 期待, 何) {
  const a = JSON.stringify(実際);
  const b = JSON.stringify(期待);
  if (a !== b) throw new Error(`${何}：${a}（期待 ${b}）`);
}

// ---------------- 確かめ ----------------

await 確かめる('G1', '開くと表を読み、8つの駒と「表のいまの中身」を出す', async () => {
  await 開く();
  同じ(await 式("document.querySelectorAll('#駒の層 .駒').length"), 8, '駒の数（1日目）');
  同じ(await 式("document.querySelectorAll('#表の中身 tr').length"), 21, '表のいまの中身の行（列の見出し＋20行）');
  同じ(await 式("Array.from(document.querySelectorAll('#日のタブ button')).map((b) => b.textContent)"), ['11/27(金)', '11/30(月)', '12/1(火)'], '日のタブ');
  同じ(await 式("document.querySelector('#棋譜 li').textContent"), 'まだ動かしていません', '棋譜');
  同じ(await 式("document.getElementById('幕').hidden"), true, '幕');
  await 写す('1_はじめ');
});

await 確かめる('G2', 'つかんで離すと、画面はすぐ動き、裏で表に書く', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  同じ(await 駒の場所(8), 'Cさん 3', '離した直後の画面の駒');
  同じ(await 式('予定の盤.送る列の長さ()'), 1, '離した直後は、まだ書いている');
  await 待つまで(書いた様子, 5, '表に書きました');
  同じ(await 一覧の行(8), ['8', '書類の確認', '2026-11-27', 'Cさん', '10:30', '12:00'], '表の一覧');
  同じ(await 棋譜の数(), 1, '表の棋譜の行');
  同じ(await 式("document.querySelector('#棋譜 li').textContent"), '1手目　書類の確認：11/27(金) 未定 11:00 → Cさん 10:30', '画面の棋譜');
  同じ(await 式("document.querySelectorAll('#表の中身 tr')[6].cells[4].textContent"), '書類の確認', '表のいまの中身（6行目 D列）');
  await 写す('3_動かした後');
});

await 確かめる('G3', 'つかんだ段が指の下に残る（3段の駒の3段目をつかむ）', async () => {
  await 開く();
  await 引きずる(await 駒の点(7, 2), await マスの点('Eさん', 12));
  同じ(await 駒の場所(7), 'Eさん 10', '研修の始まり（指の段12の2つ上）');
  await 待つまで(書いた様子);
  同じ(await 一覧の行(7), ['7', '研修', '2026-11-27', 'Eさん', '14:00', '15:30'], '表の一覧');
});

await 確かめる('G4', '重なる所では赤い点線と訳を出し、離すと元へ戻って書かない', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Bさん', 2), { 離さない: true });
  同じ(await 式("!document.getElementById('影').hidden && document.getElementById('影').classList.contains('置けない')"), true, '赤い点線');
  同じ(await 式("document.getElementById('吹き出し').hidden ? '' : document.getElementById('吹き出し').textContent"),
    'ここには置けません　11/27(金) Bさんの「打ち合わせ」（10:30〜12:00）と重なります', '吹き出し');
  await 写す('2_重なる所へ持って行った時');
  await マウス('mouseReleased', await マスの点('Bさん', 2));
  同じ(await 駒の場所(8), '未定 4', '戻った駒');
  同じ(await 様子(), 'ここには置けません　11/27(金) Bさんの「打ち合わせ」（10:30〜12:00）と重なります', '様子');
  await 寝る(300);
  同じ(await 書く頼みの数(), 0, '表への頼み');
});

await 確かめる('G5', '盤の外（下・上・横）に離すと戻り、どこをはみ出すかを言う', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 16));
  同じ(await 様子(), 'ここには置けません　18:00 を過ぎます', '下');
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', -1));
  同じ(await 様子(), 'ここには置けません　9:00 より前です', '上');
  const 盤の左 = await 式("document.getElementById('盤').getBoundingClientRect().left");
  const [, y] = await マスの点('Cさん', 5);
  await 引きずる(await 駒の点(8, 0), [盤の左 + 10, y]);
  同じ(await 様子(), 'ここには置けません　盤の外です', '横');
  同じ(await 駒の場所(8), '未定 4', '駒');
  await 寝る(300);
  同じ(await 書く頼みの数(), 0, '表への頼み');
});

await 確かめる('G6', '休みの列には置けて、注意を出す', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Dさん', 4));
  同じ(await 式("document.getElementById('吹き出し').textContent"), '11/27(金)はDさんが休みです。置きました', '吹き出し');
  await 待つまで(書いた様子);
  同じ(await 様子().then((s) => s.endsWith('11/27(金)はDさんが休みです。置きました')), true, '様子');
  同じ(await 一覧の行(8), ['8', '書類の確認', '2026-11-27', 'Dさん', '11:00', '12:30'], '表の一覧');
});

await 確かめる('G7', '押しただけ（動かさない）では、何もしない', async () => {
  await 開く();
  await 押す(await 駒の点(8, 1));
  await 寝る(300);
  同じ(await 駒の場所(8), '未定 4', '駒');
  同じ(await 書く頼みの数(), 0, '表への頼み');
});

await 確かめる('G8', '待った（ボタンと Ctrl+Z）で戻る。戻す手が無ければそう言う', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  await 待つまで(書いた様子);
  await 押す(await ボタンの点('待った'));
  同じ(await 駒の場所(8), '未定 4', 'ボタンで戻した直後の駒');
  await 待つまで(書いた様子);
  同じ(await 一覧の行(8), ['8', '書類の確認', '2026-11-27', '未定', '11:00', '12:30'], '表の一覧');
  同じ(await 式('作り物.表.中.棋譜[1].slice(2, 4)'), ['待った', '8'], '棋譜の2行目');
  await 引きずる(await 駒の点(7, 0), await マスの点('Eさん', 10));
  await 待つまで(書いた様子);
  await 鍵盤('z', 'KeyZ', 90, 2);
  同じ(await 駒の場所(7), 'Eさん 14', 'Ctrl+Z で戻した駒');
  await 待つまで(書いた様子);
  await 鍵盤('z', 'KeyZ', 90, 2);
  同じ(await 様子(), '戻す手がありません', '戻す手が無い時');
  同じ(await 式("document.getElementById('待った').disabled"), true, '待ったのボタン');
});

await 確かめる('G9', '持ったまま Esc でやめる', async () => {
  await 開く();
  const 先 = await マスの点('Cさん', 3);
  await 引きずる(await 駒の点(8, 0), 先, { 離さない: true });
  await 鍵盤('Escape', 'Escape', 27);
  同じ(await 式("document.querySelector('.駒[data-番号=\"8\"]').classList.contains('持ち上げ')"), false, '持ち上げの印');
  await マウス('mouseReleased', 先);
  同じ(await 駒の場所(8), '未定 4', '駒');
  同じ(await 様子(), '動かすのをやめました', '様子');
  await 寝る(300);
  同じ(await 書く頼みの数(), 0, '表への頼み');
});

await 確かめる('G10', 'はじめの形に戻すと、一覧も棋譜もはじめに戻る', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  await 待つまで(書いた様子);
  await 押す(await ボタンの点('はじめ'));
  await 待つまで(書いた様子);
  同じ(await 駒の場所(8), '未定 4', '駒');
  同じ(await 棋譜の数(), 0, '表の棋譜');
  同じ(await 式("document.querySelector('#棋譜 li').textContent"), 'まだ動かしていません', '画面の棋譜');
});

await 確かめる('G11', '返事を待たずに続けて3つ離しても、押した順に1つずつ書く', async () => {
  await 開く();
  await 式('作り物.細工.遅れ = 700');
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  await 引きずる(await 駒の点(7, 0), await マスの点('Eさん', 12));
  await 引きずる(await 駒の点(2, 0), await マスの点('Aさん', 9));
  同じ([await 駒の場所(8), await 駒の場所(7), await 駒の場所(2)], ['Cさん 3', 'Eさん 12', 'Aさん 9'], '画面（待たずに動く）');
  同じ((await 式('予定の盤.送る列の長さ()')) >= 2, true, 'まだ書いている手の数');
  同じ((await 様子()).startsWith('裏で表に書いています…'), true, '様子');
  await 待つまで(`予定の盤.送る列の長さ() === 0 && ${書いた様子}`, 8);
  同じ(await 式("作り物.呼んだ.filter((c) => c.口 === '駒を動かす').map((c) => c.頼み.番号)"), [8, 7, 2], '頼みの順');
  同じ(await 式('作り物.表.中.棋譜.map((r) => r[3])'), ['8', '7', '2'], '表の棋譜の順');
});

await 確かめる('G12', 'ほかの人が先に動かしていたら、訳を言って表の形に合わせる', async () => {
  await 開く();
  await 式("仕組み.駒を動かす(作り物.表.口, { 通し番号: 9999, 番号: 8, 見ていた: { 日: 0, 担当: '未定', 段: 4 }, 行き先: { 日: 0, 担当: 'Cさん', 段: 3 } })");
  await 引きずる(await 駒の点(8, 0), await マスの点('Eさん', 4));
  await 待つまで("document.getElementById('様子').textContent.includes('ほかの人が先に動かしました')", 5);
  同じ(await 駒の場所(8), 'Cさん 3', '表の形に合わせた駒');
  同じ(await 棋譜の数(), 1, '表の棋譜（ほかの人の1手だけ）');
});

await 確かめる('G13', '一覧が読めない時は、行と欄を言い、はじめの形に戻すで直る', async () => {
  await 開く({ 一覧を壊す: true }, "!document.getElementById('幕').hidden");
  同じ((await 式("document.getElementById('幕の字').textContent")).includes('一覧の7行目「始まり」の「13時」が読めません'), true, '幕の字');
  同じ(await 式("document.getElementById('幕のボタン').hidden"), false, '幕のボタン');
  await 写す('5_一覧が読めない時');
  await 押す(await ボタンの点('幕のボタン'));
  await 待つまで(`document.getElementById('幕').hidden && ${書いた様子}`, 5);
  同じ(await 式("document.querySelectorAll('#駒の層 .駒').length"), 8, '駒の数');
  同じ(await 一覧の行(6), ['6', '見積り作成', '2026-11-27', 'Cさん', '13:00', '15:00'], '直った一覧');
});

await 確かめる('G14', '混み合っている時は、訳を言って戻す', async () => {
  await 開く();
  await 式('作り物.表.中.鍵を貸さない = true');
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  await 待つまで("document.getElementById('様子').textContent.includes('混み合っています')", 5);
  同じ(await 駒の場所(8), '未定 4', '戻した駒');
});

await 確かめる('G15', '返事が来ない時は「書けたか分かりません」と言い、表を読み直して合わせる', async () => {
  await 開く({ 設定: { 書く待ちの秒: 1.5, 読む待ちの秒: 1.5 } });
  await 式('作り物.細工.書いて黙る = true');
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  await 式('作り物.細工.書いて黙る = false');
  await 待つまで("document.getElementById('様子').textContent === '表に書けたか分かりません。表を読み直します'", 4);
  await 待つまで("document.getElementById('様子').textContent === '表が変わっていたので、いまの形に合わせました'", 4);
  同じ(await 駒の場所(8), 'Cさん 3', '表に書けていた駒');
});

await 確かめる('G16', '休みの印がある時は、盤の代わりに「休んでいます」', async () => {
  await 開く({ 休み: true }, "!document.getElementById('幕').hidden");
  同じ((await 式("document.getElementById('幕の字').textContent")).includes('休んでいます'), true, '幕の字');
  同じ(await 式("document.getElementById('幕のボタン').hidden"), true, '幕のボタン');
});

await 確かめる('G17', '指（タッチ）でつかんで動かせる', async () => {
  await 送る('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  try {
    await 開く();
    await 指で引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
    同じ(await 駒の場所(8), 'Cさん 3', '画面の駒');
    await 待つまで(書いた様子);
    同じ(await 一覧の行(8), ['8', '書類の確認', '2026-11-27', 'Cさん', '10:30', '12:00'], '表の一覧');
  } finally {
    await 送る('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
});

await 確かめる('G18', 'スマホの幅（390）でも、盤が横にはみ出さない', async () => {
  await 幅を決める(390, 844, true);
  try {
    await 開く();
    同じ((await 式('document.documentElement.scrollWidth')) <= 390, true, 'ページの横幅');
    同じ((await 式("document.getElementById('盤').getBoundingClientRect().right")) <= 390 - 8, true, '盤の右の端');
    await 幅を決める(390, 1500, true);
    await 寝る(300);
    await 写す('4_スマホの幅');
  } finally {
    await 幅を決める(1280, 900);
  }
});

await 確かめる('G19', 'ほかの人が動かすと、読み直しで画面も合う', async () => {
  await 開く({ 設定: { 読み直しの秒: 1 } });
  await 式("仕組み.駒を動かす(作り物.表.口, { 通し番号: 9999, 番号: 8, 見ていた: { 日: 0, 担当: '未定', 段: 4 }, 行き先: { 日: 0, 担当: 'Cさん', 段: 3 } })");
  await 待つまで("予定の盤.駒たち().find((k) => k.番号 === 8).担当 === 'Cさん'", 4);
  同じ(await 様子(), '表が変わっていたので、いまの形に合わせました', '様子');
});

await 確かめる('G20', '遅れて届いた古い読みの返事で、画面を戻さない', async () => {
  await 開く({ 設定: { 読み直しの秒: 0.4 } });
  await 式('作り物.細工.遅れ = 1500');
  const 前 = await 式("作り物.呼んだ.filter((c) => c.口 === '盤を読む').length");
  await 待つまで(`作り物.呼んだ.filter((c) => c.口 === '盤を読む').length > ${前}`, 3, '読み直しが始まる');
  await 式('作り物.細工.遅れ = 30');
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3));
  const 見えた = [];
  const 終わり = Date.now() + 2200;
  while (Date.now() < 終わり) {
    見えた.push(await 駒の場所(8));
    await 寝る(40);
  }
  const 最初 = 見えた.indexOf('Cさん 3');
  同じ(最初 >= 0 && 見えた.slice(最初).every((s) => s === 'Cさん 3'), true, '一度動いた後に、元へ戻らない');
});

// ---------------- 日付の移動 ----------------

await 確かめる('G21', '日のタブを押すと、その日の盤に替わる（駒・休みの列・表のいまの中身の列）', async () => {
  await 開く();
  await 押す(await タブの点(1));
  同じ(await 表示の日(), 1, '見ている日');
  同じ(await 式("document.querySelectorAll('#駒の層 .駒').length"), 4, '2日目の駒の数');
  同じ(await 式("Array.from(document.querySelectorAll('.列の見出し.休み')).map((e) => e.textContent)"), ['Eさん（休み）'], '2日目の休み');
  同じ(await 式("Array.from(document.querySelectorAll('#表の中身 tr.頭 td')).map((t) => t.textContent).join('')"), 'AHIJKLM', '表のいまの中身の列');
  同じ(await 式("document.querySelectorAll('#表の中身 tr')[1].cells[2].textContent"), '11/30(月)', '表のいまの中身の日付');
  await 写す('6_日のタブ_2日目');
});

await 確かめる('G22', 'つかんだまま日のタブに乗せて待つと、その日の盤に替わり、離した所へ動く', async () => {
  await 開く({ 設定: { タブを待つ秒: 0.3 } });
  const タブ = await タブの点(1);
  await 引きずる(await 駒の点(8, 0), タブ, { 離さない: true });
  await 待つまで('予定の盤.表示の日() === 1', 3, '盤が2日目に替わる');
  await 写す('7_タブに乗せて2日目に替わった所');
  const 先 = await マスの点('Cさん', 3);
  await 続けて動かす(タブ, 先);
  await マウス('mouseReleased', 先);
  同じ([await 駒のいる日(8), await 駒の場所(8)], [1, 'Cさん 3'], '画面の駒');
  同じ(await 表示の日(), 1, '置いた日の盤のまま');
  await 待つまで(書いた様子);
  同じ(await 一覧の行(8), ['8', '書類の確認', '2026-11-30', 'Cさん', '10:30', '12:00'], '表の一覧');
  同じ(await 式("document.querySelector('#棋譜 li').textContent"), '1手目　書類の確認：11/27(金) 未定 11:00 → 11/30(月) Cさん 10:30', '画面の棋譜');
});

await 確かめる('G23', '日のタブの上で離すと、同じ担当・同じ時刻でその日へ動き、タブが光る', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await タブの点(2));
  同じ([await 駒のいる日(8), await 駒の場所(8)], [2, '未定 4'], '画面の駒');
  同じ(await 表示の日(), 0, '見ている日はそのまま');
  同じ(await 式("document.querySelector('.駒[data-番号=\"8\"]') === null"), true, '1日目の盤から消える');
  同じ(await 式("document.querySelector('#日のタブ button[data-日=\"2\"]').classList.contains('光る')"), true, 'タブが光る');
  同じ(await 式("document.getElementById('吹き出し').textContent"), '12/1(火) 未定 11:00 へ動かしました', '吹き出し');
  await 待つまで(書いた様子);
  同じ(await 一覧の行(8), ['8', '書類の確認', '2026-12-01', '未定', '11:00', '12:30'], '表の一覧');
});

await 確かめる('G24', '日のタブの上で離した所がふさがっていれば、訳を言って書かない', async () => {
  await 開く();
  await 引きずる(await 駒の点(1, 0), await タブの点(1));
  同じ(await 様子(), 'ここには置けません　11/30(月) Aさんの「打ち合わせ」（10:00〜11:30）と重なります', '様子');
  同じ([await 駒のいる日(1), await 駒の場所(1)], [0, 'Aさん 2'], '駒');
  await 寝る(300);
  同じ(await 書く頼みの数(), 0, '表への頼み');
});

await 確かめる('G25', '日をまたいだ手も、待ったで元の日へ戻る', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await タブの点(2));
  await 待つまで(書いた様子);
  await 押す(await ボタンの点('待った'));
  同じ([await 駒のいる日(8), await 駒の場所(8)], [0, '未定 4'], '戻した駒');
  await 待つまで(書いた様子);
  同じ(await 一覧の行(8), ['8', '書類の確認', '2026-11-27', '未定', '11:00', '12:30'], '表の一覧');
  同じ(await 式("Array.from(document.querySelectorAll('#棋譜 li')).map((li) => li.textContent)"),
    ['2手目　待った（1手目を戻しました）', '1手目　書類の確認：11/27(金) 未定 11:00 → 12/1(火) 未定 11:00'], '画面の棋譜');
});

await 確かめる('G26', 'ほかの日に替えて置けない所で離したら、つかんだ日の盤へ戻る', async () => {
  await 開く({ 設定: { タブを待つ秒: 0.3 } });
  const タブ = await タブの点(1);
  await 引きずる(await 駒の点(8, 0), タブ, { 離さない: true });
  await 待つまで('予定の盤.表示の日() === 1', 3, '盤が2日目に替わる');
  const 先 = await マスの点('Aさん', 3);
  await 続けて動かす(タブ, 先);
  await マウス('mouseReleased', 先);
  同じ(await 表示の日(), 0, 'つかんだ日の盤');
  同じ([await 駒のいる日(8), await 駒の場所(8)], [0, '未定 4'], '駒');
  同じ(await 様子(), 'ここには置けません　11/30(月) Aさんの「打ち合わせ」（10:00〜11:30）と重なります', '様子');
  await 寝る(300);
  同じ(await 書く頼みの数(), 0, '表への頼み');
});

await 確かめる('G27', 'つかんでいる間に画面の高さだけが変わっても、駒を落とさない', async () => {
  await 開く();
  const 先 = await マスの点('Cさん', 3);
  await 引きずる(await 駒の点(8, 0), 先, { 離さない: true });
  await 幅を決める(1280, 700);
  await 寝る(400);
  同じ(await 式("document.querySelector('.駒[data-番号=\"8\"]').classList.contains('持ち上げ')"), true, 'つかんだまま');
  await マウス('mouseMoved', [先[0] + 2, 先[1]]);
  await マウス('mouseReleased', [先[0] + 2, 先[1]]);
  同じ(await 駒の場所(8), 'Cさん 3', '離した所');
  await 幅を決める(1280, 900);
  await 待つまで(書いた様子);
});

await 確かめる('G28', '画面の幅が変わった時は、つかむのをやめて、盤を描き直す', async () => {
  await 開く();
  await 引きずる(await 駒の点(8, 0), await マスの点('Cさん', 3), { 離さない: true });
  await 幅を決める(900, 900);
  await 寝る(400);
  await マウス('mouseReleased', [5, 5]);
  同じ(await 駒の場所(8), '未定 4', '駒は元の所');
  同じ((await 式('予定の盤.寸().幅')) < 700, true, '盤を描き直した');
  await 幅を決める(1280, 900);
  await 寝る(300);
});

// ---------------- 片付けと結果 ----------------
try { await 送る('Browser.close'); } catch { /* もう閉じた */ }
立てた.kill();
await 寝る(300);
try { rmSync(置き場, { recursive: true, force: true }); } catch { /* 後で消える */ }

const 合格 = 結果.filter((r) => r.合否 === '合格').length;
console.log(`画面：${結果.length}件のうち ${合格}件 合格・${結果.length - 合格}件 不合格`);
for (const r of 結果) if (r.合否 !== '合格') console.log(`  × ${r.番号} ${r.名前}\n    ${r.訳}`);
writeFileSync(join(ここ, '画面の確かめの結果.json'), JSON.stringify({ 日時: new Date().toISOString(), 結果 }, null, 2) + '\n');
process.exitCode = 合格 === 結果.length ? 0 : 1;
