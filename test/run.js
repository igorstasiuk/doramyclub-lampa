'use strict';
// Тесты чистых функций doramyclub.js. Фикстуры — фрагменты настоящей разметки doramy.club и Kodik
// (сняты 2026-11-03); сайт за anti-bot проверкой, поэтому живых запросов тесты не делают.
var assert = require('assert');
var P = require('../doramyclub.js');

var passed = 0;
function t(name, fn) {
    try { fn(); passed++; console.log('ok   ' + name); }
    catch (e) { console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); process.exitCode = 1; }
}

var BASE = 'https://doramy.club';
var F = require('./fixtures');
var LISTING = F.LISTING, F2 = F, detailHtml = F.detailHtml, UVK_ESQUIRE = F.UVK_ESQUIRE, REAL_SRC = F.REAL_SRC, KODIK_PAGE = F.KODIK_PAGE;

/* ---------- листинг ---------- */


t('parseListing: карточки, страна/год/жанры, рейтинг, мини', function () {
    var l = P.parseListing(LISTING, BASE);
    assert.strictEqual(l.length, 3);
    assert.strictEqual(l[0].id, '61469');
    assert.strictEqual(l[0].title, 'Бог меча');
    assert.strictEqual(l[0].orig, 'Du Jian Jiu Tian');
    assert.strictEqual(l[0].country, 'Китай');
    assert.strictEqual(l[0].year, 2026);
    assert.strictEqual(l[0].genres, 'Фэнтези');
    assert.strictEqual(l[0].info, 'Сериал: 24 серии');
    assert.strictEqual(l[0].mini, true);
    assert.strictEqual(l[1].rating, 9.83);
    assert.strictEqual(l[1].genres, 'Драма, Комедия, Криминал');
    assert.strictEqual(l[1].mini, false);
});

t('parseListing: поисковая разметка с переводами строк, абсолютные URL', function () {
    var l = P.parseListing(LISTING, BASE);
    assert.strictEqual(l[2].title, 'Королевские воры');
    assert.strictEqual(l[2].poster, 'https://im.doramy.club/2020/04/korolevskie-vory-340x470.jpg');
    assert.strictEqual(l[2].url, 'https://doramy.club/18618-korolevskie-vory.html');
});

t('parseListing: мусор и пустая строка не падают', function () {
    assert.deepStrictEqual(P.parseListing('', BASE), []);
    assert.deepStrictEqual(P.parseListing('<html>нет карточек</html>', BASE), []);
});

t('hasNext / listPath / searchPath', function () {
    assert.strictEqual(P.hasNext(LISTING), true);
    assert.strictEqual(P.hasNext('<a class="page-numbers">1</a>'), false);
    assert.strictEqual(P.listPath('/serialy', 1), '/serialy');
    assert.strictEqual(P.listPath('/serialy/', 3), '/serialy/page/3');
    assert.strictEqual(P.listPath('/strana/2-kitaj', 2), '/strana/2-kitaj/page/2');
    assert.strictEqual(P.searchPath('корол', 1), '/?s=%D0%BA%D0%BE%D1%80%D0%BE%D0%BB');
    assert.strictEqual(P.searchPath('корол', 2), '/page/2?s=%D0%BA%D0%BE%D1%80%D0%BE%D0%BB');
});

/* ---------- меню ---------- */

t('parseMenu: жанры, годы, страны; запасной список при пустой странице', function () {
    var m = P.parseMenu('<a href="/genre/komediya">Комедия</a><a href="/genre/komediya">Комедия</a><a href="/razdel/1-doramy-pro-shkolu">Школа</a>' +
        '<a href="/god/2-2025">2025</a><a href="/strana/2-kitaj">Китай</a>', BASE);
    assert.deepStrictEqual(m.genres, [['Комедия', '/genre/komediya'], ['Школа', '/razdel/1-doramy-pro-shkolu']]);
    assert.deepStrictEqual(m.years, [['2025', '/god/2-2025']]);
    assert.deepStrictEqual(m.countries, [['Китай', '/strana/2-kitaj']]);
    var e = P.parseMenu('<html></html>', BASE);
    assert.ok(e.genres.length > 10 && e.years.length > 5 && e.countries.length === 5);
});

/* ---------- страница тайтла ---------- */



