// A tiny static server for trying the game locally: node tools-feral/serve.js [port]   (serves the public/ folder)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'public'), port = +process.argv[2] || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__save?')) {      // local test helper: the browser posts a generated image (icons, card picture) and it is saved under public/feral/
    const rel = decodeURIComponent(req.url.split('path=')[1] || ''); const target = path.join(root, 'feral', rel); if (!target.startsWith(path.join(root, 'feral')) || rel.includes('..')) { res.statusCode = 403; return res.end(); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.concat(chunks)); res.end('saved ' + rel + ' ' + Buffer.concat(chunks).length); }); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const dev = p.startsWith('/__dev/'); const f = dev ? path.join(__dirname, p.slice(7)) : path.join(root, p); if (!dev && !f.startsWith(root)) { res.statusCode = 403; return res.end(); }   // /__dev/ serves this tools folder (test bots) - local only
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end('not found'); } res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(d); });
}).listen(port, () => console.log('serving ' + root + ' on http://localhost:' + port));
