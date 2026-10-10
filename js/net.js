// Chop net: WebSocket link to the local relay that talks to the iPhone knife.
export class Net {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.ws = null;
    this.lastHaptic = 0;
    this.connect();
  }

  connect() {
    const ws = new WebSocket(`ws://${location.host}`);
    this.ws = ws;
    ws.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      this.onMessage({ t: 'phones', n: 0 });
      setTimeout(() => this.connect(), 1000);
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  haptic(intensity, sharpness, force = false) {
    const now = performance.now();
    if (!force && now - this.lastHaptic < 18) return;
    this.lastHaptic = now;
    this.send({ t: 'h', i: +intensity.toFixed(2), s: +sharpness.toFixed(2) });
  }
}
