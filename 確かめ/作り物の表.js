/*
 * 作り物の表：Google スプレッドシートの代わり（確かめ用）
 *
 * 仕組みが受け取る「表の口」と同じ形の口を作る。中身は手元の配列。
 * node の確かめと、画面の確かめ（ブラウザの中の作り物の Google Apps Script）の両方で使う。
 * 「中」から、表の中身・呼ばれた回数を見たり、鍵を貸さない・口を止めるなどの細工ができる。
 */
var 作り物の表 = (function () {
  'use strict';

  var 表に触る口 = ['整える', '整え直す', '一覧を読む', '一覧に書く', '盤に描く', '盤を読む', '棋譜を読む', '棋譜に足す', '棋譜を書き直す'];

  function 字の面(面) {
    return 面.map(function (行) {
      return 行.map(function (値) { return 値 === null || 値 === undefined ? '' : String(値); });
    });
  }

  function 写しの面(面) {
    return 面.map(function (行) { return 行.slice(); });
  }

  function 空の盤() {
    var 面 = [];
    for (var 行 = 0; 行 < 20; 行++) {
      var 一行 = [];
      for (var 列 = 0; 列 < 19; 列++) 一行.push('');
      面.push(一行);
    }
    return { 値: 面, 色: 面.map(function (r) { return r.map(function () { return '#ffffff'; }); }), 太さ: 面.map(function (r) { return r.map(function () { return 'normal'; }); }) };
  }

  function 日本の時刻(ミリ秒) {
    return new Date(ミリ秒 + 9 * 3600 * 1000).toISOString();
  }

  function 作る(始め) {
    始め = 始め || {};
    var 中 = {
      ある: { 一覧: false, 盤: false, 棋譜: false },
      一覧: [],
      盤: 空の盤(),
      棋譜: [],
      印: {},
      数: {},
      鍵: false,
      鍵を貸さない: false,
      今: 始め.今 !== undefined ? 始め.今 : Date.UTC(2026, 10, 27, 1, 0, 0), // 2026-11-27 10:00（日本）
      呼んだ: {},
      止める: {}
    };

    function 記す(名) {
      中.呼んだ[名] = (中.呼んだ[名] || 0) + 1;
      if (中.止める[名]) throw new Error('作り物の表：「' + 名 + '」を止めました');
    }

    var 口 = {
      整える: function () {
        記す('整える');
        var 作った = !(中.ある.一覧 && 中.ある.盤 && 中.ある.棋譜);
        中.ある = { 一覧: true, 盤: true, 棋譜: true };
        return 作った;
      },
      整え直す: function () {
        記す('整え直す');
        中.一覧 = [];
        中.棋譜 = [];
        中.盤 = 空の盤();
      },
      一覧を読む: function () { 記す('一覧を読む'); return 字の面(中.一覧); },
      一覧に書く: function (行たち) { 記す('一覧に書く'); 中.一覧 = 字の面(行たち); },
      盤に描く: function (絵) {
        記す('盤に描く');
        中.盤 = { 値: 字の面(絵.値), 色: 写しの面(絵.色), 太さ: 写しの面(絵.太さ) };
      },
      盤を読む: function () { 記す('盤を読む'); return { 値: 写しの面(中.盤.値), 色: 写しの面(中.盤.色) }; },
      棋譜を読む: function () { 記す('棋譜を読む'); return 字の面(中.棋譜); },
      棋譜に足す: function (行) { 記す('棋譜に足す'); 中.棋譜.push(字の面([行])[0]); },
      棋譜を書き直す: function (行たち) { 記す('棋譜を書き直す'); 中.棋譜 = 字の面(行たち); },
      印を読む: function (名) {
        記す('印を読む');
        return Object.prototype.hasOwnProperty.call(中.印, 名) ? 中.印[名] : null;
      },
      印に書く: function (名, 値) { 記す('印に書く'); 中.印[名] = String(値); },
      数を読む: function (名) {
        記す('数を読む');
        var 一つ = 中.数[名];
        if (!一つ || 一つ.期限 <= 中.今) return 0;
        return 一つ.値;
      },
      数に書く: function (名, 値, 秒) { 記す('数に書く'); 中.数[名] = { 値: Number(値), 期限: 中.今 + 秒 * 1000 }; },
      鍵を取る: function (ミリ秒) {
        記す('鍵を取る');
        中.鍵の待ち = ミリ秒;
        if (中.鍵 || 中.鍵を貸さない) return false;
        中.鍵 = true;
        return true;
      },
      鍵を放す: function () { 記す('鍵を放す'); 中.鍵 = false; },
      今: function () { return 中.今; },
      時刻の字: function (ミリ秒) { return 日本の時刻(ミリ秒).replace('T', ' ').slice(0, 19); },
      日付の字: function (ミリ秒) { return 日本の時刻(ミリ秒).slice(0, 10); },
      書き終える: function () { 記す('書き終える'); }
    };

    function 表に触った回数() {
      return 表に触る口.reduce(function (合計, 名) { return 合計 + (中.呼んだ[名] || 0); }, 0);
    }

    function 数え直す() {
      中.呼んだ = {};
    }

    return { 口: 口, 中: 中, 表に触った回数: 表に触った回数, 数え直す: 数え直す };
  }

  return { 作る: 作る };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = 作り物の表;