t('parseDetail: поля, жанры, рейтинг, описание, описание без сущностей', function () {
    var d = P.parseDetail(detailHtml(UVK_ESQUIRE), BASE);
    assert.strictEqual(d.title, '1 эсквайр');
    assert.strictEqual(d.year, 2024);
    assert.strictEqual(d.country, 'Южная Корея');
    assert.deepStrictEqual(d.genres, ['Драма', 'Исторический', 'Мелодрама']);
    assert.strictEqual(d.rating, 9.68);
    assert.strictEqual(d.total, 12);
    assert.strictEqual(d.voiceEp, 8);
    assert.strictEqual(d.subsEp, 10);
    assert.strictEqual(d.fields['Статус'], 'Выходит');
    assert.strictEqual(d.fields['Перевод'], 'Русская озвучка, Русские субтитры');
    assert.strictEqual(d.description, 'Описание «дорамы» & всё такое.');
    assert.strictEqual(d.note, 'В Корее серии выходят по субботам');
    assert.strictEqual(d.poster, 'https://doramy.club/wp-content/uploads/2024/01/1-eskvajr.jpg');
});

t('parseDetail: основная студия, канал, актёры, похожие', function () {
    var d = P.parseDetail(detailHtml(UVK_ESQUIRE), BASE);
    assert.strictEqual(d.studio, 'LE-Production');
    var kinds = d.links.map(function (l) { return l.kind + ':' + l.title; });
    assert.deepStrictEqual(kinds, ['kanal:JTBC', 'studiya:LE-Production']);
    assert.strictEqual(d.links[0].path, '/kanal/jtbc');
    assert.strictEqual(d.cast.length, 2);
    assert.strictEqual(d.cast[0].name, 'Ли Джин Ук');
    assert.strictEqual(d.cast[0].role, 'Главная роль');
    assert.strictEqual(d.cast[0].path, '/akter/li-dzhin-uk');
    assert.strictEqual(d.similar.length, 1);
    assert.strictEqual(d.similar[0].id, '60522');
});

t('parseDetail: основная озвучка + субтитры — разное число серий, тип serial в iframe', function () {
    var d = P.parseDetail(detailHtml(UVK_ESQUIRE), BASE);
    assert.strictEqual(d.tracks.length, 2);
    assert.strictEqual(d.tracks[0].title, 'Озвучка — LE-Production');
    assert.strictEqual(d.tracks[0].main, true);
    assert.strictEqual(d.tracks[0].links.length, 3);
    assert.strictEqual(d.tracks[1].title, 'Субтитры');
    assert.strictEqual(d.tracks[1].links.length, 4);
    assert.strictEqual(d.tracks[0].links[0], 'https://kodikplayer.com/seria/1489907/19f1f542720d55da405fff57f6bc26b6/720p');
    assert.strictEqual(d.tracks[1].links[2], 'https://kodikplayer.com/uv/715187/edc2eca5f8893864364d/720p');
    assert.strictEqual(d.iframe, 'https://kodikplayer.com/serial/69271/81aaca2db531389e25bae791e5ff417e/720p');
    assert.strictEqual(d.kind, 'serial');
});

t('parseDetail: только субтитры (пустой массив озвучки)', function () {
    var block = '<div class="player"><script> uvk.show([\n\'Озвучка\',\'Субтитры\',],[\n["kodikplayer.com%2Fseria%2F1%2Faaa%2F720p",],]);</script></div>';
    // первый массив — единственный непустой; он соответствует вкладке «Озвучка», поэтому проверяем и обратный порядок
    var d = P.parseDetail(detailHtml(block), BASE);
    assert.strictEqual(d.tracks.length, 1);
    var block2 = '<div class="player"><script> uvk.show([\n\'Субтитры\',],[\n["kodikplayer.com%2Fseria%2F7%2Fbbb%2F720p","kodikplayer.com%2Fseria%2F8%2Fccc%2F720p",],]);</script></div>';
    var d2 = P.parseDetail(detailHtml(block2), BASE);
    assert.strictEqual(d2.tracks.length, 1);
    assert.strictEqual(d2.tracks[0].title, 'Субтитры');
    assert.strictEqual(d2.tracks[0].links.length, 2);
});

t('parseDetail: пустая озвучка [] + субтитры — подпись остаётся «Субтитры»', function () {
    var block = '<div class="player"><script> uvk.show([\n\'Озвучка\',\'Субтитры\',],[\n[],["kodikplayer.com%2Fseria%2F7%2Fbbb%2F720p",],]);</script></div>';
    var d = P.parseDetail(detailHtml(block), BASE);
    assert.strictEqual(d.tracks.length, 1);
    assert.strictEqual(d.tracks[0].title, 'Субтитры');
    assert.strictEqual(d.tracks[0].tab, 'Субтитры');
    assert.strictEqual(d.tracks[0].links.length, 1);
});

