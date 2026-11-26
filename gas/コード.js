/*
 * 予定の盤：Google Apps Script の入口と「表の口」
 *
 * 入口（Google の決まりで名前が決まっている物と、メニュー・トリガー）
 *   doGet          … ウェブアプリ。見る人がブラウザで開く
 *   onOpen         … スプレッドシートを開いた時に、メニュー「予定の盤」を足す
 *   駒の窓を開く   … メニューから、駒をつかんで動かす画面を窓で開く
 *   毎朝の見張り   … 時間のトリガー（毎朝）から。だめなら直して、動かしている人に知らせる
 * 画面から呼ばれる5つの口：開く・盤を読む・駒を動かす・一手戻す・はじめの形に戻す
 * それ以外の関数は、名前の最後を _ にする（画面から呼べないようにする）。
 *
 * 決まり（動かせるか・何を書くか）は 芯.js と 仕組み.js。表（スプレッドシート）に触るのは、ここの 表の口_ だけ。
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('盤')
    .setTitle('予定の盤')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('予定の盤')
    .addItem('駒をつかんで動かす画面を開く', '駒の窓を開く')
    .addToUi();
}

function 駒の窓を開く() {
  // ノートパソコンの画面（高さ768）にも収まる大きさ。盤が入りきらない時は、窓の中で下へ動かして見る
  var 窓 = HtmlService.createHtmlOutputFromFile('盤').setWidth(1000).setHeight(620);
  SpreadsheetApp.getUi().showModelessDialog(窓, '駒をつかんで動かす画面');
}

// 毎朝の見張り（時間のトリガーから呼ぶ）。表を見て、だめなら直す。直した時と、止まった時だけ、
// 動かしている人のアドレスへメールで知らせる。画面からも呼べてしまう名前なので、6時間に1回しか動かない。
function 毎朝の見張り() {
  var 印 = PropertiesService.getScriptProperties();
  var 今 = Date.now();
  var 前 = Number(印.getProperty('最後の見張り') || 0);
  if (今 - 前 < 6 * 3600 * 1000) return '見張りは6時間に1回です';
  印.setProperty('最後の見張り', String(今));
  var 知らせ = '';
  try {
    var 結果 = 仕組み.見張る(表の口_());
    if (結果.結果 === '直した') 知らせ = '直しました：' + 結果.訳;
    var 画面 = doGet(); // 画面が出せるか
    if (!画面 || typeof 画面.getContent !== 'function' || 画面.getContent().indexOf('予定の盤') < 0) 知らせ += '　画面が出せません';
  } catch (誤り) {
    知らせ = '止まりました：' + (誤り && 誤り.message ? 誤り.message : String(誤り));
  }
  if (!知らせ) return '大丈夫';
  var 宛先 = Session.getEffectiveUser().getEmail();
  if (宛先) MailApp.sendEmail(宛先, '予定の盤の見張り', 知らせ + '\n\nスプレッドシート：' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  return 知らせ;
}

function 開く(頼み) { return 計る_(function (口) { return 仕組み.開く(口, 頼み); }); }
function 盤を読む(頼み) { return 計る_(function (口) { return 仕組み.盤を読む(口, 頼み); }); }
function 駒を動かす(頼み) { return 計る_(function (口) { return 仕組み.駒を動かす(口, 頼み); }); }
function 一手戻す(頼み) { return 計る_(function (口) { return 仕組み.一手戻す(口, 頼み); }); }
function はじめの形に戻す(頼み) { return 計る_(function (口) { return 仕組み.はじめの形に戻す(口, 頼み); }); }

// 裏でかかった時間を測って、返事に添える（どこが遅いかを見るため）
function 計る_(中身) {
  var 始め = Date.now();
  var 記録 = {};
  var 口 = 表の口_();
  var 包み = {};
  Object.keys(口).forEach(function (名) {
    包み[名] = function () {
      var t = Date.now();
      try {
        return 口[名].apply(null, arguments);
      } finally {
        記録[名] = (記録[名] || 0) + (Date.now() - t);
      }
    };
  });
  var 返事 = 中身(包み);
  if (返事 && typeof 返事 === 'object') {
    返事.裏の秒 = (Date.now() - 始め) / 1000;
    返事.口ごとのミリ秒 = 記録;
  }
  return 返事;
}

// 仕組みが表に触る時の口（作り物の表 確かめ/作り物の表.js と同じ形）
// 1回の頼みの中では、シートの一覧・行の数・印（ScriptProperties）・数（CacheService）を覚えておき、呼ぶ回数を減らす。
// 書く物は鍵の中でしか書かないので、鍵を取った時に印と数を読み直せば、覚えた物がずれない。
function 表の口_() {
  var 表 = SpreadsheetApp.getActiveSpreadsheet();
  if (!表) throw new Error('この仕組みが付いているスプレッドシートが見つかりません');
  var 印 = PropertiesService.getScriptProperties();
  var 置き場 = CacheService.getScriptCache();
  var 鍵 = LockService.getScriptLock();
  var 時間帯 = Session.getScriptTimeZone();
  var 名前たち = ['盤', '一覧', '棋譜'];

  var シートたち = null; // 名前 → シート
  var 行の数 = {};       // シートの名前 → 見出しの下の行の数（読んだ時・書いた時に覚える）
  var 印の写し = null;
  var まだ書いていない印 = null;
  var 数の写し = {};

  function シートたち_() {
    if (!シートたち) {
      シートたち = {};
      表.getSheets().forEach(function (シート) { シートたち[シート.getName()] = シート; });
    }
    return シートたち;
  }

  function シート_(名前) {
    var シート = シートたち_()[名前];
    if (!シート) throw new Error('シート「' + 名前 + '」がありません');
    return シート;
  }

  function 字の行(行) {
    return 行.map(function (値) { return String(値); });
  }

  // 見出しの下の行を、表示のとおりの字で読む（時刻が日付の値にならない）
  function 字の行たち_(名前, 列の数) {
    var 全部 = シート_(名前).getDataRange().getDisplayValues();
    var 行たち = 全部.slice(1).map(function (行) {
      var 一行 = 行.slice(0, 列の数);
      while (一行.length < 列の数) 一行.push('');
      return 一行;
    });
    行の数[名前] = 行たち.length;
    return 行たち;
  }

  function 今の行の数_(名前) {
    if (行の数[名前] === undefined) 行の数[名前] = Math.max(0, シート_(名前).getLastRow() - 1);
    return 行の数[名前];
  }

  function 字にして書く_(名前, 行たち, 列の数) {
    var シート = シート_(名前);
    var 前 = 今の行の数_(名前);
    if (前 > 行たち.length) シート.getRange(2 + 行たち.length, 1, 前 - 行たち.length, 列の数).clearContent();
    if (行たち.length) シート.getRange(2, 1, 行たち.length, 列の数).setValues(行たち.map(字の行));
    行の数[名前] = 行たち.length;
  }

  var 盤の列の数 = 1 + 芯.日の数 * 芯.担当たち.length;

  // シートが無ければ作る。新しいスプレッドシートの空のシート1枚は、名前を替えて使う。作った時 true
  function 作る_(名前, 位置) {
    var ある = シートたち_();
    if (ある[名前]) return false;
    var 全部 = 表.getSheets();
    var シート;
    if (全部.length === 1 && 全部[0].getLastRow() === 0 && 全部[0].getLastColumn() === 0 && 名前たち.indexOf(全部[0].getName()) < 0) {
      シート = 全部[0];
      delete ある[シート.getName()];
      シート.setName(名前);
    } else {
      シート = 表.insertSheet(名前, Math.min(位置, 全部.length));
    }
    ある[名前] = シート;
    行の数[名前] = 0;
    return true;
  }

  // シートの中身と書式を消して、見出し・書式なしテキスト（時刻と日付を字のまま持つ）・列の幅をそろえる
  function 形を整える_(名前, 見出し, 列の数, 幅たち, 固定の行, 固定の列) {
    var シート = シート_(名前);
    シート.clear();
    シート.getRange(1, 1, シート.getMaxRows(), 列の数).setNumberFormat('@');
    if (見出し) {
      シート.getRange(1, 1, 1, 見出し.length).setValues([見出し.slice()]).setFontWeight('bold').setBackground('#eeeeee');
    }
    シート.setFrozenRows(固定の行);
    シート.setFrozenColumns(固定の列);
    幅たち.forEach(function (幅, i) { シート.setColumnWidth(i + 1, 幅); });
    行の数[名前] = 0;
  }

  function 印を書き終える_() {
    if (!まだ書いていない印) return;
    印.setProperties(まだ書いていない印, false);
    まだ書いていない印 = null;
  }

  return {
    整える: function () {
      var 作った = false;
      名前たち.forEach(function (名前, 位置) { if (作る_(名前, 位置)) 作った = true; });
      return 作った;
    },
    整え直す: function () {
      var 盤の幅 = [56];
      for (var i = 1; i < 盤の列の数; i++) 盤の幅.push(76);
      形を整える_('盤', null, 盤の列の数, 盤の幅, 2, 1);
      形を整える_('一覧', 芯.一覧の見出し, 芯.一覧の見出し.length, [48, 110, 96, 72, 64, 64], 1, 0);
      形を整える_('棋譜', 芯.棋譜の見出し, 芯.棋譜の見出し.length, [44, 140, 56, 44, 100, 92, 72, 72, 92, 72, 72, 64], 1, 0);
    },
    一覧を読む: function () { return 字の行たち_('一覧', 芯.一覧の見出し.length); },
    一覧に書く: function (行たち) { 字にして書く_('一覧', 行たち, 芯.一覧の見出し.length); },
    盤に描く: function (絵) {
      var 範囲 = シート_('盤').getRange(1, 1, 絵.値.length, 絵.値[0].length);
      範囲.setValues(絵.値);
      範囲.setBackgrounds(絵.色);
      範囲.setFontWeights(絵.太さ);
    },
    盤を読む: function () {
      var 範囲 = シート_('盤').getRange(1, 1, 2 + 芯.段の数, 盤の列の数);
      return { 値: 範囲.getDisplayValues(), 色: 範囲.getBackgrounds() };
    },
    棋譜を読む: function () { return 字の行たち_('棋譜', 芯.棋譜の見出し.length); },
    棋譜に足す: function (行) {
      var 数 = 今の行の数_('棋譜');
      シート_('棋譜').getRange(2 + 数, 1, 1, 芯.棋譜の見出し.length).setValues([字の行(行)]);
      行の数['棋譜'] = 数 + 1;
    },
    棋譜を書き直す: function (行たち) { 字にして書く_('棋譜', 行たち, 芯.棋譜の見出し.length); },
    印を読む: function (名) {
      if (!印の写し) 印の写し = 印.getProperties();
      return Object.prototype.hasOwnProperty.call(印の写し, 名) ? 印の写し[名] : null;
    },
    印に書く: function (名, 値) {
      if (!印の写し) 印の写し = 印.getProperties();
      印の写し[名] = String(値);
      まだ書いていない印 = まだ書いていない印 || {};
      まだ書いていない印[名] = String(値);
    },
    数を読む: function (名) {
      if (!Object.prototype.hasOwnProperty.call(数の写し, 名)) {
        var 値 = 置き場.get(名);
        数の写し[名] = 値 === null ? 0 : (Number(値) || 0);
      }
      return 数の写し[名];
    },
    数に書く: function (名, 値, 秒) {
      置き場.put(名, String(値), 秒);
      数の写し[名] = Number(値);
    },
    鍵を取る: function (ミリ秒) {
      var 取れた = 鍵.tryLock(ミリ秒);
      if (取れた) {
        印の写し = null; // 鍵を待つ間に、ほかの人が書いたかもしれない
        数の写し = {};
      }
      return 取れた;
    },
    鍵を放す: function () {
      try {
        印を書き終える_();
      } finally {
        鍵.releaseLock();
      }
    },
    今: function () { return Date.now(); },
    時刻の字: function (ミリ秒) { return Utilities.formatDate(new Date(ミリ秒), 時間帯, 'yyyy-MM-dd HH:mm:ss'); },
    日付の字: function (ミリ秒) { return Utilities.formatDate(new Date(ミリ秒), 時間帯, 'yyyy-MM-dd'); },
    書き終える: function () {
      印を書き終える_();
      SpreadsheetApp.flush();
    }
  };
}
