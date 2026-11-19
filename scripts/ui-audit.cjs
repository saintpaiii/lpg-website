#!/usr/bin/env node
/*
 * J10 — UI audit: contrast + phone layout, in BOTH colour schemes, at 375 × 800.
 *
 *   npm run ui:audit -- --db=lpg_uiaudit [--seed] [--only=/seller] [--json=out.json] [--chrome=PATH]
 *
 * Starts `php -S` on a TEST database (DB_DATABASE=<--db>, MAIL_MAILER=log; never the .env database — refused), logs in
 * as admin, seller1, customer1 and rider1 (DemoSeeder accounts) and opens every page in light and dark mode. Reports:
 *   (a) visible text with a contrast ratio < 3 : 1 against its real background (colours converted with a canvas, so
 *       oklch() works; walks up to the first opaque background, blending translucent layers), and
 *   (b) pages wider than the viewport, and action buttons (button, [role=button], a.inline-flex) off-screen.
 * --seed runs `migrate:fresh --seed` on THAT test database first (only names containing test / audit / throwaway).
 * Uses playwright-core with the installed Google Chrome (no browser download).
 */
const { chromium } = require('playwright-core');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
}));
const DB = String(args.db || process.env.UI_AUDIT_DB || 'lpg_uiaudit');
const PORT = Number(args.port || 8124);
const BASE = `http://127.0.0.1:${PORT}`;
const ONLY = args.only ? String(args.only) : null;
const CHROME = args.chrome || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// ── Safety: never the real database ─────────────────────────────────────────
const envDb = (() => {
    try {
        const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^DB_DATABASE=(.*)$/m);
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
    } catch { return null; }
})();
if (envDb && DB === envDb) {
    console.error(`Refusing: --db=${DB} is the .env database. Use a TEST database (e.g. lpg_uiaudit).`);
    process.exit(2);
}
if (!/test|audit|throwaway/i.test(DB)) {
    console.error(`Refusing: the database name must contain "test", "audit" or "throwaway" (got ${DB}).`);
    process.exit(2);
}

