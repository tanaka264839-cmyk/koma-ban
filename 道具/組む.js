// 組む：芯・仕組み・画面から、Google Apps Script に入れる物（gas/ の 芯.js・仕組み.js・盤.html）を作る。
// 動かし方：node 道具/組む.js        … 作る
//           node 道具/組む.js --見る … 作らずに、gas/ が元と同じかだけを見る（入れる前に流す）
// gas/コード.js と gas/appsscript.json は手で書く元なので、ここでは作らない。
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const 根 = path.resolve(__dirname, '..');
const 目印 = '<!--芯をここに入れる-->';

function 読む(場所) {
  return fs.readFileSync(path.join(根, 場所), 'utf8');
}

function 頭書き(元) {
  return `// 組んだ物：${元} の写し。手で直さない（直す時は元を直して node 道具/組む.js）\n`;
}

function 組んだ物() {
  const 芯 = 読む('芯/芯.js');
  const 仕組み = 読む('仕組み/仕組み.js');
  const 画面 = 読む('画面/盤.html');
  if (画面.split(目印).length !== 2) throw new Error('画面/盤.html の目印「' + 目印 + '」が1つではありません');
  if (/<\/script/i.test(芯)) throw new Error('芯に </script が入っていて、画面に入れられません');
  return {
    'gas/芯.js': 頭書き('芯/芯.js') + 芯,
    'gas/仕組み.js': 頭書き('仕組み/仕組み.js') + 仕組み,
    'gas/盤.html': 画面.replace(目印, () => '<script>\n' + 芯 + '</script>'),
  };
}

function main() {
  const 見るだけ = process.argv.includes('--見る');
  const 物 = 組んだ物();
  const ちがう = [];
  for (const [場所, 中身] of Object.entries(物)) {
    const 全 = path.join(根, 場所);
    const 今 = fs.existsSync(全) ? fs.readFileSync(全, 'utf8') : null;
    if (今 === 中身) continue;
    if (見るだけ) ちがう.push(場所);
    else fs.writeFileSync(全, 中身, 'utf8');
  }
  if (見るだけ) {
    console.log(ちがう.length ? `組む：元と違う物があります（${ちがう.join('・')}）。node 道具/組む.js で作り直してください` : '組む：gas/ は元と同じです');
    process.exitCode = ちがう.length ? 1 : 0;
  } else {
    console.log('組む：gas/ の 芯.js・仕組み.js・盤.html を作りました');
  }
}

if (require.main === module) main();
module.exports = { 組んだ物 };
