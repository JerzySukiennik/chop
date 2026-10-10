// Chop relay: serves the game, bridges the iPhone (TCP, newline JSON, Bonjour _chop._tcp) to browsers (WebSocket).
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const HTTP_PORT = Number(process.argv[2] || 8790);
const PHONE_PORT = HTTP_PORT + 1;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file.includes('node_modules') || file.includes(`${path.sep}ios${path.sep}`)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const browsers = new Set();
const phones = new Set();

function toBrowsers(line) { for (const b of browsers) if (b.readyState === 1) b.send(line); }
function status() { toBrowsers(JSON.stringify({ t: 'phones', n: phones.size })); }

wss.on('connection', ws => {
  browsers.add(ws);
  ws.send(JSON.stringify({ t: 'phones', n: phones.size }));
  ws.on('message', data => { const line = data.toString() + '\n'; for (const p of phones) p.write(line); });
  ws.on('close', () => browsers.delete(ws));
});

const phoneServer = net.createServer(sock => {
  sock.setNoDelay(true);
  phones.add(sock);
  console.log('phone connected', sock.remoteAddress);
  status();
  let buf = '';
  sock.on('data', chunk => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line) toBrowsers(line);
    }
  });
  const drop = () => { if (phones.delete(sock)) { console.log('phone disconnected'); status(); } };
  sock.on('close', drop);
  sock.on('error', drop);
});

server.listen(HTTP_PORT, () => console.log(`game  http://localhost:${HTTP_PORT}`));
phoneServer.listen(PHONE_PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
  console.log(`phone tcp :${PHONE_PORT}  (${ips.join(', ')})`);
  const dns = spawn('dns-sd', ['-R', 'Chop', '_chop._tcp', 'local', String(PHONE_PORT)], { stdio: 'ignore' });
  const stop = () => { dns.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});