t('parseDetail: фильм — один iframe /video/', function () {
    var block = '<div class="player"><div class="tabs"><li>Дорама</li></div><div class="box"><iframe src="//kodikplayer.com/video/119785/226b9f15497a63372783e21c60b8c878/720p" frameborder="0"></iframe></div></div>';
    var d = P.parseDetail(detailHtml(block), BASE);
    assert.strictEqual(d.kind, 'movie');
    assert.strictEqual(d.tracks.length, 1);
    assert.deepStrictEqual(d.tracks[0].links, ['https://kodikplayer.com/video/119785/226b9f15497a63372783e21c60b8c878/720p']);
});

t('parseDetail: iframe season без вкладок — треков нет, iframe сохранён', function () {
    var block = '<div class="player"><div class="box"><iframe src="//kodikplayer.com/season/123675/b9c499768e77a63ccb55184fda7583a0/720p"></iframe></div></div>';
    var d = P.parseDetail(detailHtml(block), BASE);
    assert.strictEqual(d.tracks.length, 0);
    assert.strictEqual(d.iframe, 'https://kodikplayer.com/season/123675/b9c499768e77a63ccb55184fda7583a0/720p');
});

t('parseDetail: страница без плеера не падает', function () {
    var d = P.parseDetail('<html><body>пусто</body></html>', BASE);
    assert.strictEqual(d.tracks.length, 0);
    assert.strictEqual(d.title, '');
});

/* ---------- Kodik ---------- */

t('parseKodikLink: seria / season / serial / video / uv, кодированный и обычный вид', function () {
    assert.deepStrictEqual(P.parseKodikLink('kodikplayer.com%2Fseria%2F1679782%2Fbf7e9bc7320f8b5145fd03f767753364%2F720p'),
        { type: 'seria', id: '1679782', hash: 'bf7e9bc7320f8b5145fd03f767753364', q: '720p' });
    assert.strictEqual(P.parseKodikLink('//kodikplayer.com/serial/69271/81aaca/720p').type, 'serial');
    assert.strictEqual(P.parseKodikLink('//kodikplayer.com/uv/856465/1fc7527d7c06f2dac1a0/720p').type, 'uv');
    assert.strictEqual(P.parseKodikLink('https://example.com/x'), null);
});

// настоящий ответ /ftor (src укорочен до первого качества) — декодируется перебором сдвига

t('decodeKodik: настоящая ссылка (ROT18 + base64)', function () {
    assert.strictEqual(P.decodeKodik(REAL_SRC),
        'https://cloud2.solodcdn.com/useruploads/40eebef5-4058-43df-b154-038c63bba6cb/9cf688dd6f7e6f9f6e54bd76e1ffe753:2026110309/720.mp4:hls:manifest.m3u8');
    assert.strictEqual(P.decodeKodik('//already.example/x.m3u8'), 'https://already.example/x.m3u8');
    assert.strictEqual(P.decodeKodik('!!!'), '');
});

t('parseFtor: качества по убыванию, pickQuality', function () {
    var json = JSON.stringify({ links: {
        '360': [{ src: REAL_SRC.replace('ThkgUK5b', 'ThkgUK5b'), type: 'application/x-mpegURL' }],
        '720': [{ src: REAL_SRC, type: 'application/x-mpegURL' }]
    } });
    var q = P.parseFtor(json);
    assert.deepStrictEqual(Object.keys(q), ['720p', '360p']);
    assert.strictEqual(P.pickQuality(q, 'best'), q['720p']);
    assert.strictEqual(P.pickQuality(q, '360'), q['360p']);
    assert.strictEqual(P.pickQuality(q, '480'), q['360p']); // ближайшее не выше запрошенного
    assert.strictEqual(P.pickQuality({}, 'best'), '');
});

// настоящие <option> страницы Kodik /season/ (озвучки и серии)

t('parseKodikPage: озвучки с разным числом серий, субтитры, серии с пропуском', function () {
    var k = P.parseKodikPage(KODIK_PAGE);
    assert.strictEqual(k.translations.length, 3);
    assert.strictEqual(k.translations[0].title, 'DubLik.Tv');
    assert.strictEqual(k.translations[0].count, 8);
    assert.strictEqual(k.translations[0].subs, false);
    assert.strictEqual(k.translations[1].subs, true);
    assert.strictEqual(k.translations[2].count, 6);
    assert.strictEqual(k.translations[2].mediaId, '123886');
    assert.strictEqual(k.series.length, 3);
    assert.strictEqual(k.series[1].num, 2);
    assert.strictEqual(k.series[2].num, 4);
    assert.strictEqual(k.series[0].link, 'https://kodikplayer.com/seria/1677524/b9c499768e77a63ccb55184fda7583a0/720p');
});

t('parseKodikPage: пустая страница', function () {
    var k = P.parseKodikPage('<html></html>');
    assert.deepStrictEqual(k, { translations: [], series: [] });
});

