// Parses newline-separated serial messages from the receiver micro:bit.
// Accepts the JSON format written by firmware/receiver/main.ts, and is tolerant
// of noise (partial lines, boot banners, stray characters).

const HANDS = { LEFT: 'LEFT', RIGHT: 'RIGHT', L: 'LEFT', R: 'RIGHT' };

/**
 * @param {string} line
 * @returns {null | {event:string, hand?:'LEFT'|'RIGHT', strength?:number, seq?:number, rssi?:number,
 *                   threshold?:number, noise?:number, mag?:number, raw:string, [k:string]:any}}
 */
export function parseMessage(line) {
  if (typeof line !== 'string') return null;
  const raw = line.trim();
  if (!raw) return null;

  // JSON (primary format). Extract the first {...} in case of leading garbage.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    let obj;
    try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
    if (!obj || typeof obj !== 'object' || typeof obj.event !== 'string') return null;
    const msg = { ...obj, event: obj.event.toUpperCase(), raw };
    if (obj.hand !== undefined) {
      const h = HANDS[String(obj.hand).toUpperCase()];
      if (!h) return null;
      msg.hand = h;
    }
    for (const k of ['strength', 'seq', 'rssi', 'threshold', 'noise', 'mag', 'uptime', 'pktL', 'pktR']) {
      if (msg[k] !== undefined) {
        const n = Number(msg[k]);
        if (!Number.isFinite(n)) return null;
        msg[k] = n;
      }
    }
    if (msg.event === 'PUNCH' && (!msg.hand || !Number.isFinite(msg.seq))) return null;
    return msg;
  }

  // Compact fallback: "PUNCH,RIGHT,1600,12" (handy for custom firmware)
  const p = raw.split(',');
  if (p[0].toUpperCase() === 'PUNCH' && p.length >= 4) {
    const hand = HANDS[p[1].toUpperCase()];
    const strength = Number(p[2]); const seq = Number(p[3]);
    if (hand && Number.isFinite(strength) && Number.isFinite(seq)) {
      return { event: 'PUNCH', hand, strength, seq, raw };
    }
  }
  return null;
}
