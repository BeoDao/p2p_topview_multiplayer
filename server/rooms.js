/**
 * In-memory room registry for the signaling server.
 *
 * The server never sees game traffic: it only introduces peers to each other
 * and keeps track of who the current host (authoritative simulator) is.
 */
export class RoomRegistry {
  constructor() {
    /** @type {Map<string, Map<string, object>>} roomId -> (peerId -> peer) */
    this.rooms = new Map();
    /** @type {Map<string, string>} roomId -> hostId */
    this.hosts = new Map();
  }

  join(roomId, peer) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    room.set(peer.id, peer);
    if (!this.hosts.has(roomId)) this.hosts.set(roomId, peer.id);
    return { peers: [...room.values()].filter((p) => p.id !== peer.id), hostId: this.hosts.get(roomId) };
  }

  leave(roomId, peerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.delete(peerId);

    if (room.size === 0) {
      this.rooms.delete(roomId);
      this.hosts.delete(roomId);
      return { empty: true, hostId: null, hostChanged: false };
    }

    let hostChanged = false;
    if (this.hosts.get(roomId) === peerId) {
      // Oldest remaining peer is promoted; peers are inserted in join order.
      const next = room.keys().next().value;
      this.hosts.set(roomId, next);
      hostChanged = true;
    }
    return { empty: false, hostId: this.hosts.get(roomId), hostChanged };
  }

  get(roomId, peerId) {
    return this.rooms.get(roomId)?.get(peerId) ?? null;
  }

  peers(roomId) {
    return [...(this.rooms.get(roomId)?.values() ?? [])];
  }

  stats() {
    return [...this.rooms.entries()].map(([id, room]) => ({
      room: id,
      peers: room.size,
      host: this.hosts.get(id),
    }));
  }
}
