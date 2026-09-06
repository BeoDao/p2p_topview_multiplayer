/**
 * Client-side prediction with server reconciliation.
 *
 * The local player is simulated immediately from its own input so the game
 * feels latency-free. Every input is kept until the host acknowledges it; when
 * an authoritative state arrives, we snap the entity back to it and replay the
 * still-unacknowledged inputs on top. If the host agreed with us, the replay
 * lands on the same position and nothing visibly moves.
 */
export class Predictor {
  constructor({ maxPending = 180, tolerance = 0.5 } = {}) {
    this.maxPending = maxPending;
    this.tolerance = tolerance;
    /** @type {{cmd:object, dt:number}[]} */
    this.pending = [];
    this.lastAck = 0;
    this.lastCorrection = 0;
  }

  /** Record an input that has been applied locally and sent to the host. */
  record(cmd, dt) {
    this.pending.push({ cmd, dt });
    if (this.pending.length > this.maxPending) this.pending.shift();
  }

  /**
   * @param {object} entity local predicted entity (mutated in place)
   * @param {object} authoritative host state for that entity
   * @param {number} ackSeq highest input seq the host has consumed
   * @param {(entity:object, cmd:object, dt:number) => void} replay
   */
  reconcile(entity, authoritative, ackSeq, replay) {
    if (!entity || !authoritative) return;
    this.lastAck = ackSeq;
    this.pending = this.pending.filter((p) => p.cmd.seq > ackSeq);

    const beforeX = entity.x ?? 0;
    const beforeY = entity.y ?? 0;

    Object.assign(entity, authoritative);
    for (const p of this.pending) replay(entity, p.cmd, p.dt);

    this.lastCorrection = Math.hypot((entity.x ?? 0) - beforeX, (entity.y ?? 0) - beforeY);
  }

  /** True when the last correction was large enough that the player may see it. */
  get misprediction() {
    return this.lastCorrection > this.tolerance;
  }

  reset() {
    this.pending.length = 0;
    this.lastAck = 0;
    this.lastCorrection = 0;
  }
}
