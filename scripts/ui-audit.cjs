#!/usr/bin/env node
/*
 * J10 / K10 — UI audit: contrast + layout, in BOTH colour schemes, at 375 × 800 (phone) and 1366 × 800 (desktop).
 *
 *   npm run ui:audit -- --db=lpg_uiaudit [--seed] [--only=/seller | --only==/exact] [--sizes=375,1366] [--no-dialogs] [--dev] [--json=out.json]
 *
 * Starts `php -S` on a TEST database (DB_DATABASE=<--db>, MAIL_MAILER=log; never the .env database — refused), logs in
 * once per role as admin, seller1, customer1 and rider1 (DemoSeeder accounts) and opens every page. Each page is first
 * scrolled to the bottom and back (content that fades in on scroll is checked too). Reports:
 *   contrast   visible text < 3 : 1 against its real background (canvas colour conversion, so oklch() works; translucent
 *              layers are alpha-blended over what's underneath; fixed bars use what is painted below them)
 *   wide       the document is wider than the viewport
 *   offscreen  an action button outside the viewport (not in a chip / tab bar that scrolls sideways on purpose)
 *   clipped    visible text / a button extending past an ancestor with overflow hidden / clip (incl. dialogs), unless that
 *              is a deliberate "…" (text-overflow: ellipsis) or a sideways scroller
 *   midword    a single word broken over 3+ lines in a narrow box ("Deliv / ery")
 *   overlap    sibling labels in a row / stepper whose boxes overlap
 *   hscroll    (K11) a box with overflow-x auto / scroll whose content is wider than it (scrollWidth > clientWidth + 2) —
 *              a table cut off at the card edge counts here, not as "clipped". Deliberate sideways chip / tab bars
 *              (nav, role=tablist, .scrollbar-none, [data-audit-scroll-ok], a one-row bar without a table) are not reported.
 * Dialog sweep: on each page, non-destructive buttons (Add / New / Create / Assign / Edit / Record / Receive …) are clicked;
 * an opened dialog is checked the same way, then closed with Escape.
 * --seed runs `migrate:fresh --seed` on THAT test database first (only names containing test / audit / throwaway), then
 * scripts/ui-audit-long-data.php (a rider with a long name, a long store name, a long product name).
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
const SIZES = String(args.sizes || '375,1366').split(',').map(Number).filter(Boolean);
const DIALOGS = !args['no-dialogs'];
const CHROME = args.chrome || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const KINDS = ['contrast', 'wide', 'offscreen', 'clipped', 'midword', 'overlap', 'hscroll'];

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

const env = { ...process.env, DB_DATABASE: DB, MAIL_MAILER: 'log', FACEPP_FAKE: 'pass', ...(args.dev ? {} : { VITE_IGNORE_HOT: '1' }) };   // the built assets — --dev: what a running `npm run dev` serves (the source)
const shell = process.platform === 'win32';
if (args.seed) {
    console.log(`Seeding ${DB} (migrate:fresh --seed + long demo data) …`);
    let r = spawnSync('php', ['artisan', 'migrate:fresh', '--seed', '--force'], { cwd: ROOT, env, stdio: 'inherit', shell });
    if (r.status !== 0) process.exit(r.status || 1);
    r = spawnSync('php', [path.join('scripts', 'ui-audit-long-data.php')], { cwd: ROOT, env, stdio: 'inherit', shell });
    if (r.status !== 0) process.exit(r.status || 1);
}

const PAGES = {
    guest: ['/', '/login', '/register', '/seller/register', '/terms', '/seller-terms', '/privacy', '/this-page-does-not-exist'],
    customer: ['/customer/products', '/customer/products/1', '/customer/store/1', '/customer/store/4', '/customer/cart', '/customer/profile', '/customer/checkout', '/customer/orders',
        '@first:/customer/orders:/customer/orders/', '/customer/messages', '/customer/refunds', '/settings/profile', '/settings/password', '/settings/appearance'],
    seller: ['/seller/dashboard', '/seller/main-dashboard', '/seller/products', '/seller/orders', '@first:/seller/orders:/seller/orders/', '@row:/seller/orders:Preparing', '/seller/deliveries',
        '/seller/vehicles', '/seller/invoices', '/seller/inventory', '/seller/suppliers', '/seller/purchase-orders', '/seller/staff', '/seller/attendance',
        '/seller/payroll', '/seller/plan', '/seller/revenue', '/seller/refunds', '/seller/reports', '@tabs:/seller/dss', '/seller/settings', '/seller/branches', '/seller/branches/create',
        '/seller/messages', '/seller/coupons'],
    rider: ['/rider/deliveries', '/rider/documents', '/rider/my-payslips', '/rider/history'],
    admin: ['/admin/dashboard', '/admin/stores', '/admin/stores/1', '/admin/stores/4', '/admin/users', '/admin/subscriptions', '/admin/settings', '/admin/reports', '/admin/reports?tab=users', '/admin/reports?tab=stores', '/admin/reports?tab=orders',
        '/admin/reports?tab=ratings', '/admin/reports?tab=subscriptions',
        '/admin/verifications', '/admin/customers', '/admin/dss'],
};
const USERS = {
    customer: ['customer1@lpg.com', 'Password@123'],
    seller: ['seller1@lpg.com', 'Password@123'],
    rider: ['rider1@lpg.com', 'Password@123'],
    admin: ['admin@lpg.com', 'password'],
};
// Buttons that open a dialog without changing anything (clicked by the dialog sweep) — and words never clicked
const OPENERS = /^(add|new|create|assign|edit|record|receive|stock in|stock out|set|upload|import|view|details|pay|change|update|damaged|batches|in|out)\b/i;
const NEVER = /\b(delete|remove|archive|cancel|reject|suspend|deactivate|log ?out|sign (in|out|up)|send|confirm|approve|accept|decline|restore|force|submit|save|place order|checkout|mark|clock (in|out)|switch|toggle|search|apply|export|csv|pdf|print|download|refresh|read again)\b/i;

// ── In-page checks (run in the browser) ─────────────────────────────────────
async function auditInPage(rootSelector) {
    const root = rootSelector ? document.querySelector(rootSelector) : document.body;
    if (!root) return null;
    if (!document.getElementById('ui-audit-no-motion')) {
        const st = document.createElement('style');
        st.id = 'ui-audit-no-motion';
        st.textContent = '*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important}';
        document.head.appendChild(st);
    }
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
    const over = (top, under) => {   // alpha-composite top over an opaque colour
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
    const blend = (layers) => {   // layers: top → bottom; the bottom-most opaque one is the base
        let base = layers.length && layers[layers.length - 1][3] >= 0.999 ? layers.pop() : rootBg;
        for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
        return base;
    };
    // The real background behind an element: every translucent layer alpha-blended down to the first opaque one.
    // null = an image / gradient is in the way (can't be judged — skipped).
    const bgOf = (el) => {
        const chain = [];
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            chain.push(e);
            const pos = getComputedStyle(e).position;
            if (pos === 'fixed' || pos === 'sticky') {
                // a transparent fixed / sticky bar: what is painted UNDER it at that point counts
                const opaque = chain.some((x) => rgba(getComputedStyle(x).backgroundColor)[3] > 0 || getComputedStyle(x).backgroundImage !== 'none');
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                if (!opaque && cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) {
                    const layers = [];
                    for (const u of document.elementsFromPoint(cx, cy)) {
                        if (chain.includes(u) || e.contains(u)) continue;
                        const cs = getComputedStyle(u);
                        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
                        const c = rgba(cs.backgroundColor);
                        if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
                    }
                    return blend(layers);
                }
                break;
            }
        }
        const layers = [];
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
            const c = rgba(cs.backgroundColor);
            if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
        }
        return blend(layers);
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
    const animating = (el) => {
        for (let e = el; e; e = e.parentElement) if (e.getAnimations && e.getAnimations().some((a) => a.playState === 'running')) return true;
        return false;
    };
    const skip = (el) => el.closest('[aria-hidden="true"], .recharts-wrapper, .leaflet-container, svg, [data-audit-skip], [data-sonner-toaster]');
    // Inside a dialog sweep only the dialog counts; a page audit ignores open dialogs / popovers
    const inScope = (el) => (rootSelector ? root.contains(el) : !el.closest('[role=dialog], [role=alertdialog], [data-radix-popper-content-wrapper]'));

    const out = { contrast: [], wide: null, offscreen: [], clipped: [], midword: [], overlap: [], hscroll: [] };
    const texts = [];
    const seen = new Set();
    const positions = [];
    if (rootSelector) positions.push(null);
    else for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(300, innerHeight * 0.75)) positions.push(y);
    for (const y of positions) {
    if (y !== null) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const el = n.parentElement;
        if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue;
        seen.add(el);
        if (skip(el) || !inScope(el) || animating(el)) { seen.delete(el); continue; }
        const op = visible(el);
        if (!op) { seen.delete(el); continue; }   // maybe visible at another scroll position
        if (y !== null) {
            const br = el.getBoundingClientRect();
            if (br.bottom < 0 || br.top > innerHeight) { seen.delete(el); continue; }
        }
        texts.push({ el, node: n, text });
        // (a) contrast — disabled controls are exempt (WCAG 1.4.3)
        if (!el.closest('button:disabled, [aria-disabled="true"], fieldset:disabled')) {
            const bg = bgOf(el);
            if (bg) {
                const cs = getComputedStyle(el);
                let fg = rgba(cs.color);
                fg = [fg[0], fg[1], fg[2], fg[3] * op];
                const r = ratio(over(fg, bg), bg);
                if (r < 3) out.contrast.push({ text: text.slice(0, 60), el: describe(el), ratio: Math.round(r * 100) / 100, fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(',')})` });
            }
        }
    }
    // geometry checks for the texts seen at this position (positions change between scrolls for fixed bars only)
    checkGeometry(texts.splice(0));
    }
    if (positions.length > 1) { window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 200)); }

    // (b) clipped: text / buttons extending past an ancestor that hides overflow (not a deliberate "…", not a scroller)
    const clipCheck = (el, label) => {
        const r = el.getBoundingClientRect();
        for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.textOverflow === 'ellipsis' || getComputedStyle(el).textOverflow === 'ellipsis') return;
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;   // reachable by scrolling
            if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
                const a = e.getBoundingClientRect();
                if (r.right > a.right + 2 || r.left < a.left - 2) {
                    out.clipped.push({ text: label.slice(0, 50), el: describe(el), by: describe(e), over: Math.round(Math.max(r.right - a.right, a.left - r.left)) });
                }
                return;
            }
        }
    };
    function checkGeometry(list) {
    for (const t of list) {
        // the text box itself (a Range — an inline span can be wider than its container)
        const range = document.createRange();
        range.selectNodeContents(t.node);
        const rr = range.getBoundingClientRect();
        if (rr.width < 1) continue;
        const holder = t.el;
        const r = rr;
        for (let e = holder; e && e !== document.documentElement; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.textOverflow === 'ellipsis') break;
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') break;
            if (e !== holder && (cs.overflowX === 'hidden' || cs.overflowX === 'clip')) {
                const a = e.getBoundingClientRect();
                if (r.right > a.right + 2 || r.left < a.left - 2) {
                    out.clipped.push({ text: t.text.slice(0, 50), el: describe(holder), by: describe(e), over: Math.round(Math.max(r.right - a.right, a.left - r.left)) });
                }
                break;
            }
        }
    }
    // (c) mid-word breaks: one word, a narrow box, 3+ lines
    for (const t of list) {
        if (/\s/.test(t.text) || t.text.length < 7) continue;
        const fs = parseFloat(getComputedStyle(t.el).fontSize) || 14;
        const w = t.el.getBoundingClientRect().width;
        if (w > fs * 0.6 * 7) continue;
        const range = document.createRange();
        range.selectNodeContents(t.node);
        const lines = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size;
        if (lines >= 3) out.midword.push({ text: t.text.slice(0, 40), el: describe(t.el), width: Math.round(w), lines });
    }
    }
    for (const b of root.querySelectorAll('button, [role="button"], a.inline-flex, a[data-slot="button"]')) {
        if (!inScope(b) || skip(b) || !visible(b) || animating(b)) continue;
        clipCheck(b, (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim());
    }

    // (d) overlapping sibling labels (steppers, rows)
    for (const p of root.querySelectorAll('*')) {
        if (!inScope(p) || skip(p)) continue;
        const d = getComputedStyle(p).display;
        if (!/flex|grid/.test(d) || p.children.length < 2 || p.children.length > 12) continue;
        const kids = [...p.children].filter((k) => {
            const cs = getComputedStyle(k);
            return !['absolute', 'fixed', 'sticky'].includes(cs.position) && (k.innerText || '').trim() && visible(k);   // a sticky footer floats over content on purpose
        });
        for (let i = 0; i < kids.length; i++) {
            for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (ix > 3 && iy > 3) {
                    out.overlap.push({ a: kids[i].innerText.replace(/\s+/g, ' ').trim().slice(0, 30), b: kids[j].innerText.replace(/\s+/g, ' ').trim().slice(0, 30), el: describe(p), area: Math.round(ix * iy) });
                }
            }
        }
    }

    // (f) K11 — sideways scrollers whose content does not fit (a table wider than its card)
    for (const e of root.querySelectorAll('*')) {
        if (!inScope(e) || skip(e) || !visible(e)) continue;
        const ox = getComputedStyle(e).overflowX;
        if (ox !== 'auto' && ox !== 'scroll') continue;
        if (e.scrollWidth <= e.clientWidth + 2 || e.clientWidth === 0) continue;
        if (e.matches('nav, [role=tablist], .scrollbar-none, [data-audit-scroll-ok]') || e.closest('nav, [role=tablist], [data-audit-scroll-ok]')) continue;
        if (e.tagName === 'HTML' || e.tagName === 'BODY') continue;   // the page itself is "wide"
        if (!e.querySelector('table') && e.clientHeight < 80) continue;   // a one-row chip / filter bar that scrolls sideways on purpose
        const heads = [...e.querySelectorAll('th')].map((th) => th.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
        out.hscroll.push({ el: describe(e), over: e.scrollWidth - e.clientWidth, heads: heads.join(' | ') || (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) });
    }

    // (e) page width + off-screen action buttons (page audit only)
    if (!rootSelector) {
        const vw = innerWidth;
        out.wide = document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : null;
        for (const b of document.querySelectorAll('button, [role="button"], a.inline-flex, a[data-slot="button"]')) {
            if (!inScope(b) || !visible(b) || skip(b)) continue;
            let scroller = false;
            for (let e = b.parentElement; e && e !== document.body; e = e.parentElement) {
                const ox = getComputedStyle(e).overflowX;
                if ((ox === 'auto' || ox === 'scroll') && e.scrollWidth > e.clientWidth + 1) { scroller = true; break; }
            }
            if (scroller && !b.closest('table')) continue;
            const r = b.getBoundingClientRect();
            if (r.right > vw + 1 || r.left < -1) {
                out.offscreen.push({ text: (b.innerText || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 40), el: describe(b), left: Math.round(r.left), right: Math.round(r.right) });
            }
        }
    }
    return out;
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
    await page.waitForTimeout(1100);
}

/** Open each non-destructive dialog of the page, audit it, close it (Escape). */
async function dialogSweep(page, url) {
    const found = [];
    const labels = await page.evaluate(({ o, n }) => {
        const OPEN = new RegExp(o, 'i'), NO = new RegExp(n, 'i');
        const seen = new Set();
        return [...document.querySelectorAll('button')].filter((b) => {
            const t = (b.innerText || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length > 40 || b.disabled || !b.offsetParent || seen.has(t) || NO.test(t) || !OPEN.test(t)) return false;
            if (b.closest('[role=dialog], [role=alertdialog], nav, header, [data-sidebar]')) return false;
            seen.add(t);
            return true;
        }).slice(0, 6).map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim());
    }, { o: OPENERS.source, n: NEVER.source });
    for (const label of labels) {
        try {
            await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => (b.innerText || '').replace(/\s+/g, ' ').trim() === t && b.offsetParent)?.click(), label);
            await page.waitForTimeout(900);
            if (!page.url().startsWith(BASE + url.split('?')[0])) {   // it was a link, not a dialog
                await open(page, url);
                continue;
            }
            const sel = await page.evaluate(() => {
                const d = document.querySelector('[role=alertdialog][data-state=open], [role=dialog][data-state=open]');
                if (!d) return null;
                d.setAttribute('data-audit-dialog', '1');
                return '[data-audit-dialog="1"]';
            });
            if (sel) {
                const res = await page.evaluate(auditInPage, sel);
                if (res) found.push({ label, res });
                await page.evaluate(() => document.querySelector('[data-audit-dialog]')?.removeAttribute('data-audit-dialog'));
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            if (await page.evaluate(() => !!document.querySelector('[role=dialog][data-state=open], [role=alertdialog][data-state=open]'))) {
                await open(page, url);
            }
        } catch { await open(page, url); }
    }
    return found;
}

