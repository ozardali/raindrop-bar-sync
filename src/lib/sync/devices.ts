/**
 * Shared record of which browsers sync with the collection and what each changed last,
 * kept in the `note` of a special raindrop in the root collection (like the order
 * manifests, docs/architecture.md). Used for the devices list, for "(from Firefox)" in the activity
 * log, and to give last-write-wins the real edit time of a change instead of the time it
 * reached Raindrop. Every use falls back to plain Raindrop data when the record is missing
 * or stale, so sync never depends on it. Pure functions only.
 */
import type { NodeKey, Timestamps } from './types';

export const DEVICES_LINK = 'https://raindrop-bar-sync.invalid/devices';
export const DEVICES_TITLE = '⚙ bar-sync devices';

/** [edited, synced]: when the user changed the node in the browser, and when it was sent. */
export type ChangeTimes = [editedAt: number, syncedAt: number];

export interface DeviceRecord {
  name: string;
  /** Epoch ms of this device's last sync that wrote the record. */
  seenAt: number;
  /** Node key -> times of this device's last change to it that was sent to Raindrop. */
  changes: Record<NodeKey, ChangeTimes>;
}

export interface DevicesDoc {
  v: 1;
  devices: Record<string, DeviceRecord>;
}

const MAX_LENGTH = 9_500; // `note` is truncated at 10 000 chars (docs/raindrop-api.md)
const MAX_CHANGES = 100;
const CHANGE_TTL_MS = 14 * 24 * 3600_000;
const DEVICE_TTL_MS = 90 * 24 * 3600_000;
/** A device with no changes refreshes its `seenAt` at most this often (1 request). */
export const SEEN_REFRESH_MS = 10 * 60_000;
/**
 * A raindrop's `lastUpdate` this close after a recorded sync is that sync's own write.
 * Later than this, someone else (e.g. raindrop.io) changed it since.
 */
const WRITE_WINDOW_MS = 60_000;

export function emptyDevices(): DevicesDoc {
  return { v: 1, devices: {} };
}

export function parseDevices(note: string | undefined): DevicesDoc {
  try {
    const d = JSON.parse(note ?? '') as DevicesDoc;
    if (d?.v !== 1 || !d.devices || typeof d.devices !== 'object') return emptyDevices();
    // Early records stored a single sync time per key.
    for (const r of Object.values(d.devices)) {
      for (const [k, t] of Object.entries(r.changes ?? {})) {
        if (typeof t === 'number') r.changes[k] = [t, t];
      }
    }
    return d;
  } catch {
    return emptyDevices();
  }
}

/** Union of two records; per device the more recently seen entry wins. */
export function mergeDevices(a: DevicesDoc, b: DevicesDoc): DevicesDoc {
  const devices = { ...a.devices };
  for (const [id, d] of Object.entries(b.devices)) {
    if (!devices[id] || devices[id].seenAt < d.seenAt) devices[id] = d;
  }
  return { v: 1, devices };
}

/**
 * Records this device's sync and the keys it sent to Raindrop (key -> when it was edited
 * in the browser); drops stale data.
 */
export function recordDevice(
  doc: DevicesDoc,
  device: { id: string; name: string },
  sent: Record<NodeKey, number>,
  now: number,
): DevicesDoc {
  const devices: Record<string, DeviceRecord> = {};
  for (const [id, d] of Object.entries(doc.devices)) {
    if (now - d.seenAt < DEVICE_TTL_MS) devices[id] = d;
  }
  const changes = { ...devices[device.id]?.changes };
  for (const [k, editedAt] of Object.entries(sent)) changes[k] = [Math.min(editedAt, now), now];
  devices[device.id] = { name: device.name, seenAt: now, changes: recent(changes, now) };
  return { v: 1, devices };
}

/** Serialized note, trimming the oldest change entries until it fits. */
export function serializeDevices(doc: DevicesDoc): string {
  let current = doc;
  for (let s = JSON.stringify(current); ; s = JSON.stringify(current)) {
    if (s.length <= MAX_LENGTH) return s;
    // Drop the single oldest change across all devices; devices themselves are kept.
    let oldest: [string, NodeKey, number] | null = null;
    for (const [id, d] of Object.entries(current.devices)) {
      for (const [k, [, at]] of Object.entries(d.changes)) if (!oldest || at < oldest[2]) oldest = [id, k, at];
    }
    if (!oldest) return s.slice(0, MAX_LENGTH); // cannot happen with sane names
    const [id, key] = oldest;
    const { [key]: _drop, ...rest } = current.devices[id]!.changes;
    current = { ...current, devices: { ...current.devices, [id]: { ...current.devices[id]!, changes: rest } } };
  }
}

/**
 * Display names. Two devices with the same name (two Chrome profiles, or Helium and another
 * fork that both say "Chromium") get a short id suffix so they can be told apart.
 */
export function deviceLabels(doc: DevicesDoc): Map<string, string> {
  const byName = new Map<string, number>();
  for (const d of Object.values(doc.devices)) byName.set(d.name, (byName.get(d.name) ?? 0) + 1);
  return new Map(
    Object.entries(doc.devices).map(([id, d]) => [id, (byName.get(d.name) ?? 0) > 1 ? `${d.name} · ${id.slice(0, 4)}` : d.name]),
  );
}

/** Label of the other device that most recently changed `key`, if known. */
export function changedBy(doc: DevicesDoc, key: NodeKey, selfId: string): string | undefined {
  const last = lastWrite(doc, key);
  return last && last.id !== selfId ? deviceLabels(doc).get(last.id) : undefined;
}

/**
 * Raindrop's `lastUpdate` is when a change reached Raindrop. A browser that was offline
 * sends old edits late, which would make them look newer than they are. When the last
 * write to a node is known to be a recorded sync, use the edit time it recorded instead.
 */
export function effectiveRemoteTimes(updatedAt: Timestamps, doc: DevicesDoc): Timestamps {
  const out: Timestamps = new Map(updatedAt);
  for (const [key, at] of updatedAt) {
    const last = lastWrite(doc, key);
    if (last && at <= last.syncedAt + WRITE_WINDOW_MS) out.set(key, last.editedAt);
  }
  return out;
}

function lastWrite(doc: DevicesDoc, key: NodeKey): { id: string; editedAt: number; syncedAt: number } | undefined {
  let best: { id: string; editedAt: number; syncedAt: number } | undefined;
  for (const [id, d] of Object.entries(doc.devices)) {
    const t = d.changes[key];
    if (t && (!best || t[1] > best.syncedAt)) best = { id, editedAt: t[0], syncedAt: t[1] };
  }
  return best;
}

function recent(changes: Record<NodeKey, ChangeTimes>, now: number): Record<NodeKey, ChangeTimes> {
  return Object.fromEntries(
    Object.entries(changes)
      .filter(([, [, at]]) => now - at < CHANGE_TTL_MS)
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, MAX_CHANGES),
  );
}
