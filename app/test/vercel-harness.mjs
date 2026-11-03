// Dev tool: hosts the built Vercel function in a plain Node server so it can be smoke-tested without a Vercel account.
//   VERCEL=1 npm run app:vercel-build && DATABASE_URL=... VERCEL=1 node app/test/vercel-harness.mjs "$PWD/.vercel/output/functions/_render.func/app/dist/server/entry.mjs"
// Listens on 127.0.0.1:4331. Send "x-test-client: <ip>" to simulate different visitors.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const STATIC = join(process.cwd(), '.vercel/output/static');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.json': 'application/json' };
const mod = await import(process.argv[2]);
createServer(async (req, res) => {
  try {
    // Vercel serves files from .vercel/output/static before invoking the function ("handle": "filesystem").
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const file = join(STATIC, path);
    if (file.startsWith(STATIC) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      return res.end(readFileSync(file));
    }
    const url = `http://${req.headers.host}${req.url}`;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(url, { method: req.method, headers: { ...req.headers, 'x-real-ip': req.headers['x-test-client'] ?? '203.0.113.7', 'x-forwarded-for': (req.headers['x-test-client'] ?? '203.0.113.7') }, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
    const response = await mod.default.fetch(request);
    const headers = {};
    for (const [k, v] of response.headers) headers[k] = v;
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) headers['set-cookie'] = cookies;
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end('harness error'); }
}).listen(4331, '127.0.0.1', () => console.log('harness listening'));
