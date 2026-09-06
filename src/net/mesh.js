import { Emitter } from '../core/emitter.js';
import { SignalingClient, defaultSignalingUrl } from './signaling-client.js';
import { DEFAULT_ICE_SERVERS, Peer } from './peer.js';

/**
 * A full mesh of `Peer` connections plus host tracking.
 *
 * Every peer connects to every other peer, so host migration is instant: when
 * the host leaves, the server promotes the next peer and everyone already has
 * a live channel to it.
 *
 * Emits: ready, peer, peer-close, message(msg, fromId, channel),
 *        host(hostId, wasHost), close.
 */
export class Mesh extends Emitter {
  constructor({ room = 'lobby', name = 'player', url = defaultSignalingUrl(), iceServers = DEFAULT_ICE_SERVERS } = {}) {
    super();
    this.room = room;
    this.name = name;
    this.iceServers = iceServers;
    this.id = null;
    this.hostId = null;
    /** @type {Map<string, Peer>} */
    this.peers = new Map();

    this.signaling = new SignalingClient(url);
    this._wire();
  }

  get isHost() {
    return this.id !== null && this.id === this.hostId;
  }

  connect() {
    this.signaling.connect(this.room, this.name);
  }

  _wire() {
    const s = this.signaling;

    s.on('joined', (msg) => {
      this.id = msg.id;
      this._setHost(msg.hostId);
      for (const p of msg.peers) this._createPeer(p.id, p.name);
      this.emit('ready', { id: this.id, hostId: this.hostId });
    });

    s.on('peer-join', (msg) => this._createPeer(msg.id, msg.name));

    s.on('peer-leave', (msg) => {
      const peer = this.peers.get(msg.id);
      if (!peer) return;
      peer.close();
      this.peers.delete(msg.id);
      this.emit('peer-close', msg.id);
    });

    s.on('host', (msg) => this._setHost(msg.hostId));

    s.on('signal', (msg) => {
      let peer = this.peers.get(msg.from);
      if (!peer) peer = this._createPeer(msg.from, 'player');
      peer.accept(msg.data).catch((err) => console.error('[mesh] signal failed', err));
    });

    s.on('close', () => this.emit('close'));
  }

  _setHost(hostId) {
    if (this.hostId === hostId) return;
    const wasHost = this.isHost;
    this.hostId = hostId;
    this.emit('host', hostId, wasHost);
  }

  _createPeer(id, name) {
    if (this.peers.has(id) || id === this.id) return this.peers.get(id);
    const peer = new Peer({
      id,
      localId: this.id,
      name,
      iceServers: this.iceServers,
      signal: (to, data) => this.signaling.signal(to, data),
    });
    peer.on('connect', () => this.emit('peer', peer));
    peer.on('disconnect', () => this.emit('peer-close', id));
    peer.on('message', (msg, channel) => this.emit('message', msg, id, channel));
    this.peers.set(id, peer);
    return peer;
  }

  /** Send to one peer. */
  sendTo(id, msg, channel = 'state') {
    return this.peers.get(id)?.send(msg, channel) ?? false;
  }

  /** Send to the current host (no-op when we are the host). */
  sendToHost(msg, channel = 'state') {
    if (this.isHost || !this.hostId) return false;
    return this.sendTo(this.hostId, msg, channel);
  }

  /** Send to every connected peer. */
  broadcast(msg, channel = 'state') {
    let sent = 0;
    for (const peer of this.peers.values()) {
      if (peer.send(msg, channel)) sent += 1;
    }
    return sent;
  }

  close() {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.signaling.close();
  }
}
