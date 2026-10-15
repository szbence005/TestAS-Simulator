// Egyszerű statikus szerver helyi teszteléshez: npm start  →  http://localhost:8080
// Windows/macOS/Linux alatt is működik. Ha a port foglalt, automatikusan a következőt próbálja.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};
const startPort = Number(process.env.PORT) || 8080;

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = resolve(root, '.' + urlPath);
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('.git')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

function listen(port, tries = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries < 20) {
      console.log(`A(z) ${port}-es port foglalt, próbálom: ${port + 1}`);
      listen(port + 1, tries + 1);
    } else throw err;
  });
  server.listen(port, () => console.log(`http://localhost:${port}`));
}
listen(startPort);
