'use strict';
class Net {
  constructor() {
    this.handlers = {};
    this.ws = null;
    this.connected = false;
    this.queue = [];
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}`);
    this.ws.onopen = () => { this.connected = true; this.emit('open'); for (const m of this.queue) this.ws.send(m); this.queue = []; };
    this.ws.onclose = () => { this.connected = false; this.emit('close'); setTimeout(() => this.connect(), 2000); };
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      this.emit(m.t, m);
    };
  }
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  emit(type, m) { for (const fn of this.handlers[type] || []) fn(m); }
  send(obj) {
    const s = JSON.stringify(obj);
    if (this.connected && this.ws.readyState === 1) this.ws.send(s);
    else if (obj.t === 'create' || obj.t === 'join') this.queue.push(s);
  }
}
