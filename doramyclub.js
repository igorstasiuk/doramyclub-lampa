/*!
 * Doramy.club for Lampa
 * Каталог дорам (doramy.club): новинки, сериалы, фильмы, топы, страны/жанры/годы,
 * поиск, актёры/каналы/студии, страница тайтла с выбором озвучки/субтитров,
 * серии с прогрессом, личные списки, продолжение просмотра, выбор плеера.
 * Видео: плеер сайта — Kodik; плагин сам получает прямой поток (m3u8) без iframe.
 */
(function () {
    'use strict';

    var VERSION = '0.1.0';
    var DEFAULT_BASE = 'https://doramy.club';
    var KODIK = 'https://kodikplayer.com';
    var CACHE_TTL = 10 * 60 * 1000;
    var STREAM_TTL = 10 * 60 * 1000;

    /* ------------------------------------------------------------------ */
    /*  Pure helpers (без зависимостей от Lampa — тестируются в node)     */
    /* ------------------------------------------------------------------ */

    var FALLBACK_MENU = {
        sections: [
            ['Новинки', '/1-novinki'], ['Фильмы', '/filmy'], ['Сериалы', '/serialy'],
            ['Топ: всё время', '/top'], ['Топ месяца', '/top-months'], ['Топ года', '/top-year']
        ],
        countries: [
            ['Южная Корея', '/strana/2-yuzhnaya-koreya'], ['Китай', '/strana/2-kitaj'], ['Япония', '/strana/1-yaponiya'],
            ['Таиланд', '/strana/tailand'], ['Тайвань', '/strana/1-tajvan']
        ],
        genres: [
            ['Детектив', '/genre/detektiv'], ['Драма', '/genre/1-drama'], ['Комедия', '/genre/komediya'], ['Криминал', '/genre/kriminal'],
            ['Мелодрама', '/genre/melodrama'], ['Мистика', '/genre/1-mistika'], ['Музыка', '/genre/muzyka'], ['Приключения', '/genre/priklyucheniya'],
            ['Триллер', '/genre/triller'], ['Ужасы', '/genre/1-uzhasy'], ['Фантастика', '/genre/1-fantastika'], ['Фэнтези', '/genre/fentezi'],
            ['Боевик', '/genre/1-boevik'], ['Боевые искусства', '/genre/boevye-iskusstva'], ['Военный', '/genre/voennyj'],
            ['Исторический', '/genre/1-istoricheskij'], ['Спорт', '/genre/1-sport'], ['Ток-шоу', '/genre/1-tok-shou'],
            ['Школа', '/razdel/1-doramy-pro-shkolu'], ['Мини-дорамы', '/razdel/1-mini-doramy-skorotat-vecherok']
        ],
        years: [
            ['2026', '/god/2026'], ['2025', '/god/2-2025'], ['2024', '/god/2-2024'], ['2023', '/god/2-2023'], ['2022', '/god/1-2022'],
            ['2021', '/god/2021'], ['2020', '/god/1-2020'], ['2019', '/god/2019'], ['2018', '/god/2018'], ['2017', '/god/2017'],
            ['2016', '/god/2016'], ['2015', '/god/2015']
        ]
    };

    var LISTS = { fav: 'Избранное', later: 'На потом', watching: 'Смотрю', done: 'Просмотрено', dropped: 'Брошено' };
    var LIST_KEYS = ['fav', 'later', 'watching', 'done', 'dropped'];

    function unesc(s) {
        return ('' + (s || '')).replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
            .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…')
            .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    function strip(s) {
        return unesc(('' + (s || '')).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, ''))
            .replace(/[ \t\r]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
    }

    function absUrl(u, base) {
        if (!u) return '';
        if (/^\/\//.test(u)) return 'https:' + u;
        if (/^https?:/i.test(u)) return u;
        return ('' + base).replace(/\/+$/, '') + (u.charAt(0) === '/' ? '' : '/') + u;
    }

    function postId(href) {
        var m = ('' + href).match(/\/(\d+)-[^\/]*\.html/);
        return m ? m[1] : '';
    }

    // Карточки списков: <section class="post-list"> (разделы, жанры, поиск, актёры...)
    function parseListing(html, base) {
        var out = [], parts = ('' + html).split('<section class="post-list">');
        parts.shift();
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i], end = p.indexOf('</section>');
            if (end >= 0) p = p.slice(0, end);
            var a = p.match(/<a href="([^"]+\.html)"[^>]*>\s*<img src="([^"]+)"[^>]*>\s*<span>([\s\S]*?)<\/span>/);
            if (!a) continue;
            var id = postId(a[1]);
            if (!id) continue;
            var us = [];
            p.replace(/<u>([\s\S]*?)<\/u>/g, function (m, t) { us.push(strip(t)); return m; });
            var cy = us[0] || '', ym = cy.match(/(\d{4})\s*$/);
            var em = p.match(/<em>([\s\S]*?)<\/em>/);
            var avg = p.match(/class="average">\s*([\d.,]+)/);
            var hom = p.match(/<tbody class="tbody-hom">([\s\S]*?)<\/tbody>/);
            var mini = /class="mini-web"/.test(p);
            out.push({
                id: id,
                url: absUrl(a[1], base),
                poster: absUrl(a[2], base),
                title: strip(a[3]),
                orig: em ? strip(em[1]) : '',
                country: cy.replace(/,?\s*\d{4}\s*$/, '').trim(),
                year: ym ? +ym[1] : 0,
                genres: us[1] || '',
                info: hom ? strip(hom[1].replace(/<\/tr>/g, '\n')).replace(/\n/g, ' · ') : '',
                rating: avg ? parseFloat(avg[1].replace(',', '.')) : 0,
                mini: mini
            });
        }
        return out;
    }

    function hasNext(html) {
        return /class="next page-numbers"/.test('' + html);
    }

    // Меню сайта: жанры/разделы, годы, страны (для каталога); при сбое остаётся запасной список
    function parseMenu(html, base) {
        var seen = {}, menu = { sections: FALLBACK_MENU.sections, countries: [], genres: [], years: [] };
        ('' + html).replace(/<a href="(?:https?:\/\/[^\/"]+)?(\/(genre|razdel|god|strana)\/[^"]+)"[^>]*>([^<]+)<\/a>/g, function (m, path, kind, title) {
            if (seen[path]) return m;
            seen[path] = 1;
            var item = [strip(title), path];
            if (kind === 'genre' || kind === 'razdel') menu.genres.push(item);
            else if (kind === 'god') menu.years.push(item);
            else menu.countries.push(item);
            return m;
        });
        if (!menu.genres.length) menu.genres = FALLBACK_MENU.genres;
        if (!menu.years.length) menu.years = FALLBACK_MENU.years;
        if (!menu.countries.length) menu.countries = FALLBACK_MENU.countries;
        return menu;
    }

    function parseKodikLink(s) {
        var str = '' + s;
        try { str = decodeURIComponent(str); } catch (e) { /* уже раскодировано */ }
        var m = str.match(/kodik[a-z0-9.\-]*\.[a-z]+\/(seria|season|serial|video|uv)\/(\d+)\/([A-Za-z0-9]+)(?:\/(\d+p))?/i);
        return m ? { type: m[1].toLowerCase(), id: m[2], hash: m[3], q: m[4] || '720p' } : null;
    }

    function kodikUrl(l) {
        return KODIK + '/' + l.type + '/' + l.id + '/' + l.hash + '/' + (l.q || '720p');
    }

    function kodikLinks(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var l = parseKodikLink(list[i]);
            out.push(l ? kodikUrl(l) : '');
        }
        return out;
    }

    // Страница тайтла: поля, актёры, описание, плееры (uvk.show — вкладки «Озвучка/Субтитры», iframe — Kodik)
    function parseDetail(html, base) {
        html = '' + html;
        var d = { fields: {}, links: [], cast: [], similar: [], tracks: [], iframe: '', kind: 'serial' };

        var h1 = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        var raw = h1 ? strip(h1[1]) : '';
        var ym = raw.match(/\((\d{4})\)\s*$/);
        d.year = ym ? +ym[1] : 0;
        d.title = raw.replace(/\s*\(\d{4}\)\s*$/, '').replace(/\s+(дорама|сериал|фильм)\s*$/i, '').trim() || raw;

        var poster = html.match(/<img[^>]*class="s-poster"[^>]*src="([^"]+)"/);
        d.poster = poster ? absUrl(poster[1], base) : '';

        var tag = html.match(/<table class="table-tag">([\s\S]*?)<\/table>/);
        if (tag) {
            var us = [];
            tag[1].replace(/<u>([\s\S]*?)<\/u>/g, function (m, t) { us.push(strip(t)); return m; });
            d.country = (us[0] || '').replace(/,?\s*\d{4}\s*$/, '').trim();
            d.genres = us[1] ? us[1].split(/\s*,\s*/) : [];
            if (!d.year) { var y2 = (us[0] || '').match(/(\d{4})/); d.year = y2 ? +y2[1] : 0; }
        } else { d.genres = []; }

        var sin = html.match(/<tbody class="tbody-sin">([\s\S]*?)<\/tbody>/);
        if (sin) {
            sin[1].replace(/<tr[^>]*>\s*<td class="s1">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g, function (m, label, val) {
                label = strip(label).replace(/:$/, '');
                var b = val.match(/<b>(\d+)<\/b>/);
                if ((label === 'Озвучка' || label === 'Субтитры') && b) {
                    d[label === 'Озвучка' ? 'voiceEp' : 'subsEp'] = +b[1];
                    return m;
                }
                var links = [];
                val.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, function (mm, href, t) {
                    var k = href.match(/\/(kanal|studiya|rezhisser|scenarist|ozvuchka)\/[^\/]+/);
                    if (k) links.push({ kind: k[1], label: label, title: strip(t), path: href.replace(/^https?:\/\/[^\/]+/, '') });
                    return mm;
                });
                if (links.length) d.links = d.links.concat(links);
                else d.fields[label] = strip(val);
                return m;
            });
        }
        var cnt = (d.fields['Сериал'] || '').match(/(\d+)/);
        d.total = cnt ? +cnt[1] : 0;
        // основная озвучка тайтла (студия) — строка «Озвучка: LE-Production»
        d.studio = '';
        for (var si0 = 0; si0 < d.links.length; si0++) {
            if (d.links[si0].label === 'Озвучка') { d.studio = d.links[si0].title; break; }
        }

        html.replace(/<span class="tdlinks"><a href="([^"]+)"([^>]*)>([^<]+)<\/a>/g, function (m, href, attrs, name) {
            var role = attrs.match(/data-txt="([^"]*)"/), img = attrs.match(/data-img="([^"]*)"/);
            d.cast.push({ path: href.replace(/^https?:\/\/[^\/]+/, ''), name: strip(name), role: role ? strip(role[1]) : '', photo: img ? absUrl(img[1], base) : '' });
            return m;
        });

        var descr = html.match(/<div class="description"[^>]*>([\s\S]*?)<\/div>/);
        d.description = descr ? strip(descr[1]) : '';
        var inf = html.match(/<div class="infos">([\s\S]*?)<\/div>/);
        d.note = inf ? strip(inf[1]) : '';
        var rt = html.match(/itemprop="ratingValue">\s*([\d.,]+)\s*</);
        d.rating = rt ? parseFloat(rt[1].replace(',', '.')) : 0;

        var si = html.indexOf('id="owl-perelink"');
        if (si >= 0) {
            var chunk = html.slice(si, si + 40000), nx = chunk.indexOf('class="carou-in', 20);
            if (nx > 0) chunk = chunk.slice(0, nx);
            chunk.replace(/<a href="([^"]+\.html)"[^>]*>\s*<img src="([^"]+)"[^>]*>\s*<div class="pe-title">([\s\S]*?)<\/div>/g, function (m, href, img, t) {
                var id = postId(href);
                if (id) d.similar.push({ id: id, url: absUrl(href, base), poster: absUrl(img, base), title: strip(t) });
                return m;
            });
        }

        // плееры
        var ui = html.indexOf('uvk.show(');
        if (ui >= 0) {
            var seg = html.slice(ui, html.indexOf('</script>', ui));
            var tabs = [], lists = [];
            var tm = seg.match(/\[\s*((?:'[^']*'\s*,?\s*)+)\]/);
            if (tm) tm[1].replace(/'([^']*)'/g, function (m, t) { tabs.push(t); return m; });
            // пустые массивы тоже считаем: у дорамы только с субтитрами первый массив («Озвучка») может быть []
            seg.replace(/\[\s*((?:"[^"]*"\s*,?\s*)*)\]/g, function (m, body) {
                var arr = [];
                body.replace(/"([^"]*)"/g, function (mm, s) { arr.push(s); return mm; });
                lists.push(kodikLinks(arr));
                return m;
            });
            for (var t = 0; t < lists.length; t++) {
                var links = lists[t].filter(function (x) { return x; });
                if (links.length) {
                    var tab = tabs[t] || ('Вариант ' + (t + 1));
                    d.tracks.push({ title: tab === 'Озвучка' && d.studio ? tab + ' — ' + d.studio : tab, tab: tab, main: true, links: lists[t] });
                }
            }
        }
        var fr = html.match(/<iframe[^>]+src="([^"]*kodik[^"]*)"/i);
        if (fr) {
            var kl = parseKodikLink(fr[1]);
            if (kl) {
                d.iframe = kodikUrl(kl);
                if (kl.type === 'video' && !d.tracks.length) {
                    d.kind = 'movie';
                    d.tracks.push({ title: 'Фильм', links: [d.iframe] });
                }
            }
        }
        return d;
    }

    function dataAttr(attrs, name) {
        var m = attrs.match(new RegExp('data-' + name + '="([^"]*)"'));
        return m ? unesc(m[1]) : '';
    }

    // Страница Kodik: список озвучек (translations) и серий выбранной озвучки
    function parseKodikPage(html) {
        html = '' + html;
        var out = { translations: [], series: [] };
        var sel = function (cls) {
            var i = html.indexOf('class="' + cls + '"');
            if (i < 0) return '';
            var e = html.indexOf('</select>', i);
            return html.slice(i, e < 0 ? i + 20000 : e);
        };
        var tr = sel('serial-translations-box') || sel('movie-translations-box');
        tr.replace(/<option value="(\d+)"([^>]*)>([\s\S]*?)<\/option>/g, function (m, id, attrs, text) {
            var mid = dataAttr(attrs, 'media-id'), hash = dataAttr(attrs, 'media-hash');
            if (!mid || !hash) return m;
            out.translations.push({
                id: id,
                title: dataAttr(attrs, 'title') || strip(text),
                subs: dataAttr(attrs, 'translation-type') === 'subtitles',
                count: parseInt(dataAttr(attrs, 'episode-count'), 10) || 0,
                mediaId: mid,
                hash: hash,
                type: dataAttr(attrs, 'media-type') || 'season',
                selected: /selected/.test(attrs)
            });
            return m;
        });
        sel('serial-series-box').replace(/<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g, function (m, v, attrs, text) {
            var id = dataAttr(attrs, 'id'), hash = dataAttr(attrs, 'hash');
            if (id && hash) out.series.push({ num: parseInt(v, 10) || out.series.length + 1, title: strip(text), link: kodikUrl({ type: 'seria', id: id, hash: hash, q: '720p' }) });
            return m;
        });
        return out;
    }

    // Параметры плеера Kodik, нужные для запроса ссылок
    function parseKodikParams(html) {
        html = '' + html;
        var up = html.match(/urlParams\s*=\s*'(\{[\s\S]*?\})'/), params = null;
        try { params = up ? JSON.parse(up[1]) : null; } catch (e) { params = null; }
        var g = function (n) { var m = html.match(new RegExp('vInfo\\.' + n + "\\s*=\\s*'([^']*)'")); return m ? m[1] : ''; };
        var js = html.match(/\/assets\/js\/app\.player_[a-z0-9_]+\.[a-f0-9]+\.js/);
        return { params: params, type: g('type'), hash: g('hash'), id: g('id'), script: js ? js[0] : '' };
    }

    function b64(s) {
        if (typeof atob === 'function') return atob(s);
        return Buffer.from(s, 'base64').toString('binary');
    }

    // Ссылка в ответе Kodik: буквенный сдвиг (ROT-N) + base64. N меняется — перебираем.
    function decodeKodik(src) {
        src = '' + src;
        if (/^(https?:)?\/\//.test(src)) return src.charAt(0) === '/' ? 'https:' + src : src;
        for (var n = 0; n < 26; n++) {
            var s = src.replace(/[a-zA-Z]/g, function (c) {
                var b = c <= 'Z' ? 65 : 97;
                return String.fromCharCode((c.charCodeAt(0) - b + n) % 26 + b);
            });
            var d;
            try { d = b64(s); } catch (e) { continue; }
            if (/^(https?:)?\/\//.test(d) || d.indexOf('m3u8') > 0) return d.charAt(0) === '/' ? 'https:' + d : d;
        }
        return '';
    }

    // JSON ответа /ftor -> { '720p': url, ... } (по убыванию качества)
    function parseFtor(json) {
        var data = typeof json === 'string' ? JSON.parse(json) : json, out = {}, keys = [];
        var links = (data && data.links) || {};
        for (var q in links) {
            if (!links.hasOwnProperty(q) || !links[q] || !links[q][0]) continue;
            var u = decodeKodik(links[q][0].src);
            if (u) { out[q + 'p'] = u; keys.push(+q); }
        }
        keys.sort(function (a, b) { return b - a; });
        var res = {};
        keys.forEach(function (k) { res[k + 'p'] = out[k + 'p']; });
        return res;
    }

    // Выбор качества: pref — 'best' | '720' | '480' | '360'
    function pickQuality(quality, pref) {
        var keys = Object.keys(quality || {});
        if (!keys.length) return '';
        if (pref && pref !== 'best' && quality[pref + 'p']) return quality[pref + 'p'];
        if (pref && pref !== 'best') {
            // ближайшее не выше запрошенного, иначе лучшее
            for (var i = 0; i < keys.length; i++) if (parseInt(keys[i], 10) <= +pref) return quality[keys[i]];
        }
        return quality[keys[0]];
    }

    function listPath(path, page) {
        path = ('' + path).replace(/\/+$/, '');
        return page > 1 ? path + '/page/' + page : path;
    }

    function searchPath(query, page) {
        return (page > 1 ? '/page/' + page : '/') + '?s=' + encodeURIComponent(query);
    }

    function fmtTime(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return (h ? h + ':' + p(m) : m) + ':' + p(s);
    }

    function looksLikeChallenge(html) {
        html = '' + html;
        return html.indexOf('__js_p_') >= 0 && html.indexOf('get_jhash') >= 0 && html.indexOf('post-list') < 0;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            VERSION: VERSION, FALLBACK_MENU: FALLBACK_MENU, parseListing: parseListing, hasNext: hasNext, parseMenu: parseMenu,
            parseDetail: parseDetail, parseKodikLink: parseKodikLink, kodikUrl: kodikUrl, parseKodikPage: parseKodikPage,
            parseKodikParams: parseKodikParams, decodeKodik: decodeKodik, parseFtor: parseFtor, pickQuality: pickQuality,
            listPath: listPath, searchPath: searchPath, fmtTime: fmtTime, looksLikeChallenge: looksLikeChallenge, strip: strip
        };
    }

    if (typeof window === 'undefined' || typeof Lampa === 'undefined') return;
    if (window.doramyclub_plugin_ready) return;
    window.doramyclub_plugin_ready = true;

    /* ------------------------------------------------------------------ */
    /*  Storage / settings                                                */
    /* ------------------------------------------------------------------ */

    var DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

    var PLAYERS = {
        lampa: 'Как в настройках Lampa',
        inner: 'Встроенный плеер Lampa',
        android: 'Внешний (Android / Lampa)',
        webos: 'Внешний (webOS)',
        vlc: 'VLC',
        infuse: 'Infuse',
        iina: 'IINA (macOS)',
        mpv: 'mpv',
        nplayer: 'nPlayer',
        senplayer: 'SenPlayer',
        copy: 'Скопировать ссылку'
    };

    function setting(name, def) {
        var v = Lampa.Storage.get(name, def + '');
        return v === '' ? def : v;
    }

    function base() {
        var url = ('' + setting('doramy_base', DEFAULT_BASE)).trim().replace(/\/+$/, '');
        return /^https?:\/\//i.test(url) ? url : 'https://' + url.replace(/^\/+/, '');
    }

    function getMap(key) {
        var v = Lampa.Storage.get(key, '{}');
        return v && typeof v === 'object' ? v : {};
    }

    var imgMode = {};

    function imgHost(url) {
        var m = (url || '').match(/^https?:\/\/([^\/]+)/i);
        return m ? m[1].toLowerCase() : '';
    }

    function imgChain(url) {
        var plain = url.replace(/^https?:\/\//, '');
        return [url, 'https://images.weserv.nl/?url=' + encodeURIComponent(plain)];
    }

    function bestPoster(url) {
        if (!url) return url;
        var step = imgMode[imgHost(url)];
        return step ? imgChain(url)[step] : url;
    }

    function setImage(img, url, onFail) {
        if (!url) return onFail ? onFail() : img.attr('src', './img/img_broken.svg');
        var host = imgHost(url), chain = imgChain(url);
        var step = imgMode[host] || 0;
        img.off('error.dc load.dc');
        img.on('load.dc', function () { imgMode[host] = step; });
        img.on('error.dc', function () {
            if (++step < chain.length) img.attr('src', chain[step]);
            else if (onFail) onFail();
            else img.attr('src', './img/img_broken.svg');
        });
        img.attr('src', chain[step]);
    }

    // Ленивая загрузка картинок без IntersectionObserver (его нет в старых WebView ТВ)
    function Lazy(opts) {
        opts = opts || {};
        var margin = opts.margin === undefined ? 1 : opts.margin, trickle = opts.trickle || 0;
        var items = [], timer = null;

        function near(n) {
            var r = n.getBoundingClientRect();
            var vh = window.innerHeight || 720, vw = window.innerWidth || 1280;
            return r.bottom > -vh * margin && r.top < vh * (1 + margin) && r.right > -vw * margin && r.left < vw * (1 + margin);
        }

        this.add = function (img, url, onFail) { items.push({ img: img, url: url, fail: onFail }); };
        this.reset = function () { items = []; };
        this.check = function () {
            if (document.hidden) return;
            var far = [];
            items = items.filter(function (it) {
                var n = it.img[0];
                if (!n || !$.contains(document.documentElement, n)) return true;
                if (near(n)) {
                    setImage(it.img, it.url, it.fail);
                    return false;
                }
                far.push(it);
                return true;
            });
            if (trickle && far.length) {
                var batch = far.slice(0, trickle);
                batch.forEach(function (it) { setImage(it.img, it.url, it.fail); });
                items = items.filter(function (it) { return batch.indexOf(it) < 0; });
            }
        };
        this.start = function () {
            var self = this;
            if (!timer) timer = setInterval(function () { self.check(); }, 500);
        };
        this.stop = function () {
            clearInterval(timer);
            timer = null;
            items = [];
        };
    }

    // Тяжёлые кеши — в IndexedDB через Lampa.Cache; всегда читаем с life_time = -1
    var bigMem = {};

    function bigSet(key, value) {
        bigMem[key] = value;
        var fallback = function () { try { Lampa.Storage.set(key, value); } catch (e) { /* квота */ } };
        try {
            if (Lampa.Cache && Lampa.Cache.rewriteData) {
                Lampa.Cache.rewriteData('other', key, value)['catch'](fallback);
                try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
            } else fallback();
        } catch (e) { fallback(); }
    }

    function bigGet(key, cb) {
        if (bigMem[key]) return cb(bigMem[key]);
        var legacy = function () {
            var v = Lampa.Storage.get(key, '');
            cb(v && typeof v === 'object' ? v : null);
        };
        try {
            if (Lampa.Cache && Lampa.Cache.getData) {
                Lampa.Cache.getData('other', key, -1).then(function (v) {
                    if (v && typeof v === 'object') { bigMem[key] = v; cb(v); } else legacy();
                })['catch'](legacy);
            } else legacy();
        } catch (e) { legacy(); }
    }

    // История просмотра и личные списки (локально; сайт хранит их в аккаунте, которого у плагина нет)
    function episodeHash(id, key) {
        return Lampa.Utils.hash('doramyclub:' + id + ':' + key);
    }

    function brief(t) {
        return { id: t.id, url: t.url, title: t.title, orig: t.orig || '', poster: t.poster, year: t.year || 0, country: t.country || '' };
    }

    function remember(t, ep, idx, count) {
        var st = getMap('doramy_state'), old = st[t.id] || {};
        st[t.id] = $.extend(brief(t), { count: count || old.count || 0, last: ep.num, lastName: ep.name, idx: idx, ts: Date.now() });
        var ids = Object.keys(st).sort(function (a, b) { return st[b].ts - st[a].ts; });
        ids.slice(60).forEach(function (id) { delete st[id]; });
        Lampa.Storage.set('doramy_state', st);
    }

    function historyList() {
        var st = getMap('doramy_state');
        return Object.keys(st).map(function (k) { return st[k]; }).sort(function (a, b) { return b.ts - a.ts; });
    }

    function marksOf(id) {
        var m = getMap('doramy_marks')[id];
        return m || { fav: false, status: '' };
    }

    function setMark(t, patch) {
        var all = getMap('doramy_marks'), cur = all[t.id] || { fav: false, status: '' };
        all[t.id] = $.extend({}, cur, patch, { item: brief(t), ts: Date.now() });
        if (!all[t.id].fav && !all[t.id].status) delete all[t.id];
        Lampa.Storage.set('doramy_marks', all);
    }

    function markedItems(kind) {
        var all = getMap('doramy_marks');
        return Object.keys(all).map(function (k) { return all[k]; }).filter(function (m) {
            return kind === 'fav' ? m.fav : m.status === kind;
        }).sort(function (a, b) { return b.ts - a.ts; }).map(function (m) { return m.item; });
    }

    /* ------------------------------------------------------------------ */
    /*  Network                                                           */
    /* ------------------------------------------------------------------ */

    // Запрос текста. Порядок: прокси из настроек → нативный запрос Lampa (Android, без CORS) → прямой $.ajax.
    // opts.post — строка application/x-www-form-urlencoded.
    function net(url, opts, ok, fail) {
        opts = opts || {};
        var proxy = ('' + setting('doramy_proxy', '')).trim();
        var ajax = function (u, err) {
            $.ajax({
                url: u,
                method: opts.post ? 'POST' : 'GET',
                data: opts.post || undefined,
                dataType: 'text',
                timeout: 20000,
                success: ok,
                error: function (xhr, status) { err(status || 'error'); }
            });
        };
        var direct = function () { ajax(url, function (e) { fail(e); }); };
        if (proxy) return ajax(proxy + url, function () { fail('proxy'); });
        try {
            var headers = { 'User-Agent': DESKTOP_UA };
            if (opts.post) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
                headers['X-Requested-With'] = 'XMLHttpRequest';
            }
            if (opts.referer) headers.Referer = opts.referer;
            new Lampa.Reguest().native(url, function (str) {
                typeof str === 'string' ? ok(str) : direct();
            }, direct, opts.post || false, { dataType: 'text', headers: headers });
        } catch (e) { direct(); }
    }

    var pageMem = {};

    // Страница сайта (HTML). Проверка на «проверку браузера» сайта — отдельная ошибка, чтобы показать понятное сообщение.
    function fetchPage(path, ok, fail, force) {
        var url = absUrl(path, base());
        var hit = pageMem[url];
        if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return ok(hit.html);
        net(url, { referer: base() + '/' }, function (html) {
            if (looksLikeChallenge(html)) return fail('challenge');
            if (typeof html !== 'string' || html.length < 500) return fail('empty');
            pageMem[url] = { ts: Date.now(), html: html };
            ok(html);
        }, function (e) { fail(e || 'error'); });
    }

    function loadList(path, page, ok, fail, force) {
        fetchPage(listPath(path, page), function (html) {
            ok(parseListing(html, base()), hasNext(html));
        }, fail, force);
    }

    function loadSearch(query, page, ok, fail) {
        fetchPage(searchPath(query, page), function (html) {
            ok(parseListing(html, base()), hasNext(html));
        }, fail);
    }

    function loadMenu(ok) {
        bigGet('doramy_menu', function (c) {
            if (c && c.ts && Date.now() - c.ts < 7 * 86400000 && c.menu) return ok(c.menu);
            fetchPage('/', function (html) {
                var menu = parseMenu(html, base());
                bigSet('doramy_menu', { ts: Date.now(), menu: menu });
                ok(menu);
            }, function () { ok(c && c.menu ? c.menu : FALLBACK_MENU); });
        });
    }

    function loadDetail(item, ok, fail) {
        var key = 'doramy_d_' + item.id;
        bigGet(key, function (c) {
            var cached = c && c.d ? c : null;
            fetchPage(item.url, function (html) {
                var d = parseDetail(html, base());
                d.id = item.id;
                d.url = item.url;
                bigSet(key, { ts: Date.now(), d: d });
                ok(d, false);
            }, function (e) {
                if (cached) ok(cached.d, true);
                else fail(e);
            }, !!cached && Date.now() - cached.ts > CACHE_TTL);
        });
    }

    /* ---------- Kodik ---------- */

    var ftorPath = '';
    var streamMem = {};

    function kodikFetch(link, ok, fail) {
        net(link, { referer: base() + '/' }, function (html) {
            var info = parseKodikParams(html);
            info.html = html;
            ok(info);
        }, fail);
    }

    // Путь /ftor зашит в скрипте плеера (base64) — берём оттуда, запасной вариант /ftor
    function findFtor(info, ok) {
        if (ftorPath) return ok(ftorPath);
        if (!info.script) return ok('/ftor');
        net(KODIK + info.script, {}, function (js) {
            var found = '/ftor';
            ('' + js).replace(/atob\("([A-Za-z0-9+\/=]+)"\)/g, function (m, s) {
                try { var d = b64(s); if (/^\/[a-z]{3,8}$/.test(d)) found = d; } catch (e) { /* не base64 */ }
                return m;
            });
            ftorPath = found;
            ok(found);
        }, function () { ok('/ftor'); });
    }

    function enc(o) {
        var p = [];
        for (var k in o) if (o.hasOwnProperty(k)) p.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k]));
        return p.join('&');
    }

    // Kodik-ссылка → { quality: {'720p': url}, url }
    function resolveStream(link, ok, fail) {
        var hit = streamMem[link];
        if (hit && Date.now() - hit.ts < STREAM_TTL) return ok(hit.s);
        var l = parseKodikLink(link);
        if (!l) return fail('link');
        kodikFetch(kodikUrl(l), function (info) {
            if (!info.params) return fail('params');
            findFtor(info, function (path) {
                var p = info.params;
                var body = enc({
                    d: p.d, d_sign: p.d_sign, pd: p.pd, pd_sign: p.pd_sign, ref: p.ref || '', ref_sign: p.ref_sign,
                    bad_user: 'true', cdn_is_working: 'true', type: info.type || l.type, hash: info.hash || l.hash, id: info.id || l.id, info: '{}'
                });
                net(KODIK + path, { post: body, referer: kodikUrl(l) }, function (txt) {
                    var q;
                    try { q = parseFtor(txt); } catch (e) { return fail('parse'); }
                    var url = pickQuality(q, setting('doramy_quality', 'best'));
                    if (!url) return fail('nolinks');
                    var s = { quality: q, url: url };
                    streamMem[link] = { ts: Date.now(), s: s };
                    ok(s);
                }, function () { fail('ftor'); });
            });
        }, function () { fail('kodik'); });
    }

    // Другие озвучки: список из страницы Kodik; серии выбранной — отдельным запросом
    function loadTranslations(link, ok, fail) {
        net(link, { referer: base() + '/' }, function (html) {
            var k = parseKodikPage(html);
            k.translations.length ? ok(k.translations) : fail('empty');
        }, function () { fail('kodik'); });
    }

    function loadTrack(tr, ok, fail) {
        var type = tr.type === 'video' ? 'video' : (tr.type === 'serial' ? 'serial' : 'season');
        var link = kodikUrl({ type: type, id: tr.mediaId, hash: tr.hash, q: '720p' });
        var title = trackTitle(tr);
        if (type === 'video') return ok({ title: title, subs: tr.subs, links: [link] });
        net(link, { referer: base() + '/' }, function (html) {
            var k = parseKodikPage(html), links = [];
            // у озвучек разное число серий: индекс = номер серии, пропуски остаются пустыми (серия не озвучена)
            k.series.forEach(function (s) { links[s.num - 1] = s.link; });
            for (var i = 0; i < links.length; i++) if (!links[i]) links[i] = '';
            links.length ? ok({ title: title, subs: tr.subs, links: links }) : fail('empty');
        }, function () { fail('kodik'); });
    }

    function trackTitle(tr) {
        return tr.title + (tr.subs && !/субтитр/i.test(tr.title) ? ' (субтитры)' : '');
    }

    function errorText(e) {
        if (e === 'challenge') return 'Сайт отдал проверку браузера (anti-bot) вместо страницы. Укажите прокси в настройках плагина (см. README).';
        if (e === 'proxy') return 'Прокси не отвечает. Проверьте адрес прокси в настройках плагина.';
        return 'Не удалось загрузить данные doramy.club. Проверьте сеть, адрес сайта и прокси в настройках.';
    }

    /* ------------------------------------------------------------------ */
    /*  Player                                                            */
    /* ------------------------------------------------------------------ */

    function availablePlayers() {
        var P = Lampa.Platform, keys = ['lampa', 'inner'];
        var is = function (n) { try { return P.is(n); } catch (e) { return false; } };
        var mac = false;
        try { mac = !!(P.macOS && P.macOS()); } catch (e) { /* ignore */ }
        if (is('android')) keys.push('android');
        if (is('webos')) keys.push('webos');
        if (is('apple') || is('apple_tv')) keys.push('vlc', 'infuse', 'nplayer', 'senplayer');
        if (mac) keys.push('iina', 'mpv', 'infuse', 'nplayer', 'senplayer');
        keys.push('copy');
        var cur = setting('doramy_player', 'lampa');
        if (keys.indexOf(cur) < 0 && PLAYERS[cur]) keys.splice(2, 0, cur);
        return keys.filter(function (k, i) { return keys.indexOf(k) === i; });
    }

    function choosePlayer(done) {
        var cur = setting('doramy_player', 'lampa');
        var items = availablePlayers().map(function (k) { return { title: PLAYERS[k], value: k, selected: k === cur }; });
        var back = Lampa.Controller.enabled().name;
        Lampa.Select.show({
            title: 'Плеер',
            items: items,
            onSelect: function (a) {
                Lampa.Storage.set('doramy_player', a.value);
                Lampa.Controller.toggle(back);
                done && done(a.value);
            },
            onBack: function () { Lampa.Controller.toggle(back); }
        });
    }

    // Для схем vlc://, infuse:// Lampa читает общую настройку "player" — подменяем её только на момент запуска
    var playerPatch = null;

    function restorePlayer() {
        if (!playerPatch) return;
        clearTimeout(playerPatch.timer);
        Lampa.Storage.set('player', playerPatch.prev);
        playerPatch = null;
    }

    function patchPlayer(mode) {
        if (!playerPatch) playerPatch = { prev: Lampa.Storage.get('player', '') };
        clearTimeout(playerPatch.timer);
        playerPatch.timer = setTimeout(restorePlayer, 20000);
        Lampa.Storage.set('player', mode);
    }

    function hookPlayer() {
        if (!Lampa.Player || !Lampa.Player.listener) return;
        Lampa.Player.listener.follow('external', function () {
            restorePlayer();
            if (Lampa.Player.runas) Lampa.Player.runas('');
            Lampa.Player.callback(false);
        });
    }

    function applyPlayer(item, mode) {
        if (mode === 'copy') {
            Lampa.Utils.copyTextToClipboard(item.url, function () {
                Lampa.Noty.show('Ссылка скопирована');
            }, function () {
                Lampa.Noty.show('Не удалось скопировать ссылку');
            });
            return false;
        }
        if (mode === 'inner' || mode === 'android' || mode === 'webos') item.launch_player = mode;
        else if (mode !== 'lampa') patchPlayer(mode);
        return true;
    }

    function epKey(ep) { return ep.num ? 'e' + ep.num : 'film'; }

    // eps: [{ num, name, link }]. Ссылка на поток получается при запуске серии; в плейлисте — лениво (url-функция Lampa).
    function playEpisode(t, eps, idx, onClose) {
        var go = function (mode) {
            var ep = eps[idx];
            if (!ep.link) return Lampa.Noty.show('Для этой серии нет видео у выбранной озвучки');
            Lampa.Noty.show('Получаю ссылку на видео…');
            resolveStream(ep.link, function (s) {
                var playlist = eps.map(function (e, i) {
                    var o = {
                        title: e.name,
                        timeline: Lampa.Timeline.view(episodeHash(t.id, epKey(e))),
                        callback: function () { remember(t, e, i, eps.length); }
                    };
                    if (i === idx) {
                        o.url = s.url;
                        o.quality = s.quality;
                    } else if (e.link) {
                        o.url = function (call) {
                            resolveStream(e.link, function (st) {
                                o.url = st.url;
                                o.quality = st.quality;
                                call();
                            }, function () { Lampa.Noty.show('Не удалось получить видео серии'); });
                        };
                    }
                    return o;
                }).filter(function (o) { return o.url; });
                var cur = 0;
                for (var k = 0; k < playlist.length; k++) if (playlist[k].title === ep.name) { cur = k; break; }
                var item = {
                    title: t.title + ' — ' + ep.name,
                    url: s.url,
                    quality: s.quality,
                    timeline: Lampa.Timeline.view(episodeHash(t.id, epKey(ep))),
                    playlist: playlist
                };
                if (!applyPlayer(item, mode)) return;
                remember(t, ep, idx, eps.length);
                Lampa.Player.play(item);
                Lampa.Player.playlist(playlist);
                Lampa.Player.callback(function () { onClose && onClose(); });
            }, function (e) {
                Lampa.Noty.show('Не удалось получить видео (' + e + '). Проверьте прокси в настройках.');
            });
        };
        if (setting('doramy_player_ask', false)) choosePlayer(go);
        else go(setting('doramy_player', 'lampa'));
    }

    /* ------------------------------------------------------------------ */
    /*  UI helpers                                                        */
    /* ------------------------------------------------------------------ */

    function injectStyle() {
        if ($('#doramyclub-style').length) return;
        $('head').append('<style id="doramyclub-style">' +
            '.dc{padding:1.2em 0 2em}' +
            '.dc-bar{display:flex;flex-wrap:wrap;padding:0 1.5em .4em}.dc-bar>.dc-btn{margin:0 .8em .8em 0}' +
            '.dc-btn{padding:.7em 1.4em;border-radius:.6em;background:rgba(255,255,255,.1);font-size:1.1em}' +
            '.dc-btn.focus{background:#fff;color:#000}' +
            '.dc-row{margin-bottom:1.6em}' +
            '.dc-row__title{font-size:1.5em;padding:0 1.5em .6em;opacity:.9}' +
            '.dc-grid{display:flex;flex-wrap:wrap;padding:0 1em}' +
            '.dc-card{position:relative;box-sizing:border-box;width:12.5%;padding:0 .45em;margin-bottom:1.2em;min-width:0}' +
            '.dc-card__img{position:relative;height:0;padding-top:140%;border-radius:.7em;overflow:hidden;background:#2a2a2a}' +
            '.dc-card__img img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}' +
            '.dc-card__bar{position:absolute;left:0;right:0;bottom:0;height:.4em;background:rgba(0,0,0,.55)}.dc-card__bar div{height:100%;background:#e64980}' +
            '.dc-card__badge{position:absolute;left:0;bottom:.5em;padding:.2em .6em;background:#e64980;color:#fff;font-size:.9em;border-radius:0 .4em .4em 0}' +
            '.dc-card__rate{position:absolute;right:.4em;top:.4em;padding:.1em .5em;background:rgba(0,0,0,.65);color:#ffd43b;font-size:.9em;border-radius:.4em}' +
            '.dc-card__title{margin-top:.5em;font-size:1em;line-height:1.25;max-height:2.5em;overflow:hidden;padding:0 .2em}' +
            '.dc-card__sub{opacity:.55;font-size:.85em;padding:0 .2em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.dc-card.focus .dc-card__img{box-shadow:0 0 0 .22em #fff}' +
            '.dc-card--more .dc-card__img{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.1)}' +
            '.dc-card--more .dc-card__more{position:absolute;left:0;right:0;top:50%;margin-top:-.7em;text-align:center;font-size:1.1em}' +
            '.dc-title{display:flex;padding:1.5em}.dc-title__poster{margin-right:2em;width:15em;flex-shrink:0}' +
            '.dc-title__poster img{width:100%;border-radius:.7em}' +
            '.dc-title__body{flex:1;min-width:0}' +
            '.dc-title__name{font-size:2em;line-height:1.2}' +
            '.dc-title__orig{opacity:.6;margin-top:.2em}' +
            '.dc-title__meta{margin:.8em 0;opacity:.8;line-height:1.4}' +
            '.dc-title__rate{display:inline-block;margin-right:.7em;padding:.05em .5em;border-radius:.4em;background:#e64980;color:#fff}' +
            '.dc-title__note{margin:.3em 0 .6em;color:#ffa94d}' +
            '.dc-title__facts{margin:.5em 0;line-height:1.45;opacity:.85}' +
            '.dc-title__descr{margin:1em 0;line-height:1.45;max-height:7.5em;overflow:hidden;opacity:.85}' +
            '.dc-title__btns{display:flex;flex-wrap:wrap;margin:1em 0 .2em}.dc-title__btns .dc-btn{margin:0 .8em .8em 0}' +
            '.dc-row--eps .scroll__body,.dc-row--sim .scroll__body{display:flex;flex-wrap:nowrap;align-items:flex-start}' +
            '.dc-row--eps,.dc-row--sim{margin-top:1em}' +
            '.dc-ep{position:relative;width:11em;margin:0 .6em;flex-shrink:0;border-radius:.8em;padding:.9em .8em;background:rgba(255,255,255,.07)}' +
            '.dc-ep.focus{background:rgba(255,255,255,.2);box-shadow:0 0 0 .2em #fff}' +
            '.dc-ep.watched{opacity:.55}.dc-ep.nolink{opacity:.35}' +
            '.dc-ep__name{font-size:1.4em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.dc-ep__sub{opacity:.65;margin-top:.25em;min-height:1.3em;font-size:.9em}' +
            '.dc-ep__bar{display:none;position:absolute;left:0;right:0;bottom:0;height:.4em;background:rgba(0,0,0,.55);border-radius:0 0 .8em .8em;overflow:hidden}' +
            '.dc-ep__bar div{height:100%;background:#e64980}' +
            '.dc-sim{position:relative;width:10em;margin:0 .6em;flex-shrink:0}' +
            '.dc-sim .dc-card__img{padding-top:140%}' +
            '.dc-sim.focus .dc-card__img{box-shadow:0 0 0 .22em #fff}' +
            '.dc-more{padding:.4em 1.5em 1.5em;text-align:center}.dc-btn--more{display:inline-block}' +
            '.dc-modal__text{padding:1em 1.5em;line-height:1.5;font-size:1.2em;white-space:pre-wrap}' +
            '.dc-empty{padding:3em 1.5em;font-size:1.3em;opacity:.7;line-height:1.4}' +
            '@media (max-width:760px){.dc-title{flex-direction:column;padding:1em}.dc-title__poster{width:9em;margin:0 0 1em 0}' +
            '.dc-title__name{font-size:1.5em}.dc-grid{padding:0 .5em}.dc-bar{padding:0 1em 1em}.dc-row__title{padding:0 1em .6em;font-size:1.3em}}' +
            '@media (max-width:1499px){.dc-card{width:14.2857%}}' +
            '@media (max-width:1099px){.dc-card{width:16.6667%}}' +
            '@media (max-width:899px){.dc-card{width:20%}}' +
            '@media (max-width:699px){.dc-card{width:25%}}' +
            '@media (max-width:519px){.dc-card{width:33.3333%}}' +
            '@media (max-width:379px){.dc-card{width:50%}}' +
            '</style>');
    }

    // Навигация пультом: каждый ряд — массив элементов; фокус двигаем сами, не через пространственный Navigator
    function Grid(name, scroll) {
        var rows = [], r = 0, c = 0, self = this, layoutFn = null;

        function row(i) { return rows[i] || []; }

        function refresh() {
            if (!layoutFn) return;
            var cur = row(r)[c];
            rows = layoutFn();
            if (cur) self.track(cur);
        }

        this.layout = function (fn) { layoutFn = fn; rows = fn(); };
        this.set = function (arr, keep) {
            var cur = keep ? row(r)[c] : null;
            rows = arr;
            if (cur) self.track(cur);
        };
        this.at = function (nr, nc) { r = nr; c = nc || 0; };

        this.track = function (el) {
            el = el[0] || el;
            for (var i = 0; i < rows.length; i++) {
                for (var j = 0; j < rows[i].length; j++) {
                    if (rows[i][j][0] === el) { r = i; c = j; return; }
                }
            }
        };

        this.focus = function () {
            refresh();
            if (!row(r).length) {
                for (var i = 0; i < rows.length; i++) if (rows[i].length) { r = i; c = 0; break; }
            }
            var list = row(r);
            if (!list.length) return;
            c = Math.max(0, Math.min(c, list.length - 1));
            Lampa.Controller.collectionFocus(list[c], scroll.render());
        };

        this.step = function (d) {
            refresh();
            var n = r + d;
            while (n >= 0 && n < rows.length && !rows[n].length) n += d;
            if (n < 0 || n >= rows.length) return false;
            r = n;
            this.focus();
            return true;
        };

        this.bind = function () {
            Lampa.Controller.add(name, {
                toggle: function () {
                    if (self.onToggle) self.onToggle();
                    Lampa.Controller.collectionSet(scroll.render());
                    self.focus();
                },
                left: function () {
                    refresh();
                    if (c > 0) { c--; self.focus(); }
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    refresh();
                    if (c < row(r).length - 1) { c++; self.focus(); }
                },
                up: function () {
                    if (!self.step(-1)) Lampa.Controller.toggle('head');
                },
                down: function () { self.step(1); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle(name);
        };
    }

    function openTitle(t) {
        Lampa.Activity.push({ url: '', title: t.title, component: 'doramyclub_title', item: brief(t), page: 1 });
    }

    function openCatalog(path, title) {
        Lampa.Activity.push({ url: '', title: title, component: 'doramyclub_main', catalog: { path: path, title: title }, page: 1 });
    }

    function openMarks(kind) {
        Lampa.Activity.push({ url: '', title: LISTS[kind], component: 'doramyclub_main', marks: kind, page: 1 });
    }

    function openSearch(query) {
        Lampa.Activity.push({ url: '', title: 'Поиск: ' + query, component: 'doramyclub_main', query: query, page: 1 });
    }

    function askSearch(back) {
        var prev = Lampa.Storage.get('doramy_last_query', '') || '';
        Lampa.Input.edit({ title: 'Поиск дорам', value: prev, free: true, nosave: true }, function (q) {
            Lampa.Controller.toggle(back || 'content');
            q = ('' + (q || '')).trim();
            if (q.length < 2) return;
            Lampa.Storage.set('doramy_last_query', q);
            openSearch(q);
        });
    }

    // Каталог как на сайте: разделы, страны, жанры, годы. Второй уровень — отдельным списком.
    function openCatalogMenu() {
        var back = function () { Lampa.Controller.toggle('content'); };
        loadMenu(function (menu) {
            var sub = function (title, list) {
                setTimeout(function () {
                    Lampa.Select.show({
                        title: title,
                        items: list.map(function (g) { return { title: g[0], value: g }; }),
                        onSelect: function (it) { back(); openCatalog(it.value[1], title + ': ' + it.value[0]); },
                        onBack: back
                    });
                }, 80);
            };
            var items = menu.sections.map(function (s) { return { title: s[0], path: s[1] }; });
            items.push({ title: 'Страны ▸', group: 'countries' }, { title: 'Жанры ▸', group: 'genres' }, { title: 'Годы ▸', group: 'years' });
            Lampa.Select.show({
                title: 'Каталог',
                items: items,
                onSelect: function (it) {
                    if (it.path) { back(); return openCatalog(it.path, it.title); }
                    sub({ countries: 'Страна', genres: 'Жанр', years: 'Год' }[it.group], menu[it.group]);
                },
                onBack: back
            });
        });
    }

    function openMarksMenu() {
        var back = function () { Lampa.Controller.toggle('content'); };
        Lampa.Select.show({
            title: 'Мои списки',
            items: LIST_KEYS.map(function (k) { return { title: LISTS[k] + ' (' + markedItems(k).length + ')', value: k }; }),
            onSelect: function (it) { back(); openMarks(it.value); },
            onBack: back
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Component: главная / каталог / поиск / списки                     */
    /* ------------------------------------------------------------------ */

    var DASH = [['Новинки', '/1-novinki'], ['Топ', '/top'], ['Сериалы', '/serialy'], ['Фильмы', '/filmy']];

    function MainComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div class="dc"></div>');
        var grid = new Grid('content', scroll);
        var sections = [], btns = [], bar;
        var destroyed = false, token = 0, builtSig = '', lastData = null;
        var page = 1, more = false, busy = false, moreBtn = null, lastBox = null, lastItems = null;
        var lazy = new Lazy({ margin: 2, trickle: 4 });

        scroll.minus();
        html.append(scroll.render());

        function card(t, badge, pct) {
            var el = $('<div class="dc-card selector"><div class="dc-card__img"><img alt=""/></div>' +
                '<div class="dc-card__title"></div><div class="dc-card__sub"></div></div>');
            el.find('.dc-card__title').text(t.title);
            el.find('.dc-card__sub').text([t.year || '', t.country || ''].filter(function (x) { return x; }).join(' · '));
            lazy.add(el.find('img'), t.poster);
            var img = el.find('.dc-card__img');
            var b = badge || (t.mini ? 'Мини' : '') || t.info;
            if (b) img.append($('<div class="dc-card__badge"></div>').text(b));
            if (t.rating) img.append($('<div class="dc-card__rate"></div>').text(t.rating.toFixed(1)));
            if (pct > 0 && pct < 90) img.append($('<div class="dc-card__bar"><div></div></div>').find('div').css('width', pct + '%').end());
            return el;
        }

        function cardNode(t, badge, opts) {
            opts = opts || {};
            var el = card(t, badge, opts.pct && opts.pct(t));
            el.on('hover:focus', function () {
                grid.track(el);
                scroll.update(el, false);
                setTimeout(function () { lazy.check(); }, 60);
            });
            if (opts.onLong) {
                el.on('hover:long', function () { opts.onLong(t); });
                el.on('contextmenu', function (e) { e.preventDefault(); opts.onLong(t); });
            }
            el.on('hover:hover hover:touch', function () { grid.track(el); });
            el.on('hover:enter', function () { openTitle(t); });
            return el;
        }

        // Секция — адаптивная сетка с переносом строк; moreAct добавляет карточку «Все →»
        function row(title, list, badgeFn, opts, moreAct) {
            opts = opts || {};
            var items = [];
            var wrap = $('<div class="dc-row"><div class="dc-row__title"></div><div class="dc-grid"></div></div>');
            var box = wrap.find('.dc-grid');
            wrap.find('.dc-row__title').text(title).toggle(!!title);
            list.forEach(function (t) {
                var el = cardNode(t, badgeFn && badgeFn(t), opts);
                box.append(el);
                items.push(el);
            });
            if (moreAct) {
                var m = $('<div class="dc-card dc-card--more selector"><div class="dc-card__img"><div class="dc-card__more">Все →</div></div></div>');
                m.on('hover:focus', function () { grid.track(m); scroll.update(m, false); });
                m.on('hover:hover hover:touch', function () { grid.track(m); });
                m.on('hover:enter', moreAct);
                box.append(m);
                items.push(m);
            }
            scroll.append(wrap);
            sections.push(items);
            lastBox = box;
            lastItems = items;
        }

        function layoutRows() {
            var out = [btns];
            sections.forEach(function (items) {
                var byTop = {}, tops = [];
                items.forEach(function (el) {
                    var t = el[0].offsetTop;
                    if (!byTop[t]) { byTop[t] = []; tops.push(t); }
                    byTop[t].push(el);
                });
                tops.sort(function (x, y) { return x - y; });
                tops.forEach(function (t) { out.push(byTop[t]); });
            });
            if (moreBtn && more) out.push([moreBtn]);
            return out;
        }

        function button(label, act) {
            var el = $('<div class="dc-btn selector"></div>').text(label);
            el.on('hover:focus', function () { grid.track(el); scroll.update(bar, false); });
            el.on('hover:hover hover:touch', function () { grid.track(el); });
            el.on('hover:enter', act);
            bar.append(el);
            return el;
        }

        function toolbar() {
            bar = $('<div class="dc-bar"></div>');
            btns = [];
            if (object.catalog || object.query || object.marks) {
                btns.push(button('← Главная', function () {
                    Lampa.Activity.replace({ url: '', title: 'Doramy.club', component: 'doramyclub_main', page: 1 }, true);
                }));
            }
            btns.push(button('Поиск', function () { askSearch('content'); }));
            btns.push(button('Каталог', openCatalogMenu));
            btns.push(button('Мои списки', openMarksMenu));
            if (!object.query && !object.marks) btns.push(button('Обновить', function () { self.reload(true); }));
            var pl = button('Плеер: ' + PLAYERS[setting('doramy_player', 'lampa')], function () {
                choosePlayer(function (v) {
                    pl.text('Плеер: ' + PLAYERS[v]);
                    Lampa.Controller.toggle('content');
                });
            });
            btns.push(pl);
            scroll.append(bar);
        }

        function history() { return historyList().slice(0, 20); }

        function histSig() {
            return history().map(function (h) { return h.id + ':' + h.last + ':' + h.ts; }).join('|');
        }

        function historyMenu(h) {
            Lampa.Select.show({
                title: h.title,
                items: [
                    { title: 'Открыть', run: function () { openTitle(h); } },
                    { title: 'Удалить из истории', run: function () { var st = getMap('doramy_state'); delete st[h.id]; Lampa.Storage.set('doramy_state', st); build(lastData); } },
                    { title: 'Очистить всю историю', run: function () { Lampa.Storage.set('doramy_state', {}); build(lastData); } }
                ],
                onSelect: function (it) { Lampa.Controller.toggle('content'); it.run(); },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }

        function finish() {
            grid.layout(layoutRows);
            grid.at(sections.length ? 1 : 0, 0);
            self.activity.loader(false);
            self.activity.toggle();
            setTimeout(function () { lazy.check(); }, 100);
        }

        // data: [{ title, items, path? }]
        function build(data) {
            lastData = data;
            builtSig = histSig();
            lazy.reset();
            scroll.clear();
            sections = [];
            toolbar();

            var dashboard = !object.query && !object.catalog && !object.marks;
            if (dashboard) {
                var hist = history();
                if (hist.length) {
                    row('Продолжить просмотр', hist, function (h) {
                        var extra = h.count && h.total > h.count ? ' · +' + (h.total - h.count) : '';
                        return h.lastName ? h.lastName + extra : '';
                    }, {
                        pct: function (h) { return Lampa.Timeline.view(episodeHash(h.id, h.last ? 'e' + h.last : 'film')).percent; },
                        onLong: historyMenu
                    });
                }
            }
            if (!data.length || !data.some(function (s) { return s.items.length; })) {
                scroll.append($('<div class="dc-empty">Ничего не найдено</div>'));
            }
            data.forEach(function (s) {
                if (!s.items.length) return;
                row(s.title, s.items, null, null, s.path ? function () { openCatalog(s.path, s.title); } : null);
            });
            if (more && !dashboard && !object.marks) addMoreButton();
            finish();
        }

        function addMoreButton() {
            moreBtn = $('<div class="dc-btn dc-btn--more selector">Загрузить ещё</div>');
            moreBtn.on('hover:focus', function () { grid.track(moreBtn); scroll.update(moreBtn, false); });
            moreBtn.on('hover:hover hover:touch', function () { grid.track(moreBtn); });
            moreBtn.on('hover:enter', loadMore);
            scroll.append($('<div class="dc-more"></div>').append(moreBtn));
        }

        function pageLoader(p, ok, fail) {
            if (object.query) loadSearch(object.query, p, ok, fail);
            else loadList(object.catalog.path, p, ok, fail, p === 1 && false);
        }

        function loadMore() {
            if (busy || !more) return;
            busy = true;
            moreBtn.text('Загружаю…');
            var mine = token, next = page + 1;
            pageLoader(next, function (items, hasMore) {
                busy = false;
                if (destroyed || mine !== token) return;
                items.forEach(function (t) {
                    var el = cardNode(t);
                    lastBox.append(el);
                    lastItems.push(el);
                });
                page = next;
                more = hasMore;
                if (hasMore) moreBtn.text('Загрузить ещё');
                else { moreBtn.parent().remove(); moreBtn = null; }
                setTimeout(function () { lazy.check(); }, 100);
            }, function () {
                busy = false;
                if (!destroyed) moreBtn.text('Не удалось загрузить — повторить');
            });
        }

        function fail(e) {
            scroll.clear();
            sections = [];
            toolbar();
            scroll.append($('<div class="dc-empty"></div>').text(errorText(e)));
            finish();
        }

        this.reload = function (force) {
            var mine = ++token;
            var alive = function () { return !destroyed && mine === token; };
            moreBtn = null;
            busy = false;
            page = 1;
            self.activity.loader(true);
            if (object.marks) {
                build([{ title: LISTS[object.marks], items: markedItems(object.marks) }]);
            } else if (object.query || object.catalog) {
                pageLoader(1, function (items, hasMore) {
                    if (!alive()) return;
                    more = hasMore;
                    var title = object.query ? 'Найдено по запросу «' + object.query + '»' : object.catalog.title;
                    build([{ title: title, items: items }]);
                }, function (e) { if (alive()) fail(e); });
            } else {
                var left = DASH.length, res = [], errs = 0, lastErr = '';
                DASH.forEach(function (d, i) {
                    loadList(d[1], 1, function (items) {
                        res[i] = { title: d[0], items: items, path: d[1] };
                        if (!--left && alive()) done();
                    }, function (e) {
                        errs++;
                        lastErr = e;
                        res[i] = { title: d[0], items: [] };
                        if (!--left && alive()) done();
                    }, force);
                });
                var done = function () {
                    if (errs === DASH.length) fail(lastErr);
                    else build(res);
                };
            }
        };

        this.create = function () {
            lazy.start();
            this.reload(false);
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            if (object.marks) return this.reload(false);
            if (lastData && builtSig !== histSig()) return build(lastData);
            grid.bind();
        };

        this.pause = function () {};
        this.stop = function () {};
        this.render = function () { return html; };
        this.destroy = function () { destroyed = true; lazy.stop(); scroll.destroy(); html.remove(); };
    }

    /* ------------------------------------------------------------------ */
    /*  Component: страница тайтла                                        */
    /* ------------------------------------------------------------------ */

    var ROW_BTNS = 0, ROW_EPS = 1, ROW_SIM = 2;

    function TitleComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div class="dc"></div>');
        var grid = new Grid('content', scroll);
        var item = object.item, d = null;
        var tracks = [], others = [], othersState = 'idle', cur = 0, eps = [], epNodes = [];
        var rows = [[], [], []];
        var continueBtn, voiceBtn, head, epsHost, simHost, btnsBox;
        var destroyed = false, token = 0, tlTimer = null;
        var epLazy = new Lazy({ margin: 1 });

        scroll.minus();
        html.append(scroll.render());

        function onTimeline() {
            clearTimeout(tlTimer);
            tlTimer = setTimeout(function () { if (!destroyed && eps.length) refreshProgress(); }, 400);
        }

        function viewOf(ep) { return Lampa.Timeline.view(episodeHash(item.id, epKey(ep))); }

        function buildEps() {
            var tr = tracks[cur];
            eps = [];
            if (!tr) return;
            for (var i = 0; i < tr.links.length; i++) {
                var movie = d.kind === 'movie' || (tr.links.length === 1 && !d.total && d.kind !== 'serial');
                eps.push({ num: movie ? 0 : i + 1, name: movie ? item.title : (i + 1) + ' серия', link: tr.links[i] });
            }
        }

        function resumeIndex() {
            var st = getMap('doramy_state')[item.id];
            if (!st) return 0;
            var idx = -1;
            for (var k = 0; k < eps.length; k++) if (eps[k].num === st.last) { idx = k; break; }
            if (idx < 0) return 0;
            if (viewOf(eps[idx]).percent >= 90 && idx + 1 < eps.length) return idx + 1;
            return idx;
        }

        function play(idx) {
            var t = $.extend({}, item, { title: d.title || item.title, poster: d.poster || item.poster, year: d.year || item.year, country: d.country || item.country, total: d.total });
            playEpisode(t, eps, idx, function () {
                refreshProgress();
                grid.at(ROW_EPS, idx);
                Lampa.Controller.toggle('content');
            });
        }

        function setWatched(i, watched) {
            var v = viewOf(eps[i]), dur = v.duration || 1;
            Lampa.Timeline.update({ hash: v.hash, percent: watched ? 100 : 0, time: watched ? dur : 0, duration: watched ? dur : 0 });
        }

        function episodeMenu(i) {
            var ep = eps[i], v = viewOf(ep), watched = v.percent >= 90;
            var items = [
                { title: watched ? 'Отметить непросмотренной' : 'Отметить просмотренной', run: function () { setWatched(i, !watched); } },
                { title: 'Отметить просмотренными все до этой', run: function () { for (var k = 0; k <= i; k++) setWatched(k, true); } }
            ];
            if (v.percent > 0 || v.time > 5) items.push({ title: 'Сбросить прогресс серии', run: function () { setWatched(i, false); } });
            items.push({ title: 'Сбросить прогресс всего тайтла', run: function () { for (var k = 0; k < eps.length; k++) setWatched(k, false); } });
            Lampa.Select.show({
                title: ep.name,
                items: items,
                onSelect: function (it) { Lampa.Controller.toggle('content'); it.run(); refreshProgress(); },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }

        function epNode(ep, idx, line, wrap) {
            var el = $('<div class="dc-ep selector"><div class="dc-ep__name"></div><div class="dc-ep__sub"></div>' +
                '<div class="dc-ep__bar"><div></div></div></div>');
            el.find('.dc-ep__name').text(ep.num ? ep.num + ' серия' : 'Смотреть');
            if (!ep.link) el.addClass('nolink');
            el.on('hover:focus', function () {
                grid.track(el);
                line.update(el, true);
                scroll.update(wrap, false);
            });
            el.on('hover:hover hover:touch', function () { grid.track(el); });
            el.on('hover:enter', function () { play(idx); });
            el.on('hover:long', function () { episodeMenu(idx); });
            el.on('contextmenu', function (e) { e.preventDefault(); episodeMenu(idx); });
            return el;
        }

        function refreshProgress() {
            for (var i = 0; i < eps.length; i++) {
                var el = epNodes[i];
                if (!el) continue;
                var v = viewOf(eps[i]);
                el.toggleClass('watched', v.percent >= 90);
                el.find('.dc-ep__bar').toggle(v.percent > 0 && v.percent < 90);
                el.find('.dc-ep__bar div').css('width', Math.min(100, v.percent) + '%');
                el.find('.dc-ep__sub').text(v.percent >= 90 ? 'Просмотрено' : v.time > 5 ? 'Остановились на ' + fmtTime(v.time) : '');
            }
            if (continueBtn && eps.length) {
                var r = resumeIndex(), rv = eps[r] ? viewOf(eps[r]) : null, st = getMap('doramy_state')[item.id];
                var label = eps[r].num ? eps[r].name : 'фильм';
                continueBtn.text(st ? 'Продолжить: ' + label + (rv && rv.time > 5 && rv.percent < 90 ? ' (' + fmtTime(rv.time) + ')' : '') : 'Смотреть' + (eps[0].num ? ': ' + eps[0].name : ''));
            }
        }

        function renderEpisodes() {
            epsHost.empty();
            epLazy.reset();
            epNodes = [];
            if (!eps.length) {
                epsHost.append($('<div class="dc-empty">Видео для этого тайтла пока нет. Попробуйте другую озвучку или зайдите позже.</div>'));
                rows[ROW_EPS] = [];
                return;
            }
            var wrap = $('<div class="dc-row dc-row--eps"><div class="dc-row__title"></div></div>');
            wrap.find('.dc-row__title').text(d.kind === 'movie' ? 'Фильм' : 'Серии (' + eps.length + ')');
            var line = new Lampa.Scroll({ horizontal: true, step: 450 });
            var nodes = [];
            for (var i = 0; i < eps.length; i++) {
                var n = epNode(eps[i], i, line, wrap);
                epNodes[i] = n;
                nodes.push(n);
                line.append(n);
            }
            wrap.append(line.render());
            epsHost.append(wrap);
            rows[ROW_EPS] = nodes;
            refreshProgress();
        }

        function selectTrack(i) {
            cur = i;
            buildEps();
            renderEpisodes();
            voiceBtn.text('Озвучка: ' + tracks[cur].title);
            grid.set(rows, true);
            var m = getMap('doramy_voice');
            m[item.id] = tracks[i].title;
            Lampa.Storage.set('doramy_voice', m);
        }

        function initialTrack() {
            var saved = getMap('doramy_voice')[item.id];
            for (var i = 0; i < tracks.length; i++) if (saved && tracks[i].title === saved) return i;
            var pref = setting('doramy_voice_pref', 'voice');
            for (var j = 0; j < tracks.length; j++) {
                var sub = /субтитр/i.test(tracks[j].title);
                if ((pref === 'subs') === sub) return j;
            }
            return 0; // у тайтла только один вариант (например, одни субтитры) — берём его
        }

        function countEps(t) {
            var n = 0;
            for (var i = 0; i < t.links.length; i++) if (t.links[i]) n++;
            return n;
        }

        // У озвучек разное число серий: показываем «N из всего», если озвучена только часть
        function countText(n) {
            if (!n) return '';
            return ' · ' + (d.total && n < d.total ? n + ' из ' + d.total : n) + ' эп.';
        }

        function hasMainVoice() {
            for (var i = 0; i < tracks.length; i++) if (tracks[i].main && tracks[i].tab === 'Озвучка') return true;
            return false;
        }

        // Остальные озвучки/субтитры берём из Kodik (у сайта это вкладка «Другие озвучки»)
        function fetchOthers(cb) {
            if (!d.iframe) { othersState = 'ok'; others = []; return cb && cb(); }
            othersState = 'loading';
            var mine = token;
            loadTranslations(d.iframe, function (list) {
                if (destroyed || mine !== token) return;
                others = list.filter(function (t) {
                    // основную озвучку сайт уже показал вкладкой «Озвучка» — не дублируем
                    return !(d.studio && !t.subs && hasMainVoice() && t.title.toLowerCase() === d.studio.toLowerCase());
                });
                othersState = 'ok';
                cb && cb();
            }, function () {
                if (destroyed || mine !== token) return;
                othersState = 'fail';
                cb && cb();
            });
        }

        function pickOther(t) {
            loadTrack(t, function (track) {
                if (destroyed) return;
                track.extra = true;
                for (var i = 0; i < tracks.length; i++) if (tracks[i].title === track.title) { tracks[i] = track; return selectTrack(i); }
                tracks.push(track);
                selectTrack(tracks.length - 1);
            }, function () { Lampa.Noty.show('Не удалось загрузить серии этой озвучки'); });
        }

        // Выбор озвучки одним списком: основная (с сайта) → субтитры → дополнительные (Kodik)
        function voiceMenu() {
            var back = function () { Lampa.Controller.toggle('content'); };
            var items = [];
            tracks.forEach(function (t, i) {
                if (!t.main) return;
                items.push({ title: t.title + countText(countEps(t)), subtitle: /субтитр/i.test(t.title) ? 'субтитры' : 'основная озвучка', value: i, selected: i === cur });
            });
            others.forEach(function (t) {
                var title = trackTitle(t), sel = false;
                for (var i = 0; i < tracks.length; i++) if (tracks[i].extra && tracks[i].title === title) sel = i === cur;
                items.push({ title: title + countText(t.count), subtitle: t.subs ? 'субтитры' : 'дополнительная озвучка', other: t, selected: sel });
            });
            if (d.iframe && othersState !== 'ok') {
                items.push({ title: othersState === 'loading' ? 'Другие озвучки загружаются…' : 'Загрузить другие озвучки', reload: true });
            }
            if (!items.length) return Lampa.Noty.show('Для этого тайтла нет видео');
            Lampa.Select.show({
                title: 'Озвучка',
                items: items,
                onSelect: function (it) {
                    back();
                    if (it.reload) {
                        if (othersState !== 'loading') fetchOthers(function () { Lampa.Noty.show(othersState === 'ok' ? 'Озвучки загружены' : 'Не удалось загрузить озвучки'); });
                        return;
                    }
                    if (it.other) return pickOther(it.other);
                    selectTrack(it.value);
                },
                onBack: back
            });
        }

        function qualityMenu() {
            var cur = setting('doramy_quality', 'best');
            var vals = { best: 'Лучшее', '720': '720p', '480': '480p', '360': '360p' };
            Lampa.Select.show({
                title: 'Качество',
                items: Object.keys(vals).map(function (k) { return { title: vals[k], value: k, selected: k === cur }; }),
                onSelect: function (it) {
                    Lampa.Storage.set('doramy_quality', it.value);
                    streamMem = {};
                    Lampa.Controller.toggle('content');
                    qBtn.text('Качество: ' + vals[it.value]);
                },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }
        var qBtn;

        function listsMenu() {
            var m = marksOf(item.id);
            var items = [{ title: (m.fav ? '✓ ' : '') + 'Избранное', fav: true }];
            LIST_KEYS.slice(1).forEach(function (k) { items.push({ title: (m.status === k ? '✓ ' : '') + LISTS[k], status: k }); });
            if (m.status) items.push({ title: 'Убрать из списка статуса', status: '' });
            var t = $.extend({}, item, { title: d.title || item.title, poster: d.poster || item.poster, year: d.year || item.year, country: d.country || item.country });
            Lampa.Select.show({
                title: 'Мои списки',
                items: items,
                onSelect: function (it) {
                    Lampa.Controller.toggle('content');
                    if (it.fav) setMark(t, { fav: !m.fav });
                    else setMark(t, { status: m.status === it.status ? '' : it.status });
                    var nm = marksOf(item.id);
                    listBtn.text(listLabel(nm));
                },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }
        var listBtn;

        function listLabel(m) {
            var parts = [];
            if (m.fav) parts.push('★');
            if (m.status) parts.push(LISTS[m.status]);
            return 'В списки' + (parts.length ? ': ' + parts.join(' · ') : '');
        }

        function showDescription() {
            var box = $('<div class="dc-modal"></div>');
            box.append($('<div class="dc-modal__text"></div>').text(d.description));
            Lampa.Modal.open({
                title: d.title,
                html: box,
                size: 'medium',
                onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('content'); }
            });
        }

        // Актёры, канал, студия озвучки → каталог сайта с их тайтлами
        function peopleMenu() {
            var items = [];
            d.links.forEach(function (l) { items.push({ title: l.label + ': ' + l.title, path: l.path, name: l.title }); });
            d.cast.forEach(function (c) { items.push({ title: c.name + (c.role ? ' — ' + c.role : ''), path: c.path, name: c.name }); });
            Lampa.Select.show({
                title: 'Актёры, канал, студия',
                items: items,
                onSelect: function (it) { Lampa.Controller.toggle('content'); openCatalog(it.path, it.name); },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }

        function genresMenu() {
            loadMenu(function (menu) {
                var items = [];
                d.genres.forEach(function (g) {
                    for (var i = 0; i < menu.genres.length; i++) if (menu.genres[i][0].toLowerCase() === g.toLowerCase()) items.push({ title: g, path: menu.genres[i][1] });
                });
                if (d.country) menu.countries.forEach(function (c) { if (c[0].toLowerCase() === d.country.toLowerCase()) items.push({ title: d.country, path: c[1] }); });
                if (!items.length) return Lampa.Noty.show('Для жанров этого тайтла нет разделов');
                Lampa.Select.show({
                    title: 'Жанры и страна',
                    items: items,
                    onSelect: function (it) { Lampa.Controller.toggle('content'); openCatalog(it.path, it.title); },
                    onBack: function () { Lampa.Controller.toggle('content'); }
                });
            });
        }

        function button(container, label, act) {
            var el = $('<div class="dc-btn selector"></div>').text(label);
            el.on('hover:focus', function () { grid.track(el); scroll.update(head, false); });
            el.on('hover:hover hover:touch', function () { grid.track(el); });
            el.on('hover:enter', act);
            container.append(el);
            return el;
        }

        function failView(msg, retry) {
            scroll.clear();
            head = $('<div class="dc-title"><div class="dc-title__body"></div></div>');
            var body = head.find('.dc-title__body');
            body.append($('<div class="dc-empty"></div>').text(msg));
            var wb = $('<div class="dc-title__btns"></div>');
            var again = button(wb, 'Повторить', retry);
            var back = button(wb, 'Назад', function () { Lampa.Activity.backward(); });
            body.append(wb);
            scroll.append(head);
            rows = [[again, back], [], []];
            grid.set(rows);
            grid.at(0, 0);
            self.activity.loader(false);
            self.activity.toggle();
        }

        function facts() {
            var out = [];
            var f = d.fields;
            if (f['Сериал']) out.push(f['Сериал']);
            else if (f['Фильм']) out.push(f['Фильм']);
            if (f['Время']) out.push(f['Время']);
            if (f['Статус']) out.push(f['Статус']);
            var s = [];
            if (d.voiceEp) s.push('озвучка: ' + d.voiceEp + ' серия');
            if (d.subsEp) s.push('субтитры: ' + d.subsEp + ' серия');
            var lines = [out.join(' · ')];
            if (s.length) lines.push('Вышло — ' + s.join(', '));
            if (f['Перевод']) lines.push('Перевод: ' + f['Перевод']);
            return lines.filter(function (x) { return x; });
        }

        function build(det, offline) {
            d = det;
            tracks = (d.tracks || []).slice();
            scroll.clear();
            epLazy.reset();

            head = $('<div class="dc-title"><div class="dc-title__poster"><img alt=""/></div><div class="dc-title__body"></div></div>');
            setImage(head.find('.dc-title__poster img'), d.poster || item.poster);
            var body = head.find('.dc-title__body');
            body.append($('<div class="dc-title__name"></div>').text(d.title || item.title));
            if (item.orig) body.append($('<div class="dc-title__orig"></div>').text(item.orig));
            var meta = $('<div class="dc-title__meta"></div>');
            if (d.rating) meta.append($('<span class="dc-title__rate"></span>').text(d.rating.toFixed(1)));
            meta.append(document.createTextNode([d.year || '', d.country || '', (d.genres || []).join(', ')].filter(function (x) { return x; }).join(' · ')));
            body.append(meta);
            if (d.note) body.append($('<div class="dc-title__note"></div>').text(d.note));
            if (offline) body.append($('<div class="dc-title__note"></div>').text('Нет связи с сайтом — показаны сохранённые данные'));
            body.append($('<div class="dc-title__facts"></div>').html($.map(facts(), function (l) { return $('<div></div>').text(l)[0].outerHTML; }).join('')));
            if (d.description) body.append($('<div class="dc-title__descr"></div>').text(d.description));

            btnsBox = $('<div class="dc-title__btns"></div>');
            continueBtn = button(btnsBox, 'Смотреть', function () { if (eps.length) play(resumeIndex()); });
            voiceBtn = button(btnsBox, 'Озвучка', voiceMenu);
            qBtn = button(btnsBox, 'Качество: ' + ({ best: 'Лучшее', '720': '720p', '480': '480p', '360': '360p' }[setting('doramy_quality', 'best')]), qualityMenu);
            var plBtn = button(btnsBox, 'Плеер: ' + PLAYERS[setting('doramy_player', 'lampa')], function () {
                choosePlayer(function (v) { plBtn.text('Плеер: ' + PLAYERS[v]); Lampa.Controller.toggle('content'); });
            });
            listBtn = button(btnsBox, listLabel(marksOf(item.id)), listsMenu);
            var descrBtn = d.description ? button(btnsBox, 'Описание', showDescription) : null;
            var ppl = (d.links.length || d.cast.length) ? button(btnsBox, 'Актёры и студия', peopleMenu) : null;
            var gen = (d.genres.length || d.country) ? button(btnsBox, 'Жанры', genresMenu) : null;
            var lampaBtn = (Lampa.Search && Lampa.Search.open) ? button(btnsBox, 'Карточка Lampa', function () {
                Lampa.Search.open({ input: d.title || item.title });
            }) : null;
            body.append(btnsBox);
            scroll.append(head);

            epsHost = $('<div class="dc-eps-host"></div>');
            scroll.append(epsHost);
            simHost = $('<div class="dc-sim-host"></div>');
            scroll.append(simHost);

            var btnRow = [continueBtn, voiceBtn, qBtn, plBtn, listBtn];
            [descrBtn, ppl, gen, lampaBtn].forEach(function (b) { if (b) btnRow.push(b); });
            rows = [btnRow, [], []];

            // Основная озвучка и субтитры — вкладки сайта; остальные озвучки грузим из Kodik в фоне
            if (tracks.length) {
                cur = initialTrack();
                buildEps();
                renderEpisodes();
                voiceBtn.text('Озвучка: ' + tracks[cur].title);
                fetchOthers();
            } else if (d.iframe) {
                // на сайте нет вкладок (только iframe Kodik) — выбираем из списка Kodik по предпочтению
                voiceBtn.text('Озвучка: загрузка…');
                fetchOthers(function () {
                    var pref = setting('doramy_voice_pref', 'voice'), pick = null;
                    for (var i = 0; i < others.length && !pick; i++) if ((pref === 'subs') === !!others[i].subs) pick = others[i];
                    pick = pick || others[0];
                    if (!pick) return voiceBtn.text('Озвучка: недоступна');
                    loadTrack(pick, function (tr) {
                        if (destroyed) return;
                        tr.extra = true;
                        tracks.push(tr);
                        selectTrack(tracks.length - 1);
                        grid.at(ROW_BTNS, 0);
                    }, function () { voiceBtn.text('Озвучка: недоступна'); });
                });
            } else {
                renderEpisodes();
                voiceBtn.text('Озвучка: нет видео');
            }

            if (d.similar && d.similar.length) renderSimilar();

            // хотя бы один выбираемый элемент всегда есть — кнопки
            grid.set(rows);
            grid.at(eps.length && getMap('doramy_state')[item.id] ? ROW_EPS : ROW_BTNS, eps.length && getMap('doramy_state')[item.id] ? resumeIndex() : 0);
            self.activity.loader(false);
            self.activity.toggle();
            setTimeout(function () { epLazy.check(); }, 100);
        }

        function renderSimilar() {
            var wrap = $('<div class="dc-row dc-row--sim"><div class="dc-row__title">Похожие</div></div>');
            var line = new Lampa.Scroll({ horizontal: true, step: 450 });
            var nodes = [];
            d.similar.forEach(function (t) {
                var el = $('<div class="dc-sim selector"><div class="dc-card__img"><img alt=""/></div><div class="dc-card__title"></div></div>');
                el.find('.dc-card__title').text(t.title);
                epLazy.add(el.find('img'), t.poster);
                el.on('hover:focus', function () { grid.track(el); line.update(el, true); scroll.update(wrap, false); setTimeout(function () { epLazy.check(); }, 60); });
                el.on('hover:hover hover:touch', function () { grid.track(el); });
                el.on('hover:enter', function () { openTitle(t); });
                nodes.push(el);
                line.append(el);
            });
            wrap.append(line.render());
            simHost.append(wrap);
            rows[ROW_SIM] = nodes;
        }

        function load() {
            var mine = ++token;
            self.activity.loader(true);
            loadDetail(item, function (det, offline) {
                if (destroyed || mine !== token) return;
                build(det, offline);
            }, function (e) {
                if (destroyed || mine !== token) return;
                failView(errorText(e), load);
            });
        }

        function onVisible() {
            if (!document.hidden && !destroyed && eps.length) refreshProgress();
        }

        this.create = function () {
            self.activity.loader(true);
            epLazy.start();
            document.addEventListener('visibilitychange', onVisible);
            if (Lampa.Timeline && Lampa.Timeline.listener) Lampa.Timeline.listener.follow('update', onTimeline);
            load();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            refreshProgress();
            grid.bind();
        };

        this.pause = function () {};
        this.stop = function () {};
        this.render = function () { return html; };
        this.destroy = function () {
            destroyed = true;
            epLazy.stop();
            document.removeEventListener('visibilitychange', onVisible);
            clearTimeout(tlTimer);
            if (Lampa.Timeline && Lampa.Timeline.listener && Lampa.Timeline.listener.remove) Lampa.Timeline.listener.remove('update', onTimeline);
            scroll.destroy();
            html.remove();
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Menu + settings + search + rows                                   */
    /* ------------------------------------------------------------------ */

    var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-7-4.6-9-9.2C1.6 8 3.7 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.3 0 5.4 3.5 4 7.3C19 16.4 12 21 12 21z"/></svg>';

    function addMenu() {
        if ($('.menu .menu__list [data-action="doramyclub"]').length) return;
        var item = $('<li class="menu__item selector" data-action="doramyclub">' +
            '<div class="menu__ico">' + ICON + '</div>' +
            '<div class="menu__text">Doramy.club</div></li>');
        item.on('hover:enter', function () {
            Lampa.Activity.push({ url: '', title: 'Doramy.club', component: 'doramyclub_main', page: 1 });
        });
        $('.menu .menu__list').eq(0).append(item);
    }

    function showDiagnostics(state) {
        var lines = [
            'Версия плагина: ' + VERSION,
            'Сайт: ' + base() + ' → ' + state.site,
            'Прокси: ' + (setting('doramy_proxy', '') || 'не задан'),
            'Kodik: ' + KODIK + ' → ' + state.kodik,
            'User-Agent: ' + ((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 140)
        ];
        if (state.site.indexOf('anti-bot') >= 0) lines.push('Сайт требует проверку браузера: без прокси, который её проходит, каталог не загрузится.');
        var box = $('<div class="dc-modal"></div>').append($('<div class="dc-modal__text"></div>').text(lines.join('\n')));
        Lampa.Modal.open({
            title: 'Doramy.club: диагностика',
            html: box,
            size: 'medium',
            onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('settings_component'); }
        });
    }

    function runDiagnostics() {
        Lampa.Noty.show('Проверяю сайт и плеер…');
        var state = { site: '…', kodik: '…' }, left = 2;
        var done = function () { if (!--left) showDiagnostics(state); };
        var t0 = Date.now();
        fetchPage('/serialy', function (html) {
            state.site = 'доступен, ' + parseListing(html, base()).length + ' карточек (' + (Date.now() - t0) + ' мс)';
            done();
        }, function (e) {
            state.site = e === 'challenge' ? 'НЕДОСТУПЕН (anti-bot: проверка браузера)' : 'НЕДОСТУПЕН (' + e + ')';
            done();
        }, true);
        net(KODIK + '/', {}, function () { state.kodik = 'доступен'; done(); }, function (e) { state.kodik = 'НЕДОСТУПЕН (' + e + ')'; done(); });
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({ component: 'doramyclub', name: 'Doramy.club', icon: ICON });
        Lampa.SettingsApi.addParam({ component: 'doramyclub', param: { name: 'doramy_version', type: 'static', default: '' }, field: { name: 'Версия плагина', description: VERSION } });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_diag_btn', type: 'button' },
            field: { name: 'Диагностика', description: 'Проверить доступность сайта и плеера Kodik, показать версию и платформу' },
            onChange: runDiagnostics
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_player', type: 'select', values: PLAYERS, default: 'lampa' },
            field: { name: 'Плеер', description: 'Внешние плееры не возвращают таймкод — запоминание работает во встроенном и Android-плеере' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_player_ask', type: 'trigger', default: false },
            field: { name: 'Спрашивать плеер при каждом запуске' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_quality', type: 'select', values: { best: 'Лучшее', '720': '720p', '480': '480p', '360': '360p' }, default: 'best' },
            field: { name: 'Качество видео' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_voice_pref', type: 'select', values: { voice: 'Озвучка', subs: 'Субтитры' }, default: 'voice' },
            field: { name: 'Предпочитаемый вариант', description: 'Что открывать первым на странице тайтла, если озвучка ещё не выбиралась' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_proxy', type: 'input', values: '', default: '' },
            field: { name: 'Прокси', description: 'Префикс, к которому дописывается полный URL (например https://my-proxy.example/?url=). Нужен в браузере (CORS) и если сайт отдаёт проверку браузера. Должен пропускать POST к kodikplayer.com' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_base', type: 'input', values: '', default: DEFAULT_BASE },
            field: { name: 'Адрес сайта', description: 'Можно указать зеркало' }
        });
    }

    function toCard(t) {
        return {
            id: t.id,
            title: t.title,
            name: t.title,
            original_title: t.orig,
            original_name: t.orig,
            img: bestPoster(t.poster),
            poster: bestPoster(t.poster),
            release_date: t.year ? t.year + '-01-01' : '',
            vote_average: t.rating || 0,
            source: 'doramyclub',
            dorama: t
        };
    }

    function addGlobalSearch() {
        if (!Lampa.Search || !Lampa.Search.addSource) return;
        Lampa.Search.addSource({
            title: 'Doramy.club',
            search: function (params, done) {
                var q = decodeURIComponent(params.query || '');
                loadSearch(q, 1, function (list) {
                    done(list.length ? [{ title: 'Doramy.club', results: list.map(toCard), total: list.length }] : []);
                }, function () { done([]); });
            },
            onCancel: function () {},
            params: { lazy: true, align_left: true, card_events: { onMenu: function () {} } },
            onMore: function (params, close) {
                if (close) close();
                openSearch(decodeURIComponent(params.query || ''));
            },
            onSelect: function (params, close) {
                if (close) close();
                openTitle(params.element.dorama);
            }
        });
    }

    function addMainRows() {
        if (!Lampa.ContentRows || !Lampa.ContentRows.add) return;
        var mk = function (t) {
            var c = toCard(t);
            c.params = { emit: { onlyEnter: function () { openTitle(t); } } };
            return c;
        };
        Lampa.ContentRows.add({
            name: 'doramyclub_continue',
            title: 'Doramy.club: продолжить просмотр',
            index: 1,
            screen: ['main'],
            call: function () {
                try {
                    var hist = historyList().slice(0, 15);
                    if (!hist.length) return;
                    return function (call) { call({ results: hist.map(mk), title: 'Doramy.club: продолжить просмотр' }); };
                } catch (e) { console.log('Doramy.club', 'row continue', e); }
            }
        });
        Lampa.ContentRows.add({
            name: 'doramyclub_fav',
            title: 'Doramy.club: избранное',
            index: 2,
            screen: ['main'],
            call: function () {
                try {
                    var fav = markedItems('fav').slice(0, 15);
                    if (!fav.length) return;
                    return function (call) { call({ results: fav.map(mk), title: 'Doramy.club: избранное' }); };
                } catch (e) { console.log('Doramy.club', 'row fav', e); }
            }
        });
    }

    function start() {
        console.log('Doramy.club', 'v' + VERSION);
        injectStyle();
        hookPlayer();
        Lampa.Component.add('doramyclub_main', MainComponent);
        Lampa.Component.add('doramyclub_title', TitleComponent);
        addSettings();
        addMenu();
        try { addGlobalSearch(); } catch (e) { console.log('Doramy.club', 'global search unavailable', e); }
        try { addMainRows(); } catch (e) { console.log('Doramy.club', 'main rows unavailable', e); }
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})();
