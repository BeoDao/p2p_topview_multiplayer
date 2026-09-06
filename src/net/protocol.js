/**
 * Wire protocol for peer-to-peer game traffic.
 *
 * Messages are JSON: readable, debuggable and small enough for the tick rates
 * this framework targets. `encode`/`decode` are the single choke point, so
 * swapping in a binary codec later only touches this file.
 */
export const MSG = {
  HELLO: 'hello',        // client -> host: identify after the channel opens
  INPUT: 'input',        // client -> host: one sampled input command
  SNAPSHOT: 'snap',      // host -> client: authoritative world state
  EVENT: 'event',        // host -> client: one-shot game event (hit, pickup, ...)
  CHAT: 'chat',          // any -> any
  PING: 'ping',
  PONG: 'pong',
};

export function encode(msg) {
  return JSON.stringify(msg);
}

export function decode(raw) {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
  } catch {
    return null;
  }
}

export const hello = (name, meta = {}) => ({ t: MSG.HELLO, name, meta });
export const input = (cmd, tick) => ({ t: MSG.INPUT, cmd, tick });
export const snapshot = (tick, entities, acks, extra) => ({
  t: MSG.SNAPSHOT,
  tick,
  ts: Date.now(),
  ents: entities,
  acks,
  ...(extra ? { extra } : {}),
});
export const event = (name, data) => ({ t: MSG.EVENT, name, data });
