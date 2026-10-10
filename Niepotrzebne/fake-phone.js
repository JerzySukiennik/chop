const net = require('net');
const sock = net.connect(8791, '127.0.0.1');
let haptics = 0, hmax = 0;
let buf = '';
sock.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const m = JSON.parse(l); if (m.t === 'h') { haptics++; hmax = Math.max(hmax, m.i); } } });
const send = o => sock.write(JSON.stringify(o) + '\n');
const pose = (x, y, z) => send({ t: 'p', s: 2, m: [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, x, y, z, 1] });
let t = 0;
const T0 = 1.0, chops = 8, period = 0.7;
sock.on('connect', () => {
  const iv = setInterval(() => {
    t += 1 / 60;
    if (t < T0) pose(0, 0.75, 0);
    else if (t < T0 + 0.05) { pose(0, 0.75, 0); send({ t: 'cal' }); }
    else {
      const k = Math.floor((t - T0 - 0.3) / period);
      const ph = ((t - T0 - 0.3) % period) / period;
      if (k >= chops) { clearInterval(iv); setTimeout(() => { console.log(JSON.stringify({ haptics, hmax })); sock.end(); process.exit(0); }, 300); return; }
      const x = -0.07 + Math.max(0, k) * 0.018;
      const y = 0.75 + 0.07 * (0.5 + 0.5 * Math.cos(ph * Math.PI * 2)) - 0.012;
      pose(x, y, -0.06);
    }
  }, 1000 / 60);
});
