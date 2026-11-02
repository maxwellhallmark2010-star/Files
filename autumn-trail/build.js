// node build.js  ->  writes ../autumn-trail.html (single, self-contained file)
const fs = require('fs'), path = require('path');
const here = __dirname;
const three = fs.readFileSync(path.join(here, 'vendor', 'three.min.js'), 'utf8');
const game = fs.readFileSync(path.join(here, 'game.js'), 'utf8');
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const out = tpl.replace('/*__THREE__*/', () => three).replace('/*__GAME__*/', () => game);
fs.writeFileSync(path.join(here, '..', 'autumn-trail.html'), out);
console.log('wrote autumn-trail.html', (out.length / 1024).toFixed(0) + ' KB');
