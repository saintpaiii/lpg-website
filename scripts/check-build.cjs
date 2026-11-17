/**
 * npm run check:build — run before every push.
 * The live server does not run npm: it serves the committed public/build. Every file the Vite manifest references
 * (entry files, CSS, assets) must therefore be tracked by git (staged counts). Prints the number of missing files
 * (must be 0) and lists them; exits with code 1 when any are missing.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'public/build/manifest.json');
if (!fs.existsSync(manifestPath)) {
    console.error('public/build/manifest.json not found — run `npm run build` first.');
    process.exit(1);
}

const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const needed = new Set();
for (const k in m) {
    needed.add(m[k].file);
    (m[k].css || []).forEach((c) => needed.add(c));
    (m[k].assets || []).forEach((a) => needed.add(a));
}

const tracked = new Set(
    execSync('git ls-files public/build', { cwd: root }).toString().split('\n').filter(Boolean).map((x) => x.replace('public/build/', '')),
);
const missing = [...needed].filter((f) => !tracked.has(f));
console.log(missing.length);
if (missing.length) {
    console.error(`${missing.length} of ${needed.size} build files are not in git (git add -A public/build):`);
    missing.slice(0, 50).forEach((f) => console.error('  ' + f));
    process.exit(1);
}
console.error(`OK — all ${needed.size} build files referenced by the manifest are tracked.`);