t('parseKodikParams: urlParams, vInfo, путь скрипта плеера', function () {
    var html = "<script>var urlParams = '{\"d\":\"kodikplayer.com\",\"d_sign\":\"abc:1\",\"pd\":\"kodikplayer.com\",\"pd_sign\":\"abc:1\",\"ref\":\"\",\"ref_sign\":\"def:1\"}';</script>" +
        "<script>vInfo.type = 'seria'; vInfo.hash = 'bf7e9bc7320f8b5145fd03f767753364'; vInfo.id = '1679782';</script>" +
        '<script src="https://kodikplayer.com/assets/js/app.player_single.6c65717c413f8324306a77f36515b8bff4423d51cb35621fceeaa6b6ef6dba26.js"></script>';
    var p = P.parseKodikParams(html);
    assert.strictEqual(p.params.d_sign, 'abc:1');
    assert.strictEqual(p.type, 'seria');
    assert.strictEqual(p.id, '1679782');
    assert.ok(/^\/assets\/js\/app\.player_single\.[a-f0-9]+\.js$/.test(p.script));
    assert.strictEqual(P.parseKodikParams('').params, null);
});


/* ---------- аккаунт и синхронизация ---------- */

t('parseNonce / parseAccountName: nonce из wfmFavorites, логин (не e-mail)', function () {
    assert.strictEqual(P.parseNonce('<script>var wfmFavorites = {"url":"https:\\/\\/doramy.club\\/wp-admin\\/admin-ajax.php","nonce":"04aca10880","postId":"61103"};</script>'), '04aca10880');
    assert.strictEqual(P.parseNonce('<html></html>'), '');
    var prof = '<tr><th class="profpart1">Логин:</th><th class="profpart2">Mortifor</th></tr><tr><th class="profpart1">E-mail:</th><th class="profpart2">a@b.c</th></tr>';
    assert.strictEqual(P.parseAccountName(prof), 'Mortifor');
    assert.strictEqual(P.parseAccountName('<form id="loginform"></form>'), '');
});

t('parseAccountList: карточки каталога и запасной разбор по ссылкам', function () {
    assert.strictEqual(P.parseAccountList(LISTING, BASE).length, 3);
    var alt = '<ul class="fav-list"><li><a href="https://doramy.club/60612-drugaya-lyubov-no-ne-ty.html"><img src="/x.jpg">Другая любовь, но не ты</a> <a class="del-link" data-post="60612" href="#">Удалить</a></li>' +
        '<li><a href="/61103-100-dnej-lzhi.html">100 дней лжи</a></li></ul>';
    var l = P.parseAccountList(alt, BASE);
    assert.deepStrictEqual(l.map(function (x) { return x.id + ':' + x.title; }), ['60612:Другая любовь, но не ты', '61103:100 дней лжи']);
    assert.strictEqual(l[0].poster, 'https://doramy.club/x.jpg');
    assert.deepStrictEqual(P.parseAccountList('<div>пусто</div>', BASE), []);
});

t('LIST_ACTIONS: имена action-ов плагина gid-favorites', function () {
    assert.strictEqual(P.LIST_ACTIONS.fav.add, 'wfm_add');
    assert.strictEqual(P.LIST_ACTIONS.later.del, 'budu_del');
    assert.strictEqual(P.LIST_ACTIONS.later.delh, 'budu_delh');
    assert.strictEqual(P.LIST_ACTIONS.watching.add, 'viewed_add');
    assert.strictEqual(P.LIST_ACTIONS.done.add, 'zakl_add');
    assert.strictEqual(P.LIST_ACTIONS.dropped.delh, 'broh_delh');
    assert.strictEqual(P.LIST_ACTIONS.dropped.page, '/regs-broh');
});

var IT = function (id) { return { id: id, title: 't' + id }; };

t('mergeMarks: первая синхронизация — объединение, ничего не теряется', function () {
    var local = { 1: { fav: true, status: '', item: IT('1'), ts: 5 }, 2: { fav: false, status: 'later', item: IT('2'), ts: 5 } };
    var remote = { fav: { 2: IT('2'), 3: IT('3') }, later: {}, watching: { 1: IT('1') }, done: {}, dropped: {} };
    var r = P.mergeMarks(local, remote, {}, false);
    assert.deepStrictEqual(Object.keys(r.marks).sort(), ['1', '2', '3']);
    assert.strictEqual(r.marks[1].fav, true);          // локальное избранное сохранено
    assert.strictEqual(r.marks[1].status, 'watching'); // статус с сайта подтянут
    assert.strictEqual(r.marks[2].fav, true);          // избранное с сайта подтянуто
    assert.strictEqual(r.marks[2].status, 'later');    // локальный статус сохранён
    var ops = r.ops.map(function (o) { return o.id + ':' + o.kind + ':' + o.op; }).sort();
    assert.deepStrictEqual(ops, ['1:fav:add', '2:later:add']);
});

