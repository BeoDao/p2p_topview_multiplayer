import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomRegistry } from '../server/rooms.js';
import { TileMap, World, TILE } from '../src/game/world.js';
import { SnapshotBuffer } from '../src/game/interpolation.js';
import { Predictor } from '../src/game/prediction.js';
import { makeRandom, lerpAngle, limit } from '../src/core/math.js';

test('room registry elects the first peer as host and promotes on leave', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', { id: 'a', name: 'a' });
  const second = rooms.join('r', { id: 'b', name: 'b' });

  assert.equal(second.hostId, 'a');
  assert.deepEqual(second.peers.map((p) => p.id), ['a']);

  const afterHostLeaves = rooms.leave('r', 'a');
  assert.equal(afterHostLeaves.hostId, 'b');
  assert.equal(afterHostLeaves.hostChanged, true);

  assert.equal(rooms.leave('r', 'b').empty, true);
  assert.deepEqual(rooms.stats(), []);
});

test('tilemap blocks circles and slides them along walls', () => {
  const map = new TileMap({ width: 4, height: 4, tileSize: 32 });
  map.set(2, 1, TILE.WALL);

  assert.equal(map.solidAt(2 * 32 + 5, 1 * 32 + 5), true);
  assert.equal(map.circleBlocked(2 * 32 - 4, 1 * 32 + 16, 12), true);

  // Moving diagonally into the wall keeps the free axis (slide, not stick).
  const moved = map.moveCircle(40, 48, 10, 30, 20);
  assert.equal(moved.hitX, true);
  assert.equal(moved.x, 40);
  assert.equal(moved.y, 68);
});

test('generated maps are seed-deterministic and enclosed', () => {
  const a = TileMap.generate({ width: 20, height: 16, seed: 7 });
  const b = TileMap.generate({ width: 20, height: 16, seed: 7 });
  const c = TileMap.generate({ width: 20, height: 16, seed: 8 });

  assert.deepEqual([...a.tiles], [...b.tiles]);
  assert.notDeepEqual([...a.tiles], [...c.tiles]);
  assert.equal(a.at(0, 0), TILE.WALL);
  assert.equal(a.at(19, 15), TILE.WALL);
});

test('world tracks owners and spawns on free ground', () => {
  const map = TileMap.generate({ width: 20, height: 16, seed: 3 });
  const world = new World(map);
  world.add({ type: 'player', owner: 'peer1', x: 10, y: 10 });
  const bullet = world.add({ type: 'bullet', x: 12, y: 10 });

  assert.equal(world.playerOf('peer1').type, 'player');
  assert.equal(world.playerOf('nobody'), null);
  assert.deepEqual(world.near(10, 10, 5, 'bullet'), [bullet]);

  const random = makeRandom(1);
  for (let i = 0; i < 50; i++) {
    const spot = world.randomSpawn(random, 12);
    assert.equal(map.circleBlocked(spot.x, spot.y, 12), false);
  }
});

test('snapshot buffer interpolates between straddling snapshots', () => {
  const buffer = new SnapshotBuffer({ delay: 100 });
  const now = performance.now();
  buffer.push({ tick: 1, ents: [{ id: 'p1', x: 0, y: 0, angle: 0 }] });
  buffer.snapshots[0].localTs = now - 200;
  buffer.push({ tick: 2, ents: [{ id: 'p1', x: 100, y: 50, angle: Math.PI / 2 }] });
  buffer.snapshots[1].localTs = now - 100;

  const [p] = buffer.sample();
  assert.ok(p.x > 0 && p.x <= 100, `expected interpolated x, got ${p.x}`);
  assert.equal(buffer.sample(['p1']).length, 0);

  // Out-of-order/duplicate snapshots are ignored.
  buffer.push({ tick: 2, ents: [] });
  assert.equal(buffer.snapshots.length, 2);
});

test('predictor drops acknowledged inputs and replays the rest', () => {
  const predictor = new Predictor();
  const move = (entity, cmd, dt) => {
    entity.x += cmd.mx * 100 * dt;
  };

  const entity = { x: 0 };
  for (let seq = 1; seq <= 3; seq++) {
    const cmd = { seq, mx: 1 };
    move(entity, cmd, 0.1);
    predictor.record(cmd, 0.1);
  }
  assert.equal(entity.x, 30);

  // Host has consumed input 1 and agrees with where that put us.
  predictor.reconcile(entity, { x: 10 }, 1, move);
  assert.equal(predictor.pending.length, 2);
  assert.equal(entity.x, 30);
  assert.equal(predictor.misprediction, false);

  // Host disagrees (a wall we did not simulate): we get corrected.
  predictor.reconcile(entity, { x: 0 }, 2, move);
  assert.equal(entity.x, 10);
  assert.equal(predictor.misprediction, true);
});

test('math helpers', () => {
  // Interpolating across the ±π seam takes the short way round, not the long one.
  const wrapped = lerpAngle(-Math.PI + 0.1, Math.PI - 0.1, 0.5);
  assert.ok(Math.abs(Math.abs(wrapped) - Math.PI) < 1e-9, `expected ±π, got ${wrapped}`);
  const v = limit(3, 4, 5);
  assert.equal(Math.round(Math.hypot(v.x, v.y)), 5);
  assert.equal(Math.hypot(...Object.values(limit(30, 40, 5))).toFixed(3), '5.000');
});