const count = (res) => KINDS.reduce((n, k) => n + (k === 'wide' ? (res.wide ? 1 : 0) : (res[k]?.length ?? 0)), 0);

function print(head, res) {
    const parts = KINDS.filter((k) => (k === 'wide' ? res.wide : res[k]?.length)).map((k) => (k === 'wide' ? `page ${res.wide}px wide` : `${res[k].length} ${k}`));
    console.log(`\n${head}: ${parts.join(', ')}`);
    for (const c of res.contrast.slice(0, 8)) console.log(`   contrast ${c.ratio}:1  "${c.text}"  ${c.el}  fg ${c.fg} on ${c.bg}`);
    for (const c of res.clipped.slice(0, 8)) console.log(`   clipped by ${c.over}px "${c.text}"  ${c.el}  (by ${c.by})`);
    for (const c of res.midword.slice(0, 8)) console.log(`   mid-word "${c.text}" ${c.lines} lines in ${c.width}px  ${c.el}`);
    for (const c of res.overlap.slice(0, 8)) console.log(`   overlap "${c.a}" × "${c.b}"  ${c.el}`);
    for (const h of (res.hscroll || []).slice(0, 8)) console.log(`   hscroll +${h.over}px  [${h.heads}]  ${h.el}`);
    for (const o of res.offscreen.slice(0, 8)) console.log(`   off-screen "${o.text}" ${o.el} (${o.left}…${o.right}px)`);
}