t('mergeMarks: после первой синхронизации сайт главнее, удаления на сайте применяются', function () {
    var local = { 1: { fav: true, status: '', item: IT('1'), ts: 5 }, 2: { fav: true, status: '', item: IT('2'), ts: 5 } };
    var remote = { fav: { 1: IT('1') }, later: { 4: IT('4') }, watching: {}, done: {}, dropped: {} };
    var r = P.mergeMarks(local, remote, {}, true);
    assert.deepStrictEqual(Object.keys(r.marks).sort(), ['1', '4']);
    assert.strictEqual(r.marks[4].status, 'later');
    assert.deepStrictEqual(r.ops, []);
});

t('mergeMarks: неотправленные локальные изменения не затираются сайтом', function () {
    var local = { 1: { fav: true, status: 'done', item: IT('1'), ts: 9 } };
    var remote = { fav: {}, later: {}, watching: {}, done: {}, dropped: {} };
    var r = P.mergeMarks(local, remote, { 1: true }, true);
    assert.strictEqual(r.marks[1].status, 'done');
    assert.strictEqual(r.marks[1].fav, true);
    // локально снято, но удаление ещё не отправлено, а на сайте отметка есть — остаётся снятой
    var r2 = P.mergeMarks({}, { fav: { 7: IT('7') }, later: {}, watching: {}, done: {}, dropped: {} }, { 7: true }, true);
    assert.deepStrictEqual(Object.keys(r2.marks), []);
});

t('mergeMarks: несколько статусов на сайте — берётся самый «живой» (смотрю > на потом > просмотрено > брошено)', function () {
    var remote = { fav: {}, later: { 1: IT('1') }, watching: {}, done: { 1: IT('1') }, dropped: { 1: IT('1') } };
    assert.strictEqual(P.mergeMarks({}, remote, {}, true).marks[1].status, 'later');
});


/* ---------- 0.3: навигатор, рандом, актёры, подборки, комментарии, расписание, новости ---------- */

t('listPath: query в пути и отдельный query, пагинация собирается самим плагином', function () {
    assert.strictEqual(P.listPath('/top-vebki?sort_stat=pop', 2), '/top-vebki/page/2?sort_stat=pop');
    assert.strictEqual(P.listPath('/navi-cl', 3, 'razdel=serialy&tax_strana=11'), '/navi-cl/page/3?razdel=serialy&tax_strana=11');
    assert.strictEqual(P.listPath('/genre/detektiv', 2, 'st_strana=koreya'), '/genre/detektiv/page/2?st_strana=koreya');
    assert.strictEqual(P.listPath('/serialy/', 1), '/serialy');
});

t('naviQuery: пример с сайта (9 страниц), И/ИЛИ жанров, годы, исключения', function () {
    var q = P.naviQuery({ razdel: 'serialy', strana: '11', perevod: '12', genres: ['35'], sortRating: true, released: true, noMini: true });
    assert.strictEqual(q, 'razdel=serialy&tax_strana=11&tax_perevod=12&tag_zhanr%5B%5D=35&sort_rai=ratings&sort_stat=released&mini_dor=exclude');
    assert.strictEqual(P.naviQuery({}), '');
    var q2 = P.naviQuery({ years: ['5070', '4056'], genres: ['35', '36'], genresAnd: true, exclude: ['32'], studiya: '3825' });
    assert.strictEqual(q2, 'tax_studiya=3825&tax_god%5B%5D=5070&tax_god%5B%5D=4056&tag_zhanr%5B%5D=35&tag_zhanr%5B%5D=36&zhanr_sort=and&tag_id%5B%5D=32');
    // «все жанры обязательны» при одном жанре бессмысленно
    assert.strictEqual(P.naviQuery({ genres: ['35'], genresAnd: true }), 'tag_zhanr%5B%5D=35');
});

t('NAVI: справочники совпадают с формой /navi-cl', function () {
    assert.strictEqual(P.NAVI.genres.length, 18);
    assert.strictEqual(P.optionLabel(P.NAVI.genres, '13'), 'Детективы');
    assert.strictEqual(P.optionLabel(P.NAVI.years, '5070'), '2026');
    assert.strictEqual(P.optionLabel(P.NAVI.strana, '19'), 'Япония');
    assert.strictEqual(P.NAVI.studiya.length, 17);
    assert.strictEqual(P.naviTitle({ razdel: 'serialy', strana: '11', genres: ['35'], sortRating: true }), 'Фильтр: Сериалы · Южная Корея · Мистика · по рейтингу');
});

