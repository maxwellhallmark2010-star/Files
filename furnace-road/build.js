// Build Furnace Road into one self-contained HTML file.
//   node build.js                    -> ../furnace-road.html (three.js inlined, works offline)
//   node build.js --artifact <file>  -> also writes a page fragment that loads three.js from cdnjs
const fs = require('fs'), path = require('path');
const here = __dirname;
const srcDir = path.join(here, 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
const game = "(function () {\n'use strict';\n" +
  files.map((f) => `// ===== ${f} =====\n` + fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n') +
  '\n})();\n';
const three = fs.readFileSync(path.join(here, 'vendor', 'three.min.js'), 'utf8');
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');

const full = tpl.replace('/*__THREE__*/', () => three).replace('/*__GAME__*/', () => game);
const out = path.join(here, '..', 'furnace-road.html');
fs.writeFileSync(out, full);
console.log('wrote', path.relative(process.cwd(), out), (full.length / 1024).toFixed(0) + ' KB from', files.length, 'modules');

const ai = process.argv.indexOf('--artifact');
if (ai > 0 && process.argv[ai + 1]) {
  const grab = (tag) => { const m = tpl.match(new RegExp(`<!--A:${tag}-->([\\s\\S]*?)<!--/A:${tag}-->`)); if (!m) throw new Error('missing ' + tag); return m[1]; };
  const frag = (grab('TITLE') + grab('STYLE') + grab('BODY'))
    .replace('<script>/*__THREE__*/</script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
    .replace('/*__GAME__*/', () => game);
  fs.writeFileSync(process.argv[ai + 1], frag);
  console.log('wrote artifact fragment', process.argv[ai + 1], (frag.length / 1024).toFixed(0) + ' KB');
}
