/*
 * 作り物の口：画面の確かめで、google.script.run の代わりをする（ブラウザの中だけで使う）
 *
 * 先に 芯.js・仕組み.js・作り物の表.js を同じページに読み込んでから使う。
 * 本物と同じく、頼みと返事は写し（JSON）で渡す。仕組みは呼んだ時に動かし、返事は遅れて届ける。
 * 開く時に location.hash へ JSON で細工を書ける（例：#{"休み":true}・#{"一覧を壊す":true}・#{"設定":{"読み直しの秒":1}}）。
 * 開いた後の細工は window.作り物.細工 で（遅れ・遅れの並び・書いて黙る・止める）。
 */
(function () {
  'use strict';
  var 表 = 作り物の表.作る();
  var 細工 = { 遅れ: 120, 遅れの並び: [], 書いて黙る: false, 止める: false };
  var 呼んだ = [];

  var 最初 = {};
  try {
    最初 = JSON.parse(decodeURIComponent(location.hash.slice(1)) || '{}');
  } catch (e) {
    最初 = {};
  }
  if (最初.一覧を壊す || 最初.休み) 仕組み.開く(表.口, { 通し番号: 0 });
  if (最初.一覧を壊す) {
    表.中.一覧[5][4] = '13時'; // 6番（見積り作成）の始まり

    表.中.印['最後に動いた'] = String(表.中.今); // 10分たっていない（開いても直らない）
  }
  if (最初.休み) 表.中.印['休み'] = 'はい';
  if (最初.設定) window.予定の盤の設定 = 最初.設定;

  function 走らせる(成功, 失敗, 口, 頼み) {
    var 写し = JSON.parse(JSON.stringify(頼み === undefined ? null : 頼み));
    呼んだ.push({ 口: 口, 頼み: 写し, 時: Date.now() });
    var 遅れ = 細工.遅れの並び.length ? 細工.遅れの並び.shift() : 細工.遅れ;
    var 返事 = null;
    var 誤り = null;
    if (細工.止める) {
      誤り = new Error('作り物：止めました');
    } else {
      try {
        返事 = JSON.parse(JSON.stringify(仕組み[口](表.口, 写し)));
      } catch (e) {
        誤り = e;
      }
    }
    if (細工.書いて黙る) return; // 表には書いたが、返事は来ない
    setTimeout(function () {
      if (誤り) {
        if (失敗) 失敗(誤り);
      } else if (成功) {
        成功(返事);
      }
    }, 遅れ);
  }

  function 走り手(成功, 失敗) {
    var 手 = {
      withSuccessHandler: function (関数) { return 走り手(関数, 失敗); },
      withFailureHandler: function (関数) { return 走り手(成功, 関数); },
      withUserObject: function () { return 手; }
    };
    ['開く', '盤を読む', '駒を動かす', '一手戻す', 'はじめの形に戻す'].forEach(function (名) {
      手[名] = function (頼み) { 走らせる(成功, 失敗, 名, 頼み); };
    });
    return 手;
  }

  window.作り物 = { 表: 表, 細工: 細工, 呼んだ: 呼んだ };
  window.google = { script: { run: 走り手(null, null) } };
})();