const env = { ...process.env, DB_DATABASE: DB, MAIL_MAILER: 'log', FACEPP_FAKE: 'pass' };
if (args.seed) {
    console.log(`Seeding ${DB} (migrate:fresh --seed) …`);
    const r = spawnSync('php', ['artisan', 'migrate:fresh', '--seed', '--force'], { cwd: ROOT, env, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) process.exit(r.status || 1);
}

const PAGES = {
    guest: ['/', '/login', '/register', '/seller/register', '/terms', '/seller-terms', '/privacy', '/this-page-does-not-exist'],
    customer: ['/customer/products', '/customer/products/1', '/customer/store/1', '/customer/cart', '/customer/checkout', '/customer/orders',
        '@first:/customer/orders:/customer/orders/', '/customer/messages', '/customer/refunds', '/settings/profile', '/settings/password', '/settings/appearance'],
    seller: ['/seller/dashboard', '/seller/main-dashboard', '/seller/products', '/seller/orders', '@first:/seller/orders:/seller/orders/', '/seller/deliveries',
        '/seller/vehicles', '/seller/invoices', '/seller/inventory', '/seller/suppliers', '/seller/purchase-orders', '/seller/staff', '/seller/attendance',
        '/seller/payroll', '/seller/plan', '/seller/revenue', '/seller/refunds', '/seller/reports', '@tabs:/seller/dss', '/seller/settings', '/seller/branches',
        '/seller/messages', '/seller/coupons'],
    rider: ['/rider/deliveries', '/rider/documents', '/rider/my-payslips', '/rider/history'],
    admin: ['/admin/dashboard', '/admin/stores', '/admin/stores/1', '/admin/users', '/admin/subscriptions', '/admin/settings', '/admin/reports',
        '/admin/verifications', '/admin/customers', '/admin/dss'],
};
const USERS = {
    customer: ['customer1@lpg.com', 'Password@123'],
    seller: ['seller1@lpg.com', 'Password@123'],
    rider: ['rider1@lpg.com', 'Password@123'],
    admin: ['admin@lpg.com', 'password'],
};

// ── In-page checks (run in the browser) ─────────────────────────────────────
function auditInPage() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
        if (!css || css === 'transparent') return [0, 0, 0, 0];
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top, under) => {   // composite top over an opaque colour
        const a = top[3];
        return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const rootBg = (() => {
        const b = rgba(getComputedStyle(document.body).backgroundColor);
        if (b[3] > 0) return over(b, [255, 255, 255, 1]);
        const h = rgba(getComputedStyle(document.documentElement).backgroundColor);
        return h[3] > 0 ? over(h, [255, 255, 255, 1]) : [255, 255, 255, 1];
    })();
    // The real background behind an element: translucent layers blended up to the first opaque one. null = an image /
    // gradient is in the way (can't be judged — skipped).
    const bgOf = (el) => {
        const layers = [];
        // Text in a fixed / sticky bar with a transparent background (e.g. the landing navbar over the hero): what is
        // painted UNDER it at that point counts, not the DOM ancestors
        let chain = [];
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            chain.push(e);
            const pos = getComputedStyle(e).position;
            if (pos === 'fixed' || pos === 'sticky') {
                const opaque = chain.some((x) => rgba(getComputedStyle(x).backgroundColor)[3] > 0 || getComputedStyle(x).backgroundImage !== 'none');
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                if (!opaque && cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
                    for (const u of document.elementsFromPoint(cx, cy)) {
                        if (chain.includes(u) || e.contains(u)) continue;
                        const cs = getComputedStyle(u);
                        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
                        const c = rgba(cs.backgroundColor);
                        if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
                    }
                    let base = layers.length && layers[layers.length - 1][3] >= 0.999 ? layers.pop() : rootBg;
                    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
                    return base;
                }
                break;
            }
        }
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
            const c = rgba(cs.backgroundColor);
            if (c[3] > 0) {
                layers.push(c);
                if (c[3] >= 0.999) break;
            }
        }
        let base = layers.length && layers[layers.length - 1][3] >= 0.999 ? layers.pop() : rootBg;
        for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
        return base;
    };
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        let op = 1;
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
            op *= Number(cs.opacity);
            if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') return false;
        }
        return op > 0.05 ? op : false;
    };
    const describe = (el) => {
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4).join('.');
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    };

    const contrast = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 1) continue;
        const el = n.parentElement;
        if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue;
        seen.add(el);
        if (el.closest('[aria-hidden="true"], .recharts-wrapper, .leaflet-container, svg, [data-audit-skip]')) continue;
        // Disabled controls are exempt (WCAG 1.4.3); so is text still fading in (an animation is running on it)
        if (el.closest('button:disabled, [aria-disabled="true"], fieldset:disabled')) continue;
        if (el.getAnimations && el.getAnimations({ subtree: false }).length === 0
            && [...(function* () { for (let e = el; e; e = e.parentElement) yield e; })()].some((e) => e.getAnimations && e.getAnimations().some((a) => a.playState === 'running'))) continue;
        const op = visible(el);
        if (!op) continue;
        const cs = getComputedStyle(el);
        const bg = bgOf(el);
        if (!bg) continue;
        let fg = rgba(cs.color);
        fg = [fg[0], fg[1], fg[2], fg[3] * op];
        const r = ratio(over(fg, bg), bg);
        if (r < 3) {
            contrast.push({ text: text.slice(0, 60), el: describe(el), ratio: Math.round(r * 100) / 100, fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(',')})` });
        }
    }

    const vw = window.innerWidth;
    const wide = document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : null;
    const offscreen = [];
    for (const b of document.querySelectorAll('button, [role="button"], a.inline-flex, a[data-slot="button"]')) {
        if (!visible(b) || b.closest('[aria-hidden="true"], [data-audit-skip]')) continue;
        // A chip / tab bar that scrolls sideways on purpose is reachable — but buttons in a sideways-scrolling TABLE are
        // what phones must not need (they should be cards)
        let scroller = false;
        for (let e = b.parentElement; e && e !== document.body; e = e.parentElement) {
            const ox = getComputedStyle(e).overflowX;
            if ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1) { scroller = true; break; }
        }
        if (scroller && !b.closest('table')) continue;
        const r = b.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
            offscreen.push({ text: (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 40), el: describe(b), left: Math.round(r.left), right: Math.round(r.right) });
        }
    }

    return { contrast, wide, offscreen };
}

// ── Driver ───────────────────────────────────────────────────────────────────
async function login(page, email, password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'load' });
    const ok = await page.evaluate(async ({ email, password }) => {
        const tok = decodeURIComponent((document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN=')) || '').split('=')[1] || '');
        const r = await fetch('/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': tok }, body: JSON.stringify({ email, password }) });
        return r.status < 400;
    }, { email, password });
    if (!ok) throw new Error(`login failed for ${email}`);
}

async function acceptPolicies(page) {
    for (let i = 0; i < 2; i++) try {
        const has = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Accept and continue'));
        if (!has) return;
        await page.evaluate(() => {
            const l = [...document.querySelectorAll('label')].find((x) => x.innerText.includes('I have read and agree'));
            (l?.querySelector('input,button'))?.click();
        });
        await page.waitForTimeout(250);
        await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Accept and continue')?.click());
        await page.waitForTimeout(1200);
    } catch { await page.waitForTimeout(1500); /* the page navigated meanwhile */ }
}

async function open(page, url) {
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
}

(async () => {
    const server = spawn('php', ['-S', `127.0.0.1:${PORT}`, path.join(ROOT, 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')],
        { cwd: path.join(ROOT, 'public'), env, stdio: 'ignore', shell: process.platform === 'win32' });
    await new Promise((r) => setTimeout(r, 1500));
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const results = [];
    const summary = { light: { contrast: 0, wide: 0, offscreen: 0 }, dark: { contrast: 0, wide: 0, offscreen: 0 } };

    try {
        for (const [role, pages] of Object.entries(PAGES)) {
            for (const scheme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width: 375, height: 800 }, colorScheme: scheme, deviceScaleFactor: 1 });
                await context.addInitScript(() => { try { localStorage.setItem('appearance', 'system'); } catch { /* */ } });
                const page = await context.newPage();
                if (USERS[role]) {
                    await login(page, ...USERS[role]);
                    await open(page, pages.find((p) => !p.startsWith('@')) || '/');
                    await acceptPolicies(page);
                }
                for (const spec of pages) {
                    let targets = [spec];
                    if (spec.startsWith('@first:')) {
                        const [, list, prefix] = spec.split(':');
                        await open(page, list);
                        const href = await page.evaluate((pre) => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => h && h.startsWith(pre) && /\/\d+$/.test(h)), prefix);
                        targets = href ? [href] : [];
                    }
                    for (const url of targets) {
                        const tabs = url.startsWith('@tabs:');
                        const real = tabs ? url.slice(6) : url;
                        if (ONLY && !real.startsWith(ONLY)) continue;
                        await open(page, real);
                        const runs = [{ label: real, run: () => page.evaluate(auditInPage) }];
                        if (tabs) {
                            const names = await page.evaluate(() => [...document.querySelectorAll('[role=tablist] button, [data-tabbar] button, .scrollbar-none button')].map((b) => b.innerText.trim()).filter(Boolean));
                            for (const n of [...new Set(names)]) {
                                runs.push({ label: `${real} [${n}]`, run: async () => {
                                    await page.evaluate((t) => [...document.querySelectorAll('[role=tablist] button, [data-tabbar] button, .scrollbar-none button')].find((b) => b.innerText.trim() === t)?.click(), n);
                                    await page.waitForTimeout(900);
                                    return page.evaluate(auditInPage);
                                } });
                            }
                        }
                        for (const r of runs) {
                            let res;
                            try { res = await r.run(); } catch (e) {
                                await page.waitForTimeout(1500);
                                try { res = await r.run(); } catch (e2) {
                                    console.log(`[${scheme}] ${role} ${r.label}: could not audit (${String(e2.message).split(/\r?\n/)[0]})`);
                                    continue;
                                }
                            }
                            const finding = { scheme, role, page: r.label, ...res };
                            results.push(finding);
                            summary[scheme].contrast += res.contrast.length;
                            summary[scheme].wide += res.wide ? 1 : 0;
                            summary[scheme].offscreen += res.offscreen.length;
                            const n = res.contrast.length + (res.wide ? 1 : 0) + res.offscreen.length;
                            if (n) {
                                console.log(`\n[${scheme}] ${role} ${r.label}: ${res.contrast.length} low-contrast, ${res.wide ? `page ${res.wide}px wide, ` : ''}${res.offscreen.length} off-screen buttons`);
                                for (const c of res.contrast.slice(0, 12)) console.log(`   contrast ${c.ratio}:1  "${c.text}"  ${c.el}  fg ${c.fg} on ${c.bg}`);
                                if (res.contrast.length > 12) console.log(`   … ${res.contrast.length - 12} more`);
                                for (const o of res.offscreen.slice(0, 8)) console.log(`   off-screen "${o.text}" ${o.el} (${o.left}…${o.right}px)`);
                            }
                        }
                    }
                }
                await context.close();
            }
        }
    } finally {
        await browser.close();
        server.kill();
        if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    }

    if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(results, null, 2));
    const pagesAudited = new Set(results.map((r) => `${r.role} ${r.page}`)).size;
    console.log(`\n── UI audit: ${pagesAudited} pages × 2 schemes ──`);
    for (const s of ['light', 'dark']) {
        console.log(`  ${s.padEnd(5)}  low-contrast texts: ${summary[s].contrast}   pages wider than 375px: ${summary[s].wide}   off-screen buttons: ${summary[s].offscreen}`);
    }
    const total = Object.values(summary).reduce((n, s) => n + s.contrast + s.wide + s.offscreen, 0);
    process.exit(total > 0 && args.strict ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
