// Serveur du mode en ligne : fichiers statiques + relais de salons à deux
// joueurs (hôte / invité) en Server-Sent Events. Aucune règle de jeu ici :
// les messages sont opaques, chaque client rejoue la partie chez lui
// (lockstep, voir src/online.js). Zéro dépendance : http/fs natifs.
//
// API :
//   POST /api/rooms                    { seed, map, hostSide } → { code }
//   POST /api/rooms/<code>/join        → { seed, map, side } (côté invité)
//   POST /api/rooms/<code>/msg         { role, msg } → relaie msg à l'autre rôle
//   GET  /api/rooms/<code>/events?role=host|guest → flux SSE (Last-Event-ID rejoué)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ROOM_TTL = 24 * 60 * 60 * 1000; // salon balayé au-delà de 24 h
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I/L/O/0/1 ambigus

export function createRelay() {
  const rooms = new Map(); // code → salon

  const sweep = () => {
    const now = Date.now();
    for (const [code, room] of rooms) if (now - room.createdAt > ROOM_TTL) rooms.delete(code);
  };

  const newCode = () => {
    let code;
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0],
      ).join('');
    } while (rooms.has(code));
    return code;
  };

  function create({ seed, map = null, hostSide = 'allies' }) {
    sweep();
    if (!Number.isInteger(seed)) throw new Error('seed manquante');
    const code = newCode();
    rooms.set(code, {
      seed,
      map,
      hostSide,
      createdAt: Date.now(),
      joined: false,
      // par rôle : messages numérotés (rejouables via Last-Event-ID) + flux ouvert
      outbox: { host: [], guest: [] },
      streams: { host: null, guest: null },
    });
    return { code };
  }

  function room(code) {
    const r = rooms.get(code);
    if (!r) throw new Error('salon introuvable');
    return r;
  }

  // Empile un message pour `role` et le pousse sur son flux s'il est connecté.
  function push(r, role, msg) {
    const entry = { id: r.outbox[role].length + 1, msg };
    r.outbox[role].push(entry);
    r.streams[role]?.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry.msg)}\n\n`);
  }

  function join(code) {
    const r = room(code);
    if (r.joined) throw new Error('salon complet');
    r.joined = true;
    push(r, 'host', { t: 'joined' });
    return { seed: r.seed, map: r.map, side: r.hostSide === 'allies' ? 'axis' : 'allies' };
  }

  function relay(code, role, msg) {
    push(room(code), role === 'host' ? 'guest' : 'host', msg);
  }

  // Branche un flux SSE : rejoue l'outbox au-delà de lastId puis pousse en direct.
  function subscribe(code, role, lastId, res) {
    const r = room(code);
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': connecté\n\n'); // commentaire SSE : envoie les en-têtes tout de suite
    for (const e of r.outbox[role])
      if (e.id > lastId) res.write(`id: ${e.id}\ndata: ${JSON.stringify(e.msg)}\n\n`);
    r.streams[role] = res;
    res.on('close', () => {
      if (r.streams[role] === res) r.streams[role] = null;
    });
  }

  return { create, join, relay, subscribe };
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });

async function serveStatic(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(ROOT, path === '/' || path === '\\' ? 'index.html' : path);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('introuvable');
  }
}

export function createApp(relay = createRelay()) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/api\/rooms(?:\/([A-Z0-9]+))?(?:\/(join|msg|events))?$/);
    if (!m) return serveStatic(req, res);

    const json = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    const [, code, action] = m;
    try {
      if (req.method === 'POST' && !code) return json(200, relay.create(await readBody(req)));
      if (req.method === 'POST' && action === 'join') return json(200, relay.join(code));
      if (req.method === 'POST' && action === 'msg') {
        const { role, msg } = await readBody(req);
        relay.relay(code, role, msg);
        return json(200, { ok: true });
      }
      if (req.method === 'GET' && action === 'events') {
        const lastId = Number(req.headers['last-event-id'] ?? 0);
        return relay.subscribe(code, url.searchParams.get('role'), lastId, res);
      }
      json(404, { error: 'route inconnue' });
    } catch (err) {
      json(err.message === 'salon introuvable' ? 404 : 409, { error: err.message });
    }
  });
}

// Lancé directement (npm run online) : sert le jeu et le relais sur PORT (3000).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Ordre de Bataille en ligne : http://localhost:${port}`);
  });
}
