// Lokale beheerserver: toont de site en laat beheer.html scores opslaan en publiceren.
// Start met: node server.mjs   (of dubbelklik "Beheer starten.cmd")
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data', 'scores.json');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const git = (...args) => new Promise((resolve) => {
  execFile('git', args, { cwd: ROOT }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }));
});

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function publish(message) {
  const log = [];
  for (const args of [['add', 'data/scores.json'], ['commit', '-m', message]]) {
    const r = await git(...args);
    log.push(`$ git ${args.join(' ')}\n${r.out}`);
    if (!r.ok && !/nothing to commit/.test(r.out)) return { ok: false, log: log.join('\n\n') };
  }
  const r = await git('push');
  log.push(`$ git push\n${r.out}`);
  return { ok: r.ok, log: log.join('\n\n') };
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/save') {
      const data = await readBody(req);
      if (!Array.isArray(data.players) || !Array.isArray(data.days)) return send(res, 400, { ok: false, error: 'Ongeldige data' });
      await writeFile(DATA, JSON.stringify(data, null, 2) + '\n', 'utf8');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const { message } = await readBody(req);
      return send(res, 200, await publish(message || 'Scores bijgewerkt'));
    }
    if (req.method !== 'GET') return send(res, 405, { ok: false });

    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { ok: false });
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); res.end('Niet gevonden'); return; }
    send(res, 500, { ok: false, error: String(e.message ?? e) });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`MapTap beheer draait op http://localhost:${PORT}/beheer.html  (Ctrl+C om te stoppen)`);
});
