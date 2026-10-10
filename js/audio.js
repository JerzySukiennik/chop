// Chop audio: sliced CC0 cutting one-shots plus a synthesized board knock.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.last = {};
  }

  async init() {
    if (this.ctx) return this.ctx.resume();
    this.ctx = new AudioContext();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(comp).connect(this.ctx.destination);
    const manifest = await fetch('sounds/manifest.json').then(r => r.json());
    await Promise.all(Object.entries(manifest).map(async ([kind, files]) => {
      this.buffers[kind] = (await Promise.all(files.map(async f => {
        try {
          const data = await fetch(`sounds/${f}`).then(r => r.arrayBuffer());
          return await this.ctx.decodeAudioData(data);
        } catch { return null; }
      }))).filter(Boolean);
    }));
  }

  cut(kind, strength) {
    const list = this.buffers[kind];
    if (!this.ctx || !list || !list.length) return this.knock(strength);
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last[kind]) i = (i + 1) % list.length;
    this.last[kind] = i;
    const src = this.ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain();
    g.gain.value = 0.45 + 0.55 * Math.min(1, strength);
    src.connect(g).connect(this.out);
    src.start();
  }

  knock(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = 0.15 + 0.6 * Math.min(1, strength);
    const len = Math.floor(this.ctx.sampleRate * 0.06);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 300;
    bp.Q.value = 1.4;
    const ng = this.ctx.createGain();
    ng.gain.value = v * 0.8;
    noise.connect(bp).connect(ng).connect(this.out);
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(v * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(og).connect(this.out);
    noise.start(t);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}