t('parseListing: счётчики озвучки/субтитров, статус «Выходит», главная роль, бейдж', function () {
    var l = P.parseListing(F2.ACTOR_PAGE, BASE);
    assert.strictEqual(l.length, 1);
    assert.strictEqual(l[0].status, 'Выходит');
    assert.strictEqual(l[0].voiceEp, 8);
    assert.strictEqual(l[0].subsEp, 9);
    assert.strictEqual(l[0].mainRole, true);
    assert.strictEqual(P.cardBadge(l[0]), 'Выходит · оз.8/сб.9');
    var plain = P.parseListing(LISTING, BASE)[0];
    assert.strictEqual(plain.voiceEp, 0);
    assert.strictEqual(P.cardBadge(plain), 'Мини');
});

t('parseActor: шапка актёра с фактами', function () {
    var a = P.parseActor(F2.ACTOR_PAGE, BASE);
    assert.strictEqual(a.name, 'Ким Ю Чжон (1999)');
    assert.strictEqual(a.photo, 'https://doramy.club/wp-content/uploads/2026/09/kim-yu-chzhon2.jpg');
    assert.deepStrictEqual(a.facts.map(function (f) { return f[0] + '=' + f[1]; }), ['Дорам=31', 'ДР=22.09.1999', 'Зодиак=Кролик, Дева', 'Рост=165 см', 'Страна=Сеул, Южная Корея']);
    assert.strictEqual(P.parseActor('<html></html>', BASE), null);
});

t('parseActorsAjax / parseActorsTop / ajaxNonceExpired', function () {
    var l = P.parseActorsAjax(F2.FAST_AKTERS, BASE);
    assert.strictEqual(l.length, 2);
    assert.strictEqual(l[0].name, 'Ким Вон Хэ');
    assert.strictEqual(l[0].path, '/akter/1-kim-von-xe');
    assert.strictEqual(l[0].birth, '21.05.1969');
    assert.strictEqual(l[1].name, 'Ким Ми Гён (1963)');
    var top = P.parseActorsTop(F2.AKTERY_TOP, BASE);
    assert.deepStrictEqual(top.map(function (x) { return x.name + '|' + x.path; }), ['Ли Дон Ук|/akter/1-li-don-uk', 'Сон Кан|/akter/1-son-kan']);
    assert.strictEqual(P.ajaxNonceExpired('<li class="no-results"><b>Ошибка! Обновите страницу</b></li>'), true);
    assert.strictEqual(P.ajaxNonceExpired(F2.FAST_AKTERS), false);
    assert.deepStrictEqual(P.parseActorsTop('<html></html>', BASE), []);
});

t('parsePodborki / parsePopular', function () {
    var p = P.parsePodborki(F2.PODBORKI, BASE);
    assert.deepStrictEqual(p.map(function (x) { return x.title + '|' + x.path; }), ['Измена в отношениях|/razdel/doramy-pro-izmenu-v-otnosheniyax', 'Вэб-дорамы|/razdel/vertikalnye-veb-doramy']);
    assert.strictEqual(p[0].poster, 'https://doramy.club/wp-content/uploads/pod-new/izmena.jpg');
    var pop = P.parsePopular(F2.CAROU, BASE);
    assert.strictEqual(pop.length, 2);
    assert.strictEqual(pop[1].id, '61103');
    assert.strictEqual(pop[1].rating, 9.68);
});

t('parseRandom / parseRandNonce / parseSeaNonce', function () {
    var r = P.parseRandom(F2.RAND_RESPONSE, BASE);
    assert.strictEqual(r.item.title, 'Восемнадцать');
    assert.strictEqual(r.item.orig, 'A-Teen');
    assert.strictEqual(r.item.rating, 8.89);
    assert.strictEqual(r.item.info, 'Сериал: 24 серии · Перевод: Озвучка');
    assert.strictEqual(r.kind, 'Мини дорама');
    assert.deepStrictEqual(r.roles.map(function (x) { return x.name; }), ['Син Йе Ын', 'Ли На Ын']);
    assert.ok(/Восемнадцать».*старшеклассников/.test(r.descr));
    assert.deepStrictEqual(r.collections, ['Дорамы про школу', 'Мини-дорамы скоротать вечерок']);
    assert.strictEqual(P.parseRandom('<li>Ошибка</li>', BASE), null);
    assert.strictEqual(P.parseRandNonce('var rand_obj = {"a_url":"https:\\/\\/doramy.club\\/wp-admin\\/admin-ajax.php","nonce":"ab12cd34"}'), 'ab12cd34');
    assert.strictEqual(P.parseSeaNonce('var sea_ajax = {"url":"x","nonce":"99ff"};'), '99ff');
});

