import { Emitter } from './core/emitter.js';
import { GameLoop } from './core/loop.js';
import { InputSampler } from './core/input.js';
import { makeRandom } from './core/math.js';
import { Mesh } from './net/mesh.js';
import { MSG, event as evt, hello, input as inputMsg, snapshot as snapMsg } from './net/protocol.js';
import { TileMap, World } from './game/world.js';
import { SnapshotBuffer } from './game/interpolation.js';
import { Predictor } from './game/prediction.js';
import { Renderer } from './render/renderer.js';

/**
 * @typedef {object} GameModule A game plugged into the framework.
 * @property {number} [tickRate]            simulation Hz (default 30)
 * @property {() => TileMap} createMap      host-side map construction
 * @property {(ctx, info) => object} createPlayer  build a player entity
 * @property {(entity, cmd, dt, ctx) => void} applyInput  DETERMINISTIC movement;
 *   this runs on the host and is replayed by the owner during prediction, so it
 *   must depend only on its arguments and the map.
 * @property {(ctx, dt, tick) => void} [step]  host-only authoritative logic
 * @property {(ctx, entity) => void} [onPlayerLeave]
 * @property {(entity) => object} [serialize]  snapshot projection of an entity
 * @property {(renderer, ctx) => void} draw    per-frame drawing
 * @property {(ctx) => string[]} [hud]         HUD lines
 */

const DEFAULTS = {
  tickRate: 30,
  snapshotRate: 20,
  interpolationDelay: 100,
  room: 'lobby',
  name: 'player',
  zoom: 1,
};

/**
 * Host-authoritative peer-to-peer runtime for top-view games.
 *
 * One peer in the room is the host: it owns the world, consumes everyone's
 * inputs and broadcasts snapshots. Clients predict their own player locally and
 * interpolate everyone else. If the host leaves, the signaling server promotes
 * another peer and the new host adopts the last snapshot it received.
 *
 * Emits: start, host, peer, peer-close, event(name, data), chat, error.
 */
export class TopViewGame extends Emitter {
  /**
   * @param {GameModule} game
   * @param {{canvas: HTMLCanvasElement} & Partial<typeof DEFAULTS>} options
   */
  constructor(game, options) {
    super();
    if (!options?.canvas) throw new Error('TopViewGame requires a canvas');
    if (typeof game?.applyInput !== 'function') throw new Error('game.applyInput is required');
    if (typeof game?.createPlayer !== 'function') throw new Error('game.createPlayer is required');

    this.game = game;
    this.options = { ...DEFAULTS, ...options };
    this.seed = this.options.seed ?? (Math.random() * 2 ** 31) | 0;

    this.renderer = new Renderer(options.canvas, { zoom: this.options.zoom, theme: options.theme });
    this.input = new InputSampler(options.canvas, { bindings: options.bindings });
    this.mesh = new Mesh({
      room: this.options.room,
      name: this.options.name,
      url: this.options.signalingUrl,
      iceServers: this.options.iceServers,
    });

    this.world = null;              // authoritative on the host, predicted-local on clients
    this.state = {};                // free-form bag owned by the game module
    this.random = makeRandom(this.seed);
    this.localEntityId = null;
    this.players = new Map();       // peerId -> { name }

    this.buffer = new SnapshotBuffer({
      delay: this.options.interpolationDelay,
      interpolate: game.interpolate ?? ['x', 'y'],
      angles: game.interpolateAngles ?? ['angle'],
    });
    this.predictor = new Predictor();

    this._inbox = new Map();        // host: peerId -> latest pending input
    this._acks = new Map();         // host: peerId -> last consumed seq
    this._snapshotAccumulator = 0;
    this._renderEntities = [];
    this._started = false;

    const tickRate = game.tickRate ?? this.options.tickRate;
    this.loop = new GameLoop({
      tickRate,
      onTick: (dt, tick) => this._tick(dt, tick),
      onRender: (alpha, dt) => this._render(alpha, dt),
    });

    this._wireMesh();
  }

  get isHost() {
    return this.mesh.isHost;
  }

  get localId() {
    return this.mesh.id;
  }

  /** The entity this client controls (predicted locally), or null. */
  get localPlayer() {
    return this.localEntityId ? this.world?.get(this.localEntityId) ?? null : null;
  }

  /** Context object handed to every game-module hook. */
  get ctx() {
    return {
      world: this.world,
      map: this.world?.map ?? null,
      state: this.state,
      random: this.random,
      isHost: this.isHost,
      localId: this.localId,
      localEntityId: this.localEntityId,
      players: this.players,
      entities: this._renderEntities,
      camera: this.renderer.camera,
      tick: this.loop.tick,
      emit: (name, data) => this._emitGameEvent(name, data),
    };
  }

