/*!
 * Doramy.club for Lampa
 * Каталог дорам (doramy.club): новинки, сериалы, фильмы, топы, страны/жанры/годы,
 * поиск, актёры/каналы/студии, страница тайтла с выбором озвучки/субтитров,
 * серии с прогрессом, личные списки, продолжение просмотра, выбор плеера.
 * Видео: плеер сайта — Kodik; плагин сам получает прямой поток (m3u8) без iframe.
 */
(function () {
    'use strict';

    var VERSION = '0.3.0';
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
            ['Топ: всё время', '/top'], ['Топ месяца', '/top-months'], ['Топ года', '/top-year'],
            ['Русская озвучка', '/perevod/russkaya-ozvuchka'], ['Русские субтитры', '/perevod/subtitry'], ['Лакорны', '/lakorny'],
            ['Вэб-дорамы', '/razdel/vertikalnye-veb-doramy'], ['Топ вэбок', '/top-vebki'], ['Топ вэбок: популярные', '/top-vebki?sort_stat=pop']
        ],
        channels: [
            ['tvN', '/kanal/tvn'], ['Netflix', '/kanal/netflix'], ['Disney+', '/kanal/disney'], ['iQIYI', '/kanal/iqiyi'], ['SBS', '/kanal/sbs'],
            ['KBS2', '/kanal/kbs2'], ['JTBC', '/kanal/jtbc']
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

    // Списки аккаунта сайта: плагин gid-favorites (WordPress admin-ajax: action + postId + security=nonce, cookie сессии)
    var LIST_ACTIONS = {
        fav: { add: 'wfm_add', del: 'wfm_del', delh: 'wfm_del', page: '/regs-favorit' },
        later: { add: 'budu_add', del: 'budu_del', delh: 'budu_delh', page: '/regs-budu' },
        watching: { add: 'viewed_add', del: 'viewed_del', delh: 'viewed_delh', page: '/regs-view' },
        done: { add: 'zakl_add', del: 'zakl_del', delh: 'zakl_delh', page: '/regs-zakl' },
        dropped: { add: 'broh_add', del: 'broh_del', delh: 'broh_delh', page: '/regs-broh' }
    };
    var STATUS_PRIORITY = ['watching', 'later', 'done', 'dropped'];

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
            var st = p.match(/<div class="status">([^<]*)<\/div>/);
            var vo = hom ? hom[1].match(/Озвучка:[\s\S]*?<b>(\d+)<\/b>/) : null;
            var su = hom ? hom[1].match(/Субтитры:[\s\S]*?<b>(\d+)<\/b>/) : null;
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
                mini: mini,
                status: st ? strip(st[1]) : '',
                voiceEp: vo ? +vo[1] : 0,
                subsEp: su ? +su[1] : 0,
                mainRole: /class="main_akter"/.test(p)
            });
        }
        return out;
    }

    function hasNext(html) {
        return /class="next page-numbers"/.test('' + html);
    }

    // Меню сайта: жанры/разделы, годы, страны (для каталога); при сбое остаётся запасной список
    function parseMenu(html, base) {
        var seen = {}, menu = { sections: FALLBACK_MENU.sections, channels: FALLBACK_MENU.channels, countries: [], genres: [], years: [] };
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
        var rcnt = html.match(/itemprop="ratingCount">\s*([^<]*)</);
        d.ratingCount = rcnt ? parseInt(unesc(rcnt[1]).replace(/[^\d]/g, ''), 10) || 0 : 0;
        var og = html.match(/<meta property="og:image" content="([^"]+)"/);
        d.posterHd = og ? absUrl(og[1], base) : '';
        d.status = d.fields['Статус'] || '';
        d.schedule = parseSchedule(d.note);
        var cm = parseComments(html);
        d.comments = cm.list;
        d.commentsClosed = cm.closed;
        d.collections = [];
        var pb = html.indexOf('class="podbor-s"');
        if (pb >= 0) {
            var pe = html.indexOf('</ul>', pb);
            html.slice(pb, pe < 0 ? pb + 20000 : pe).replace(/<a href="([^"]*\/razdel\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g, function (m, href, inner) {
                var alt = inner.match(/alt="([^"]*)"/), title = strip(inner) || (alt ? strip(alt[1]) : '');
                if (title) d.collections.push({ path: href.replace(/^https?:\/\/[^\/]+/, ''), title: title });
                return m;
            });
        }

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
                    d.tracks.push({ title: tab === 'Озвучка' && d.studio ? tab + ' — ' + d.studio : tab, tab: tab, main: true, auto: tab === 'Автоперевод', links: lists[t] });
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

    // path может уже содержать query (/top-vebki?sort_stat=pop); пагинацию собираем сами (у /navi-cl сайт ломает ссылки '#038;')
    function listPath(path, page, query) {
        path = '' + path;
        var q = '', i = path.indexOf('?');
        if (i >= 0) { q = path.slice(i + 1); path = path.slice(0, i); }
        path = path.replace(/\/+$/, '');
        var u = page > 1 ? path + '/page/' + page : path;
        var all = [q, query || ''].filter(function (x) { return x; }).join('&');
        return all ? u + '?' + all : u;
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

    // nonce для admin-ajax лежит в инлайн-переменной wfmFavorites на страницах сайта
    function parseNonce(html) {
        var m = ('' + html).match(/wfmFavorites\s*=\s*\{[^}]*?"nonce"\s*:\s*"([a-f0-9]+)"/);
        return m ? m[1] : '';
    }

    // Логин из «Ваш профиль»: первая ячейка profpart2 — логин, вторая — e-mail (её не читаем и не храним)
    function parseAccountName(html) {
        var m = ('' + html).match(/<th class="profpart2">\s*([^<\s][^<]*?)\s*<\/th>/);
        return m ? strip(m[1]) : '';
    }

    // Страница личного списка: карточки как в каталоге; запасной вариант — ссылки на тайтлы
    function parseAccountList(html, base) {
        var items = parseListing(html, base);
        if (items.length) return items;
        var seen = {};
        ('' + html).replace(/<a[^>]+href="([^"]*\/\d+-[^"\/]*\.html)"[^>]*>([\s\S]*?)<\/a>/g, function (m, href, inner) {
            var id = postId(href);
            if (!id || seen[id]) return m;
            var img = inner.match(/<img[^>]+src="([^"]+)"/), title = strip(inner);
            if (!title) return m;
            seen[id] = 1;
            items.push({ id: id, url: absUrl(href, base), poster: img ? absUrl(img[1], base) : '', title: title, orig: '', country: '', year: 0, genres: '', info: '', rating: 0, mini: false });
            return m;
        });
        return items;
    }

    // Слияние локальных отметок и списков аккаунта.
    //   local   — { id: { fav, status, item, ts } }
    //   remote  — { fav: {id: item}, later: {...}, watching: {...}, done: {...}, dropped: {...} }
    //   pending — { id: true } для тайтлов с неотправленными операциями (локальная версия главнее)
    //   initDone — false при первой синхронизации: объединяем (union), чтобы ничего не потерять с обеих сторон
    // Возвращает { marks, ops }: итоговые отметки и операции, которые надо отправить на сайт.
    function mergeMarks(local, remote, pending, initDone) {
        var marks = {}, ops = [], ids = {}, rs = {}, id;
        LIST_KEYS.forEach(function (kind) {
            var m = remote[kind] || {};
            for (var rid in m) {
                if (!m.hasOwnProperty(rid)) continue;
                var r0 = rs[rid] || (rs[rid] = { fav: false, status: '', item: m[rid] });
                if (kind === 'fav') r0.fav = true;
                else if (!r0.status || STATUS_PRIORITY.indexOf(kind) < STATUS_PRIORITY.indexOf(r0.status)) r0.status = kind;
            }
        });
        for (id in local) if (local.hasOwnProperty(id)) ids[id] = 1;
        for (id in rs) if (rs.hasOwnProperty(id)) ids[id] = 1;
        for (id in ids) {
            if (!ids.hasOwnProperty(id)) continue;
            var l = local[id], r = rs[id], item = (r && r.item) || (l && l.item), res;
            if (pending && pending[id]) {
                res = l;
            } else if (!initDone && l) {
                res = { fav: !!(l.fav || (r && r.fav)), status: l.status || (r ? r.status : ''), item: item, ts: l.ts };
                if (l.fav && !(r && r.fav)) ops.push({ id: id, kind: 'fav', op: 'add' });
                if (l.status && (!r || r.status !== l.status)) {
                    if (r && r.status) ops.push({ id: id, kind: r.status, op: 'del' });
                    ops.push({ id: id, kind: l.status, op: 'add' });
                }
            } else if (r) {
                res = { fav: r.fav, status: r.status, item: item, ts: (l && l.ts) || 0 };
            } else {
                res = undefined; // удалено на сайте
            }
            if (res && (res.fav || res.status)) marks[id] = res;
        }
        return { marks: marks, ops: ops };
    }


    /* ---------- навигатор /navi-cl, рандом, актёры, подборки (структура сняна с живого сайта 2026-11-03) ---------- */

    var NAVI = {
        razdel: [['Все разделы', ''], ['Сериалы', 'serialy'], ['Фильмы', 'filmy']],
        strana: [['Все страны', ''], ['Южная Корея', '11'], ['Китай', '20'], ['Япония', '19'], ['Таиланд', '260'], ['Тайвань', '239'], ['Филиппины', '1210']],
        perevod: [['Любой', ''], ['Русская озвучка', '12'], ['Русские субтитры', '23']],
        studiya: [['Все озвучки', ''], ['STEPonee', '1118'], ['LE-Production', '3825'], ['SoftBox', '1091'], ['Дораманутая', '1433'], ['AMG', '1435'],
            ['Green Tea', '1131'], ['DubLik-TV', '1865'], ['Храм Дорам', '1429'], ['HighHopes', '1436'], ['XDUB DORAMA', '1437'], ['Phoenixes', '1439'],
            ['Колобок', '1494'], ['Юлия Просенюк', '1438'], ['Puski production', '1490'], ['HMP Production', '1640'], ['Light Breeze', '1936']],
        years: [['2026', '5070'], ['2025', '4056'], ['2024', '3208'], ['2023', '1947'], ['2022', '1773'], ['2021', '1657'], ['2020', '1476'], ['2019', '1252'],
            ['2018', '999'], ['2017', '18'], ['2016', '10'], ['2015', '21'], ['2014', '22'], ['2013', '141'], ['2012', '234'], ['2011', '108'], ['2010', '171'],
            ['2009', '127'], ['2008', '231'], ['2007', '165'], ['2006', '226'], ['2005', '916'], ['2004', '597'], ['2003', '326']],
        genres: [['Боевики', '3'], ['Боевые искусства', '39'], ['Военные', '28'], ['Детективы', '13'], ['Драмы', '4'], ['Исторические', '38'], ['Комедии', '25'],
            ['Криминал', '27'], ['Мелодрама', '5'], ['Мистика', '35'], ['Музыка', '29'], ['Приключения', '14'], ['Спорт', '26'], ['Ток-шоу', '31'],
            ['Триллеры', '15'], ['Ужасы', '32'], ['Фантастика', '37'], ['Фэнтези', '36']]
    };

    var RAND = {
        category: [['Всё', ''], ['Сериалы', 'serialy'], ['Фильмы', 'filmy']],
        country: [['Любая', ''], ['Корея', 'koreya'], ['Китай', 'kitaj'], ['Япония', 'yaponiya'], ['Таиланд', 'tailand'], ['Тайвань', 'tajvan']],
        perevod: [['Любой', ''], ['Озвучка', 'ozvuchka'], ['Субтитры', 'subtitry']],
        period: [['Любой', ''], ['До 2010', 'until-2010'], ['2010–2015', 'from-10-15'], ['2016–2020', 'from-16-20'], ['2021–2026', 'from-21-26']]
    };

    var COUNTRY_FILTER = [['Все страны', ''], ['Корея', 'koreya'], ['Китай', 'kitaj'], ['Япония', 'yaponiya']];

    // Строка запроса /navi-cl. f: { razdel, strana, perevod, studiya, years[], genres[], genresAnd, exclude[], sortRating, released, noMini }
    function naviQuery(f) {
        f = f || {};
        var p = [];
        var add = function (k, v) { if (v !== '' && v !== undefined && v !== null) p.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); };
        add('razdel', f.razdel); add('tax_strana', f.strana); add('tax_perevod', f.perevod); add('tax_studiya', f.studiya);
        (f.years || []).forEach(function (y) { add('tax_god[]', y); });
        (f.genres || []).forEach(function (g) { add('tag_zhanr[]', g); });
        if (f.genresAnd && f.genres && f.genres.length > 1) add('zhanr_sort', 'and');
        (f.exclude || []).forEach(function (g) { add('tag_id[]', g); });
        if (f.sortRating) add('sort_rai', 'ratings');
        if (f.released) add('sort_stat', 'released');
        if (f.noMini) add('mini_dor', 'exclude');
        return p.join('&');
    }

    function optionLabel(list, value) {
        for (var i = 0; i < list.length; i++) if (list[i][1] === value) return list[i][0];
        return '';
    }

    function optionLabels(list, values) {
        return (values || []).map(function (v) { return optionLabel(list, v); }).filter(function (x) { return x; });
    }

    function naviTitle(f) {
        var parts = [];
        if (f.razdel) parts.push(optionLabel(NAVI.razdel, f.razdel));
        if (f.strana) parts.push(optionLabel(NAVI.strana, f.strana));
        if (f.perevod) parts.push(optionLabel(NAVI.perevod, f.perevod));
        if (f.studiya) parts.push(optionLabel(NAVI.studiya, f.studiya));
        if (f.years && f.years.length) parts.push(optionLabels(NAVI.years, f.years).join(', '));
        if (f.genres && f.genres.length) parts.push(optionLabels(NAVI.genres, f.genres).join(f.genresAnd ? ' + ' : ' / '));
        if (f.sortRating) parts.push('по рейтингу');
        return 'Фильтр' + (parts.length ? ': ' + parts.join(' · ') : '');
    }

    function parseRandNonce(html) {
        var m = ('' + html).match(/rand_obj\s*=\s*\{[^}]*?"nonce"\s*:\s*"([a-f0-9]+)"/);
        return m ? m[1] : '';
    }

    function parseSeaNonce(html) {
        var m = ('' + html).match(/sea_ajax\s*=\s*\{[^}]*?"nonce"\s*:\s*"([a-f0-9]+)"/);
        return m ? m[1] : '';
    }

    // Ответ rand_posts: карточка (section.post-list) + section.info-rand (тип, главные роли, описание, подборки)
    function parseRandom(html, base) {
        html = '' + html;
        var items = parseListing(html, base);
        if (!items.length) return null;
        var it = items[0];
        var rows = [];
        (html.match(/<tbody class="tbody-rand">[\s\S]*?<\/tbody>/) || [''])[0].replace(/<td class="i1">([\s\S]*?)<\/td><td>([\s\S]*?)<\/td>/g, function (m, a, b) {
            rows.push(strip(a) + ' ' + strip(b));
            return m;
        });
        it.info = rows.join(' · ');
        var info = html.match(/<section class="info-rand">([\s\S]*?)<\/section>/);
        var inner = info ? info[1] : '';
        var roles = [];
        inner.replace(/<span data-img="([^"]*)">([\s\S]*?)<\/span>/g, function (m, img, name) {
            var n = strip(name).replace(/,\s*$/, '');
            if (n) roles.push({ name: n, photo: absUrl(img, base) });
            return m;
        });
        var pm = inner.match(/<p>([\s\S]*?)<\/p>/), kind = inner.match(/class="rand-sr">([^<]*)/);
        var collections = [];
        (inner.match(/class="rand-pod">[\s\S]*$/) || [''])[0].replace(/<li>([\s\S]*?)<\/li>/g, function (m, t) { collections.push(strip(t)); return m; });
        return { item: it, roles: roles, descr: pm ? strip(pm[1]) : '', kind: kind ? strip(kind[1]) : '', collections: collections };
    }

    // Быстрый поиск: «Ошибка! Обновите страницу» = nonce протух
    function ajaxNonceExpired(html) {
        return /Обновите страницу/.test('' + html);
    }

    function parseActorsAjax(html, base) {
        var out = [];
        ('' + html).replace(/<li><a href="([^"]*\/akter\/[^"]+)"[^>]*>\s*<img src="([^"]*)"[^>]*>\s*<span class="ajax-search-title">([\s\S]*?)<\/span>\s*(?:<u>([\s\S]*?)<\/u>)?/g, function (m, href, img, name, birth) {
            out.push({ path: href.replace(/^https?:\/\/[^\/]+/, ''), name: strip(name), photo: absUrl(img, base), birth: birth ? strip(birth) : '' });
            return m;
        });
        return out;
    }

    function parseActorsTop(html, base) {
        var i = ('' + html).indexOf('class="akt"'), out = [];
        if (i < 0) return out;
        var chunk = html.slice(i, html.indexOf('</ul>', i) < 0 ? i + 60000 : html.indexOf('</ul>', i));
        chunk.replace(/<li><a href="([^"]*\/akter\/[^"]+)"[^>]*>\s*<img src="([^"]*)"[^>]*>\s*<b>([\s\S]*?)<\/b>/g, function (m, href, img, name) {
            out.push({ path: href.replace(/^https?:\/\/[^\/]+/, ''), name: strip(name), photo: absUrl(img, base), birth: '' });
            return m;
        });
        return out;
    }

    // Шапка страницы актёра: фото и таблица «Дорам / ДР / Зодиак / Рост / Страна»
    function parseActor(html, base) {
        html = '' + html;
        var h1 = html.match(/<section class="akter-st">\s*<h1>([\s\S]*?)<\/h1>/);
        if (!h1) return null;
        var img = html.match(/class="akter-poster">\s*<img src="([^"]+)"/);
        var facts = [];
        html.replace(/<td colspan="2" class="i-akter">([\s\S]*?)<\/td><td>([\s\S]*?)<\/td>/g, function (m, a, b) {
            facts.push([strip(a).replace(/:$/, ''), strip(b)]);
            return m;
        });
        return { name: strip(h1[1]), photo: img ? absUrl(img[1], base) : '', facts: facts };
    }

    function parsePodborki(html, base) {
        var i = ('' + html).indexOf('class="podborki"'), out = [];
        if (i < 0) return out;
        var e = html.indexOf('</ul>', i), chunk = html.slice(i, e < 0 ? i + 80000 : e);
        chunk.replace(/<li><a href="([^"]*\/razdel\/[^"]+)"[^>]*>\s*<img src="([^"]*)"[^>]*>\s*<span>([\s\S]*?)<\/span>/g, function (m, href, img, t) {
            out.push({ path: href.replace(/^https?:\/\/[^\/]+/, ''), poster: absUrl(img, base), title: strip(t) });
            return m;
        });
        return out;
    }

    // Карусель «популярное сейчас» на главной
    function parsePopular(html, base) {
        var i = ('' + html).indexOf('id="owl-carou"'), out = [];
        if (i < 0) return out;
        var chunk = html.slice(i, i + 30000), nx = chunk.indexOf('</section>');
        if (nx > 0) chunk = chunk.slice(0, nx);
        chunk.replace(/<a href="([^"]+\.html)"[^>]*>\s*<img src="([^"]+)"[^>]*>\s*<div class="pe-title">([\s\S]*?)<\/div>(?:\s*<div class="s-average">([\d.,]+)<\/div>)?/g, function (m, href, img, t, avg) {
            var id = postId(href);
            if (id) out.push({ id: id, url: absUrl(href, base), poster: absUrl(img, base), title: strip(t), orig: '', country: '', year: 0, genres: '', info: '', rating: avg ? parseFloat(avg.replace(',', '.')) : 0, mini: false, status: '', voiceEp: 0, subsEp: 0 });
            return m;
        });
        return out;
    }

    // Инлайн-комментарии со страницы тайтла (только чтение)
    function parseComments(html) {
        html = '' + html;
        var out = [], closed = /Отзывы к данной дораме уже закрыты/.test(html);
        var i = html.indexOf('class="commentlist"');
        if (i >= 0) {
            var chunk = html.slice(i, i + 120000);
            chunk.replace(/<div class="ct-author">([\s\S]*?)<\/div>\s*<div class="ct-ti">([\s\S]*?)<\/div>[\s\S]*?<div class="comment-text-content">([\s\S]*?)<\/div>\s*<\/div>/g, function (m, a, d, t) {
                var text = strip(t);
                if (text && out.length < 50) out.push({ author: strip(a), date: strip(d), text: text });
                return m;
            });
        }
        return { list: out, closed: closed };
    }

    // «Выходит по субботам и воскресеньям» → { days: [5, 6] } (понедельник = 0)
    var DAY_RE = [[/понедельник/i, 0], [/вторник/i, 1], [/сред[аыуе]/i, 2], [/четверг/i, 3], [/пятниц/i, 4], [/суббот/i, 5], [/воскресень/i, 6]];

    function parseSchedule(text) {
        text = '' + (text || '');
        var days = [];
        DAY_RE.forEach(function (d) { if (d[0].test(text)) days.push(d[1]); });
        return days.length ? { days: days, text: text } : null;
    }

    // Состояние тайтла в списке по кнопкам страницы: data-action="del" — уже в списке, "add" — нет
    var LIST_CLASS = { fav: 'fav-linkhome', later: 'budu-link', watching: 'viewed-link', done: 'zakl-link', dropped: 'broh-link' };

    function parseListState(html, kind) {
        var cls = LIST_CLASS[kind];
        if (!cls) return null;
        var m = ('' + html).match(new RegExp('<a\\b[^>]*class="' + cls + '"[^>]*>'));
        if (!m) return null;
        var a = m[0].match(/data-action="(add|del)"/);
        return a ? (a[1] === 'del' ? 'in' : 'out') : null;
    }

    // Анализ вставленной cookie без раскрытия значений: что в ней есть и совпадает ли UA с тем, что шлёт плагин
    function analyzeCookie(str, ua) {
        var names = [], jua = null;
        ('' + (str || '')).split(';').forEach(function (part) {
            var i = part.indexOf('=');
            var name = (i < 0 ? part : part.slice(0, i)).trim();
            if (!name) return;
            names.push(name);
            if (name === '__jua_' && i >= 0) { try { jua = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { jua = part.slice(i + 1).trim(); } }
        });
        return {
            names: names,
            hasSession: names.some(function (n) { return /^wordpress_logged_in_/.test(n); }),
            hasAntibot: names.some(function (n) { return /^__(js_p_|jhash_|jua_|hash_|lhash_)/.test(n); }),
            jua: jua,
            uaMatch: jua === null ? null : jua === ua
        };
    }

    // Строка Cookie из DevTools/буфера обмена → чистая «a=b; c=d» (убираем префикс «Cookie:», кавычки, переводы строк)
    function normalizeCookie(str) {
        var t = ('' + (str || '')).replace(/[\r\n]+/g, ' ').trim();
        t = t.replace(/^-H\s+/i, '').replace(/^["']+|["']+$/g, '').trim();
        t = t.replace(/^cookie\s*:\s*/i, '');
        return t.split(/\s*;\s*/).filter(function (x) { return x && x.indexOf('=') > 0; }).join('; ');
    }

    function maskCookie(str) {
        return analyzeCookie(str, '').names.map(function (n) { return n + '=***'; }).join('; ');
    }

    // Новые серии: сравнение счётчиков из ленты сайта с тем, что пользователь уже видел.
    //   seen    — { id: { v, s } }, current — { id: { voiceEp, subsEp, item } }, ids — { id: true } (что отслеживаем)
    // Возвращает { news: { id: { item, v, s, dv, ds } }, seen } (seen с добавленными базовыми значениями).
    function detectNews(seen, current, ids) {
        var news = {}, nextSeen = {}, id;
        for (id in seen) if (seen.hasOwnProperty(id)) nextSeen[id] = seen[id];
        for (id in ids) {
            if (!ids.hasOwnProperty(id) || !current[id]) continue;
            var c = current[id], sn = nextSeen[id];
            if (!sn) { nextSeen[id] = { v: c.voiceEp || 0, s: c.subsEp || 0 }; continue; }
            var dv = (c.voiceEp || 0) - (sn.v || 0), ds = (c.subsEp || 0) - (sn.s || 0);
            if (dv > 0 || ds > 0) news[id] = { item: c.item, v: c.voiceEp || 0, s: c.subsEp || 0, dv: Math.max(0, dv), ds: Math.max(0, ds) };
        }
        return { news: news, seen: nextSeen };
    }

    var DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

    // «1:30-2:45» → { start: 90, end: 165 }
    function parseSkip(text) {
        var m = ('' + (text || '')).match(/^\s*(\d+):(\d{2})\s*[-–—]\s*(\d+):(\d{2})\s*$/);
        if (!m) return null;
        var a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
        return b > a ? { start: a, end: b } : null;
    }

    // Страна как параметр раздела: /genre/*, /god/* — ?st_strana=, /1-novinki — ?st_sort=
    function countryParam(path) {
        if (/^\/(genre|god)\//.test(path)) return 'st_strana';
        if (/^\/1-novinki/.test(path)) return 'st_sort';
        return '';
    }

    function queryValue(q, name) {
        var m = ('&' + (q || '')).match(new RegExp('&' + name + '=([^&]*)'));
        return m ? decodeURIComponent(m[1]) : '';
    }

    function setQueryValue(q, name, value) {
        var parts = (q || '').split('&').filter(function (x) { return x && x.indexOf(name + '=') !== 0; });
        if (value) parts.push(name + '=' + encodeURIComponent(value));
        return parts.join('&');
    }

    function cardBadge(t) {
        var p = [];
        if (t.status) p.push(t.status);
        var c = [];
        if (t.voiceEp) c.push('оз.' + t.voiceEp);
        if (t.subsEp) c.push('сб.' + t.subsEp);
        if (c.length) p.push(c.join('/'));
        return p.join(' · ') || (t.mini ? 'Мини' : '') || t.info || '';
    }

    function looksLikeChallenge(html) {
        html = '' + html;
        return html.indexOf('__js_p_') >= 0 && html.indexOf('get_jhash') >= 0 && html.indexOf('post-list') < 0;
    }

    // Пауза перед повтором при 429/503 (мс), либо 0 — не повторять. attempt — номер уже сделанных повторов.
    // retryAfter — значение заголовка Retry-After в секундах; ограничиваем сверху, чтобы не вешать интерфейс.
    var RETRY_MAX = 2;
    function retryDelay(code, retryAfter, attempt) {
        if ((code !== 429 && code !== 503) || attempt >= RETRY_MAX) return 0;
        var sec = parseFloat(retryAfter);
        if (sec > 0) return Math.min(sec, 10) * 1000;
        return 1500 * Math.pow(2, attempt);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            retryDelay: retryDelay, VERSION: VERSION, FALLBACK_MENU: FALLBACK_MENU, parseListing: parseListing, hasNext: hasNext, parseMenu: parseMenu,
            parseDetail: parseDetail, parseKodikLink: parseKodikLink, kodikUrl: kodikUrl, parseKodikPage: parseKodikPage,
            parseKodikParams: parseKodikParams, decodeKodik: decodeKodik, parseFtor: parseFtor, pickQuality: pickQuality,
            listPath: listPath, searchPath: searchPath, fmtTime: fmtTime, looksLikeChallenge: looksLikeChallenge, strip: strip,
            LIST_ACTIONS: LIST_ACTIONS, NAVI: NAVI, RAND: RAND, naviQuery: naviQuery, naviTitle: naviTitle, optionLabel: optionLabel, parseRandNonce: parseRandNonce, parseSeaNonce: parseSeaNonce,
            parseRandom: parseRandom, ajaxNonceExpired: ajaxNonceExpired, parseActorsAjax: parseActorsAjax, parseActorsTop: parseActorsTop, parseActor: parseActor,
            parsePodborki: parsePodborki, parsePopular: parsePopular, parseComments: parseComments, parseSchedule: parseSchedule, parseListState: parseListState,
            parseSkip: parseSkip, countryParam: countryParam, queryValue: queryValue, setQueryValue: setQueryValue, DAY_NAMES: DAY_NAMES, COUNTRY_FILTER: COUNTRY_FILTER,
            analyzeCookie: analyzeCookie, maskCookie: maskCookie, normalizeCookie: normalizeCookie, detectNews: detectNews, cardBadge: cardBadge, parseNonce: parseNonce, parseAccountName: parseAccountName, parseAccountList: parseAccountList, mergeMarks: mergeMarks
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

    function normalizeBase(url) {
        url = ('' + url).trim().replace(/\/+$/, '');
        return /^https?:\/\//i.test(url) ? url : 'https://' + url.replace(/^\/+/, '');
    }

    function configuredBase() { return normalizeBase(setting('doramy_base', DEFAULT_BASE)); }

    // Зеркала добавляет только пользователь (на сайте есть фишинговые клоны, свой список плагин не публикует)
    function mirrors() {
        var out = [];
        ('' + setting('doramy_mirrors', '')).split(/[\s,;]+/).forEach(function (u) { if (u) out.push(normalizeBase(u)); });
        return out;
    }

    var activeBase = '';

    function base() { return activeBase || configuredBase(); }

    function hostOf(u) {
        var m = ('' + u).match(/^https?:\/\/([^\/:?#]+)/i);
        return m ? m[1].toLowerCase() : '';
    }

    // Абсолютные ссылки из кеша (https://doramy.club/...) переписываем на активный адрес (зеркало)
    function rebase(url) {
        var h = hostOf(url);
        if (!h) return url;
        var known = [configuredBase()].concat(mirrors());
        for (var i = 0; i < known.length; i++) {
            if (hostOf(known[i]) === h) return base() + url.replace(/^https?:\/\/[^\/]+/, '');
        }
        return url;
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
        if (setting('doramy_auto_status', false) && !marksOf(t.id).status) setMark(t, { status: 'watching' });
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
        var next = $.extend({}, cur, patch, { item: brief(t), ts: Date.now() });
        if (!next.fav && !next.status) delete all[t.id];
        else all[t.id] = next;
        Lampa.Storage.set('doramy_marks', all);
        markChanged(t.id, cur, next);
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
    // Очередь запросов к сайту: не больше 2 одновременных и пауза между стартами (настройка doramy_gap, мс) — не нагружаем сайт и слабые ТВ
    var sq = [], sqBusy = 0, sqLast = 0, sqTimer = null;

    function siteQueue(fn) {
        sq.push(fn);
        sqPump();
    }

    function sqPump() {
        if (sqTimer || sqBusy >= 2 || !sq.length) return;
        var gap = parseInt(setting('doramy_gap', 350), 10) || 0, wait = sqLast + gap - Date.now();
        if (wait > 0) {
            sqTimer = setTimeout(function () { sqTimer = null; sqPump(); }, wait);
            return;
        }
        var fn = sq.shift(), released = false;
        sqBusy++;
        sqLast = Date.now();
        try {
            fn(function () { if (!released) { released = true; sqBusy--; sqPump(); } });
        } catch (e) { if (!released) { released = true; sqBusy--; } }
        if (sq.length) sqPump();
    }

    // Запрос текста. Порядок: прокси из настроек → нативный запрос Lampa (Android, без CORS) → прямой $.ajax.
    // opts.post — строка application/x-www-form-urlencoded; opts.site — запрос к сайту (очередь, cookie аккаунта).
    function net(url, opts, ok, fail) {
        opts = opts || {};
        if (opts.site && !opts._q) {
            return siteQueue(function (release) {
                net(url, $.extend({}, opts, { _q: 1 }), function (r) { release(); ok(r); }, function (e) { release(); fail(e); });
            });
        }
        var proxy = ('' + setting('doramy_proxy', '')).trim();
        var ajax = function (u, err) {
            $.ajax({
                url: u,
                method: opts.post ? 'POST' : 'GET',
                data: opts.post || undefined,
                dataType: 'text',
                timeout: 20000,
                success: ok,
                error: function (xhr, status) { err(status || 'error', xhr); }
            });
        };
        var direct = function () {
            ajax(url, function (e, xhr) {
                // 429/503 от сайта: повторяем GET с паузой, пока держим слот очереди (POST не повторяем — не идемпотентен)
                var n = opts._try || 0, wait = 0;
                if (opts.site && !opts.post) {
                    var ra = null;
                    try { ra = xhr && xhr.getResponseHeader && xhr.getResponseHeader('Retry-After'); } catch (x) { }
                    wait = retryDelay(xhr && xhr.status, ra, n);
                }
                if (!wait) return fail(e);
                setTimeout(function () { net(url, $.extend({}, opts, { _q: 1, _try: n + 1 }), ok, fail); }, wait);
            });
        };
        if (proxy) return ajax(proxy + url, function () { fail('proxy'); });
        try {
            var headers = { 'User-Agent': opts.site ? siteUA() : DESKTOP_UA };
            if (opts.post) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
                headers['X-Requested-With'] = 'XMLHttpRequest';
            }
            if (opts.referer) headers.Referer = opts.referer;
            // cookie аккаунта — только на адрес сайта из настроек (не на Kodik, не на зеркала)
            if (opts.site && cookie() && hostOf(url) === hostOf(configuredBase())) headers.Cookie = cookie();
            new Lampa.Reguest().native(url, function (str) {
                typeof str === 'string' ? ok(str) : direct();
            }, direct, opts.post || false, { dataType: 'text', headers: headers });
        } catch (e) { direct(); }
    }

    var pageMem = {}, offlineNoted = false;

    // Офлайн-кеш страниц: последние 80 страниц в IndexedDB (LRU), читаем только если сеть недоступна
    function pageKey(pkey) { return 'doramy_pg_' + Lampa.Utils.hash(pkey); }

    function pageStore(pkey, html) {
        if (typeof html !== 'string' || html.length > 400000) return;
        var key = pageKey(pkey), idx = Lampa.Storage.get('doramy_pg_idx', '[]');
        if (!$.isArray(idx)) idx = [];
        idx = $.grep(idx, function (k) { return k !== key; });
        idx.push(key);
        while (idx.length > 80) bigSet(idx.shift(), {});
        Lampa.Storage.set('doramy_pg_idx', idx);
        bigSet(key, { ts: Date.now(), html: html });
    }

    function pageLoad(pkey, cb) {
        bigGet(pageKey(pkey), function (v) { cb(v && v.html ? v.html : null); });
    }

    // Страница сайта (HTML). Заглушка проверки браузера — отдельная ошибка. При сбое пробуем зеркала, затем офлайн-кеш.
    // ok(html, offline)
    function fetchPage(path, ok, fail, force, st) {
        st = st || { tried: 0, challenge: false };
        var url = rebase(absUrl(path, base())), pkey = url.replace(/^https?:\/\/[^\/]+/, '');
        var hit = pageMem[pkey];
        if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return ok(hit.html, false);
        var failed = function (e) {
            if (e === 'challenge') st.challenge = true;
            var order = [configuredBase()].concat(mirrors());
            st.tried++;
            if (order.length > 1 && st.tried < order.length) {
                activeBase = order[(order.indexOf(base()) + 1) % order.length];
                return fetchPage(path, ok, fail, force, st);
            }
            activeBase = '';
            var err = st.challenge ? 'challenge' : (e || 'error');
            pageLoad(pkey, function (html) {
                if (!html) return fail(err);
                if (!offlineNoted) { offlineNoted = true; Lampa.Noty.show('Doramy.club: нет связи с сайтом, показан офлайн-кеш'); }
                ok(html, true);
            });
        };
        net(url, { referer: base() + '/', site: true }, function (html) {
            if (looksLikeChallenge(html)) return failed('challenge');
            if (typeof html !== 'string' || html.length < 500) return failed('empty');
            pageMem[pkey] = { ts: Date.now(), html: html };
            pageStore(pkey, html);
            ok(html, false);
        }, function (e) { failed(e || 'error'); });
    }

    function loadList(path, page, ok, fail, force, query) {
        fetchPage(listPath(path, page, query), function (html) {
            ok(parseListing(html, base()), hasNext(html), html);
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


    /* ---------- аккаунт сайта и синхронизация списков ---------- */

    // Cookie сессии вставляется в настройках (из вашего браузера после входа на сайт). Пароль плагин не принимает и не хранит:
    // слой запросов Lampa не отдаёт Set-Cookie, поэтому получить сессию входом по паролю из плагина нельзя.
    function cookie() { return ('' + setting('doramy_cookie', '')).trim(); }

    function accountOn() { return !!cookie() && !!setting('doramy_sync_on', true); }

    function syncState() {
        var s = getMap('doramy_sync');
        if (!s.queue) s.queue = [];
        return s;
    }

    function saveSync(s) { Lampa.Storage.set('doramy_sync', s); }

    function accountInfo() { return getMap('doramy_account'); }

    var nonceMem = null, flushing = false, flushTimer = null, syncing = false;

    function markChanged(id, before, after) {
        if (!accountOn()) return;
        var url = (after.item && after.item.url) || (before.item && before.item.url) || '';
        if (!!before.fav !== !!after.fav) syncEnqueue(id, 'fav', after.fav ? 'add' : 'del', url);
        if ((before.status || '') !== (after.status || '')) {
            if (before.status) syncEnqueue(id, before.status, 'del', url);
            if (after.status) syncEnqueue(id, after.status, 'add', url);
        }
    }

    function syncEnqueue(id, kind, op, url) {
        var s = syncState();
        // add, за которым сразу идёт del того же (и наоборот), взаимно гасятся
        var last = s.queue[s.queue.length - 1];
        if (last && last.id === id && last.kind === kind && last.op !== op) s.queue.pop();
        else s.queue.push({ id: id, kind: kind, op: op, url: url || '', ts: Date.now(), tries: 0 });
        saveSync(s);
        clearTimeout(flushTimer);
        flushTimer = setTimeout(function () {
            flushQueue(function (okAll, paused) { if (!okAll && !paused) Lampa.Noty.show('Doramy.club: не удалось отправить изменения на сайт, повторю при следующей синхронизации'); });
        }, 1500);
    }

    function getNonce(ok, fail, force) {
        if (!force && nonceMem && Date.now() - nonceMem.ts < 20 * 60 * 1000) return ok(nonceMem.v);
        net(absUrl('/regs-favorit', base()), { site: true, referer: base() + '/' }, function (html) {
            if (looksLikeChallenge(html)) return fail('challenge');
            var n = parseNonce(html);
            if (!n) return fail('noauth');
            nonceMem = { v: n, ts: Date.now() };
            ok(n);
        }, function (e) { fail(e || 'error'); });
    }

    // Одно действие admin-ajax.php (action = wfm_add / budu_del / ...). Успех на сайте определяем по ответу, а затем подтверждаем состоянием кнопки на странице тайтла.
    function ajaxCall(action, id, ok, fail, retried) {
        getNonce(function (nonce) {
            net(absUrl('/wp-admin/admin-ajax.php', base()), { site: true, referer: base() + '/', post: enc({ security: nonce, action: action, postId: id }) }, function (res) {
                if (looksLikeChallenge(res)) return fail('challenge');
                var t = ('' + res).trim();
                if (t === '-1' || t === '0') {
                    if (!retried) { nonceMem = null; return ajaxCall(action, id, ok, fail, true); }
                    return fail('rejected');
                }
                ok();
            }, function (e) { fail(e || 'error'); });
        }, function (e) { fail(e); }, !!retried);
    }

    // true/false — кнопка на странице тайтла подтверждает/опровергает состояние; null — проверить нельзя (нет адреса страницы, нет кнопки)
    function verifyState(kind, id, want, url, cb) {
        url = url || (getMap('doramy_state')[id] || {}).url;
        if (!url) return cb(null);
        net(rebase(url), { site: true, referer: base() + '/' }, function (html) {
            if (looksLikeChallenge(html)) return cb(null);
            var st = parseListState(html, kind);
            cb(st === null ? null : (st === 'in') === (want === 'add'));
        }, function () { cb(null); });
    }

    // Удаление пробуем двумя вариантами: как со страницы тайтла (*_del), затем как со страницы списка (*_delh)
    function siteAction(kind, op, id, ok, fail, url) {
        var a = LIST_ACTIONS[kind];
        if (!a) return fail('rejected');
        var variants = op === 'add' ? [a.add] : (a.delh && a.delh !== a.del ? [a.del, a.delh] : [a.del]);
        (function next(i) {
            ajaxCall(variants[i], id, function () {
                verifyState(kind, id, op, url, function (good) {
                    if (good === false) return i + 1 < variants.length ? next(i + 1) : fail('rejected');
                    ok();
                });
            }, fail);
        })(0);
    }

    /* ---------- получение и обновление cookie ---------- */

    // Сайт привязывает проверку браузера к User-Agent браузера (cookie __jua_). Плагин по умолчанию шлёт свой UA; по явной настройке
    // отправляет UA того браузера, из которого вы сами взяли cookie. Подбора или подделки отпечатков плагин не делает.
    function siteUA() {
        if (setting('doramy_use_cookie_ua', false)) {
            var j = analyzeCookie(cookie(), '').jua;
            if (j) return j;
        }
        return DESKTOP_UA;
    }

    function storeCookie(str) {
        var c = normalizeCookie(str);
        if (!c) return false;
        Lampa.Storage.set('doramy_cookie', c);
        Lampa.Storage.set('doramy_cookie_ts', Date.now());
        nonceMem = null;
        pushCred();
        return true;
    }

    /* ---------- перенос между устройствами (Mac ↔ приставка) через аккаунт Lampa (CUB) ---------- */

    // Строку cookie не набирают на приставке: вставьте её на Mac, включите перенос — на приставке она появится после синхронизации
    // хранилища Lampa. Это опция: cookie тогда хранится на серверах CUB в вашем аккаунте. По умолчанию выключено.
    function pushCred() {
        if (!setting('doramy_cub_cookie', false) || !Lampa.Storage.sync) return;
        var c = cookie();
        if (!c) return;
        var cred = getMap('doramy_cred');
        if (cred.cookie && cred.cookie.v === c) return;
        cred.cookie = { v: c, ts: Lampa.Storage.get('doramy_cookie_ts', 0) || Date.now() };
        Lampa.Storage.set('doramy_cred', cred);
    }

    function initCubSync() {
        if (!Lampa.Storage || !Lampa.Storage.sync) return;
        try {
            if (setting('doramy_cub_lists', false)) {
                Lampa.Storage.sync('doramy_marks', 'object_object');
                Lampa.Storage.sync('doramy_state', 'object_object');
            }
            if (setting('doramy_cub_cookie', false)) {
                Lampa.Storage.sync('doramy_cred', 'object_object');
                var remote = getMap('doramy_cred').cookie;
                var localTs = Lampa.Storage.get('doramy_cookie_ts', 0) || 0;
                if (remote && remote.v && (!cookie() || (remote.ts || 0) > localTs) && remote.v !== cookie()) {
                    Lampa.Storage.set('doramy_cookie', remote.v);
                    Lampa.Storage.set('doramy_cookie_ts', remote.ts || Date.now());
                    nonceMem = null;
                } else pushCred();
            }
        } catch (e) { console.log('Doramy.club', 'CUB sync unavailable', e); }
    }

    function onCubToggle() {
        // выключили перенос cookie — убираем её из облака
        if (!setting('doramy_cub_cookie', false)) {
            try { if (Lampa.Storage.clean) Lampa.Storage.clean('doramy_cred'); } catch (e) { /* нет синхронизации */ }
            Lampa.Storage.set('doramy_cred', {});
        }
        initCubSync();
    }

    function pasteCookie() {
        var done = function (t) {
            if (!storeCookie(t)) return Lampa.Noty.show('В буфере обмена нет строки Cookie');
            Lampa.Noty.show('Cookie вставлена (' + analyzeCookie(cookie(), '').names.length + ' шт.). Нажмите «Проверить вход»');
        };
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
                return navigator.clipboard.readText().then(done, function () { Lampa.Noty.show('Нет доступа к буферу обмена: разрешите его в браузере'); });
            }
        } catch (e) { /* нет буфера */ }
        Lampa.Noty.show('Буфер обмена недоступен на этом устройстве — введите cookie вручную или включите перенос через аккаунт Lampa');
    }

    function cookieAgeText() {
        var ts = Lampa.Storage.get('doramy_cookie_ts', 0);
        if (!ts) return 'неизвестно';
        var h = Math.round((Date.now() - ts) / 3600000);
        return h < 1 ? 'меньше часа назад' : h + ' ч назад';
    }

    function notifyPaused(why) {
        Lampa.Noty.show(why === 'noauth' ? 'Doramy.club: сессия истекла — вставьте новый cookie в настройках, синхронизация приостановлена' : 'Doramy.club: сайт требует проверку браузера, синхронизация приостановлена');
    }

    // Отправляет очередь по одной операции. Заглушка проверки браузера и истёкшая сессия ставят синк на паузу (очередь не теряется);
    // операция, которую сайт два раза отклонил или которая не прошла 5 раз, отбрасывается.
    function flushQueue(done) {
        if (flushing) return done && done(false);
        var s0 = syncState();
        if (!s0.queue.length) return done && done(true);
        if (s0.paused) return done && done(false, s0.paused);
        flushing = true;
        (function next() {
            var s = syncState(), op = s.queue[0];
            if (!op) { flushing = false; return done && done(true); }
            siteAction(op.kind, op.op, op.id, function () {
                s.queue.shift();
                saveSync(s);
                next();
            }, function (err) {
                if (err === 'challenge' || err === 'noauth') {
                    s.paused = err;
                    saveSync(s);
                    flushing = false;
                    notifyPaused(err);
                    return done && done(false, err);
                }
                op.tries = (op.tries || 0) + 1;
                var drop = op.tries >= 5 || (err === 'rejected' && op.tries >= 2);
                if (drop) s.queue.shift();
                saveSync(s);
                if (drop) return next();
                flushing = false;
                done && done(false);
            }, op.url);
        })();
    }

    // Проверка сессии: страница профиля показывает логин только вошедшему
    function checkSession(ok, fail) {
        net(absUrl('/regs-vash-profil', base()), { site: true, referer: base() + '/' }, function (html) {
            if (looksLikeChallenge(html)) return fail('challenge');
            var login = parseAccountName(html);
            if (!login) return fail('noauth');
            Lampa.Storage.set('doramy_account', { login: login, ts: Date.now() });
            var ss = syncState();
            if (ss.paused) { ss.paused = ''; saveSync(ss); }
            ok(login);
        }, function (e) { fail(e || 'error'); });
    }

    function pullList(kind, ok, fail) {
        var out = {}, page = 1;
        (function next() {
            net(absUrl(listPath(LIST_ACTIONS[kind].page, page), base()), { site: true, referer: base() + '/' }, function (html) {
                if (looksLikeChallenge(html)) return fail('challenge');
                var n = parseNonce(html);
                if (n) nonceMem = { v: n, ts: Date.now() };
                parseAccountList(html, base()).forEach(function (t) { out[t.id] = brief(t); });
                if (hasNext(html) && page < 30) { page++; next(); } else ok(out);
            }, function (e) { fail(e || 'error'); });
        })();
    }

    function syncErrorText(e) {
        if (e === 'noauth') return 'Сессия не принята: войдите на сайт в браузере и вставьте cookie заново';
        return errorText(e);
    }

    // Полная синхронизация: сессия → отправить очередь → забрать 5 списков → слить → отправить то, что есть только у нас
    function syncAll(cb) {
        if (syncing) return cb && cb('busy');
        if (!cookie()) return cb && cb('noauth');
        syncing = true;
        var finish = function (err, info) { syncing = false; cb && cb(err, info); };
        checkSession(function (login) {
            flushQueue(function () {
                var remote = {}, kinds = LIST_KEYS.slice(), failed = null;
                (function nextKind() {
                    var kind = kinds.shift();
                    if (!kind) return merge();
                    pullList(kind, function (items) { remote[kind] = items; nextKind(); }, function (e) { failed = e; finish(e); });
                })();
                function merge() {
                    if (failed) return;
                    var st = syncState(), pending = {};
                    st.queue.forEach(function (q) { pending[q.id] = true; });
                    var res = mergeMarks(getMap('doramy_marks'), remote, pending, !!st.init);
                    Lampa.Storage.set('doramy_marks', res.marks);
                    st.init = true;
                    st.last = Date.now();
                    res.ops.forEach(function (o) { st.queue.push({ id: o.id, kind: o.kind, op: o.op, ts: Date.now(), tries: 0 }); });
                    saveSync(st);
                    var info = { login: login, total: Object.keys(res.marks).length, pushed: res.ops.length };
                    if (res.ops.length) flushQueue(function () { finish(null, info); });
                    else finish(null, info);
                }
            });
        }, function (e) {
            if (e === 'challenge' || e === 'noauth') { var ps = syncState(); ps.paused = e; saveSync(ps); }
            finish(e);
        });
    }

    function runSync(silent) {
        if (!silent) Lampa.Noty.show('Синхронизирую с аккаунтом doramy.club…');
        syncAll(function (err, info) {
            if (err === 'busy') return;
            if (err) return !silent && Lampa.Noty.show('Синхронизация: ' + syncErrorText(err));
            if (!silent) Lampa.Noty.show('Синхронизировано: ' + info.login + ', дорам в списках — ' + info.total + (info.pushed ? ', отправлено на сайт — ' + info.pushed : ''));
        });
    }

    function checkAccount() {
        if (!cookie()) return Lampa.Noty.show('Сначала вставьте cookie сессии в настройках');
        Lampa.Noty.show('Проверяю вход…');
        checkSession(function (login) { Lampa.Noty.show('Вход выполнен: ' + login + ' (cookie получена ' + cookieAgeText() + ')'); },
            function (e) { Lampa.Noty.show(syncErrorText(e)); });
    }

    function logoutAccount() {
        Lampa.Storage.set('doramy_cookie', '');
        Lampa.Storage.set('doramy_account', {});
        Lampa.Storage.set('doramy_sync', {});
        nonceMem = null;
        Lampa.Noty.show('Аккаунт отключён; локальные списки сохранены');
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
                // ручная метка заставки (на тайтл и озвучку): Lampa показывает кнопку «Пропустить»
                var sk = getMap('doramy_skip')[t.id + ':' + (t.voice || '')];
                var seg = sk ? { skip: [{ start: sk.start, end: sk.end }] } : null;
                var playlist = eps.map(function (e, i) {
                    var o = {
                        title: e.name,
                        timeline: Lampa.Timeline.view(episodeHash(t.id, epKey(e))),
                        callback: function () { remember(t, e, i, eps.length); }
                    };
                    if (seg) o.segments = seg;
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
                if (seg) item.segments = seg;
                if (!applyPlayer(item, mode)) return;
                remember(t, ep, idx, eps.length);
                playingNow = true; // во время просмотра фоновые проверки (новые серии, синк) не запускаем
                Lampa.Player.play(item);
                Lampa.Player.playlist(playlist);
                Lampa.Player.callback(function () { playingNow = false; onClose && onClose(); });
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
            '.dc-actor .dc-title__poster{width:10em}.dc-card__sub{min-height:1.2em}' +
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
        if (t.catalogPath) return openCatalog(t.catalogPath, t.title);
        Lampa.Activity.push({ url: '', title: t.title, component: 'doramyclub_title', item: brief(t), page: 1 });
    }

    function openCatalog(path, title, query) {
        Lampa.Activity.push({ url: '', title: title, component: 'doramyclub_main', catalog: { path: path, title: title, query: query || '' }, page: 1 });
    }

    function openScreen(mode, title) {
        Lampa.Activity.push({ url: '', title: title, component: 'doramyclub_main', mode: mode, page: 1 });
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

    /* ------------------------------------------------------------------ */
    /*  Новые серии, расписание, поиск актёров, навигатор, рандом          */
    /* ------------------------------------------------------------------ */

    var playingNow = false;

    function knownItem(id) {
        var m = getMap('doramy_marks')[id];
        if (m && m.item) return m.item;
        return getMap('doramy_state')[id] || null;
    }

    // Что отслеживаем: «Смотрю», избранное и история просмотра
    function trackedIds() {
        var ids = {}, marks = getMap('doramy_marks'), st = getMap('doramy_state'), id;
        for (id in marks) if (marks.hasOwnProperty(id) && (marks[id].fav || marks[id].status === 'watching')) ids[id] = true;
        for (id in st) if (st.hasOwnProperty(id)) ids[id] = true;
        return ids;
    }

    // Открыли страницу тайтла — это «увиденное» состояние счётчиков серий; новости по нему гасятся
    function markSeen(id, v, s2) {
        var seen = getMap('doramy_epseen');
        seen[id] = { v: v || 0, s: s2 || 0, ts: Date.now() };
        Lampa.Storage.set('doramy_epseen', seen);
        var news = getMap('doramy_news');
        if (news[id]) { delete news[id]; Lampa.Storage.set('doramy_news', news); }
    }

    function newsItems() {
        var news = getMap('doramy_news');
        return Object.keys(news).map(function (id) {
            var t = $.extend({}, news[id].item);
            t._news = { dv: news[id].dv || 0, ds: news[id].ds || 0 };
            return t;
        });
    }

    function newsBadge(t) {
        if (!t._news) return '';
        var p = [];
        if (t._news.dv) p.push('+' + t._news.dv + ' оз.');
        if (t._news.ds) p.push('+' + t._news.ds + ' сб.');
        return p.join(' ');
    }

    // Читает первые 3 страницы ленты обновлений (не чаще раза в 45 минут) и сравнивает счётчики «Озвучка/Субтитры: N серия»
    // с тем, что вы уже видели. Результат (изменились ли новости, сколько их) — в done.
    function checkNews(done, force) {
        var meta = getMap('doramy_newsmeta');
        if (!setting('doramy_news_on', true) || playingNow || (!force && Date.now() - (meta.ts || 0) < 45 * 60000)) return done && done(false, 0);
        var ids = trackedIds();
        if (!Object.keys(ids).length) return done && done(false, 0);
        var current = {}, pages = ['/', '/page/2', '/page/3'], i = 0, got = 0;
        function finish() {
            if (!got) return done && done(false, 0);
            var res = detectNews(getMap('doramy_epseen'), current, ids);
            Lampa.Storage.set('doramy_epseen', res.seen);
            var old = getMap('doramy_news'), merged = {}, id;
            for (id in old) if (old.hasOwnProperty(id) && !current[id]) merged[id] = old[id]; // тайтла нет в загруженных страницах — не теряем
            for (id in res.news) if (res.news.hasOwnProperty(id)) merged[id] = res.news[id];
            var changed = Object.keys(merged).sort().join(',') !== Object.keys(old).sort().join(',');
            Lampa.Storage.set('doramy_news', merged);
            Lampa.Storage.set('doramy_newsmeta', { ts: Date.now() });
            done && done(changed, Object.keys(merged).length);
        }
        (function next() {
            if (i >= pages.length) return finish();
            fetchPage(pages[i++], function (html) {
                got++;
                parseListing(html, base()).forEach(function (t) {
                    if (!current[t.id]) current[t.id] = { voiceEp: t.voiceEp, subsEp: t.subsEp, item: brief(t) };
                });
                next();
            }, function () { finish(); });
        })();
    }

    // Расписание: сайт публикует только текст «серии выходят по субботам» на странице тайтла со статусом «Выходит»
    function saveSchedule(t, d) {
        var sc = getMap('doramy_schedule');
        if (d.status === 'Выходит' && d.schedule) sc[t.id] = { days: d.schedule.days, text: d.schedule.text, item: brief(t), ts: Date.now() };
        else sc[t.id] = { ended: true, ts: Date.now() };
        Lampa.Storage.set('doramy_schedule', sc);
    }

    // Раз в сутки перечитываем страницы отслеживаемых тайтлов без свежего расписания (не больше 15, по очереди)
    function refreshSchedule(done) {
        var meta = getMap('doramy_schedmeta');
        if (playingNow || Date.now() - (meta.ts || 0) < 24 * 3600000) return done && done();
        var sc = getMap('doramy_schedule');
        var queue = Object.keys(trackedIds()).filter(function (id) {
            return !sc[id] || Date.now() - (sc[id].ts || 0) > 7 * 86400000;
        }).slice(0, 15);
        (function next() {
            var id = queue.shift();
            if (!id) { Lampa.Storage.set('doramy_schedmeta', { ts: Date.now() }); return done && done(); }
            var it = knownItem(id);
            if (!it || !it.url) return next();
            fetchPage(it.url, function (html) { saveSchedule(it, parseDetail(html, base())); next(); }, function () { next(); });
        })();
    }

    function scheduleGroups() {
        var sc = getMap('doramy_schedule'), today = (new Date().getDay() + 6) % 7, groups = [];
        for (var k = 0; k < 7; k++) {
            var day = (today + k) % 7, items = [];
            Object.keys(sc).forEach(function (id) {
                var e = sc[id];
                if (e && !e.ended && e.days && e.days.indexOf(day) >= 0) items.push($.extend({}, e.item));
            });
            if (items.length) groups.push({ title: DAY_NAMES[day] + (k === 0 ? ' (сегодня)' : ''), items: items });
        }
        return groups;
    }

    function actorItem(a) {
        return { id: 'a:' + a.path, title: a.name, poster: a.photo, catalogPath: a.path, country: a.birth || '', year: 0, rating: 0, info: 'Актёр', mini: false, status: '', voiceEp: 0, subsEp: 0 };
    }

    function podItem(p) {
        return { id: 'p:' + p.path, title: p.title, poster: p.poster, catalogPath: p.path, country: '', year: 0, rating: 0, info: '', mini: false, status: '', voiceEp: 0, subsEp: 0 };
    }

    // Быстрый поиск актёров сайта; nonce берём со страницы, при «Обновите страницу» перечитываем один раз
    var seaNonce = null;

    function searchActors(q, cb, retried) {
        if (('' + q).length < 3) return cb([]);
        var withNonce = function (n) {
            net(absUrl('/wp-admin/admin-ajax.php?security=' + n + '&action=fast_ajax_search_akters&term=' + encodeURIComponent(q), base()), { site: true, referer: base() + '/' }, function (res) {
                if (looksLikeChallenge(res)) return cb([]);
                if (ajaxNonceExpired(res)) {
                    if (retried) return cb([]);
                    seaNonce = null;
                    return searchActors(q, cb, true);
                }
                cb(parseActorsAjax(res, base()));
            }, function () { cb([]); });
        };
        if (seaNonce && Date.now() - seaNonce.ts < 50 * 60000) return withNonce(seaNonce.v);
        fetchPage('/', function (html) {
            var n = parseSeaNonce(html);
            if (!n) return cb([]);
            seaNonce = { v: n, ts: Date.now() };
            withNonce(n);
        }, function () { cb([]); }, !!retried);
    }

    function pickOne(title, options, current, cb) {
        Lampa.Select.show({
            title: title,
            items: options.map(function (o) { return { title: o[0], value: o[1], selected: o[1] === current }; }),
            onSelect: function (it) { cb(it.value); },
            onBack: function () { cb(current); }
        });
    }

    function pickMulti(title, options, selected, cb) {
        var cur = selected.slice();
        Lampa.Select.show({
            title: title,
            items: options.map(function (o) { return { title: o[0], value: o[1], checkbox: true, checked: cur.indexOf(o[1]) >= 0 }; }),
            onCheck: function (it) {
                var i = cur.indexOf(it.value);
                if (it.checked && i < 0) cur.push(it.value);
                else if (!it.checked && i >= 0) cur.splice(i, 1);
            },
            onBack: function () { cb(cur); }
        });
    }

    // Фильтр как на сайте (/navi-cl): раздел, страна, перевод, студия, годы, жанры (И/ИЛИ), исключение жанров, сортировка, «вышедшие», «без мини»
    function openNavi() {
        var back = function () { Lampa.Controller.toggle('content'); };
        var f = $.extend({ years: [], genres: [], exclude: [] }, getMap('doramy_navi'));
        var save = function () { Lampa.Storage.set('doramy_navi', f); };
        var yn = function (v) { return v ? 'да' : 'нет'; };
        var names = function (list, vals) { return vals.length ? optionLabels(list, vals).join(', ') : 'любые'; };
        function menu() {
            var items = [
                { title: 'Раздел: ' + (optionLabel(NAVI.razdel, f.razdel || '') || 'Все разделы'), k: 'razdel', list: NAVI.razdel },
                { title: 'Страна: ' + (optionLabel(NAVI.strana, f.strana || '') || 'Все страны'), k: 'strana', list: NAVI.strana },
                { title: 'Перевод: ' + (optionLabel(NAVI.perevod, f.perevod || '') || 'Любой'), k: 'perevod', list: NAVI.perevod },
                { title: 'Студия озвучки: ' + (optionLabel(NAVI.studiya, f.studiya || '') || 'Все озвучки'), k: 'studiya', list: NAVI.studiya },
                { title: 'Годы: ' + names(NAVI.years, f.years), k: 'years', multi: NAVI.years },
                { title: 'Жанры: ' + names(NAVI.genres, f.genres), k: 'genres', multi: NAVI.genres },
                { title: 'Все выбранные жанры обязательны: ' + yn(f.genresAnd), k: 'genresAnd', toggle: true },
                { title: 'Исключить жанры: ' + names(NAVI.genres, f.exclude), k: 'exclude', multi: NAVI.genres },
                { title: 'Сортировать по рейтингу: ' + yn(f.sortRating), k: 'sortRating', toggle: true },
                { title: 'Только вышедшие: ' + yn(f.released), k: 'released', toggle: true },
                { title: 'Без мини-дорам: ' + yn(f.noMini), k: 'noMini', toggle: true },
                { title: 'Показать результаты →', go: true },
                { title: 'Сбросить фильтр', reset: true }
            ];
            Lampa.Select.show({
                title: 'Фильтр (как на сайте)',
                items: items,
                onSelect: function (it) {
                    if (it.go) { save(); back(); return openCatalog('/navi-cl', naviTitle(f), naviQuery(f)); }
                    if (it.reset) { f = { years: [], genres: [], exclude: [] }; save(); return setTimeout(menu, 80); }
                    if (it.toggle) { f[it.k] = !f[it.k]; save(); return setTimeout(menu, 80); }
                    setTimeout(function () {
                        if (it.list) pickOne(it.title.split(':')[0], it.list, f[it.k] || '', function (v) { f[it.k] = v; save(); setTimeout(menu, 80); });
                        else pickMulti(it.title.split(':')[0], it.multi, f[it.k], function (v) { f[it.k] = v; save(); setTimeout(menu, 80); });
                    }, 80);
                },
                onBack: back
            });
        }
        menu();
    }

    // Случайная дорама (POST rand_posts с фильтрами сайта)
    var randNonce = null;

    function getRandNonce(ok, fail, force) {
        if (!force && randNonce && Date.now() - randNonce.ts < 50 * 60000) return ok(randNonce.v);
        net(absUrl('/rand-cl', base()), { site: true, referer: base() + '/' }, function (html) {
            if (looksLikeChallenge(html)) return fail('challenge');
            var n = parseRandNonce(html);
            if (!n) return fail('nonce');
            randNonce = { v: n, ts: Date.now() };
            ok(n);
        }, function (e) { fail(e || 'error'); });
    }

    function loadRandom(f, ok, fail, retried) {
        getRandNonce(function (n) {
            net(absUrl('/wp-admin/admin-ajax.php', base()), {
                site: true,
                referer: base() + '/rand-cl',
                post: enc({ security: n, action: 'rand_posts', category: f.category || '', taxonomy_slug: f.country || '', tax_perevod: f.perevod || '', tax_god: f.period || '', stat_pop: f.popular ? '1' : '0', mini_d: f.noMini ? '1' : '0' })
            }, function (res) {
                if (looksLikeChallenge(res)) return fail('challenge');
                var r = parseRandom(res, base());
                if (!r) {
                    if (!retried) { randNonce = null; return loadRandom(f, ok, fail, true); }
                    return fail('empty');
                }
                ok(r);
            }, function (e) { fail(e || 'error'); });
        }, fail, !!retried);
    }

    function randomFilters(f, again) {
        var save = function () { Lampa.Storage.set('doramy_rand', f); };
        var yn = function (v) { return v ? 'да' : 'нет'; };
        var items = [
            { title: 'Тип: ' + (optionLabel(RAND.category, f.category || '') || 'Всё'), k: 'category', list: RAND.category },
            { title: 'Страна: ' + (optionLabel(RAND.country, f.country || '') || 'Любая'), k: 'country', list: RAND.country },
            { title: 'Перевод: ' + (optionLabel(RAND.perevod, f.perevod || '') || 'Любой'), k: 'perevod', list: RAND.perevod },
            { title: 'Годы: ' + (optionLabel(RAND.period, f.period || '') || 'Любой'), k: 'period', list: RAND.period },
            { title: 'Только популярные: ' + yn(f.popular), k: 'popular', toggle: true },
            { title: 'Без мини-дорам: ' + yn(f.noMini), k: 'noMini', toggle: true },
            { title: 'Искать с этими фильтрами →', go: true }
        ];
        Lampa.Select.show({
            title: 'Фильтры случайной дорамы',
            items: items,
            onSelect: function (it) {
                if (it.go) { save(); Lampa.Controller.toggle('content'); return again(); }
                if (it.toggle) { f[it.k] = !f[it.k]; save(); return setTimeout(function () { randomFilters(f, again); }, 80); }
                setTimeout(function () { pickOne(it.title.split(':')[0], it.list, f[it.k] || '', function (v) { f[it.k] = v; save(); setTimeout(function () { randomFilters(f, again); }, 80); }); }, 80);
            },
            onBack: function () { save(); Lampa.Controller.toggle('content'); }
        });
    }

    function openRandom() {
        var f = $.extend({}, getMap('doramy_rand'));
        var again = function () { openRandom(); };
        var back = function () { Lampa.Controller.toggle('content'); };
        Lampa.Noty.show('Ищу случайную дораму…');
        loadRandom(f, function (r) {
            var t = r.item;
            Lampa.Select.show({
                title: t.title + (t.year ? ' (' + t.year + ')' : ''),
                items: [
                    { title: 'Открыть', subtitle: [t.country, t.genres, t.info, t.rating ? 'рейтинг ' + t.rating.toFixed(1) : ''].filter(function (x) { return x; }).join(' · '), act: 'open' },
                    { title: 'Ещё одну', act: 'again' },
                    { title: 'Описание и актёры', act: 'info' },
                    { title: 'Фильтры', act: 'filters' }
                ],
                onSelect: function (it) {
                    back();
                    if (it.act === 'open') return openTitle(t);
                    if (it.act === 'again') return setTimeout(again, 80);
                    if (it.act === 'filters') return setTimeout(function () { randomFilters(f, again); }, 80);
                    var lines = [];
                    if (r.kind) lines.push(r.kind);
                    if (r.descr) lines.push(r.descr);
                    if (r.roles.length) lines.push('Главные роли: ' + r.roles.map(function (x) { return x.name; }).join(', '));
                    if (r.collections.length) lines.push('В подборках: ' + r.collections.join('; '));
                    var box = $('<div class="dc-modal"></div>').append($('<div class="dc-modal__text"></div>').text(lines.join('\n\n')));
                    Lampa.Modal.open({ title: t.title, html: box, size: 'medium', onBack: function () { Lampa.Modal.close(); back(); } });
                },
                onBack: back
            });
        }, function (e) { Lampa.Noty.show(errorText(e)); });
    }

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
            var items = [
                { title: 'Фильтр (как на сайте)', special: 'navi' }, { title: 'Случайная дорама', special: 'rand' }, { title: 'Подборки', special: 'pod' },
                { title: 'Новые серии' + (Object.keys(getMap('doramy_news')).length ? ' (' + Object.keys(getMap('doramy_news')).length + ')' : ''), special: 'news' },
                { title: 'Расписание', special: 'sched' }, { title: 'Популярные актёры', special: 'actors' }
            ].concat(menu.sections.map(function (s) { return { title: s[0], path: s[1] }; }));
            items.push({ title: 'Страны ▸', group: 'countries' }, { title: 'Жанры ▸', group: 'genres' }, { title: 'Годы ▸', group: 'years' }, { title: 'Каналы ▸', group: 'channels' });
            Lampa.Select.show({
                title: 'Каталог',
                items: items,
                onSelect: function (it) {
                    if (it.special) {
                        back();
                        if (it.special === 'navi') return setTimeout(openNavi, 80);
                        if (it.special === 'rand') return openRandom();
                        if (it.special === 'pod') return openScreen('podborki', 'Подборки');
                        if (it.special === 'news') return openScreen('news', 'Новые серии');
                        if (it.special === 'sched') return openScreen('schedule', 'Расписание');
                        return openScreen('actorsTop', 'Популярные актёры');
                    }
                    if (it.path) { back(); return openCatalog(it.path, it.title); }
                    sub({ countries: 'Страна', genres: 'Жанр', years: 'Год', channels: 'Канал' }[it.group], menu[it.group]);
                },
                onBack: back
            });
        });
    }

    function openMarksMenu() {
        var back = function () { Lampa.Controller.toggle('content'); };
        var items = LIST_KEYS.map(function (k) { return { title: LISTS[k] + ' (' + markedItems(k).length + ')', value: k }; });
        if (accountOn()) items.push({ title: 'Синхронизировать с аккаунтом' + (accountInfo().login ? ' (' + accountInfo().login + ')' : ''), sync: true });
        Lampa.Select.show({
            title: 'Мои списки',
            items: items,
            onSelect: function (it) {
                back();
                if (it.sync) return runSync(false);
                openMarks(it.value);
            },
            onBack: back
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Component: главная / каталог / поиск / списки                     */
    /* ------------------------------------------------------------------ */

    var DASH = [['Популярное сейчас', '/', 'popular'], ['Новинки', '/1-novinki'], ['Топ', '/top'], ['Сериалы', '/serialy'], ['Фильмы', '/filmy']];

    function MainComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div class="dc"></div>');
        var grid = new Grid('content', scroll);
        var sections = [], btns = [], bar, actor = null;
        var destroyed = false, token = 0, builtSig = '', lastData = null;
        var page = 1, more = false, busy = false, moreBtn = null, lastBox = null, lastItems = null;
        var lazy = new Lazy({ margin: 2, trickle: 4 });

        scroll.minus();
        html.append(scroll.render());

        function card(t, badge, pct) {
            var el = $('<div class="dc-card selector"><div class="dc-card__img"><img alt=""/></div>' +
                '<div class="dc-card__title"></div><div class="dc-card__sub"></div></div>');
            el.find('.dc-card__title').text(t.title);
            el.find('.dc-card__sub').text([t.mainRole ? 'Главная роль' : '', t.year || '', t.country || ''].filter(function (x) { return x; }).join(' · '));
            lazy.add(el.find('img'), t.poster);
            var img = el.find('.dc-card__img');
            var b = badge || cardBadge(t);
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
            if (object.catalog || object.query || object.marks || object.mode) {
                btns.push(button('← Главная', function () {
                    Lampa.Activity.replace({ url: '', title: 'Doramy.club', component: 'doramyclub_main', page: 1 }, true);
                }));
            }
            btns.push(button('Поиск', function () { askSearch('content'); }));
            btns.push(button('Каталог', openCatalogMenu));
            btns.push(button('Мои списки', openMarksMenu));
            btns.push(button('Случайная', openRandom));
            var cp = object.catalog ? countryParam(object.catalog.path) : '';
            if (cp) {
                var cv = queryValue(object.catalog.query, cp);
                btns.push(button('Страна: ' + (optionLabel(COUNTRY_FILTER, cv) || 'Все страны'), function () {
                    pickOne('Страна', COUNTRY_FILTER, cv, function (v) {
                        Lampa.Controller.toggle('content');
                        Lampa.Activity.replace({ url: '', title: object.catalog.title, component: 'doramyclub_main', catalog: { path: object.catalog.path, title: object.catalog.title, query: setQueryValue(object.catalog.query, cp, v) }, page: 1 }, true);
                    });
                }));
            }
            if (actor) {
                var onlyMain = queryValue(object.catalog.query, 'akter_role') === 'main';
                btns.push(button(onlyMain ? 'Роли: только главные' : 'Роли: все', function () {
                    Lampa.Activity.replace({ url: '', title: object.catalog.title, component: 'doramyclub_main', catalog: { path: object.catalog.path, title: object.catalog.title, query: setQueryValue(object.catalog.query, 'akter_role', onlyMain ? '' : 'main') }, page: 1 }, true);
                }));
            }
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
            if (actor) actorHeader();

            var dashboard = !object.query && !object.catalog && !object.marks && !object.mode;
            if (dashboard) {
                var nws = newsItems();
                if (nws.length && setting('doramy_row_news', true)) row('Вышли новые серии', nws, newsBadge, {});
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
                scroll.append($('<div class="dc-empty"></div>').text(
                    object.mode === 'news' ? 'Новых серий пока нет. Отслеживаются дорамы из «Смотрю», избранного и истории — сравниваются счётчики серий на сайте с теми, что вы видели.' :
                    object.mode === 'schedule' ? 'Расписание пусто: оно строится по дорамам из ваших списков со статусом «Выходит» и текстом сайта «серии выходят по…». Добавьте такие дорамы в «Смотрю» или избранное.' :
                    'Ничего не найдено'));
            }
            if (object.mode === 'schedule' && data.length) scroll.append($('<div class="dc-empty"></div>').text('Дни — по данным сайта (когда серии выходят в Корее/Китае); озвучка и субтитры появляются позже.'));
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
            else loadList(object.catalog.path, p, ok, fail, false, object.catalog.query);
        }

        function actorHeader() {
            var box = $('<div class="dc-title dc-actor"><div class="dc-title__poster"><img alt=""/></div><div class="dc-title__body"></div></div>');
            setImage(box.find('img'), actor.photo);
            var body = box.find('.dc-title__body');
            body.append($('<div class="dc-title__name"></div>').text(actor.name));
            var facts = $('<div class="dc-title__facts"></div>');
            actor.facts.forEach(function (f) { facts.append($('<div></div>').text(f[0] + ': ' + f[1])); });
            body.append(facts);
            scroll.append(box);
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
            actor = null;
            self.activity.loader(true);
            if (object.marks) {
                build([{ title: LISTS[object.marks], items: markedItems(object.marks) }]);
            } else if (object.mode === 'podborki') {
                fetchPage('/podborki-luchshix-doram', function (html) {
                    if (alive()) build([{ title: 'Подборки', items: parsePodborki(html, base()).map(podItem) }]);
                }, function (e) { if (alive()) fail(e); }, force);
            } else if (object.mode === 'actorsTop') {
                fetchPage('/aktery-top', function (html) {
                    if (alive()) build([{ title: 'Популярные актёры', items: parseActorsTop(html, base()).map(actorItem) }]);
                }, function (e) { if (alive()) fail(e); }, force);
            } else if (object.mode === 'news') {
                checkNews(function () { if (alive()) build([{ title: 'Вышли новые серии', items: newsItems() }]); }, true);
            } else if (object.mode === 'schedule') {
                refreshSchedule(function () { if (alive()) build(scheduleGroups()); });
            } else if (object.query) {
                pageLoader(1, function (items, hasMore) {
                    if (!alive()) return;
                    more = hasMore;
                    searchActors(object.query, function (actors) {
                        if (!alive()) return;
                        var data = [];
                        if (actors.length) data.push({ title: 'Актёры', items: actors.slice(0, 12).map(actorItem) });
                        data.push({ title: 'Найдено по запросу «' + object.query + '»', items: items });
                        build(data);
                    });
                }, function (e) { if (alive()) fail(e); });
            } else if (object.catalog) {
                pageLoader(1, function (items, hasMore, pageHtml) {
                    if (!alive()) return;
                    more = hasMore;
                    if (/^\/akter\//.test(object.catalog.path)) actor = parseActor(pageHtml, base());
                    build([{ title: object.catalog.title, items: items }]);
                }, function (e) { if (alive()) fail(e); });
            } else {
                var left = DASH.length, res = [], errs = 0, lastErr = '';
                var done = function () {
                    if (errs === DASH.length) return fail(lastErr);
                    build(res);
                    // фоновые проверки: новые серии и расписание (раз в сутки), только если пользователь ничего не смотрит
                    checkNews(function (changed) { if (changed && alive()) build(res); });
                    refreshSchedule();
                };
                DASH.forEach(function (d, i) {
                    var ok = function (items) {
                        res[i] = { title: d[0], items: items, path: d[2] ? undefined : d[1] };
                        if (!--left && alive()) done();
                    };
                    var bad = function (e) {
                        errs++;
                        lastErr = e;
                        res[i] = { title: d[0], items: [] };
                        if (!--left && alive()) done();
                    };
                    if (d[2] === 'popular') fetchPage(d[1], function (html) { ok(parsePopular(html, base()).slice(0, 10)); }, bad, force);
                    else loadList(d[1], 1, ok, bad, force);
                });
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

    var ROW_BTNS = 0, ROW_EPS = 1, ROW_CAST = 2, ROW_SIM = 3;

    function TitleComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div class="dc"></div>');
        var grid = new Grid('content', scroll);
        var item = object.item, d = null;
        var tracks = [], others = [], othersState = 'idle', cur = 0, eps = [], epNodes = [];
        var rows = [[], [], [], []];
        var continueBtn, voiceBtn, head, epsHost, castHost, simHost, btnsBox;
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
            var t = $.extend({}, item, { title: d.title || item.title, poster: d.poster || item.poster, year: d.year || item.year, country: d.country || item.country, total: d.total, voice: tracks[cur] ? tracks[cur].title : '' });
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

        // Метка заставки: одна на тайтл и озвучку, применяется ко всем сериям (Lampa покажет «Пропустить»)
        function skipKey() { return item.id + ':' + (tracks[cur] ? tracks[cur].title : ''); }

        function setSkip() {
            var sk = getMap('doramy_skip')[skipKey()];
            Lampa.Input.edit({ title: 'Заставка: начало-конец, например 1:30-2:45', value: sk ? fmtTime(sk.start) + '-' + fmtTime(sk.end) : '', free: true, nosave: true }, function (txt) {
                Lampa.Controller.toggle('content');
                var r = parseSkip(txt);
                if (!r) return Lampa.Noty.show('Формат: мм:сс-мм:сс, конец позже начала');
                var m = getMap('doramy_skip');
                m[skipKey()] = r;
                Lampa.Storage.set('doramy_skip', m);
                Lampa.Noty.show('Заставка сохранена: ' + fmtTime(r.start) + '–' + fmtTime(r.end));
            });
        }

        function episodeMenu(i) {
            var ep = eps[i], v = viewOf(ep), watched = v.percent >= 90;
            var items = [
                { title: watched ? 'Отметить непросмотренной' : 'Отметить просмотренной', run: function () { setWatched(i, !watched); } },
                { title: 'Отметить просмотренными все до этой', run: function () { for (var k = 0; k <= i; k++) setWatched(k, true); } }
            ];
            if (v.percent > 0 || v.time > 5) items.push({ title: 'Сбросить прогресс серии', run: function () { setWatched(i, false); } });
            items.push({ title: 'Сбросить прогресс всего тайтла', run: function () { for (var k = 0; k < eps.length; k++) setWatched(k, false); } });
            var sk = getMap('doramy_skip')[skipKey()];
            items.push({ title: sk ? 'Заставка: ' + fmtTime(sk.start) + '–' + fmtTime(sk.end) + ' (изменить)' : 'Задать пропуск заставки…', run: setSkip });
            if (sk) items.push({ title: 'Убрать пропуск заставки', run: function () { var m = getMap('doramy_skip'); delete m[skipKey()]; Lampa.Storage.set('doramy_skip', m); } });
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

        // «Автоперевод»: на сайте одна ссылка «выбор серий в плеере» — раскрываем её в список серий Kodik
        function ensureTrack(i, cb) {
            var tr = tracks[i];
            if (!tr || !tr.auto || tr.resolved || !tr.links[0]) return cb();
            voiceBtn.text('Озвучка: загрузка…');
            net(tr.links[0], { referer: base() + '/' }, function (html) {
                var k = parseKodikPage(html), links = [];
                k.series.forEach(function (x) { links[x.num - 1] = x.link; });
                for (var j = 0; j < links.length; j++) if (!links[j]) links[j] = '';
                if (links.length) tr.links = links;
                tr.resolved = true;
                if (!destroyed) cb();
            }, function () { tr.resolved = true; if (!destroyed) cb(); });
        }

        function selectTrack(i) {
            ensureTrack(i, function () {
                cur = i;
                buildEps();
                renderEpisodes();
                voiceBtn.text('Озвучка: ' + tracks[cur].title);
                grid.set(rows, true);
                var m = getMap('doramy_voice');
                m[item.id] = tracks[i].title;
                Lampa.Storage.set('doramy_voice', m);
            });
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
                title: 'Мои списки' + (accountOn() && accountInfo().login ? ' · аккаунт ' + accountInfo().login : ''),
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
            rows = [[again, back], [], [], []];
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
            markSeen(item.id, d.voiceEp, d.subsEp);
            saveSchedule(item, d);

            head = $('<div class="dc-title"><div class="dc-title__poster"><img alt=""/></div><div class="dc-title__body"></div></div>');
            var posterImg = head.find('.dc-title__poster img');
            setImage(posterImg, d.posterHd || d.poster || item.poster, function () { setImage(posterImg, d.poster || item.poster); });
            var body = head.find('.dc-title__body');
            body.append($('<div class="dc-title__name"></div>').text(d.title || item.title));
            if (item.orig) body.append($('<div class="dc-title__orig"></div>').text(item.orig));
            var meta = $('<div class="dc-title__meta"></div>');
            if (d.rating) meta.append($('<span class="dc-title__rate"></span>').text(d.rating.toFixed(1) + (d.ratingCount ? ' · ' + d.ratingCount + ' оц.' : '')));
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
            var collBtn = d.collections && d.collections.length ? button(btnsBox, 'Подборки', collectionsMenu) : null;
            var commBtn = d.comments && d.comments.length ? button(btnsBox, 'Отзывы (' + d.comments.length + ')', showComments) : null;
            var lampaBtn = (Lampa.Search && Lampa.Search.open) ? button(btnsBox, 'Карточка Lampa', openTmdb) : null;
            body.append(btnsBox);
            scroll.append(head);

            epsHost = $('<div class="dc-eps-host"></div>');
            scroll.append(epsHost);
            castHost = $('<div class="dc-cast-host"></div>');
            scroll.append(castHost);
            simHost = $('<div class="dc-sim-host"></div>');
            scroll.append(simHost);

            var btnRow = [continueBtn, voiceBtn, qBtn, plBtn, listBtn];
            [descrBtn, ppl, gen, collBtn, commBtn, lampaBtn].forEach(function (b) { if (b) btnRow.push(b); });
            rows = [btnRow, [], [], []];

            // Основная озвучка и субтитры — вкладки сайта; остальные озвучки грузим из Kodik в фоне
            if (tracks.length) {
                cur = initialTrack();
                ensureTrack(cur, function () {
                    buildEps();
                    renderEpisodes();
                    voiceBtn.text('Озвучка: ' + tracks[cur].title);
                    grid.set(rows, true);
                });
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

            if (d.cast && d.cast.length) renderCast();
            if (d.similar && d.similar.length) renderSimilar();

            // хотя бы один выбираемый элемент всегда есть — кнопки
            grid.set(rows);
            grid.at(eps.length && getMap('doramy_state')[item.id] ? ROW_EPS : ROW_BTNS, eps.length && getMap('doramy_state')[item.id] ? resumeIndex() : 0);
            self.activity.loader(false);
            self.activity.toggle();
            setTimeout(function () { epLazy.check(); }, 100);
        }

        function renderCast() {
            var wrap = $('<div class="dc-row dc-row--sim"><div class="dc-row__title">В ролях</div></div>');
            var line = new Lampa.Scroll({ horizontal: true, step: 450 });
            var nodes = [];
            d.cast.slice(0, 30).forEach(function (c) {
                var el = $('<div class="dc-sim selector"><div class="dc-card__img"><img alt=""/></div><div class="dc-card__title"></div><div class="dc-card__sub"></div></div>');
                el.find('.dc-card__title').text(c.name);
                el.find('.dc-card__sub').text(c.role);
                epLazy.add(el.find('img'), c.photo);
                el.on('hover:focus', function () { grid.track(el); line.update(el, true); scroll.update(wrap, false); setTimeout(function () { epLazy.check(); }, 60); });
                el.on('hover:hover hover:touch', function () { grid.track(el); });
                el.on('hover:enter', function () { openCatalog(c.path, c.name); });
                nodes.push(el);
                line.append(el);
            });
            wrap.append(line.render());
            castHost.append(wrap);
            rows[ROW_CAST] = nodes;
        }

        function collectionsMenu() {
            Lampa.Select.show({
                title: 'Подборки',
                items: d.collections.map(function (c) { return { title: c.title, path: c.path }; }),
                onSelect: function (it) { Lampa.Controller.toggle('content'); openCatalog(it.path, it.title); },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }

        // Отзывы: только чтение, инлайн-часть со страницы тайтла
        function showComments() {
            var lines = ['Осторожно, могут быть спойлеры.' + (d.commentsClosed ? ' Новые отзывы к этой дораме закрыты.' : '')];
            d.comments.forEach(function (c) { lines.push(c.author + ' · ' + c.date + '\n' + c.text); });
            var box = $('<div class="dc-modal"></div>').append($('<div class="dc-modal__text"></div>').text(lines.join('\n\n')));
            Lampa.Modal.open({ title: 'Отзывы: ' + d.title, html: box, size: 'medium', onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('content'); } });
        }

        // Точный матч в TMDB (оригинальное название + год + тип) → полная карточка Lampa; запасной путь — поиск Lampa
        function openTmdb() {
            var cache = getMap('doramy_tmdb'), q = item.orig || d.title || item.title, type = d.kind === 'movie' ? 'movie' : 'tv';
            var open = function (card) {
                Lampa.Activity.push({ url: '', title: card.title || card.name || q, component: 'full', id: card.id, method: type, card: card, source: 'tmdb' });
            };
            var fallback = function () {
                if (Lampa.Search && Lampa.Search.open) Lampa.Search.open({ input: q });
                else Lampa.Noty.show('Поиск Lampa недоступен');
            };
            if (cache[item.id]) return open(cache[item.id]);
            try {
                var url = Lampa.TMDB.api('search/' + type + '?api_key=' + Lampa.TMDB.key() + '&language=ru&query=' + encodeURIComponent(q) +
                    (d.year ? (type === 'tv' ? '&first_air_date_year=' : '&year=') + d.year : ''));
                new Lampa.Reguest().silent(url, function (json) {
                    var res = (json && json.results) || [], best = null;
                    for (var i = 0; i < res.length && !best; i++) {
                        if (d.year && ((res[i].first_air_date || res[i].release_date || '') + '').slice(0, 4) === '' + d.year) best = res[i];
                    }
                    best = best || res[0];
                    if (!best) return fallback();
                    cache[item.id] = { id: best.id, title: best.title, name: best.name, original_title: best.original_title, original_name: best.original_name, first_air_date: best.first_air_date, release_date: best.release_date, poster_path: best.poster_path, overview: best.overview, vote_average: best.vote_average };
                    Lampa.Storage.set('doramy_tmdb', cache);
                    open(cache[item.id]);
                }, fallback);
            } catch (e) { fallback(); }
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
        var a = analyzeCookie(cookie(), siteUA());
        var lines = [
            'Версия плагина: ' + VERSION,
            'Сайт: ' + base() + ' → ' + state.site,
            'Селекторы: ' + state.parse,
            'Прокси: ' + (setting('doramy_proxy', '') || 'не задан'),
            'Зеркала: ' + (mirrors().length ? mirrors().join(', ') : 'не заданы'),
            'Kodik: ' + KODIK + ' → ' + state.kodik,
            'Cookie: ' + (cookie() ? 'задана (' + a.names.length + ' шт.), получена ' + cookieAgeText() : 'не задана'),
            '  сессия аккаунта: ' + (a.hasSession ? 'есть' : 'нет') + ', cookie проверки браузера: ' + (a.hasAntibot ? 'есть' : 'нет'),
            '  UA в cookie ' + (a.uaMatch === null ? 'не указан' : a.uaMatch ? 'совпадает с UA плагина' : 'НЕ совпадает с UA плагина')
        ];
        if (cookie()) lines.push('  состав: ' + maskCookie(cookie()));
        var sy = syncState();
        lines.push('Синхронизация: очередь ' + sy.queue.length + (sy.paused ? ', ПАУЗА (' + (sy.paused === 'noauth' ? 'сессия истекла' : 'проверка браузера') + ')' : '') + (sy.last ? ', последняя ' + new Date(sy.last).toLocaleString() : ''));
        lines.push('Платформа: ' + platformName() + ', User-Agent: ' + ((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 100));
        if (state.site.indexOf('anti-bot') >= 0) {
            lines.push('');
            lines.push('Сайт требует проверку браузера, и плагин её не решает. Что делать: вставьте cookie вашего браузера (кнопка «Вставить cookie»), при несовпадении UA включите «User-Agent из cookie», либо используйте прокси/шлюз, который проходит проверку.');
            if (a.hasAntibot && a.uaMatch === false) lines.push('Cookie проверки есть, но UA в ней другой: сайт, скорее всего, привязал проверку к браузеру, из которого она взята.');
            if (cookie() && !a.hasAntibot) lines.push('В cookie нет cookie проверки браузера (__js_p_, __jhash_, __jua_): скопируйте строку Cookie целиком.');
        }
        var box = $('<div class="dc-modal"></div>').append($('<div class="dc-modal__text"></div>').text(lines.join('\n')));
        Lampa.Modal.open({
            title: 'Doramy.club: диагностика',
            html: box,
            size: 'medium',
            onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('settings_component'); }
        });
    }

    // Диагностика + «контрактная» проверка селекторов на живых страницах: список, страница тайтла (плеер, жанры), навигатор
    function runDiagnostics() {
        Lampa.Noty.show('Проверяю сайт и плеер…');
        var state = { site: '…', kodik: '…', parse: '…' }, left = 2;
        var done = function () { if (!--left) showDiagnostics(state); };
        var t0 = Date.now();
        fetchPage('/serialy', function (html, offline) {
            var items = parseListing(html, base());
            state.site = (offline ? 'офлайн-кеш, ' : 'доступен, ') + items.length + ' карточек (' + (Date.now() - t0) + ' мс)';
            if (!items.length) { state.parse = 'НЕТ карточек: разметка сайта могла измениться'; return done(); }
            fetchPage(items[0].url, function (page) {
                var d = parseDetail(page, base());
                var tr = 0;
                d.tracks.forEach(function (x) { tr += x.links.length ? 1 : 0; });
                state.parse = 'карточек ' + items.length + '; тайтл «' + (d.title || '?') + '»: вариантов плеера ' + tr + ', Kodik-iframe ' + (d.iframe ? 'да' : 'нет') + ', жанров ' + d.genres.length + ', актёров ' + d.cast.length +
                    (d.title && (tr || d.iframe) ? '' : ' — ПРОВЕРЬТЕ: плеер не найден');
                done();
            }, function () { state.parse = 'карточки читаются (' + items.length + '), страница тайтла недоступна'; done(); });
        }, function (e) {
            state.site = e === 'challenge' ? 'НЕДОСТУПЕН (anti-bot: проверка браузера)' : 'НЕДОСТУПЕН (' + e + ')';
            state.parse = 'не проверено';
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
            param: { name: 'doramy_full_btn', type: 'trigger', default: true },
            field: { name: 'Кнопка «Doramy.club» в карточке Lampa', description: 'Открывает поиск по названию на сайте' }
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
        Lampa.SettingsApi.addParam({ component: 'doramyclub', param: { name: 'doramy_acc_title', type: 'title' }, field: { name: 'Аккаунт doramy.club' } });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_cookie', type: 'input', values: '', default: '' },
            field: { name: 'Cookie сессии', description: 'Длинную строку не набирайте, а вставьте кнопкой ниже (на Mac) или перенесите с Mac через аккаунт Lampa — переключатель ниже. Пароль не нужен и не хранится. Cookie уходит только на адрес сайта из настроек' },
            onChange: function () {
                var c = normalizeCookie(setting('doramy_cookie', ''));
                if (c !== setting('doramy_cookie', '')) Lampa.Storage.set('doramy_cookie', c);
                Lampa.Storage.set('doramy_cookie_ts', Date.now());
                nonceMem = null;
                pushCred();
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_cookie_paste', type: 'button' },
            field: { name: 'Вставить cookie из буфера обмена', description: 'Скопируйте строку Cookie в браузере (DevTools → Network → заголовок Cookie запроса) и нажмите здесь' },
            onChange: pasteCookie
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_cub_cookie', type: 'trigger', default: false },
            field: { name: 'Перенос cookie между устройствами', description: 'Вставьте cookie на Mac, включите здесь и на приставке — она подтянется через аккаунт Lampa (CUB). Внимание: сессия сайта будет храниться на серверах CUB в вашем аккаунте' },
            onChange: onCubToggle
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_cub_lists', type: 'trigger', default: false },
            field: { name: 'Перенос истории и списков между устройствами', description: 'История просмотра и личные списки через аккаунт Lampa (CUB)' },
            onChange: onCubToggle
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_use_cookie_ua', type: 'trigger', default: false },
            field: { name: 'User-Agent из cookie', description: 'Сайт привязывает проверку браузера к User-Agent. Включайте, только если cookie взяты вами из своего браузера: плагин будет представляться тем же браузером. Условия сайта на автоматизированные клиенты остаются на вашей ответственности' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_acc_check', type: 'button' },
            field: { name: 'Проверить вход', description: 'Показывает логин аккаунта, если сессия принята' },
            onChange: checkAccount
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_sync_on', type: 'trigger', default: true },
            field: { name: 'Синхронизировать списки с сайтом', description: 'Избранное, «На потом», «Смотрю», «Просмотрено», «Брошено»: изменения в Lampa уходят на сайт, списки сайта попадают в Lampa' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_sync_now', type: 'button' },
            field: { name: 'Синхронизировать сейчас' },
            onChange: function () { runSync(false); }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_auto_status', type: 'trigger', default: false },
            field: { name: 'Авто-статус «Смотрю»', description: 'При запуске серии ставить статус «Смотрю», если статуса ещё нет' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_acc_logout', type: 'button' },
            field: { name: 'Отключить аккаунт', description: 'Забыть cookie и очередь отправки; локальные списки остаются' },
            onChange: logoutAccount
        });
        Lampa.SettingsApi.addParam({ component: 'doramyclub', param: { name: 'doramy_news_title', type: 'title' }, field: { name: 'Новые серии и ряды на главной' } });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_news_on', type: 'trigger', default: true },
            field: { name: 'Проверять новые серии', description: 'Раз в 45 минут при открытии дашборда читаются 3 страницы ленты сайта; сравниваются счётчики серий у дорам из «Смотрю», избранного и истории. Во время просмотра не запускается' }
        });
        Lampa.SettingsApi.addParam({ component: 'doramyclub', param: { name: 'doramy_row_news', type: 'trigger', default: true }, field: { name: 'Ряд «Вышли новые серии»' } });
        Lampa.SettingsApi.addParam({ component: 'doramyclub', param: { name: 'doramy_row_watching', type: 'trigger', default: true }, field: { name: 'Ряд «Смотрю» на главной Lampa' } });
        Lampa.SettingsApi.addParam({ component: 'doramyclub', param: { name: 'doramy_net_title', type: 'title' }, field: { name: 'Сеть' } });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_gap', type: 'select', values: { '0': 'Без паузы', '250': '250 мс', '350': '350 мс', '600': '600 мс', '1000': '1 с' }, default: '350' },
            field: { name: 'Пауза между запросами к сайту', description: 'Не больше 2 одновременных запросов; пауза бережёт сайт и слабые ТВ' }
        });
        Lampa.SettingsApi.addParam({
            component: 'doramyclub',
            param: { name: 'doramy_mirrors', type: 'input', values: '', default: '' },
            field: { name: 'Зеркала сайта', description: 'Адреса через запятую; используются, если основной не отвечает. Добавляйте только адреса, подтверждённые самим сайтом: есть фишинговые клоны. Cookie аккаунта на зеркала не отправляется' }
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

    // Кнопка «Doramy.club» в полной карточке Lampa: поиск по названию (оригинал или русское) на сайте
    function addFullButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite' || !setting('doramy_full_btn', true)) return;
            try {
                var card = (e.data && e.data.movie) || (e.object && e.object.card) || {};
                var q = card.original_title || card.original_name || card.title || card.name;
                if (!q) return;
                var root = e.object.activity.render();
                if (root.find('.dc-full-btn').length) return;
                var btn = $('<div class="full-start__button selector dc-full-btn"><span></span></div>');
                btn.find('span').text('Doramy.club');
                btn.on('hover:enter', function () { openSearch(q); });
                var anchor = root.find('.view--torrent').first();
                if (anchor.length) anchor.after(btn);
                else root.find('.full-start-new__buttons, .full-start__buttons').first().append(btn);
            } catch (x) { console.log('Doramy.club', 'full button failed', x); }
        });
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

    function addMoreRows() {
        if (!Lampa.ContentRows || !Lampa.ContentRows.add) return;
        var mk = function (t) {
            var c = toCard(t);
            c.params = { emit: { onlyEnter: function () { openTitle(t); } } };
            return c;
        };
        Lampa.ContentRows.add({
            name: 'doramyclub_news',
            title: 'Doramy.club: вышли новые серии',
            index: 1,
            screen: ['main'],
            call: function () {
                try {
                    if (!setting('doramy_row_news', true)) return;
                    var list = newsItems().slice(0, 15);
                    if (!list.length) return;
                    return function (call) { call({ results: list.map(mk), title: 'Doramy.club: вышли новые серии' }); };
                } catch (e) { console.log('Doramy.club', 'row news', e); }
            }
        });
        Lampa.ContentRows.add({
            name: 'doramyclub_watching',
            title: 'Doramy.club: смотрю',
            index: 3,
            screen: ['main'],
            call: function () {
                try {
                    if (!setting('doramy_row_watching', true)) return;
                    var list = markedItems('watching').slice(0, 15);
                    if (!list.length) return;
                    return function (call) { call({ results: list.map(mk), title: 'Doramy.club: смотрю' }); };
                } catch (e) { console.log('Doramy.club', 'row watching', e); }
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
        try { addFullButton(); } catch (e) { console.log('Doramy.club', 'full button unavailable', e); }
        try { addGlobalSearch(); } catch (e) { console.log('Doramy.club', 'global search unavailable', e); }
        try { addMainRows(); addMoreRows(); } catch (e) { console.log('Doramy.club', 'main rows unavailable', e); }
        document.addEventListener('visibilitychange', function () { if (!document.hidden) playingNow = false; });
        // новые серии: напоминание при запуске (если есть)
        setTimeout(function () {
            checkNews(function (changed, count) { if (count) Lampa.Noty.show('Doramy.club: вышли новые серии — ' + count); });
        }, 6000);
        initCubSync();
        // фоновая синхронизация при запуске не чаще раза в час
        if (accountOn() && !syncState().paused && Date.now() - (syncState().last || 0) > 3600000) setTimeout(function () { runSync(true); }, 4000);
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})();
