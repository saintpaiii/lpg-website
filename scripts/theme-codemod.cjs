#!/usr/bin/env node
/*
 * J10 — one-off codemod: hard-coded light-theme Tailwind colours → shadcn theme tokens / dark: variants.
 *   node scripts/theme-codemod.cjs [--dry]
 * Works per string literal ('…', "…", `…` on one line) of resources/js/**\/*.tsx (not components/ui — shadcn):
 *   - a string that already has a dark: variant for that property (dark:text-, dark:bg-, dark:border-) is left alone;
 *   - greys → tokens: text-gray-900/800/black → text-foreground, 700 → text-foreground/80, 600/500/400 → text-muted-foreground,
 *     bg-white → bg-card, bg-gray-50/100/200 → bg-muted, border-gray-100/200/300 → border-border, divide-… → divide-border;
 *   - status colours keep their light look and get a dark: variant (bg-amber-100 → + dark:bg-amber-900/40,
 *     text-amber-800 → + dark:text-amber-300, border-amber-200 → + dark:border-amber-800);
 *   - white text on amber/yellow-400/500 or green/emerald-500 → the 600 shade (light-mode contrast ≥ 3 : 1).
 * A line with "theme-ok" in a comment is skipped.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'resources', 'js');
const DRY = process.argv.includes('--dry');
const GREY = '(?:gray|slate|zinc|neutral)';
const COLORS = '(?:red|amber|yellow|green|emerald|blue|indigo|violet|purple|orange|sky|pink|rose|teal|cyan|lime|fuchsia)';
const END = '(?=$|[\\s"\'`}):])';
const PRE = '((?:[a-z0-9-]+:)*)';   // variant prefixes (hover:, sm:, group-hover: …)

function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) return d.name === 'ui' && dir.endsWith('components') ? [] : files(p);
        return p.endsWith('.tsx') ? [p] : [];
    });
}

/** Replace class tokens in one string literal body. */
function transform(str) {
    let s = str;
    const hasDark = (prop) => new RegExp(`dark:(?:[a-z0-9-]+:)*${prop}-`).test(s);
    const sub = (re, fn) => { s = s.replace(new RegExp(`(^|[\\s"'\`{(])${PRE}${re}${END}`, 'g'), (m, lead, pre, ...rest) => (pre.includes('dark:') ? m : lead + fn(pre, ...rest))); };

    // Light-mode contrast: white text on light amber / green backgrounds → darker shade
    if (/(^|\s)text-white(\s|$)/.test(s)) {
        sub('bg-(amber|yellow)-(400|500)', (pre) => `${pre}bg-amber-600`);
        sub('bg-(green|emerald)-500', (pre) => `${pre}bg-emerald-600`);
        sub('bg-orange-500', (pre) => `${pre}bg-orange-600`);
        sub('bg-sky-500', (pre) => `${pre}bg-sky-600`);
    }

    if (!hasDark('text')) {
        sub(`(text-${GREY}-(?:900|800)|text-black)`, (pre) => `${pre}text-foreground`);
        sub(`text-${GREY}-700`, (pre) => `${pre}text-foreground/80`);
        sub(`text-${GREY}-(?:600|500|400)`, (pre) => `${pre}text-muted-foreground`);
        sub(`text-(${COLORS})-(700|800|900)`, (pre, c, n) => `${pre}text-${c}-${n} dark:${pre}text-${c}-300`);
    }
    if (!hasDark('bg')) {
        sub('bg-white', (pre) => `${pre}bg-card`);
        sub(`bg-${GREY}-(?:50|100|200)`, (pre) => `${pre}bg-muted`);
        sub(`bg-(${COLORS})-(50|100)`, (pre, c, n) => `${pre}bg-${c}-${n} dark:${pre}bg-${c}-${n === '50' ? '950/40' : '900/40'}`);
    }
    if (!hasDark('border')) {
        sub(`border-${GREY}-(?:100|200|300)`, (pre) => `${pre}border-border`);
        sub(`border-(${COLORS})-(100|200|300)`, (pre, c) => `${pre}border-${c}-200 dark:${pre}border-${c}-800`);
    }
    if (!hasDark('divide')) {
        sub(`divide-${GREY}-(?:100|200)`, (pre) => `${pre}divide-border`);
    }
    return s;
}

let changedLines = 0;
const changedFiles = [];
for (const f of files(ROOT)) {
    const src = fs.readFileSync(f, 'utf8');
    const out = src.split('\n').map((line) => {
        if (line.includes('theme-ok')) return line;
        const next = line.replace(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g, (m, q, body) => q + transform(body) + q);
        if (next !== line) changedLines++;
        return next;
    }).join('\n');
    if (out !== src) {
        changedFiles.push(path.relative(path.resolve(__dirname, '..'), f));
        if (!DRY) fs.writeFileSync(f, out);
    }
}
console.log(`${DRY ? '[dry] ' : ''}${changedLines} lines in ${changedFiles.length} files`);
if (process.argv.includes('--list')) console.log(changedFiles.join('\n'));
