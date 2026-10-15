// Matches camera observations to short-lived slots and assigns each measured hand once.
// IDs survive detector reordering; ambiguous crossings suspend control rather than swap identities.
import { validPose, validHand, assessBodyFrame } from './tracking.js';
const CORE = [11, 12, 23, 24];
const visible = (p, j) =>
  p.v[j] >= 0.6 && p.i[j * 2] >= 0 && p.i[j * 2] <= 1 && p.i[j * 2 + 1] >= 0 && p.i[j * 2 + 1] <= 1;
function distance(a, b) {
  const joints = CORE.filter(j => visible(a, j) && visible(b, j));
  if (joints.length < 2) return Infinity;
  const measuredWidth = Math.hypot(a.i[22] - a.i[24], a.i[23] - a.i[25]);
  const width = Math.max(0.06, measuredWidth);
  if ([11, 12].every(j => visible(a, j) && visible(b, j))) {
    const ratio = Math.hypot(b.i[22] - b.i[24], b.i[23] - b.i[25]) / Math.max(0.001, measuredWidth);
    if (ratio < 0.6 || ratio > 1.7) return Infinity;
  }
  return (
    joints.reduce((sum, j) => sum + Math.hypot(a.i[j * 2] - b.i[j * 2], a.i[j * 2 + 1] - b.i[j * 2 + 1]), 0) /
    joints.length /
    width
  );
}
function inside(pose, zone) {
  const joints = CORE.filter(j => visible(pose, j));
  if (joints.length < 2) return false;
  const x = joints.reduce((s, j) => s + pose.i[j * 2], 0) / joints.length;
  const y = joints.reduce((s, j) => s + pose.i[j * 2 + 1], 0) / joints.length;
  return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
}
export function createParticipants() {
  let entries = [],
    nextId = 0,
    controllerId = null;
  let pending = [];
  let limit = 2,
    controllerSlot = 0,
    zone = { x: 0, y: 0, width: 1, height: 1 };
  const prune = now => {
    entries = entries.filter(p => now - p.observedAt < 3000 && p.slot < limit);
    if (!entries.some(p => p.id === controllerId)) controllerId = entries[0]?.id ?? null;
  };
  const assignHands = (hands, now) => {
    entries.forEach(p => (p.hands = []));
    const wrists = entries
      .filter(p => p.observedAt === now && !p.ambiguous)
      .flatMap(p => [15, 16].filter(j => visible(p.pose, j)).map(j => ({ p, j })));
    const assigned = new Set();
    for (const hand of hands.slice(0, 8).filter(validHand)) {
      const candidates = wrists
        .map(w => ({ ...w, d: Math.hypot(hand.lm[0] - w.p.pose.i[w.j * 2], hand.lm[1] - w.p.pose.i[w.j * 2 + 1]) }))
        .sort((a, b) => a.d - b.d);
      const best = candidates[0];
      if (!best || best.d > 0.12 || (candidates[1] && candidates[1].d - best.d < 0.025)) continue;
      const key = `${best.p.id}:${best.j}`;
      if (!assigned.has(key)) {
        best.p.hands.push(hand);
        assigned.add(key);
      }
    }
  };
  return {
    configure(options) {
      limit = options.modelId ? 1 : (options.maxParticipants ?? 2);
      controllerSlot = options.controllerSlot ?? 0;
      zone = options.participationZone ?? zone;
      prune(performance.now());
    },
    reset() {
      entries = [];
      pending = [];
      controllerId = null;
    },
    ingest(packet, now) {
      prune(now);
      const candidates = (Array.isArray(packet.poses) ? packet.poses : packet.pose ? [packet.pose] : [])
        .slice(0, 4)
        .filter(p => validPose(p) && inside(p, zone));
      const pairs = entries
        .flatMap(entry => candidates.map((pose, index) => ({ entry, pose, index, cost: distance(entry.pose, pose) })))
        .filter(p => p.cost < 0.8)
        .sort((a, b) => a.cost - b.cost);
      const ambiguousEntries = new Set(),
        ambiguousCandidates = new Set();
      for (const pair of pairs) {
        const competitor = pairs.find(
          p => p !== pair && (p.entry === pair.entry || p.index === pair.index) && Math.abs(p.cost - pair.cost) < 0.12,
        );
        if (competitor) {
          ambiguousEntries.add(pair.entry);
          ambiguousEntries.add(competitor.entry);
          ambiguousCandidates.add(pair.index);
          ambiguousCandidates.add(competitor.index);
        }
      }
      const used = new Set(ambiguousCandidates),
        matched = new Set();
      for (const entry of ambiguousEntries) {
        entry.ambiguous = true;
        entry.recovery = 2;
      }
      for (const { entry, pose, index } of pairs) {
        if (ambiguousEntries.has(entry) || used.has(index) || matched.has(entry)) continue;
        entry.pose = pose;
        entry.observedAt = now;
        entry.recovery = Math.max(0, (entry.recovery ?? 0) - 1);
        entry.ambiguous = entry.recovery > 0;
        used.add(index);
        matched.add(entry);
      }
      const nextPending = [];
      for (const [index, pose] of candidates.entries()) {
        if (used.has(index) || entries.length >= limit || !assessBodyFrame(pose).ok) continue;
        // An unmatched observation near a retained participant cannot claim a new identity.
        if (entries.some(p => distance(p.pose, pose) < 1.2)) continue;
        const confirmation = pending.find(p => now - p.at < 1500 && distance(p.pose, pose) < 0.8);
        if (!confirmation) {
          nextPending.push({ pose, at: now });
          continue;
        }
        const slot = Array.from({ length: limit }, (_, i) => i).find(i => !entries.some(p => p.slot === i));
        entries.push({ id: ++nextId, slot, pose, hands: [], observedAt: now, ambiguous: false });
      }
      pending = nextPending;
      if (controllerId === null) controllerId = entries[0]?.id ?? null;
      assignHands(Array.isArray(packet.hands) ? packet.hands : [], now);
      return entries;
    },
    current(now) {
      prune(now);
      return entries;
    },
    controller(now) {
      prune(now);
      const p = controllerSlot
        ? entries.find(p => p.slot === controllerSlot - 1)
        : entries.find(p => p.id === controllerId);
      return p && !p.ambiguous && p.observedAt === now ? p : null;
    },
  };
}
