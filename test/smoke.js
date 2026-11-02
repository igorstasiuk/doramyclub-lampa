'use strict';
/*
 * Smoke-тест UI: jsdom + заглушка Lampa; сеть подменяется фикстурами (сайт за anti-bot, живых запросов нет).
 * Заглушка повторяет поведение Lampa из соседнего проекта (Storage приводит 'true'/'false', collectionFocus
 * шлёт hover:focus). jsdom не считает раскладку, реальный фокус на ТВ, нативный запрос Android и внешний
 * плеер здесь НЕ проверяются.
 */
var JSDOM = require('jsdom').JSDOM;
var fs = require('fs');
var path = require('path');
var F = require('./fixtures');

var PLUGIN = path.resolve(__dirname, '..', 'doramyclub.js');
var errors = [], pass = 0, failn = 0;

function ok(c, m) {
    if (c) { pass++; console.log('  ok  ', m); } else { failn++; console.log('  FAIL', m); }
}

var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

async function until(f, n) {
    for (var i = 0; i < (n || 80); i++) { if (f()) return true; await sleep(25); }
    return false;
}

var STUDIO_PAGE_URL = 'https://kodikplayer.com/serial/69271/81aaca2db531389e25bae791e5ff417e/720p';

// Страница Kodik для /seria/: параметры + путь скрипта плеера
function kodikSeria() {
    return "<script>var urlParams = '{\"d\":\"kodikplayer.com\",\"d_sign\":\"s1\",\"pd\":\"kodikplayer.com\",\"pd_sign\":\"s1\",\"ref\":\"\",\"ref_sign\":\"s2\"}';</script>" +
        "<script>vInfo.type = 'seria'; vInfo.hash = 'abc'; vInfo.id = '1';</script>" +
        '<script src="https://kodikplayer.com/assets/js/app.player_single.' + 'a'.repeat(64) + '.js"></script>';
}

function seasonPage(withSeries) {
    return F.KODIK_PAGE.replace(/<div class="serial-translations-box">[\s\S]*?<\/select><\/div>/, withSeries ? '' : '$&');
}