t('parseComments: инлайн-отзывы только для чтения, закрытые отзывы', function () {
    var c = P.parseComments(F2.COMMENTS_HTML);
    assert.strictEqual(c.closed, true);
    assert.strictEqual(c.list.length, 2);
    assert.strictEqual(c.list[0].author, 'ZHDS');
    assert.strictEqual(c.list[0].date, '18 сентября 2025');
    assert.ok(/2 сезон/.test(c.list[0].text));
    assert.deepStrictEqual(P.parseComments('<html></html>'), { list: [], closed: false });
});

t('parseDetail: число оценок, HD-постер (og:image), статус, расписание, подборки, отзывы', function () {
    var html = detailHtml(UVK_ESQUIRE).replace('<noindex>', '<meta property="og:image" content="https://doramy.club/wp-content/uploads/2024/01/1-eskvajr.jpg"><span itemprop="ratingCount">2&nbsp;996</span><ul class="podbor-s"><li><a href="https://doramy.club/razdel/doramy-pro-shkolu"><img src="/x.jpg" alt="Дорамы про школу"></a></li></ul><noindex>') + F2.COMMENTS_HTML;
    var d = P.parseDetail(html, BASE);
    assert.strictEqual(d.ratingCount, 2996);
    assert.strictEqual(d.posterHd, 'https://doramy.club/wp-content/uploads/2024/01/1-eskvajr.jpg');
    assert.strictEqual(d.status, 'Выходит');
    assert.deepStrictEqual(d.schedule, { days: [5], text: 'В Корее серии выходят по субботам' });
    assert.deepStrictEqual(d.collections, [{ path: '/razdel/doramy-pro-shkolu', title: 'Дорамы про школу' }]);
    assert.strictEqual(d.comments.length, 2);
    assert.strictEqual(d.commentsClosed, true);
});

t('parseDetail: вкладка «Автоперевод» помечается auto', function () {
    var block = '<div class="player"><script> uvk.show([\n\'Автоперевод\',],[\n["kodikplayer.com%2Fserial%2F5%2Faaa%2F720p",],]);</script></div>';
    var d = P.parseDetail(detailHtml(block), BASE);
    assert.strictEqual(d.tracks.length, 1);
    assert.strictEqual(d.tracks[0].auto, true);
});

t('parseSchedule: дни недели из текста сайта', function () {
    assert.deepStrictEqual(P.parseSchedule('В Корее серии выходят по субботам и воскресеньям').days, [5, 6]);
    assert.deepStrictEqual(P.parseSchedule('Серии выходят по понедельникам, средам и пятницам').days, [0, 2, 4]);
    assert.strictEqual(P.parseSchedule('Скоро'), null);
    assert.strictEqual(P.parseSchedule(''), null);
});

t('parseListState: data-action=del значит «уже в списке»', function () {
    assert.strictEqual(P.parseListState(F2.LIST_BUTTONS, 'watching'), 'in');
    assert.strictEqual(P.parseListState(F2.LIST_BUTTONS, 'fav'), 'out');
    assert.strictEqual(P.parseListState(F2.LIST_BUTTONS, 'dropped'), null);
    assert.strictEqual(P.parseListState('<html></html>', 'fav'), null);
});

t('analyzeCookie / maskCookie: без раскрытия значений, сравнение UA без подмены', function () {
    var ua = 'Mozilla/5.0 (X11) Test';
    var ck = 'wordpress_logged_in_abc=SECRET; __js_p_=641,86400,0,0,0; __jhash_=17; __jua_=' + encodeURIComponent(ua);
    var a = P.analyzeCookie(ck, ua);
    assert.strictEqual(a.hasSession, true);
    assert.strictEqual(a.hasAntibot, true);
    assert.strictEqual(a.uaMatch, true);
    assert.strictEqual(P.analyzeCookie(ck, 'Other UA').uaMatch, false);
    assert.strictEqual(P.analyzeCookie('wordpress_logged_in_abc=1', ua).uaMatch, null);
    assert.strictEqual(P.analyzeCookie('', ua).hasSession, false);
    var m = P.maskCookie(ck);
    assert.ok(m.indexOf('SECRET') < 0 && m.indexOf('wordpress_logged_in_abc=***') === 0);
});

t('normalizeCookie: префикс Cookie:, кавычки, cURL-вариант, переводы строк, мусор', function () {
    assert.strictEqual(P.normalizeCookie('Cookie: a=1;  b=2'), 'a=1; b=2');
    assert.strictEqual(P.normalizeCookie("-H 'cookie: a=1; b=2'"), 'a=1; b=2');
    assert.strictEqual(P.normalizeCookie('a=1;\nb=2\r\n'), 'a=1; b=2');
    assert.strictEqual(P.normalizeCookie('"a=1; b=2"'), 'a=1; b=2');
    assert.strictEqual(P.normalizeCookie('мусор'), '');
    assert.strictEqual(P.normalizeCookie(''), '');
});

