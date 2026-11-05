// node build.js  ->  writes ../boulevard-kings.html (single, self-contained file)
//                    and dist/artifact.html (same page as a fragment for publishing)
const fs = require('fs'), path = require('path');
const here = __dirname;
const three = fs.readFileSync(path.join(here, 'vendor', 'three.min.js'), 'utf8');
const files = fs.readdirSync(path.join(here, 'src')).filter(f => f.endsWith('.js')).sort();
const game = '(function(){\n' + files.map(f => `// ---- ${f}\n` + fs.readFileSync(path.join(here, 'src', f), 'utf8')).join('\n') + '\n})();';
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const frag = tpl.replace('/*__THREE__*/', () => three).replace('/*__GAME__*/', () => game);
const cut = frag.indexOf('<canvas id="c">');
const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
  + frag.slice(0, cut) + '\n</head>\n<body>\n' + frag.slice(cut) + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(here, '..', 'boulevard-kings.html'), full);
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
fs.writeFileSync(path.join(here, 'dist', 'artifact.html'), frag);
fs.writeFileSync(path.join(here, 'dist', 'game.js'), game);
console.log('wrote boulevard-kings.html', (full.length / 1024).toFixed(0) + ' KB', '·', files.length, 'source files');
