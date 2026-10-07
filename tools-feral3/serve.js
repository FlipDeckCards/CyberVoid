// A tiny static server for trying Feral 3.0 locally: node tools-feral3/serve.js [port]   (serves the public/ folder; /__dev/ serves this tools folder; POST /__save?path= writes under public/feral3/)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'public'), port = +process.argv[2] || 5174;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__save?')) {
    const rel = decodeURIComponent(req.url.split('path=')[1] || ''), base = path.join(root, 'feral3'), target = path.join(base, rel);
    if (!target.startsWith(base) || rel.includes('..')) { res.statusCode = 403; return res.end(); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.concat(chunks)); res.end('saved ' + rel + ' ' + Buffer.concat(chunks).length); }); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const dev = p.startsWith('/__dev/'), f = dev ? path.join(__dirname, p.slice(7)) : path.join(root, p);
  if (!dev && !f.startsWith(root)) { res.statusCode = 403; return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end('not found'); } res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(d); });
}).listen(port, () => console.log('serving ' + root + ' on http://localhost:' + port));