function mk(opts) {
    opts = opts || {};
    var dom = new JSDOM('<body><div class="menu"><ul class="menu__list"></ul></div></body>', { url: 'https://lampa.test/', runScripts: 'outside-only', pretendToBeVisual: true });
    var w = dom.window;
    global.window = w; global.document = w.document;
    delete require.cache[require.resolve('jquery')];
    w.$ = w.jQuery = require('jquery');
    delete global.window; delete global.document;
    w.addEventListener('error', function (e) { errors.push(e.message); });

    var S = { idb: {}, tl: [], rows: [], store: {}, comps: {}, handlers: {}, log: [], cur: '', focused: null, act: { loader: function () {}, toggle: function () {} }, pushed: [], played: [], calls: [], notes: [] };
    if (opts.proxy) S.store.doramy_proxy = opts.proxy;
    if (opts.store) for (var k in opts.store) S.store[k] = opts.store[k];

    function Scroll() {
        var el = w.$('<div class="scroll"></div>'), b = w.$('<div class="scroll__body"></div>');
        el.append(b);
        this.render = function () { return el; };
        this.body = function () { return b; };
        this.append = function (x) { b.append(x); };
        this.clear = function () { b.empty(); };
        this.update = function () {}; this.minus = function () {}; this.destroy = function () {};
    }

    w.Lampa = {
        Scroll: Scroll,
        Storage: {
            get: function (k, d) { var v = S.store[k]; if (v === undefined) v = d; if (v === 'true') return true; if (v === 'false') return false; if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10); return v === undefined ? '' : v; },
            set: function (k, v) { S.store[k] = v; }
        },
        Utils: { hash: function (s) { return 'h' + s; }, copyTextToClipboard: function () {} },
        Timeline: {
            listener: { follow: function (n, f) { S.tl.push(f); }, remove: function (n, f) { S.tl = S.tl.filter(function (x) { return x !== f; }); } },
            view: function (h) { return { hash: h, percent: S.store['p_' + h] || 0, time: S.store['t_' + h] || 0, duration: S.store['d_' + h] || 1400 }; },
            update: function (p) { S.store['p_' + p.hash] = p.percent; S.store['t_' + p.hash] = p.time; S.store['d_' + p.hash] = p.duration || 1400; }
        },
        Modal: { open: function (o) { S.modal = o; }, close: function () {} },
        Controller: {
            add: function (n, h) { S.handlers[n] = h; },
            toggle: function (n) { S.cur = n; S.log.push('toggle:' + n); if (S.handlers[n] && S.handlers[n].toggle) S.handlers[n].toggle(); },
            collectionSet: function () {},
            collectionFocus: function (el) { S.focused = el; w.$('.focus').removeClass('focus'); w.$(el).addClass('focus').trigger('hover:focus'); },
            enabled: function () { return { name: S.cur }; }
        },
        Activity: { push: function (o) { S.pushed.push(o); }, active: function () { return { activity: S.act }; }, backward: function () { S.log.push('back'); }, replace: function (o) { S.replaced = o; } },
        Player: { play: function (i) { S.played.push(i); }, playlist: function (p) { S.playlist = p; }, callback: function (c) { S.cb = c; }, runas: function () {}, listener: { follow: function () {} } },
        Select: { show: function (o) { S.sel = o; } },
        Noty: { show: function (t) { S.notes.push(t); } },
        Input: { edit: function (o, cb) { S.input = cb; } },
        Platform: { is: function (n) { return n === 'android'; }, macOS: function () { return false; } },
        SettingsApi: { addComponent: function () {}, addParam: function (p) { (S.params = S.params || []).push(p); } },
        Search: { addSource: function (s) { S.source = s; }, open: function (o) { S.searchOpen = o; } },
        Cache: {
            rewriteData: function (t, k, v) { S.idb[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
            getData: function (t, k) { return Promise.resolve(S.idb[k] || null); }
        },
        ContentRows: { add: function (r) { S.rows.push(r); } },
        Component: { add: function (n, c) { S.comps[n] = c; } },
        Listener: { follow: function () {} },
        Reguest: function () {
            this['native'] = function (u, c, e, post, opt) {
                S.calls.push({ u: u, post: post, headers: (opt && opt.headers) || {} });
                var body = route(u, post);
                setTimeout(function () { body === null ? e() : c(body); }, 1);
            };
        }
    };

    // Маршрутизатор фикстур: сайт и Kodik
    function route(u, post) {
        if (opts.dead) return null;
        var m;
        if (/wp-admin\/admin-ajax\.php/.test(u)) { S.ajax = (S.ajax || []).concat([post]); return opts.ajax !== undefined ? opts.ajax : '<li>ok</li>'; }
        if (/doramy\.club\/regs-vash-profil/.test(u)) return opts.guest ? '<html><form id="loginform"></form></html>' : '<table><tr><th class="profpart1">Логин:</th><th class="profpart2">tester</th></tr><tr><th class="profpart1">E-mail:</th><th class="profpart2">tester@example.com</th></tr></table>';
        if (/doramy\.club\/regs-favorit/.test(u)) return opts.guest ? '<html>login</html>' : '<script>var wfmFavorites = {"url":"x","nonce":"abc123","postId":"8431"};</script>' + F.LISTING.replace(/<a class="next[^>]*>[^<]*<\/a>/, '');
        if (/doramy\.club\/regs-(budu|view|zakl|broh)/.test(u)) return '<div>пусто</div>';
        if (/doramy\.club\/(1-novinki|top|serialy|filmy)(\/page\/\d+)?$/.test(u)) return F.LISTING;
        if (/doramy\.club\/?$/.test(u)) return '<a href="/genre/komediya">Комедия</a><a href="/god/2025">2025</a><a href="/strana/2-kitaj">Китай</a>';
        if (/doramy\.club\/\?s=/.test(u)) return F.LISTING;
        if (/doramy\.club\/48464-/.test(u)) return F.detailHtml(opts.player || F.UVK_ESQUIRE);
        if (/kodikplayer\.com\/assets\/js\//.test(u)) return 'var a=atob("L2Z0b3I="),b=atob("YWxsdmlkZW9tZXRyaWth");';
        if (/kodikplayer\.com\/ftor/.test(u)) return JSON.stringify({ links: { '720': [{ src: F.REAL_SRC, type: 'application/x-mpegURL' }], '360': [{ src: F.REAL_SRC, type: 'application/x-mpegURL' }] } });
        if ((m = u.match(/kodikplayer\.com\/(serial|season)\/(\d+)\//))) return m[2] === '69271' ? F.KODIK_PAGE : seasonPage(true);
        if (/kodikplayer\.com\/seria\//.test(u)) return kodikSeria();
        return null;
    }

    w.appready = true;
    w.eval(fs.readFileSync(PLUGIN, 'utf8'));
    S.w = w; S.$ = w.$;
    S.key = function (n, k) { S.handlers[n][k](); };
    return S;
}

(async function () {
    console.log('1. дашборд');
    var S = mk(), m = new S.comps.doramyclub_main({});
    m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length >= 12; }), 'карточки трёх разделов отрисованы: ' + S.$(m.render()).find('.dc-card:not(.dc-card--more)').length);
    ok(S.$(m.render()).find('.dc-card--more').length === 4, 'в каждой секции есть карточка «Все →»');
    m.start();
    ok(S.$(S.focused).hasClass('dc-card'), 'стартовый фокус на карточке');
    var walk = ['right', 'down', 'down', 'up', 'up', 'up', 'left', 'right'];
    walk.forEach(function (k) { S.key('content', k); });
    ok(S.focused !== null, 'прогулка по сетке не теряет фокус');
    S.$(S.$(m.render()).find('.dc-card--more')[0]).trigger('hover:enter');
    ok(S.pushed.length && S.pushed[S.pushed.length - 1].catalog && S.pushed[S.pushed.length - 1].catalog.path === '/1-novinki', '«Все →» открывает каталог раздела');
    S.$(S.$(m.render()).find('.dc-card:not(.dc-card--more)')[0]).trigger('hover:enter');
    ok(S.pushed[S.pushed.length - 1].component === 'doramyclub_title', 'карточка открывает страницу тайтла');
    m.destroy();

    console.log('2. нет связи (прокси недоступен)');
    S = mk({ proxy: 'http://127.0.0.1:9/?u=' }); m = new S.comps.doramyclub_main({}); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-empty').length; }, 400), 'показан экран ошибки');
    ok(/прокси/i.test(S.$(m.render()).find('.dc-empty').text()), 'текст ошибки подсказывает про прокси');
    m.start();
    ok(S.focused !== null, 'на экране ошибки есть что выбрать (кнопки панели)');
    m.destroy();

    console.log('3. каталог и поиск');
    S = mk(); m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы' } }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }), 'каталог: 3 карточки');
    ok(S.$(m.render()).find('.dc-btn--more').length === 1, 'есть «Загрузить ещё» (в фикстуре есть next)');
    m.start(); m.destroy();
    S = mk(); m = new S.comps.doramyclub_main({ query: 'корол' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }), 'поиск: карточки');
    ok(S.calls.some(function (c) { return /\/\?s=%D0%BA%D0%BE%D1%80%D0%BE%D0%BB/.test(c.u); }), 'запрос поиска ушёл на /?s=');
    m.destroy();

    console.log('4. страница тайтла: основная озвучка, субтитры, доп. озвучки с разным числом серий');
    S = mk();
    var item = { id: '48464', url: 'https://doramy.club/48464-1-eskvajr.html', title: '1 эсквайр', poster: '', orig: '' };
    var t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create();
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 3; }), 'серии основной озвучки: 3');
    t.start();
    var voiceBtn = S.$(t.render()).find('.dc-btn').filter(function () { return /^Озвучка/.test(S.$(this).text()); });
    ok(/Озвучка — LE-Production/.test(voiceBtn.text()), 'кнопка озвучки показывает основную: ' + voiceBtn.text());
    ok(await until(function () { return true; }) && await sleep(150) === undefined, 'пауза для фоновой загрузки доп. озвучек');
    voiceBtn.trigger('hover:enter');
    var titles = S.sel.items.map(function (i) { return i.title; });
    ok(S.sel.title === 'Озвучка' && titles.length === 5, 'в списке 5 вариантов (основная, субтитры, 3 доп.): ' + JSON.stringify(titles));
    ok(/LE-Production · 3 из 12 эп\./.test(titles[0]), 'у основной видно число озвученных серий');
    ok(/из 12/.test(titles[3]) || /из 12/.test(titles[2]), 'у озвучек с неполным числом серий видно «N из 12»: ' + titles.join(' | '));
    ok(S.sel.items[0].subtitle === 'основная озвучка' && S.sel.items[1].subtitle === 'субтитры' && S.sel.items[2].subtitle === 'дополнительная озвучка', 'подписи: основная / субтитры / дополнительная');
    var dub = S.sel.items.filter(function (i) { return i.other && /DubLik/.test(i.title); })[0];
    S.sel.onSelect(dub);
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 4; }), 'после выбора DubLik.Tv серий 4 (с пропуском 3-й)');
    ok(S.$(t.render()).find('.dc-ep.nolink').length === 1, 'неозвученная серия помечена и без ссылки');
    var subs = S.sel.items.filter(function (i) { return i.value === 1; })[0];
    voiceBtn.trigger('hover:enter');
    S.sel.onSelect(S.sel.items[1]);
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 4; }), 'субтитры основной вкладки: 4 серии');
    ok(/Субтитры/.test(voiceBtn.text()), 'кнопка показывает субтитры: ' + voiceBtn.text());

    console.log('5. воспроизведение: Kodik → прямая ссылка');
    S.$(S.$(t.render()).find('.dc-ep')[0]).trigger('hover:enter');
    ok(await until(function () { return S.played.length === 1; }, 200), 'плеер запущен');
    var p = S.played[0];
    ok(/solodcdn\.com\/.*manifest\.m3u8$/.test(p.url), 'прямая ссылка m3u8 (ROT+base64 расшифрован): ' + p.url);
    ok(p.quality && p.quality['720p'] && p.quality['360p'], 'есть выбор качества 720p/360p');
    var post = S.calls.filter(function (c) { return /\/ftor/.test(c.u); })[0];
    ok(post && /type=seria/.test(post.post) && /d_sign=s1/.test(post.post), 'POST на /ftor с параметрами плеера');
    ok(post && /ftor$/.test(post.u), 'путь /ftor взят из скрипта плеера (atob)');
    ok(S.playlist && S.playlist.length === 4 && typeof S.playlist[1].url === 'function' && typeof S.playlist[0].url === 'string', 'плейлист: следующие серии с ленивой url-функцией');
    ok(S.played[0].timeline && /^h/.test(S.played[0].timeline.hash), 'таймлайн привязан к серии');
    ok(S.store.doramy_state && S.store.doramy_state['48464'].last, 'история просмотра сохранена');

    console.log('6. списки');
    var listBtn = S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); });
    listBtn.trigger('hover:enter');
    S.sel.onSelect(S.sel.items[0]);
    ok(S.store.doramy_marks['48464'].fav === true && /★/.test(listBtn.text()), 'избранное сохраняется: ' + listBtn.text());
    S.$(t.render()).find('.dc-btn').filter(function () { return /^Актёры/.test(S.$(this).text()); }).trigger('hover:enter');
    ok(S.sel.items.some(function (i) { return i.path === '/akter/li-dzhin-uk'; }) && S.sel.items.some(function (i) { return i.path === '/kanal/jtbc'; }), 'меню актёров/канала/студии');
    t.destroy();


    console.log('6b. аккаунт: проверка входа, очередь, отправка на сайт');
    var CK = 'wordpress_logged_in_x=1; __jhash_=1';
    S = mk({ store: { doramy_cookie: CK, doramy_sync: { last: Date.now(), queue: [] } } });
    t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create();
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 3; }), 'страница открыта с подключённым аккаунтом');
    t.start();
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    ok(/Мои списки/.test(S.sel.title), 'меню списков');
    S.sel.onSelect(S.sel.items[0]); // избранное
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    var watching = S.sel.items.filter(function (i) { return i.status === 'watching'; })[0];
    S.sel.onSelect(watching);
    ok(S.store.doramy_sync.queue.length === 2, 'в очереди 2 операции (избранное + смотрю): ' + S.store.doramy_sync.queue.map(function (q) { return q.kind + ':' + q.op; }).join(','));
    ok(await until(function () { return S.ajax && S.ajax.length === 2; }, 200), 'после паузы обе операции отправлены на admin-ajax');
    ok(/action=wfm_add/.test(S.ajax[0]) && /postId=48464/.test(S.ajax[0]) && /security=abc123/.test(S.ajax[0]), 'избранное: wfm_add + postId + nonce: ' + S.ajax[0]);
    ok(/action=viewed_add/.test(S.ajax[1]), 'статус «Смотрю»: viewed_add: ' + S.ajax[1]);
    var ac = S.calls.filter(function (c) { return /admin-ajax/.test(c.u); })[0];
    ok(ac.headers.Cookie === CK, 'cookie сессии уходит заголовком на сайт');
    ok(!S.calls.some(function (c) { return /kodikplayer/.test(c.u) && c.headers.Cookie; }), 'cookie не уходит на Kodik');
    ok(S.store.doramy_sync.queue.length === 0, 'очередь пуста после отправки');
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    S.sel.onSelect(S.sel.items[0]); // снять избранное
    ok(await until(function () { return S.ajax.length === 3; }, 200) && /action=wfm_del/.test(S.ajax[2]), 'снятие избранного: wfm_del');
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    S.sel.onSelect(S.sel.items.filter(function (i) { return i.status === 'done'; })[0]); // смена статуса: del старого + add нового
    ok(await until(function () { return S.ajax.length === 5; }, 200) && /action=viewed_delh/.test(S.ajax[3]) && /action=zakl_add/.test(S.ajax[4]), 'смена статуса: viewed_delh → zakl_add');
    t.destroy();

    console.log('6c. аккаунт: вход и синхронизация');
    S = mk({ store: { doramy_cookie: CK, doramy_sync: { last: Date.now(), queue: [] } } });
    var prm = function (name) { return S.params.filter(function (x) { return x.param.name === name; })[0]; };
    prm('doramy_acc_check').onChange();
    ok(await until(function () { return S.notes.some(function (n) { return /Вход выполнен: tester/.test(n); }); }), 'проверка входа показывает логин');
    ok(S.store.doramy_account.login === 'tester' && JSON.stringify(S.store).indexOf('example.com') < 0, 'e-mail аккаунта не сохраняется');
    S.store.doramy_marks = { '999': { fav: true, status: '', item: { id: '999', title: 'Только в Lampa', url: 'https://doramy.club/999-x.html', poster: '' }, ts: 1 } };
    prm('doramy_sync_now').onChange();
    ok(await until(function () { return S.notes.some(function (n) { return /Синхронизировано/.test(n); }); }, 200), 'синхронизация завершилась');
    var ids = Object.keys(S.store.doramy_marks).sort();
    ok(ids.length === 4 && ids.indexOf('999') >= 0 && ids.indexOf('61469') >= 0, 'первая синхронизация — объединение: 3 с сайта + 1 локальная: ' + ids.join(','));
    ok(await until(function () { return S.ajax && S.ajax.some(function (a) { return /action=wfm_add/.test(a) && /postId=999/.test(a); }); }, 200), 'локальная дорама добавлена на сайт');
    ok(S.store.doramy_sync.init === true && S.store.doramy_sync.queue.length === 0, 'флаг первой синхронизации и пустая очередь');
    ok(S.store.doramy_marks['61469'].fav === true && S.store.doramy_marks['61469'].item.title === 'Бог меча', 'карточки с сайта сохранены с названием');

    console.log('6d. аккаунт: сессия не принята — списки не трогаем');
    S = mk({ store: { doramy_cookie: CK, doramy_marks: { '5': { fav: true, status: '', item: { id: '5', title: 'x' }, ts: 1 } }, doramy_sync: { init: true, last: Date.now(), queue: [] } }, guest: true });
    prm = function (name) { return S.params.filter(function (x) { return x.param.name === name; })[0]; };
    prm('doramy_sync_now').onChange();
    ok(await until(function () { return S.notes.some(function (n) { return /Сессия не принята/.test(n); }); }), 'понятная ошибка про сессию');
    ok(Object.keys(S.store.doramy_marks).length === 1, 'локальные списки не стёрты при неудачной сессии');

    console.log('6e. аккаунт: nonce отклонён (-1) → обновляется и повторяется');
    S = mk({ store: { doramy_cookie: CK, doramy_sync: { last: Date.now(), queue: [{ id: '7', kind: 'fav', op: 'add', ts: 1, tries: 0 }] } }, ajax: '-1' });
    S.w.Lampa.Storage.set('doramy_sync', { last: Date.now(), queue: [{ id: '7', kind: 'fav', op: 'add', ts: 1, tries: 0 }] });
    var before = S.calls.length;
    prm = function (name) { return S.params.filter(function (x) { return x.param.name === name; })[0]; };
    prm('doramy_sync_now').onChange();
    await sleep(600);
    ok(S.calls.filter(function (c) { return /regs-favorit/.test(c.u); }).length >= 2, 'nonce запрошен повторно после -1');
    ok(S.store.doramy_sync && S.store.doramy_sync.queue.length === 1 && S.store.doramy_sync.queue[0].tries === 1, 'операция осталась в очереди (tries=1) для повтора');

    console.log('6f. без аккаунта очередь не копится');
    S = mk();
    t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create();
    await until(function () { return S.$(t.render()).find('.dc-ep').length === 3; });
    t.start();
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    S.sel.onSelect(S.sel.items[0]);
    ok(S.store.doramy_marks['48464'].fav === true && !(S.store.doramy_sync && S.store.doramy_sync.queue && S.store.doramy_sync.queue.length), 'локальная отметка есть, очереди нет');
    t.destroy();

    console.log('7. только субтитры');
    var onlySubs = '<div class="player"><script> uvk.show([\n\'Озвучка\',\'Субтитры\',],[\n[],["kodikplayer.com%2Fseria%2F7%2Fbbb%2F720p","kodikplayer.com%2Fseria%2F8%2Fccc%2F720p",],]);</script></div>';
    S = mk({ player: onlySubs }); t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create();
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 2; }), 'открылся единственный вариант — субтитры (2 серии)');
    ok(/Озвучка: Субтитры/.test(S.$(t.render()).find('.dc-btn:contains("Озвучка")').text()), 'подпись: Субтитры');
    t.destroy();

    console.log('8. уничтожение страницы во время загрузки + мёртвая сеть на тайтле');
    S = mk(); t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create(); t.destroy(); await sleep(300);
    ok(errors.length === 0, 'нет JS-ошибок после destroy');
    S = mk({ dead: true, proxy: 'http://127.0.0.1:9/?u=' }); t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create();
    ok(await until(function () { return S.$(t.render()).find('.dc-empty').length; }, 400), 'экран ошибки тайтла');
    t.start();
    ok(S.$(S.focused).text() === 'Повторить', 'фокус на «Повторить»: ' + S.$(S.focused).text());
    t.destroy();

    console.log('9. регистрация: меню, настройки, поиск, ряды');
    S = mk();
    ok(S.$('.menu__list [data-action="doramyclub"]').length === 1, 'пункт меню добавлен');
    ok(S.params && S.params.length >= 14, 'настройки зарегистрированы');
    ok(S.source && S.source.title === 'Doramy.club', 'источник глобального поиска');
    ok(S.rows.length === 2, 'ряды главного экрана');

    console.log('\n' + pass + ' ok, ' + failn + ' fail' + (errors.length ? ', JS errors: ' + errors.join('; ') : ''));
    process.exit(failn || errors.length ? 1 : 0);
})().catch(function (e) { console.log('CRASH', e && e.stack || e); process.exit(1); });