/** Is something already listening on the port? (a stale server would answer instead of ours) */
function portBusy(port) {
    return new Promise((resolve) => {
        const sock = require('net').connect(port, '127.0.0.1');
        sock.once('connect', () => { sock.destroy(); resolve(true); });
        sock.once('error', () => resolve(false));
    });
}

(async () => {
    if (await portBusy(PORT)) {
        console.error(`Port ${PORT} is already in use — stop that server (or pass --port=…) so the audit measures its own test server.`);
        process.exit(2);
    }
    // php directly (no shell), so server.pid is PHP itself and stopping it at the end really stops it
    const server = spawn('php', ['-S', `127.0.0.1:${PORT}`, path.join(ROOT, 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')],
        { cwd: path.join(ROOT, 'public'), env, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 1500));
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const results = [];
    const summary = {};
    const states = {};   // one login per role (the login is rate-limited)

    try {
        for (const [role, pages] of Object.entries(PAGES)) {
            for (const w of SIZES) {
                for (const scheme of ['light', 'dark']) {
                    const key = `${scheme} ${w}`;
                    summary[key] ??= Object.fromEntries(KINDS.map((k) => [k, 0]));
                    const context = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme, deviceScaleFactor: 1, storageState: states[role] });
                    await context.addInitScript(() => { try { localStorage.setItem('appearance', 'system'); } catch { /* */ } });
                    const page = await context.newPage();
                    if (USERS[role] && !states[role]) {
                        await login(page, ...USERS[role]);
                        await open(page, pages.find((p) => !p.startsWith('@')) || '/');
                        await acceptPolicies(page);
                        states[role] = await context.storageState();
                    }
                    for (const spec of pages) {
                        let targets = [spec];
                        if (spec.startsWith('@row:')) {   // the first row of a list whose text matches (e.g. a Preparing order)
                            const [, list, match] = spec.split(':');
                            await open(page, list);
                            const href = await page.evaluate((m) => { const row = [...document.querySelectorAll('tr')].find((r) => r.innerText.includes(m)); return row?.querySelector('a[href]')?.getAttribute('href') ?? null; }, match);
                            targets = href ? [href] : [];
                        }
                        if (spec.startsWith('@first:')) {
                            const [, list, prefix] = spec.split(':');
                            await open(page, list);
                            const href = await page.evaluate((pre) => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => h && h.startsWith(pre) && /\/\d+$/.test(h)), prefix);
                            targets = href ? [href] : [];
                        }
                        for (const url of targets) {
                            const tabs = url.startsWith('@tabs:');
                            const real = tabs ? url.slice(6) : url;
                            // --only=/seller (prefix) or --only==/ (exactly that URL)
                            if (ONLY && (ONLY.startsWith("=") ? real !== ONLY.slice(1) : !real.startsWith(ONLY))) continue;
                            await open(page, real);
                            const runs = [{ label: real, run: () => page.evaluate(auditInPage, null) }];
                            if (tabs) {
                                const names = await page.evaluate(() => [...document.querySelectorAll('[role=tablist] button, [data-tabbar] button, .scrollbar-none button')].map((b) => b.innerText.trim()).filter(Boolean));
                                for (const n of [...new Set(names)]) {
                                    runs.push({ label: `${real} [${n.replace(/\s+/g, ' ')}]`, run: async () => {
                                        await page.evaluate((t) => [...document.querySelectorAll('[role=tablist] button, [data-tabbar] button, .scrollbar-none button')].find((b) => b.innerText.trim() === t)?.click(), n);
                                        await page.waitForTimeout(900);
                                        return page.evaluate(auditInPage, null);
                                    } });
                                }
                            }
                            for (const r of runs) {
                                let res;
                                try { res = await r.run(); } catch {
                                    await page.waitForTimeout(1500);
                                    try { res = await r.run(); } catch (e2) {
                                        console.log(`[${key}] ${role} ${r.label}: could not audit (${String(e2.message).split(/\r?\n/)[0]})`);
                                        continue;
                                    }
                                }
                                if (!res) continue;
                                results.push({ scheme, width: w, role, page: r.label, ...res });
                                for (const k of KINDS) summary[key][k] += k === 'wide' ? (res.wide ? 1 : 0) : res[k].length;
                                if (count(res)) print(`[${key}] ${role} ${r.label}`, res);
                            }
                            if (DIALOGS && !tabs) {
                                for (const d of await dialogSweep(page, real)) {
                                    results.push({ scheme, width: w, role, page: `${real} {dialog: ${d.label}}`, ...d.res });
                                    for (const k of KINDS) if (k !== 'wide') summary[key][k] += d.res[k].length;
                                    if (count(d.res)) print(`[${key}] ${role} ${real} {dialog: ${d.label}}`, d.res);
                                }
                            }
                        }
                    }
                    await context.close();
                }
            }
        }
    } finally {
        await browser.close();
        server.kill();
        if (shell && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
        if (await portBusy(PORT)) console.error(`Warning: something still listens on port ${PORT} after the audit.`);
    }

    if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(results, null, 2));
    const pagesAudited = new Set(results.filter((r) => !r.page.includes('{dialog')).map((r) => `${r.role} ${r.page}`)).size;
    const dialogs = new Set(results.filter((r) => r.page.includes('{dialog')).map((r) => `${r.role} ${r.page}`)).size;
    console.log(`\n── UI audit: ${pagesAudited} pages + ${dialogs} dialogs × ${Object.keys(summary).length} (scheme × width) ──`);
    for (const [k, s] of Object.entries(summary)) {
        console.log(`  ${k.padEnd(10)}  ${KINDS.map((x) => `${x}: ${s[x]}`).join('   ')}`);
    }
    const total = Object.values(summary).reduce((n, s) => n + KINDS.reduce((m, k) => m + s[k], 0), 0);
    process.exit(total > 0 && args.strict ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
