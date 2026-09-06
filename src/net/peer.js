import { Emitter } from '../core/emitter.js';
import { decode, encode } from './protocol.js';

export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * One WebRTC connection to one other peer, with two data channels:
 *
 *   - `state`   unreliable / unordered — snapshots and inputs. A stale packet
 *               is worthless, so never wait for a retransmit.
 *   - `events`  reliable / ordered — joins, chat, scores, anything one-shot.
 *
 * The peer with the lexicographically smaller id is the "polite" initiator;
 * that gives both sides the same answer without extra negotiation.
 */
export class Peer extends Emitter {
  constructor({ id, localId, name = 'player', signal, iceServers = DEFAULT_ICE_SERVERS }) {
    super();
    this.id = id;
    this.localId = localId;
    this.name = name;
    this.initiator = localId < id;
    this._signal = signal;
    this.connected = false;
    this.rtt = 0;

    this.pc = new RTCPeerConnection({ iceServers });
    this.state = null;
    this.events = null;
    this._pendingCandidates = [];

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this._signal(this.id, { candidate: e.candidate });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'closed' || s === 'disconnected') {
        if (this.connected) {
          this.connected = false;
          this.emit('disconnect');
        }
      }
    };
    this.pc.ondatachannel = (e) => this._attach(e.channel);

    if (this.initiator) {
      this._attach(this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
      this._attach(this.pc.createDataChannel('events', { ordered: true }));
      this._negotiate();
    }
  }

  async _negotiate() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this._signal(this.id, { sdp: this.pc.localDescription });
  }

  _attach(channel) {
    channel.binaryType = 'arraybuffer';
    if (channel.label === 'state') this.state = channel;
    else this.events = channel;

    channel.onopen = () => {
      if (this.state?.readyState === 'open' && this.events?.readyState === 'open' && !this.connected) {
        this.connected = true;
        this.emit('connect');
      }
    };
    channel.onclose = () => {
      if (this.connected) {
        this.connected = false;
        this.emit('disconnect');
      }
    };
    channel.onmessage = (e) => {
      const msg = decode(e.data);
      if (msg) this.emit('message', msg, channel.label);
    };
  }

  /** Handle an SDP or ICE payload relayed by the signaling server. */
  async accept(data) {
    if (data.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      for (const c of this._pendingCandidates.splice(0)) {
        await this.pc.addIceCandidate(c).catch(() => {});
      }
      if (data.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this._signal(this.id, { sdp: this.pc.localDescription });
      }
    } else if (data.candidate) {
      const candidate = new RTCIceCandidate(data.candidate);
      // Candidates can arrive before the offer/answer; buffer until we can use them.
      if (!this.pc.remoteDescription) this._pendingCandidates.push(candidate);
      else await this.pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  /** @param {'state'|'events'} channel */
  send(msg, channel = 'state') {
    const ch = channel === 'events' ? this.events : this.state;
    if (ch?.readyState !== 'open') return false;
    try {
      ch.send(encode(msg));
      return true;
    } catch {
      return false;
    }
  }

  close() {
    try {
      this.state?.close();
      this.events?.close();
      this.pc.close();
    } catch {
      /* already torn down */
    }
  }
}