  connect() {
    this.mesh.connect();
    return this;
  }

  stop() {
    this.loop.stop();
    this.mesh.close();
    this.input.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- networking

  _wireMesh() {
    this.mesh.on('ready', () => {
      if (this.isHost) this._becomeHost(null);
      this._start();
    });

    this.mesh.on('host', (hostId, wasHost) => {
      this.emit('host', hostId, this.isHost);
      if (this.isHost && !wasHost) this._becomeHost(this.buffer.latest);
    });

    this.mesh.on('peer', (peer) => {
      this.emit('peer', peer);
      if (this.isHost) this._sendWorldTo(peer.id);
      else if (peer.id === this.mesh.hostId) this._sayHello(peer.id);
    });

    this.mesh.on('peer-close', (id) => {
      this.players.delete(id);
      if (this.isHost && this.world) {
        const entity = this.world.playerOf(id);
        if (entity) {
          this.game.onPlayerLeave?.(this.ctx, entity);
          this.world.remove(entity.id);
        }
        this._inbox.delete(id);
        this._acks.delete(id);
        this.mesh.broadcast(evt('players', this._roster()), 'events');
      }
      this.emit('peer-close', id);
    });

    this.mesh.on('message', (msg, from) => this._onMessage(msg, from));
  }

  _sayHello(hostId) {
    this.mesh.sendTo(hostId, hello(this.options.name), 'events');
  }

  _onMessage(msg, from) {
    switch (msg.t) {
      case MSG.HELLO:
        if (!this.isHost) return;
        this._spawnPlayer(from, msg.name);
        this._sendWorldTo(from);
        break;

      case MSG.INPUT:
        if (!this.isHost) return;
        // Keep only the newest command: an older one that arrives late is
        // already superseded, and queueing them would add input lag.
        {
          const current = this._inbox.get(from);
          if (!current || msg.cmd.seq > current.seq) this._inbox.set(from, msg.cmd);
        }
        break;

      case MSG.SNAPSHOT:
        if (this.isHost) return;
        this._onSnapshot(msg);
        break;

      case MSG.EVENT:
        if (msg.name === 'sync') this._onSync(msg.data);
        else if (msg.name === 'players') this._onRoster(msg.data);
        else this.emit('event', msg.name, msg.data, from);
        break;

      case MSG.CHAT:
        this.emit('chat', msg.text, from);
        break;

      default:
        break;
    }
  }

  /** Host: full world description for a peer that just connected. */
  _sendWorldTo(peerId) {
    if (!this.world) return;
    this.mesh.sendTo(
      peerId,
      evt('sync', {
        seed: this.seed,
        map: this.world.map.toJSON(),
        state: this.game.serializeState?.(this.ctx) ?? null,
        players: this._roster(),
      }),
      'events',
    );
  }

  /** Everyone: names of the peers currently in the room, as the host sees them. */
  _onRoster(list) {
    this.players.clear();
    for (const p of list) this.players.set(p.id, { name: p.name });
  }

  _roster() {
    return [...this.players.entries()].map(([id, p]) => ({ id, name: p.name }));
  }

  /** Client: adopt the host's map and shared state. */
  _onSync(data) {
    this.seed = data.seed;
    this.random = makeRandom(this.seed);
    const map = TileMap.fromJSON(data.map);
    if (this.world) this.world.map = map;
    else this.world = new World(map);
    this.renderer.camera.bounds = { width: map.pixelWidth, height: map.pixelHeight };
    for (const p of data.players ?? []) this.players.set(p.id, { name: p.name });
    if (data.state) this.game.applyState?.(this.ctx, data.state);
    this._start();
  }

  _onSnapshot(msg) {
    this.buffer.push(msg);
    if (msg.extra) this.game.applyState?.(this.ctx, msg.extra);

    const mine = msg.ents.find((e) => e.owner === this.localId);
    if (!mine) return;

    if (!this.localEntityId) {
      // First authoritative sight of our player: adopt it as the prediction base.
      this.localEntityId = mine.id;
      this.world?.add({ ...mine });
      this.renderer.camera.follow(mine, true);
      return;
    }
    this.predictor.reconcile(
      this.world.get(this.localEntityId),
      mine,
      msg.acks?.[this.localId] ?? 0,
      (entity, cmd, dt) => this.game.applyInput(entity, cmd, dt, this.ctx),
    );
  }

  _emitGameEvent(name, data) {
    this.emit('event', name, data, this.localId);
    if (this.isHost) this.mesh.broadcast(evt(name, data), 'events');
  }

  /** Broadcast a chat line to the room. */
  chat(text) {
    this.mesh.broadcast({ t: MSG.CHAT, text }, 'events');
    this.emit('chat', text, this.localId);
  }

  // ------------------------------------------------------------------ lifecycle

  /** Build (or adopt) the authoritative world. */
  _becomeHost(lastSnapshot) {
    if (!this.world) {
      const map = this.game.createMap ? this.game.createMap(this.random) : TileMap.generate({ seed: this.seed });
      this.world = new World(map);
      this.renderer.camera.bounds = { width: map.pixelWidth, height: map.pixelHeight };
      this.game.createState?.(this.ctx);
    }

    if (lastSnapshot) {
      // Host migration: rebuild the world from the last state we saw so the
      // game continues instead of resetting.
      this.world.entities.clear();
      for (const e of lastSnapshot.ents) this.world.add({ ...e });
      this.buffer.clear();
    }

    this.predictor.reset();
    this.players.set(this.localId, { name: this.options.name });
    if (!this.world.playerOf(this.localId)) this._spawnPlayer(this.localId, this.options.name);
    else this.localEntityId = this.world.playerOf(this.localId).id;

    for (const [id, peer] of this.mesh.peers) {
      if (peer.connected) this._sendWorldTo(id);
    }
  }

  _spawnPlayer(ownerId, name) {
    if (!this.isHost || !this.world) return null;
    const existing = this.world.playerOf(ownerId);
    if (existing) return existing;
    const entity = this.world.add(
      this.game.createPlayer(this.ctx, { owner: ownerId, name: name ?? 'player', id: this.world.nextId('p') }),
    );
    entity.owner = ownerId;
    entity.name = name ?? 'player';
    if (ownerId === this.localId) this.localEntityId = entity.id;
    this.players.set(ownerId, { name: entity.name });
    this.mesh.broadcast(evt('players', this._roster()), 'events');
    this.emit('player-join', entity);
    return entity;
  }

  _start() {
    if (this._started || !this.world) return;
    this._started = true;
    this.loop.start();
    this.emit('start', this.ctx);
  }

  // ----------------------------------------------------------------- simulation

  _tick(dt, tick) {
    if (!this.world) return;
    const local = this.localPlayer;
    const origin = local ?? { x: this.renderer.camera.x, y: this.renderer.camera.y };
    const cmd = this.input.sample(this.renderer.camera, origin);

    if (this.isHost) {
      if (local) this.game.applyInput(local, cmd, dt, this.ctx);
      this._acks.set(this.localId, cmd.seq);

      for (const [peerId, pending] of this._inbox) {
        const entity = this.world.playerOf(peerId);
        if (!entity) continue;
        this.game.applyInput(entity, pending, dt, this.ctx);
        this._acks.set(peerId, pending.seq);
      }
      this._inbox.clear();

      this.game.step?.(this.ctx, dt, tick);
      this._maybeBroadcastSnapshot(dt, tick);
    } else if (local) {
      // Predict locally, then hand the same command to the host.
      this.game.applyInput(local, cmd, dt, this.ctx);
      this.predictor.record(cmd, dt);
      this.mesh.sendToHost(inputMsg(cmd, tick));
    }
  }

  _maybeBroadcastSnapshot(dt, tick) {
    this._snapshotAccumulator += dt;
    const interval = 1 / (this.options.snapshotRate ?? this.loop.tickRate);
    if (this._snapshotAccumulator < interval) return;
    this._snapshotAccumulator = 0;

    const serialize = this.game.serialize ?? ((e) => e);
    const ents = this.world.all().map((e) => ({ ...serialize(e), id: e.id, type: e.type, owner: e.owner }));
    this.mesh.broadcast(
      snapMsg(tick, ents, Object.fromEntries(this._acks), this.game.serializeState?.(this.ctx) ?? null),
    );
  }

  // ------------------------------------------------------------------ rendering

  _render(alpha, frameDt) {
    if (!this.world) return;
    const local = this.localPlayer;

    this._renderEntities = this.isHost
      ? this.world.all()
      : [...(local ? [local] : []), ...this.buffer.sample(local ? [local.id] : [])];

    if (local) this.renderer.camera.follow(local);

    this.renderer.beginFrame();
    this.renderer.drawMap(this.world.map);
    this.game.draw(this.renderer, { ...this.ctx, alpha, frameDt });
    this.renderer.endFrame();

    const hud = this.game.hud?.(this.ctx) ?? [];
    this.renderer.drawHud([
      `${this.isHost ? 'HOST' : 'CLIENT'}  room:${this.options.room}  peers:${this.mesh.peers.size}`,
      ...hud,
    ]);
  }
}

export { TileMap, World, TILE } from './game/world.js';
export { Mesh } from './net/mesh.js';
export { Renderer } from './render/renderer.js';
export { Camera } from './render/camera.js';
export { makeRandom, clamp, lerp, normalize, limit } from './core/math.js';