t('parseSkip: мм:сс-мм:сс, только если конец позже начала', function () {
    assert.deepStrictEqual(P.parseSkip('1:30-2:45'), { start: 90, end: 165 });
    assert.deepStrictEqual(P.parseSkip(' 0:05 – 1:00 '), { start: 5, end: 60 });
    assert.strictEqual(P.parseSkip('2:00-1:00'), null);
    assert.strictEqual(P.parseSkip('abc'), null);
    assert.strictEqual(P.parseSkip(''), null);
});

t('countryParam / queryValue / setQueryValue: фильтр страны в разделах', function () {
    assert.strictEqual(P.countryParam('/genre/detektiv'), 'st_strana');
    assert.strictEqual(P.countryParam('/god/2-2025'), 'st_strana');
    assert.strictEqual(P.countryParam('/1-novinki'), 'st_sort');
    assert.strictEqual(P.countryParam('/serialy'), '');
    assert.strictEqual(P.queryValue('a=1&st_strana=koreya', 'st_strana'), 'koreya');
    assert.strictEqual(P.queryValue('', 'st_strana'), '');
    assert.strictEqual(P.setQueryValue('a=1', 'st_strana', 'kitaj'), 'a=1&st_strana=kitaj');
    assert.strictEqual(P.setQueryValue('st_strana=koreya&a=1', 'st_strana', 'kitaj'), 'a=1&st_strana=kitaj');
    assert.strictEqual(P.setQueryValue('st_strana=koreya', 'st_strana', ''), '');
});

t('parseMenu: каналы и дополнительные разделы в запасном меню', function () {
    var m = P.parseMenu('<html></html>', BASE);
    assert.ok(m.channels.length >= 6 && m.channels[0][1] === '/kanal/tvn');
    var paths = m.sections.map(function (x) { return x[1]; });
    ['/perevod/russkaya-ozvuchka', '/perevod/subtitry', '/lakorny', '/top-vebki', '/top-vebki?sort_stat=pop'].forEach(function (x) { assert.ok(paths.indexOf(x) >= 0, x); });
});

t('detectNews: база при первом виде, новости при росте счётчиков, только отслеживаемые', function () {
    var cur = { 1: { voiceEp: 8, subsEp: 8, item: IT('1') }, 2: { voiceEp: 3, subsEp: 0, item: IT('2') }, 3: { voiceEp: 9, subsEp: 9, item: IT('3') } };
    var r1 = P.detectNews({}, cur, { 1: true, 2: true });
    assert.deepStrictEqual(r1.news, {});
    assert.deepStrictEqual(r1.seen[1], { v: 8, s: 8 });
    assert.strictEqual(r1.seen[3], undefined);
    var cur2 = { 1: { voiceEp: 9, subsEp: 8, item: IT('1') }, 2: { voiceEp: 3, subsEp: 1, item: IT('2') } };
    var r2 = P.detectNews(r1.seen, cur2, { 1: true, 2: true });
    assert.strictEqual(r2.news[1].dv, 1);
    assert.strictEqual(r2.news[1].ds, 0);
    assert.strictEqual(r2.news[2].ds, 1);
    // тайтла нет в ленте — не новость и не теряется
    assert.deepStrictEqual(P.detectNews(r1.seen, {}, { 1: true }).news, {});
});

/* ---------- прочее ---------- */

t('looksLikeChallenge: страница anti-bot распознаётся, обычная — нет', function () {
    var ch = '<html><script>function get_jhash(b){} get_param("__js_p_", "int", 0)</script></html>';
    assert.strictEqual(P.looksLikeChallenge(ch), true);
    assert.strictEqual(P.looksLikeChallenge(LISTING), false);
});

t('fmtTime', function () {
    assert.strictEqual(P.fmtTime(0), '0:00');
    assert.strictEqual(P.fmtTime(65), '1:05');
    assert.strictEqual(P.fmtTime(3725), '1:02:05');
});

t('ES5: в плагине нет синтаксиса/методов ES6+', function () {
    var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'doramyclub.js'), 'utf8');
    var bad = [];
    src.split('\n').forEach(function (line, i) {
        var code = line.replace(/\/\/.*$/, '');
        if (/=>|\blet\s|\bconst\s|`|\.includes\(|\.findIndex\(|\.startsWith\(|Object\.assign|Array\.from|gap:/.test(code)) bad.push((i + 1) + ': ' + line.trim());
    });
    assert.deepStrictEqual(bad, []);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', есть падения' : ''));
