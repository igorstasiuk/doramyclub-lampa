'use strict';
// Фрагменты настоящей разметки doramy.club и Kodik (сняты 2026-11-03) — общие для run.js и smoke.js
var LISTING = '<main><section class="post-list"> <div class="img-link"> <a href="https://doramy.club/61469-bog-mecha.html"><img src="https://doramy.club/wp-content/uploads/2026/11/bog-mecha-340x470.jpg" alt="" /><span>Бог меча</span></a> </div> <em>Du Jian Jiu Tian</em><table> <tbody> <tr><td><u>Китай, 2026</u></td></tr> <tr><td><u>Фэнтези</u></td></tr> </tbody> </table> <table class="table-hom"> <tbody class="tbody-hom"> <tr><td colspan="2"><span class="i1">Сериал: </span>24 серии</td></tr></tbody> </table> <div class="mini-web">Мини</div></section>' +
    '<section class="post-list"> <div class="img-link"> <a href="https://doramy.club/57539-istinnoe-obrazovanie.html"><img src="https://doramy.club/wp-content/uploads/2026/06/istinnoe-obrazovanie-340x470.jpg" alt=""><span>Истинное образование</span></a> </div> <em>Teach You a Lesson</em><table> <tbody> <tr><td><u>Южная Корея, 2026</u></td></tr> <tr><td><u>Драма, Комедия, Криминал</u></td></tr> </tbody> </table> <table class="table-hom"> <tbody class="tbody-hom"> <tr><td colspan="2"><span class="i1">Сериал: </span>10 серий</td></tr></tbody> </table> <div class="average">9.83</div></section>' +
    '<section class="post-list"> <div class="img-link">\n<a href="https://doramy.club/18618-korolevskie-vory.html">\n<img src="https://im.doramy.club/2020/04/korolevskie-vory-340x470.jpg" alt="">\n<span>Королевские воры</span></a>\n</div></section>' +
    '<a class="next page-numbers" href="https://doramy.club/serialy/page/3">Далее →</a></main>';
function detailHtml(playerBlock, rowsExtra) {
    return '<article class="text"><section class="post-singl"><h1 itemprop="name">1 эсквайр дорама (2024)</h1>' +
        '<div class="img-poster"><img class="s-poster" itemprop="image" src="https://doramy.club/wp-content/uploads/2024/01/1-eskvajr.jpg" alt=""></div>' +
        '<table class="table-tag"> <tbody> <tr><td><u>Южная Корея, 2024</u></td></tr> <tr><td><u>Драма, Исторический, Мелодрама</u></td></tr> </tbody> </table>' +
        '<table class="table-sin"><tbody class="tbody-sin">' +
        '<tr><td class="s1">Время:</td><td>60 мин</td></tr><tr><td class="s1">Сериал:</td><td>12 серий</td></tr>' +
        '<tr><td class="s1">Статус:</td><td><span class="o-sratus">Выходит</span></td></tr>' +
        '<tr><td class="s1">Озвучка:</td><td><i class="s2"><b>8</b> серия</i></td></tr>' +
        '<tr><td class="s1">Субтитры:</td><td><i class="s2"><b>10</b> серия</i></td></tr>' +
        '<tr class="perevod"><td class="s1">Перевод:</td><td>Русская озвучка, Русские субтитры</td></tr>' +
        '<tr class="linkpost"><td class="s1">Канал:</td><td><span><a href="https://doramy.club/kanal/jtbc">JTBC</a></span></td></tr>' +
        '<tr class="linkpost"><td class="s1">Озвучка:</td><td><span><a href="https://doramy.club/studiya/le-production">LE-Production</a> </span></td></tr>' + (rowsExtra || '') +
        '<tr class="person"><td colspan="2"><i class="sp1">В ролях:</i><span class="tdlinks"><a href="https://doramy.club/akter/li-dzhin-uk" data-txt="Главная роль" data-img="https://im.doramy.club/2024/01/li-dzhin-uk-340x470.jpg">Ли Джин Ук</a>,</span><span class="tdlinks"><a href="https://doramy.club/akter/chon-chxe-yon" data-txt="Главная роль" data-img="">Чон Чхэ Ён</a>,</span></td></tr>' +
        '</tbody></table></section>' +
        '<div class="description"><p>Описание &laquo;дорамы&raquo; &amp; всё такое.</p></div><div class="infos"><span>В Корее серии выходят по субботам</span></div><noindex>' + playerBlock + '</noindex>' +
        '<div class="rating-cl"><div class="rt-unit"><span itemprop="ratingValue">9.68</span></div></div>' +
        '<div class="carou-in owl-carousel" id="owl-perelink"><div class="carou-item-wr"><a href="https://doramy.club/60522-sdelano-v-koree-2.html"><img src="https://im.doramy.club/2026/09/sdelano-v-koree-2-340x470.jpg" alt="Сделано в Корее 2" loading="lazy"><div class="pe-title">Сделано в Корее 2</div></a></div></div></article>';
}
var UVK_ESQUIRE = '<div class="player"><div class="videoclub"><div class="tabs"><li>Дорама</li><li>Другие озвучки</li></div><div class="container"><div class="box"><script type="text/javascript"> uvk.show([\n\'Озвучка\',\'Субтитры\',],[\n' +
    '["kodikplayer.com%2Fseria%2F1489907%2F19f1f542720d55da405fff57f6bc26b6%2F720p","kodikplayer.com%2Fseria%2F1490409%2Fee381de9552d876f2b054211e58d3047%2F720p","kodikplayer.com%2Fseria%2F1493834%2Fb21aa4431f9127ae0e9869f7d6c7b06d%2F720p",],' +
    '["kodikplayer.com%2Fseria%2F1503059%2Fbfe47439f2bf187e82c4e5756cc391f3%2F720p","kodikplayer.com%2Fseria%2F1503060%2F5893375359edcef9edb3c768d5f3874a%2F720p","kodikplayer.com%2Fuv%2F715187%2Fedc2eca5f8893864364d%2F720p","kodikplayer.com%2Fuv%2F715360%2Fe33343eca1171fa51742%2F720p",],]);</script></div>' +
    '<div class="box"><iframe src="//kodikplayer.com/serial/69271/81aaca2db531389e25bae791e5ff417e/720p" frameborder="0" allowfullscreen allow="autoplay *; fullscreen *"></iframe></div></div></div></div>';
