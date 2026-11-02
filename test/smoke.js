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

    var S = { idb: opts.idb || {}, tl: [], rows: [], store: {}, comps: {}, handlers: {}, log: [], cur: '', focused: null, act: { loader: function () {}, toggle: function () {} }, pushed: [], played: [], calls: [], notes: [] };
    S.store.doramy_gap = '0';
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
            set: function (k, v) { S.store[k] = v; },
            sync: function (name, type) { (S.synced = S.synced || []).push(name + ':' + type); },
            clean: function (name) { (S.cleaned = S.cleaned || []).push(name); }
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
        TMDB: { api: function (u) { return 'https://tmdb.test/3/' + u; }, key: function () { return 'K'; } },
        Listener: { follow: function (n, f) { (S.listeners = S.listeners || {})[n] = f; } },
        Reguest: function () {
            this.silent = function (u, c) {
                S.calls.push({ u: u, tmdb: true });
                setTimeout(function () { c({ results: [{ id: 555, name: 'Esquire', first_air_date: '2024-03-01' }, { id: 556, name: 'Other', first_air_date: '2010-01-01' }] }); }, 1);
            };
            this['native'] = function (u, c, e, post, opt) {
                S.calls.push({ u: u, post: post, headers: (opt && opt.headers) || {}, t: Date.now() });
                var body = route(u, post, (opt && opt.headers) || {});
                setTimeout(function () { body === null ? e() : c(body); }, 1);
            };
        }
    };

    // Маршрутизатор фикстур: сайт и Kodik
    var pad = '<!--' + new Array(700).join('x') + '-->';
    var CHALLENGE = '<html><head><meta name="robots" content="noindex"></head><body><script>function get_jhash(b){return 1} var c = get_param("__js_p_", "int", 0);</script></body></html>';
    function route(u, post, headers) {
        if (opts.dead) return null;
        var hm = u.match(/192\.168\.1\.5:8765\/cookie\?code=(\d+)/);
        if (hm) return hm[1] === '123456' ? JSON.stringify({ cookie: 'wordpress_logged_in_x=1; __jhash_=7; __jua_=Mozilla%2F5.0%20Helper', ua: 'Mozilla/5.0 Helper', ts: 1 }) : null;
        if (opts.gate && /doramy\.club/.test(u) && (headers.Cookie || '').indexOf('__jhash_') < 0) return CHALLENGE;
        var m;
        if (/wp-admin\/admin-ajax\.php/.test(u)) {
            if (/action=fast_ajax_search_akters/.test(u)) return F.FAST_AKTERS;
            if (post && /action=gid_action/.test(post)) { S.ajax = (S.ajax || []).concat([post]); return F.GID_ALL; }
            if (post && /action=rand_posts/.test(post)) { S.rand = (S.rand || []).concat([post]); return F.RAND_RESPONSE; }
            if (post) S.ajax = (S.ajax || []).concat([post]);
            return opts.ajax !== undefined ? opts.ajax : '<li>ok</li>';
        }
        if (opts.deadMain && /doramy\.club/.test(u)) return null;
        if (/mirror\.example\/(serialy|1-novinki)/.test(u)) return F.LISTING;
        if (/doramy\.club\/regs-vash-profil/.test(u)) return opts.guest ? '<html><form id="loginform"></form></html>' : '<table><tr><th class="profpart1">Логин:</th><th class="profpart2">tester</th></tr><tr><th class="profpart1">E-mail:</th><th class="profpart2">tester@example.com</th></tr></table>';
        if (/doramy\.club\/regs-favorit/.test(u)) return opts.guest ? '<html>login</html>' : '<script>var wfmFavorites = {"url":"x","nonce":"abc123","postId":"8431"};</script>' + F.LISTING.replace(/<a class="next[^>]*>[^<]*<\/a>/, '');
        if (/doramy\.club\/regs-(budu|view|zakl|broh)/.test(u)) return '<div>пусто</div>';
        if (/doramy\.club\/(1-novinki|top|serialy|filmy)(\/page\/\d+)?$/.test(u)) return F.LISTING;
        if (/doramy\.club\/(page\/\d+)?$/.test(u)) return '<script>var sea_ajax = {"url":"x","nonce":"beef02"};</script><a href="/genre/komediya">Комедия</a><a href="/god/2025">2025</a><a href="/strana/2-kitaj">Китай</a>' + F.CAROU + F.ACTOR_PAGE.replace(/^[\s\S]*?(<section class="post-list">)/, '$1') + (opts.homeExtra || '') + pad;
        if (/doramy\.club\/rand-cl/.test(u)) return '<script>var rand_obj = {"a_url":"x","nonce":"dead01"}</script>' + pad;
        if (/doramy\.club\/podborki-luchshix-doram/.test(u)) return F.PODBORKI + pad;
        if (/doramy\.club\/aktery(\?|$)/.test(u)) return F.AKTERY_BORN + pad;
        if (/doramy\.club\/aktery-top/.test(u)) return F.AKTERY_TOP + pad;
        if (/doramy\.club\/akter\//.test(u)) return F.ACTOR_PAGE + pad;
        if (/doramy\.club\/navi-cl/.test(u)) return F.LISTING;
        if (/doramy\.club\/\?s=/.test(u)) return F.LISTING;
        if (/doramy\.club\/48464-/.test(u)) return F.detailHtml(opts.player || F.UVK_ESQUIRE) + (opts.extra || '');
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
    ok(await until(function () { return S.$(m.render()).find('.dc-row').last().find('.dc-card').length === 3; }), 'поиск: карточки (последний раздел — найденные дорамы)');
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
    ok(await until(function () { return S.store.doramy_sync.queue.length === 0; }, 200), 'очередь пуста после отправки и подтверждения состояния');
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    S.sel.onSelect(S.sel.items[0]); // снять избранное
    ok(await until(function () { return S.ajax.length === 3; }, 200) && /action=wfm_del/.test(S.ajax[2]), 'снятие избранного: wfm_del');
    S.$(t.render()).find('.dc-btn').filter(function () { return /^В списки/.test(S.$(this).text()); }).trigger('hover:enter');
    S.sel.onSelect(S.sel.items.filter(function (i) { return i.status === 'done'; })[0]); // смена статуса: del старого + add нового
    ok(await until(function () { return S.ajax.length === 5; }, 200) && /action=viewed_del/.test(S.ajax[3]) && /action=zakl_add/.test(S.ajax[4]), 'смена статуса: viewed_del → zakl_add');
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

    console.log('6g. cookie: заглушка, вставка, UA, перенос через CUB');
    S = mk({ gate: true });
    m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы' } }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-empty').length; }, 200), 'заглушка проверки браузера без cookie — экран ошибки');
    ok(/проверку браузера/.test(S.$(m.render()).find('.dc-empty').text()), 'текст ошибки про проверку браузера');
    m.start();
    ok(S.focused !== null, 'на экране ошибки есть что выбрать');
    m.destroy();
    S = mk({ gate: true, store: { doramy_cookie: 'wordpress_logged_in_x=1; __jhash_=7' } });
    m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы' } }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }, 200), 'с cookie, прошедшей проверку, каталог загружается');
    m.destroy();

    S = mk({ store: { doramy_cookie: 'wordpress_logged_in_x=1; __jua_=' + encodeURIComponent('Mozilla/5.0 Mine') } });
    m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы' } }); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length === 3; });
    ok(/Windows NT/.test(S.calls.filter(function (c) { return /doramy\.club\/serialy/.test(c.u); })[0].headers['User-Agent']), 'по умолчанию UA плагина, UA из cookie не подставляется');
    m.destroy();
    S = mk({ store: { doramy_cookie: 'wordpress_logged_in_x=1; __jua_=' + encodeURIComponent('Mozilla/5.0 Mine'), doramy_use_cookie_ua: 'true' } });
    m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы' } }); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length === 3; });
    ok(S.calls.filter(function (c) { return /doramy\.club\/serialy/.test(c.u); })[0].headers['User-Agent'] === 'Mozilla/5.0 Mine', 'по явной настройке UA берётся из cookie');
    ok(S.calls.filter(function (c) { return /kodik/.test(c.u); }).every(function (c) { return c.headers['User-Agent'] !== 'Mozilla/5.0 Mine'; }), 'Kodik UA из cookie не получает');
    m.destroy();

    S = mk();
    S.w.navigator.clipboard = { readText: function () { return Promise.resolve('Cookie: wordpress_logged_in_x=AAA;\n__jhash_=7'); } };
    S.params.filter(function (x) { return x.param.name === 'doramy_cookie_paste'; })[0].onChange();
    ok(await until(function () { return S.store.doramy_cookie === 'wordpress_logged_in_x=AAA; __jhash_=7'; }), 'вставка из буфера обмена нормализуется (префикс Cookie:, перевод строки)');
    ok(S.notes.some(function (n) { return /Cookie вставлена \(2 шт\.\)/.test(n); }), 'сообщение о числе cookie');
    S = mk();
    S.params.filter(function (x) { return x.param.name === 'doramy_cookie_paste'; })[0].onChange();
    ok(S.notes.some(function (n) { return /Буфер обмена недоступен/.test(n); }), 'нет буфера обмена — подсказка про помощника');
    // перенос через CUB (Storage.sync): по умолчанию выключен; включённый — регистрирует ключи и подтягивает cookie на новом устройстве
    S = mk();
    ok(!S.synced || S.synced.length === 0, 'по умолчанию ключи в синхронизацию Lampa не регистрируются');
    S = mk({ store: { doramy_cub_lists: 'true' } });
    ok(S.synced && S.synced.indexOf('doramy_marks:object_object') >= 0 && S.synced.indexOf('doramy_state:object_object') >= 0 && S.synced.indexOf('doramy_cred:object_object') < 0, 'переключатель списков регистрирует только историю и списки');
    S = mk({ store: { doramy_cub_cookie: 'true', doramy_cookie: 'wordpress_logged_in_x=MAC', doramy_cookie_ts: 100 } });
    ok(S.synced.indexOf('doramy_cred:object_object') >= 0 && S.store.doramy_cred.cookie.v === 'wordpress_logged_in_x=MAC', 'устройство с cookie кладёт её в синхронизируемый ключ');
    S = mk({ store: { doramy_cub_cookie: 'true', doramy_cred: { cookie: { v: 'wordpress_logged_in_x=FROM_CUB', ts: 500 } } } });
    ok(S.store.doramy_cookie === 'wordpress_logged_in_x=FROM_CUB', 'новое устройство без cookie забирает её из синхронизации');
    S = mk({ store: { doramy_cub_cookie: 'true', doramy_cookie: 'wordpress_logged_in_x=NEW', doramy_cookie_ts: 900, doramy_cred: { cookie: { v: 'wordpress_logged_in_x=OLD', ts: 100 } } } });
    ok(S.store.doramy_cookie === 'wordpress_logged_in_x=NEW' && S.store.doramy_cred.cookie.v === 'wordpress_logged_in_x=NEW', 'более новая локальная cookie побеждает и обновляет облачную');
    S = mk({ store: { doramy_cub_cookie: 'false', doramy_cred: { cookie: { v: 'X', ts: 1 } } } });
    S.params.filter(function (x) { return x.param.name === 'doramy_cub_cookie'; })[0].onChange();
    ok(S.cleaned && S.cleaned.indexOf('doramy_cred') >= 0 && !S.store.doramy_cred.cookie, 'выключение переноса стирает cookie из облака');

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

    console.log('10. каталог: фильтр как на сайте, рандом, подборки, актёры, страна');
    var sel = function (S, pred) { return S.sel.items.filter(pred)[0]; };
    var btn = function (S, c, re) { return S.$(c.render()).find('.dc-btn').filter(function () { return re.test(S.$(this).text()); }); };
    S = mk(); m = new S.comps.doramyclub_main({}); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length >= 12; }, 200), 'дашборд с рядом «Популярное сейчас»');
    ok(S.$(m.render()).find('.dc-row__title').first().text() === 'Популярное сейчас', 'первый ряд — популярное (карусель главной)');
    m.start();
    btn(S, m, /^Каталог/).trigger('hover:enter');
    ok(await until(function () { return S.sel && S.sel.title === 'Каталог'; }, 100), 'меню каталога открылось');
    var titles = S.sel.items.map(function (i) { return i.title; });
    ok(['Фильтр (как на сайте)', 'Случайная дорама', 'Подборки', 'Расписание', 'Популярные актёры', 'Русские субтитры', 'Лакорны', 'Каналы ▸'].every(function (x) { return titles.indexOf(x) >= 0; }), 'в каталоге есть фильтр, рандом, подборки, расписание, актёры, перевод, лакорны, каналы');
    S.sel.onSelect(sel(S, function (i) { return i.special === 'navi'; }));
    await sleep(150);
    ok(S.sel.title === 'Фильтр (как на сайте)' && S.sel.items.length === 13, 'экран фильтра: 11 параметров + «показать» + «сбросить»');
    S.sel.onSelect(sel(S, function (i) { return i.k === 'razdel'; }));
    await sleep(150);
    S.sel.onSelect(sel(S, function (i) { return i.value === 'serialy'; }));
    await sleep(150);
    S.sel.onSelect(sel(S, function (i) { return i.k === 'sortRating'; }));
    await sleep(150);
    S.sel.onSelect(sel(S, function (i) { return i.k === 'genres'; }));
    await sleep(150);
    ok(S.sel.items.every(function (i) { return i.checkbox; }) && S.sel.items.length === 18, 'жанры — мультивыбор из 18 с чекбоксами');
    var myst = sel(S, function (i) { return i.value === '35'; });
    myst.checked = true; S.sel.onCheck(myst);
    S.sel.onBack();
    await sleep(150);
    ok(/Жанры: Мистика/.test(sel(S, function (i) { return i.k === 'genres'; }).title) && /да/.test(sel(S, function (i) { return i.k === 'sortRating'; }).title), 'выбор запомнился в меню фильтра');
    S.sel.onSelect(sel(S, function (i) { return i.go; }));
    var pushedNavi = S.pushed[S.pushed.length - 1];
    ok(pushedNavi.catalog.path === '/navi-cl' && pushedNavi.catalog.query === 'razdel=serialy&tag_zhanr%5B%5D=35&sort_rai=ratings', 'результаты фильтра: /navi-cl + query: ' + pushedNavi.catalog.query);
    ok(JSON.stringify(S.store.doramy_navi.genres) === '["35"]', 'фильтр сохранён для следующего раза');
    m.destroy();

    var nm = new S.comps.doramyclub_main({ catalog: pushedNavi.catalog }); nm.activity = S.act; nm.create();
    ok(await until(function () { return S.$(nm.render()).find('.dc-card').length === 3; }, 100), 'экран результатов фильтра отрисован');
    ok(S.calls.some(function (c) { return /\/navi-cl\?razdel=serialy&tag_zhanr%5B%5D=35&sort_rai=ratings$/.test(c.u); }), 'запрос на /navi-cl с параметрами');
    nm.start(); btn(S, nm, /Загрузить ещё/).trigger('hover:enter');
    ok(await until(function () { return S.calls.some(function (c) { return /\/navi-cl\/page\/2\?razdel=serialy/.test(c.u); }); }, 100), 'пагинация собирается самим плагином: /navi-cl/page/2?... (без «#038;»)');
    nm.destroy();

    S = mk(); m = new S.comps.doramyclub_main({}); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length >= 12; }, 200); m.start();
    btn(S, m, /^Случайная/).trigger('hover:enter');
    ok(await until(function () { return S.sel && /Восемнадцать/.test(S.sel.title); }, 200), 'случайная дорама найдена и показана');
    ok(S.rand.length === 1 && /action=rand_posts/.test(S.rand[0]) && /security=dead01/.test(S.rand[0]), 'POST rand_posts с nonce со страницы /rand-cl');
    ok(/Южная Корея/.test(S.sel.items[0].subtitle) && /8\.9/.test(S.sel.items[0].subtitle), 'подпись: страна, число серий, рейтинг');
    S.sel.onSelect(sel(S, function (i) { return i.act === 'info'; }));
    ok(S.modal && /Восемнадцать/.test(S.modal.title) && /Главные роли: Син Йе Ын/.test(S.modal.html.text()), 'описание и главные роли');
    S.sel = null;
    btn(S, m, /^Случайная/).trigger('hover:enter');
    await until(function () { return S.sel; }, 100);
    S.sel.onSelect(sel(S, function (i) { return i.act === 'open'; }));
    ok(S.pushed[S.pushed.length - 1].item.id === '8973', 'кнопка «Открыть» ведёт на страницу тайтла');
    m.destroy();

    S = mk(); m = new S.comps.doramyclub_main({ mode: 'podborki' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 2; }, 100), 'экран подборок: 2 обложки');
    m.start(); S.$(S.$(m.render()).find('.dc-card')[0]).trigger('hover:enter');
    ok(S.pushed[S.pushed.length - 1].catalog.path === '/razdel/doramy-pro-izmenu-v-otnosheniyax', 'подборка открывает каталог раздела');
    m.destroy();

    S = mk(); m = new S.comps.doramyclub_main({ mode: 'actorsTop' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 2; }, 100), 'популярные актёры: 2 карточки');
    m.start(); S.$(S.$(m.render()).find('.dc-card')[1]).trigger('hover:enter');
    ok(S.pushed[S.pushed.length - 1].catalog.path === '/akter/1-son-kan', 'актёр открывает его каталог');
    m.destroy();

    S = mk(); m = new S.comps.doramyclub_main({ mode: 'born' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 2; }, 100), 'сегодня родились: 2 карточки');
    ok(/02\.11\.1987/.test(S.$(m.render()).text()), 'сегодня родились: дата рождения на карточке');
    m.destroy();

    S = mk(); m = new S.comps.doramyclub_main({ catalog: { path: '/akter/kim-yu-chzhon', title: 'Ким Ю Чжон', query: '' } }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-actor').length === 1; }, 100), 'шапка актёра');
    ok(/Рост: 165 см/.test(S.$(m.render()).find('.dc-actor').text()) && /Ким Ю Чжон \(1999\)/.test(S.$(m.render()).find('.dc-actor').text()), 'факты актёра: рост, имя');
    ok(/Главная роль/.test(S.$(m.render()).find('.dc-card__sub').text()), 'бейдж «Главная роль» на карточке');
    m.start(); btn(S, m, /Роли: все/).trigger('hover:enter');
    ok(S.replaced && S.replaced.catalog.query === 'akter_role=main', 'переключатель «только главные роли»: ?akter_role=main');
    m.destroy();

    S = mk(); m = new S.comps.doramyclub_main({ query: 'Ким Ю' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-row__title').length === 2; }, 100), 'в поиске два раздела: актёры и дорамы');
    ok(S.$(m.render()).find('.dc-row__title').first().text() === 'Актёры' && S.$(m.render()).find('.dc-row').first().find('.dc-card').length === 2, 'актёры найдены через быстрый поиск сайта');
    ok(S.calls.some(function (c) { return /action=fast_ajax_search_akters/.test(c.u) && /security=beef02/.test(c.u); }), 'запрос с nonce sea_ajax');
    m.destroy();

    S = mk(); m = new S.comps.doramyclub_main({ catalog: { path: '/genre/komediya', title: 'Жанр: Комедия', query: '' } }); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }, 100); m.start();
    btn(S, m, /Страна: Все страны/).trigger('hover:enter');
    S.sel.onSelect(sel(S, function (i) { return i.value === 'koreya'; }));
    ok(S.replaced.catalog.query === 'st_strana=koreya', 'фильтр страны в жанре: ?st_strana=koreya');
    m.destroy();
    S = mk(); m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы', query: '' } }); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }, 100);
    ok(btn(S, m, /^Страна/).length === 0, 'у разделов без поддержки страны кнопки «Страна» нет');
    m.destroy();

    console.log('11. новые серии и расписание');
    var home48464 = '<section class="post-list"> <div class="img-link"> <a href="https://doramy.club/48464-1-eskvajr.html"><img src="https://doramy.club/wp-content/uploads/2024/01/1-eskvajr-340x470.jpg" alt="" /><span>1 эсквайр</span></a> </div> <em>Esquire</em><table> <tbody> <tr><td><u>Южная Корея, 2024</u></td></tr> <tr><td><u>Драма</u></td></tr> </tbody> </table> <table class="table-hom"> <tbody class="tbody-hom"> <tr><td colspan="2"><span class="i1">Сериал: </span>12 серий</td></tr><tr><td colspan="2"><span class="i1">Озвучка:</span><i class="s2"><b>5</b> серия</i></td></tr><tr><td colspan="2"><span class="i1">Субтитры:</span><i class="s2"><b>6</b> серия</i></td></tr></tbody> </table> <div class="status">Выходит</div></section>';
    var st48464 = { id: '48464', url: 'https://doramy.club/48464-1-eskvajr.html', title: '1 эсквайр', orig: 'Esquire', poster: '', year: 2024, country: 'Южная Корея', last: 1, lastName: '1 серия', idx: 0, count: 12, ts: 5 };
    S = mk({ homeExtra: home48464, store: { doramy_state: { '48464': st48464 }, doramy_epseen: { '48464': { v: 3, s: 6 } } } });
    m = new S.comps.doramyclub_main({}); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-row__title').filter(function () { return /Вышли новые серии/.test(S.$(this).text()); }).length === 1; }, 200), 'на дашборде появился ряд «Вышли новые серии»');
    ok(/\+2 оз\./.test(S.$(m.render()).find('.dc-card__badge').filter(function () { return /\+/.test(S.$(this).text()); }).first().text()), 'бейдж «+2 оз.» (было 3, стало 5)');
    ok(S.store.doramy_news['48464'].dv === 2 && S.store.doramy_news['48464'].ds === 0, 'новость сохранена: озвучка +2, субтитры без изменений');
    ok(S.calls.filter(function (c) { return /doramy\.club\/(page\/\d)?$/.test(c.u); }).length === 3, 'прочитаны 3 страницы ленты (лента + page/2 + page/3)');
    m.destroy();
    var nn = new S.comps.doramyclub_main({ mode: 'news' }); nn.activity = S.act; nn.create();
    ok(await until(function () { return S.$(nn.render()).find('.dc-card').length === 1; }, 100), 'экран «Новые серии»');
    nn.destroy();
    var tt = new S.comps.doramyclub_title({ item: { id: '48464', url: 'https://doramy.club/48464-1-eskvajr.html', title: '1 эсквайр', poster: '', orig: 'Esquire' } }); tt.activity = S.act; tt.create();
    await until(function () { return S.$(tt.render()).find('.dc-ep').length === 3; }, 100);
    ok(!S.store.doramy_news['48464'] && S.store.doramy_epseen['48464'].v === 8, 'открытие страницы тайтла гасит новость и обновляет «увиденное»');
    ok(S.store.doramy_schedule['48464'] && S.store.doramy_schedule['48464'].days[0] === 5, 'расписание сохранено: суббота (из текста сайта)');
    tt.destroy();

    S = mk({ store: { doramy_marks: { '48464': { fav: false, status: 'watching', item: { id: '48464', url: 'https://doramy.club/48464-1-eskvajr.html', title: '1 эсквайр', poster: '' }, ts: 1 } } } });
    m = new S.comps.doramyclub_main({ mode: 'schedule' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-row__title').length >= 1; }, 150), 'экран расписания построен по дорамам «Смотрю»');
    ok(S.$(m.render()).find('.dc-row__title').filter(function () { return /Суббота/.test(S.$(this).text()); }).length === 1 && S.$(m.render()).find('.dc-card').length === 1, 'дорама стоит в дне «Суббота»');
    m.destroy();
    S = mk(); m = new S.comps.doramyclub_main({ mode: 'schedule' }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-empty').length; }, 100) && /Расписание пусто/.test(S.$(m.render()).find('.dc-empty').text()), 'пустое расписание объясняет, как его наполнить');
    m.start(); ok(S.focused !== null, 'на пустом расписании есть что выбрать');
    m.destroy();
    S = mk({ store: { doramy_news_on: 'false', doramy_state: { '48464': st48464 } }, homeExtra: home48464 });
    m = new S.comps.doramyclub_main({}); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length >= 12; }, 200); await sleep(300);
    ok(!S.store.doramy_news, 'при выключенной проверке новости не собираются');
    m.destroy();

    console.log('12. страница тайтла: заставка, TMDB, отзывы, «В ролях», подборки, Автоперевод');
    var EXTRA = '<meta property="og:image" content="https://doramy.club/wp-content/uploads/2024/01/hd.jpg"><span itemprop="ratingCount">2&nbsp;996</span><script>var wfmFavorites = {"url":"x","nonce":"ab77","postId":"48464"};</script><div class="list-com">Все комментарии</div><ul class="podbor-s"><li><a href="https://doramy.club/razdel/doramy-pro-shkolu"><img src="/x.jpg" alt="Дорамы про школу"></a></li></ul>' + F.COMMENTS_HTML;
    var itemO = { id: '48464', url: 'https://doramy.club/48464-1-eskvajr.html', title: '1 эсквайр', poster: '', orig: 'Esquire' };
    S = mk({ extra: EXTRA, store: { doramy_sync: { last: Date.now() } } });
    t = new S.comps.doramyclub_title({ item: itemO }); t.activity = S.act; t.create();
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 3; }, 100), 'страница с расширенной разметкой');
    t.start();
    ok(S.$(t.render()).find('.dc-title__rate').text() === '9.7 · 2996 оц.', 'рейтинг с числом оценок: ' + S.$(t.render()).find('.dc-title__rate').text());
    ok(S.$(t.render()).find('.dc-title__poster img').attr('src') === 'https://doramy.club/wp-content/uploads/2024/01/hd.jpg', 'постер — HD из og:image');
    ok(S.$(t.render()).find('.dc-row--sim').first().find('.dc-sim').length === 2 && /В ролях/.test(S.$(t.render()).find('.dc-row--sim .dc-row__title').first().text()), 'ряд «В ролях» с актёрами (2)');
    S.$(S.$(t.render()).find('.dc-row--sim').first().find('.dc-sim')[0]).trigger('hover:enter');
    ok(S.pushed[S.pushed.length - 1].catalog.path === '/akter/li-dzhin-uk', 'актёр из «В ролях» открывает его каталог');
    btn(S, t, /^Подборки/).trigger('hover:enter');
    ok(S.sel.items[0].path === '/razdel/doramy-pro-shkolu', 'кнопка «Подборки» ведёт в раздел');
    btn(S, t, /^Отзывы \(2\)/).trigger('hover:enter');
    ok(/Отзывы/.test(S.modal.title) && /спойлеры/.test(S.modal.html.text()) && /ZHDS/.test(S.modal.html.text()) && /закрыты/.test(S.modal.html.text()), 'отзывы: спойлер-предупреждение, текст, «закрыты»');
    S.modal = null; S.ajax = [];
    btn(S, t, /^Все отзывы/).trigger('hover:enter');
    ok(await until(function () { return S.modal && /Lenart/.test(S.modal.html.text()); }, 200), 'все отзывы: gid_action, три отзыва в окне');
    ok(S.ajax.length === 1 && /security=ab77/.test(S.ajax[0]) && /action=gid_action/.test(S.ajax[0]) && /postId=48464/.test(S.ajax[0]), 'все отзывы: nonce берётся со страницы тайтла');
    btn(S, t, /^Карточка Lampa/).trigger('hover:enter');
    ok(await until(function () { return S.pushed[S.pushed.length - 1].component === 'full'; }, 100), 'TMDB: открыта полная карточка Lampa');
    var full = S.pushed[S.pushed.length - 1];
    ok(full.id === 555 && full.method === 'tv' && full.source === 'tmdb', 'выбран TMDB 555 по совпадению года (2024), а не первый попавшийся: ' + full.id);
    ok(S.calls.some(function (c) { return c.tmdb && /query=Esquire/.test(c.u) && /first_air_date_year=2024/.test(c.u); }), 'поиск TMDB по оригинальному названию + год');
    ok(S.store.doramy_tmdb['48464'].id === 555, 'совпадение закешировано');
    // метка заставки → segments в плеере
    S.$(S.$(t.render()).find('.dc-ep')[0]).trigger('hover:long');
    var skipItem = sel(S, function (i) { return /Задать пропуск заставки/.test(i.title); });
    ok(!!skipItem, 'в меню серии есть «Задать пропуск заставки…»');
    S.sel.onSelect(skipItem);
    ok(typeof S.input === 'function', 'открыт ввод времени');
    S.input('bad'); ok(S.notes.some(function (n) { return /Формат: мм:сс/.test(n); }), 'неверный формат отклонён');
    S.input('1:30-2:45');
    ok(JSON.stringify(S.store.doramy_skip['48464:Озвучка — LE-Production']) === '{"start":90,"end":165}', 'метка сохранена на тайтл и озвучку');
    S.$(S.$(t.render()).find('.dc-ep')[0]).trigger('hover:enter');
    ok(await until(function () { return S.played.length === 1; }, 200), 'серия запущена');
    ok(S.played[0].segments && S.played[0].segments.skip[0].start === 90 && S.played[0].segments.skip[0].end === 165 && S.playlist[0].segments, 'в плеер передан segments.skip (Lampa покажет «Пропустить»)');
    S.cb && S.cb();
    t.destroy();

    var AUTO = '<div class="player"><script> uvk.show([\n\'Автоперевод\',],[\n["kodikplayer.com%2Fserial%2F69271%2F81aaca2db531389e25bae791e5ff417e%2F720p",],]);</script></div>';
    S = mk({ player: AUTO });
    t = new S.comps.doramyclub_title({ item: item }); t.activity = S.act; t.create();
    ok(await until(function () { return S.$(t.render()).find('.dc-ep').length === 4; }, 150), '«Автоперевод» раскрыт в список серий Kodik (4 с пропуском)');
    ok(S.$(t.render()).find('.dc-ep.nolink').length === 1, 'неозвученная серия помечена');
    t.destroy();

    console.log('13. зеркала, офлайн-кеш, пауза между запросами');
    S = mk({ deadMain: true, store: { doramy_mirrors: 'https://mirror.example', doramy_cookie: 'wordpress_logged_in_x=SECRET' } });
    m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы', query: '' } }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }, 200), 'основной адрес не отвечает — каталог загружен с зеркала');
    ok(S.calls.some(function (c) { return /mirror\.example\/serialy/.test(c.u); }), 'запрос ушёл на зеркало');
    ok(S.calls.filter(function (c) { return /mirror\.example/.test(c.u); }).every(function (c) { return !c.headers.Cookie; }), 'cookie аккаунта на зеркало не отправляется');
    ok(S.calls.filter(function (c) { return /^https:\/\/doramy\.club/.test(c.u); }).every(function (c) { return c.headers.Cookie; }), 'на основной адрес cookie отправляется');
    m.destroy();

    var shared = {};
    S = mk({ idb: shared }); m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы', query: '' } }); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }, 100); await sleep(80);
    ok(Object.keys(shared).some(function (k) { return /^doramy_pg_/.test(k) && shared[k].html; }), 'страница сохранена в офлайн-кеш (IndexedDB)');
    m.destroy();
    S = mk({ idb: shared, proxy: 'http://127.0.0.1:9/?u=' }); m = new S.comps.doramyclub_main({ catalog: { path: '/serialy', title: 'Сериалы', query: '' } }); m.activity = S.act; m.create();
    ok(await until(function () { return S.$(m.render()).find('.dc-card').length === 3; }, 300), 'без сети страница показана из офлайн-кеша');
    ok(S.notes.some(function (n) { return /офлайн-кеш/.test(n); }), 'пользователю сказано, что это офлайн-кеш');
    m.destroy();

    S = mk({ store: { doramy_gap: '300' } }); m = new S.comps.doramyclub_main({}); m.activity = S.act; m.create();
    await until(function () { return S.$(m.render()).find('.dc-card').length >= 12; }, 400);
    var times = S.calls.filter(function (c) { return /doramy\.club/.test(c.u); }).map(function (c) { return c.t; }).sort(function (a, b) { return a - b; });
    var gaps = []; for (var gi = 1; gi < times.length; gi++) gaps.push(times[gi] - times[gi - 1]);
    ok(times.length >= 5 && gaps.every(function (g) { return g >= 250; }), 'между стартами запросов к сайту пауза ≥ 250 мс при настройке 300: ' + gaps.join(','));
    m.destroy();

    console.log('9. регистрация: меню, настройки, поиск, ряды');
    S = mk();
    ok(S.$('.menu__list [data-action="doramyclub"]').length === 1, 'пункт меню добавлен');
    ok(S.params && S.params.length >= 14, 'настройки зарегистрированы');
    ok(S.source && S.source.title === 'Doramy.club', 'источник глобального поиска');
    ok(S.rows.length === 5, 'ряды главного экрана (продолжить, избранное, новые серии, смотрю, родились)');
    await (async function () {
        var row = null;
        S.rows.forEach(function (r) { if (r.name === 'doramyclub_born') row = r; });
        var fn = row && row.call({}, 'main'), got = null;
        if (fn) fn(function (d) { got = d; });
        ok(await until(function () { return got; }, 100) && got.results.length === 2 && got.results[0].title === 'Чжан Тянь Ян', 'ряд «Сегодня родились»: карточки актёров');
        S.pushed.length = 0;
        got.results[0].params.emit.onlyEnter();
        ok(S.pushed.length === 1 && S.pushed[0].catalog.path === '/akter/chzhan-tyan-yan', 'карточка ряда открывает каталог актёра');
        S.store.doramy_row_born = false;
        ok(!row.call({}, 'main'), 'настройка отключает ряд');
        delete S.store.doramy_row_born;
    })();
    (function () {
        var root = S.$('<div><div class="full-start-new__buttons"><div class="view--torrent"></div></div></div>');
        var ev = { type: 'complite', data: { movie: { original_name: 'Esquire' } }, object: { activity: { render: function () { return root; } } } };
        S.listeners.full(ev);
        S.listeners.full(ev);
        ok(root.find('.dc-full-btn').length === 1, 'кнопка в карточке Lampa добавлена один раз');
        ok(root.find('.view--torrent').next().hasClass('dc-full-btn'), 'кнопка стоит после «Торренты»');
        S.pushed.length = 0;
        root.find('.dc-full-btn').trigger('hover:enter');
        ok(S.pushed.length === 1 && S.pushed[0].query === 'Esquire', 'кнопка открывает поиск по оригинальному названию');
        S.store.doramy_full_btn = false;
        var root2 = S.$('<div><div class="full-start-new__buttons"></div></div>');
        S.listeners.full({ type: 'complite', data: { movie: { name: 'X' } }, object: { activity: { render: function () { return root2; } } } });
        ok(root2.find('.dc-full-btn').length === 0, 'настройка отключает кнопку');
        delete S.store.doramy_full_btn;
    })();

    console.log('\n' + pass + ' ok, ' + failn + ' fail' + (errors.length ? ', JS errors: ' + errors.join('; ') : ''));
    process.exit(failn || errors.length ? 1 : 0);
})().catch(function (e) { console.log('CRASH', e && e.stack || e); process.exit(1); });
