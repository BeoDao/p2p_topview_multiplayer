/**
 * Signaling + static file server.
 *
 * Responsibilities:
 *   - serve the framework, examples and static assets over HTTP
 *   - relay WebRTC offers/answers/ICE candidates between peers in a room
 *   - track room membership and elect a host
 *
 * Once the data channels are up, gameplay traffic goes peer-to-peer and this
 * process is idle.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { RoomRegistry } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Only these directories are reachable over HTTP.
const SERVE_DIRS = ['public', 'src', 'examples'];

function resolveRequestPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = clean === '/' ? '/index.html' : clean;
  const candidates = rel.startsWith('/src/') || rel.startsWith('/examples/')
    ? [path.join(ROOT, rel)]
    : [path.join(ROOT, 'public', rel)];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const allowed = SERVE_DIRS.some((dir) => resolved.startsWith(path.join(ROOT, dir) + path.sep));
    if (!allowed) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const index = path.join(resolved, 'index.html');
      if (fs.existsSync(index)) return index;
      continue;
    }
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

const registry = new RoomRegistry();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: registry.stats() }));
    return;
  }
  const file = resolveRequestPath(req.url ?? '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** @type {Map<string, import('ws').WebSocket>} peerId -> socket */
const sockets = new Map();

function broadcast(roomId, msg, exceptId) {
  for (const peer of registry.peers(roomId)) {
    if (peer.id === exceptId) continue;
    const ws = sockets.get(peer.id);
    if (ws) send(ws, msg);
  }
}

wss.on('connection', (ws) => {
  const id = randomUUID().slice(0, 8);
  let roomId = null;
  sockets.set(id, ws);
  send(ws, { t: 'welcome', id });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.t) {
      case 'join': {
        if (roomId) return;
        roomId = String(msg.room ?? 'lobby').slice(0, 64);
        const name = String(msg.name ?? 'player').slice(0, 32);
        const { peers, hostId } = registry.join(roomId, { id, name });
        send(ws, { t: 'joined', id, room: roomId, hostId, peers });
        broadcast(roomId, { t: 'peer-join', id, name }, id);
        break;
      }
      case 'signal': {
        // Relay SDP / ICE verbatim. Payloads are opaque to the server.
        if (!roomId || !msg.to) return;
        if (!registry.get(roomId, msg.to)) return;
        const target = sockets.get(msg.to);
        if (target) send(target, { t: 'signal', from: id, data: msg.data });
        break;
      }
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    sockets.delete(id);
    if (!roomId) return;
    const result = registry.leave(roomId, id);
    if (!result || result.empty) return;
    broadcast(roomId, { t: 'peer-leave', id });
    if (result.hostChanged) broadcast(roomId, { t: 'host', hostId: result.hostId });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`p2p-topview signaling + static server on http://${HOST}:${PORT}`);
});