var REAL_SRC = 'Tg9rjO91HLQck29aj2ZrHO4cG29bT3DhHFR1kOfdGEZhThYeHEDqHEG1TBYeVBobVLVsHq1qUBC0TBIhWOU2U2RqGBHrGq85G2G2WLpsHLHuV2C2HrtuVuC1VORsVhHtUEHuHBk1UhwgULQ2UBMeUhI5ThkgUK5bkLY6iOfhWu1pjutuHFV0Tu0hlBo';
var KODIK_PAGE = '<div class="serial-translations-box"><select>' +
    '<option value="1355" data-id="1355" data-translation-type="voice" data-media-id="123675" data-media-hash="b9c499768e77a63ccb55184fda7583a0" data-media-type="season" data-title="DubLik.Tv" data-episode-count="8" selected="selected">DubLik.Tv (8 эп.)</option>' +
    '<option value="3959" data-id="3959" data-translation-type="subtitles" data-media-id="123578" data-media-hash="231f6007fbe7133aa46873933c20876c" data-media-type="season" data-title="UMISEN.Subtitles" data-episode-count="8">UMISEN.Subtitles (8 эп.)</option>' +
    '<option value="4145" data-id="4145" data-translation-type="voice" data-media-id="123886" data-media-hash="bf7e9bc7320f8b5145fd03f767753364" data-media-type="season" data-title="LE-Vitation" data-episode-count="6">LE-Vitation (6 эп.)</option>' +
    '</select></div><div class="serial-series-box"><select>' +
    '<option value="1" data-id="1677524" data-hash="b9c499768e77a63ccb55184fda7583a0">1 серия</option>' +
    '<option value="2" data-id="1677525" data-hash="af46fd27f717677dbb5de101d361d4c6">2 серия</option>' +
    '<option value="4" data-id="1680265" data-hash="aaaa">4 серия</option></select></div>';

module.exports = { LISTING: LISTING, detailHtml: detailHtml, UVK_ESQUIRE: UVK_ESQUIRE, REAL_SRC: REAL_SRC, KODIK_PAGE: KODIK_PAGE };
