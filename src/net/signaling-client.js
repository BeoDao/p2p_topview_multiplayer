import { Emitter } from '../core/emitter.js';

/**
 * WebSocket client for the signaling server.
 *
 * Emits: welcome, joined, peer-join, peer-leave, host, signal, close, error.
 * Reconnects with backoff — losing signaling does not drop live data channels,
 * it only stops new peers from being introduced.
 */
export class SignalingClient extends Emitter {
  constructor(url = defaultSignalingUrl()) {
    super();
    this.url = url;
    this.ws = null;
    this.id = null;
    this.room = null;
    this.name = null;
    this._closedByUser = false;
    this._retry = 0;
  }

  connect(room, name) {
    this.room = room;
    this.name = name;
    this._closedByUser = false;
    this._open();
  }

  _open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this._retry = 0;
      this._send({ t: 'join', room: this.room, name: this.name });
    };

    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === 'welcome') this.id = msg.id;
      if (msg.t === 'joined') this.id = msg.id;
      this.emit(msg.t, msg);
    };

    ws.onerror = (err) => this.emit('error', err);

    ws.onclose = () => {
      this.emit('close');
      if (this._closedByUser) return;
      this._retry = Math.min(this._retry + 1, 6);
      setTimeout(() => this._open(), 250 * 2 ** this._retry);
    };
  }

  signal(to, data) {
    this._send({ t: 'signal', to, data });
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this._closedByUser = true;
    this.ws?.close();
  }
}

export function defaultSignalingUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}
