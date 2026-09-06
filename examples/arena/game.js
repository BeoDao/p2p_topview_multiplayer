import { TileMap, makeRandom } from '../../src/framework.js';

const PLAYER_SPEED = 190;   // px/s
const PLAYER_RADIUS = 12;
const BULLET_SPEED = 520;
const BULLET_RADIUS = 3;
const BULLET_LIFE = 1.4;    // seconds
const FIRE_COOLDOWN = 0.22;
const BULLET_DAMAGE = 18;
const RESPAWN_TIME = 2.5;
const MAX_HP = 100;

const COLORS = ['#4ea1ff', '#ff6b6b', '#ffd166', '#59d98a', '#c792ea', '#f78c6c'];
const colorFor = (id) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

/**
 * "Arena" — a deathmatch example showing the full framework contract:
 * deterministic movement (predicted on the owner, authoritative on the host),
 * host-only combat, shared scoreboard state, and custom drawing.
 */
const arena = {
  tickRate: 30,

  createMap: () => TileMap.generate({ width: 48, height: 34, tileSize: 32, seed: 20260906, density: 0.14 }),

  createState(ctx) {
    ctx.state.scores = {};
    ctx.state.spawnRandom = makeRandom(4242);
  },

  // Shared, non-entity state replicated to clients with every snapshot.
  serializeState: (ctx) => ({ scores: ctx.state.scores ?? {} }),
  applyState(ctx, data) {
    ctx.state.scores = data.scores ?? {};
  },

  createPlayer(ctx, { id, owner, name }) {
    const random = ctx.state.spawnRandom ?? Math.random;
    const spot = ctx.world.randomSpawn(random, PLAYER_RADIUS);
    ctx.state.scores[owner] = ctx.state.scores[owner] ?? 0;
    return {
      id,
      type: 'player',
      owner,
      name,
      x: spot.x,
      y: spot.y,
      angle: 0,
      r: PLAYER_RADIUS,
      hp: MAX_HP,
      dead: false,
      respawnIn: 0,
      cooldown: 0,
      fire: false,
      color: colorFor(owner),
    };
  },

  /**
   * DETERMINISTIC: runs on the host and is replayed by the owning client during
   * reconciliation. It may only move the player and record intent — anything
   * that spawns entities or deals damage belongs in `step`.
   */
  applyInput(entity, cmd, dt, ctx) {
    entity.angle = cmd.aim;
    entity.fire = !!cmd.action;
    if (entity.dead) return;

    const speed = PLAYER_SPEED * (cmd.secondary ? 0.45 : 1);
    const moved = ctx.map.moveCircle(entity.x, entity.y, entity.r, cmd.mx * speed * dt, cmd.my * speed * dt);
    entity.x = moved.x;
    entity.y = moved.y;
  },

  /** HOST ONLY: weapons, damage, respawns, scoring. */
  step(ctx, dt) {
    const { world, map, state } = ctx;

    for (const p of world.all('player')) {
      p.cooldown = Math.max(0, p.cooldown - dt);

      if (p.dead) {
        p.respawnIn -= dt;
        if (p.respawnIn <= 0) {
          const spot = world.randomSpawn(state.spawnRandom, p.r);
          Object.assign(p, { x: spot.x, y: spot.y, hp: MAX_HP, dead: false, cooldown: 0 });
        }
        continue;
      }

      if (p.fire && p.cooldown === 0) {
        p.cooldown = FIRE_COOLDOWN;
        world.add({
          type: 'bullet',
          owner: p.owner,
          x: p.x + Math.cos(p.angle) * (p.r + 4),
          y: p.y + Math.sin(p.angle) * (p.r + 4),
          vx: Math.cos(p.angle) * BULLET_SPEED,
          vy: Math.sin(p.angle) * BULLET_SPEED,
          r: BULLET_RADIUS,
          life: BULLET_LIFE,
          color: p.color,
        });
      }
    }

    for (const b of world.all('bullet')) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.life <= 0 || map.solidAt(b.x, b.y)) {
        world.remove(b.id);
        continue;
      }
      for (const p of world.all('player')) {
        if (p.dead || p.owner === b.owner) continue;
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > (p.r + b.r) ** 2) continue;

        p.hp -= BULLET_DAMAGE;
        world.remove(b.id);
        if (p.hp <= 0) {
          p.dead = true;
          p.hp = 0;
          p.respawnIn = RESPAWN_TIME;
          state.scores[b.owner] = (state.scores[b.owner] ?? 0) + 1;
          ctx.emit('kill', { killer: b.owner, victim: p.owner });
        }
        break;
      }
    }
  },

  // Keep snapshots small: only what remote peers need to draw and predict.
  serialize: (e) =>
    e.type === 'bullet'
      ? { x: e.x, y: e.y, r: e.r, color: e.color }
      : {
          x: e.x, y: e.y, angle: e.angle, r: e.r, hp: e.hp,
          dead: e.dead, cooldown: e.cooldown, name: e.name, color: e.color,
        },

  draw(renderer, ctx) {
    for (const e of ctx.entities) {
      if (e.type === 'bullet') {
        renderer.drawCircle(e.x, e.y, e.r, e.color ?? '#fff');
        continue;
      }
      if (e.type !== 'player') continue;

      const isLocal = e.id === ctx.localEntityId;
      renderer.drawActor(e, {
        color: e.color ?? '#4ea1ff',
        radius: e.r,
        label: isLocal ? `${e.name} (you)` : e.name,
        alpha: e.dead ? 0.25 : 1,
      });
      if (!e.dead) renderer.drawBar(e, (e.hp ?? MAX_HP) / MAX_HP, { offsetY: -e.r - 12 });
    }
  },

  hud(ctx) {
    const me = ctx.world?.get(ctx.localEntityId);
    const board = Object.entries(ctx.state.scores ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, score]) => `${id === ctx.localId ? '>' : ' '} ${ctx.players.get(id)?.name ?? id}: ${score}`);
    return [
      me ? `hp ${Math.round(me.hp)}${me.dead ? `  respawning ${me.respawnIn.toFixed(1)}s` : ''}` : 'waiting for host…',
      'WASD move · mouse aim · click/space fire · shift walk',
      ...board,
    ];
  },
};

export default arena;
