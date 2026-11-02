import { browser } from 'wxt/browser';
import { RaindropAuthError, RaindropClient, RaindropNetworkError } from '../raindrop/client';
import { readLocalSnapshot, applyLocalOps } from './local';
import { merge, rekeySnapshot } from './merge';
import { applyRemoteOps, readRemoteSnapshot, writeDevices, type RemoteRead } from './remote';
import { msg, type Msg } from '../../i18n/types';
import { getDevice } from '../device';
import { describeOps } from './activity';
import { SEEN_REFRESH_MS, changedBy, effectiveRemoteTimes, recordDevice } from './devices';
import { getSettings, getState, markUnsyncable, recordActivity, recordError, saveState, setMapping } from './state';
import { deserializeSnapshot, serializeSnapshot, type MergeResult, type NodeKey, type Snapshot } from './types';

const LOCK_KEY = 'syncLock';
const LOCK_TIMEOUT_MS = 2 * 60_000;
const MASS_DELETE_RATIO = 0.3;
const MASS_DELETE_MIN = 20;
/** The ratio rule needs a few deletes, otherwise one delete in a 3-item bar would ask (docs/architecture.md, "Safety nets"). */
const MASS_DELETE_RATIO_MIN = 5;

export type SyncOutcome =
  | { status: 'ok'; result: MergeResult }
  | { status: 'skipped'; reason: 'not configured' | 'sync already running' }
  /** `pause` explains a mass-delete pause; a dry run has none. */
  | { status: 'needs-confirmation'; result: MergeResult; pause?: Msg }
  | { status: 'error'; error: Msg };

export interface SyncOptions {
  /** Compute ops only; used for the first-sync preview and mass-delete confirmation. */
  dryRun?: boolean;
  /** User confirmed a dry run; bypasses the mass-delete guard. */
  confirmed?: boolean;
}

export async function runSync(opts: SyncOptions = {}): Promise<SyncOutcome> {
  const settings = await getSettings();
  if (!settings.enabled || !settings.token || settings.rootCollectionId === null) {
    return { status: 'skipped', reason: 'not configured' };
  }
  if (!(await acquireLock())) return { status: 'skipped', reason: 'sync already running' };

  const startedAt = Date.now();
  try {
    const state = await getState();
    const client = new RaindropClient(async () => (await getSettings()).token);

    const [{ snapshot: local, barId }, remote] = await Promise.all([
      readLocalSnapshot(state.nativeToKey, state.unsyncable),
      readRemoteSnapshot(client, settings.rootCollectionId),
    ]);

    const result = merge({
      base: state.base ? deserializeSnapshot(state.base) : null,
      local,
      remote: remote.snapshot,
      localTouchedAt: new Map(Object.entries(state.localTouchedAt)),
      // When the last write came from a recorded sync, LWW uses its real edit time (docs/architecture.md).
      remoteUpdatedAt: effectiveRemoteTimes(remote.updatedAt, remote.devices.doc),
    });

    const massDelete = isMassDelete(result.summary.local.delete, local.nodes.size)
      ? msg('pause.local', { deletes: result.summary.local.delete, total: local.nodes.size })
      : isMassDelete(result.summary.remote.delete, remote.snapshot.nodes.size)
        ? msg('pause.remote', { deletes: result.summary.remote.delete, total: remote.snapshot.nodes.size })
        : null;

    if (opts.dryRun) return { status: 'needs-confirmation', result };
    // The first sync is not confirmed: it never deletes anything (docs/architecture.md, "Merge").
    if (!opts.confirmed && massDelete) {
      if (JSON.stringify(state.pendingConfirmation) !== JSON.stringify(massDelete)) {
        await recordActivity({ kind: 'paused', msg: msg('act.paused', { reason: massDelete }) });
      }
      await saveState({ pendingConfirmation: massDelete });
      await setBadge('?');
      return { status: 'needs-confirmation', result, pause: massDelete };
    }

    // Mapping changes are persisted one by one, before the next write, so that a sync that is
    // interrupted (worker killed, network error) resumes without creating duplicates.
    for (const [from, to] of result.localRekey) await rekeyMapping(from, to);

    if (result.ops.length === 0) {
      await finish(result.newBase, startedAt);
      await shareDevices(client, settings.rootCollectionId, remote.devices, {});
      return { status: 'ok', result };
    }

    await pushBackup(local);

    const remoteRekey = await applyRemoteOps(
      result.ops,
      {
        client,
        rootId: settings.rootCollectionId,
        onRekey: async (from, to) => {
          await rekeyMapping(from, to);
          await refreshLock();
        },
        onUnsyncable: async (key, reason) => {
          const nativeId = (await getState()).keyToNative[key] ?? nativeIdFromTempKey(key);
          if (nativeId) await markUnsyncable(nativeId, reason);
          const title = result.newBase.nodes.get(key)?.title ?? key;
          await recordActivity({ kind: 'warn', msg: msg('act.unsyncable', { title: msg('common.quoted', { text: title }) }) });
        },
        onWarning: (warning) => recordActivity({ kind: 'warn', msg: warning }),
      },
      result.newBase,
      remote.manifests,
    );

    const mapping = await getState();
    await applyLocalOps(result.ops, {
      barId,
      nativeIdOf: (key) => {
        const k = remoteRekey.get(key) ?? key;
        return mapping.keyToNative[k] ?? nativeIdFromTempKey(k);
      },
      onCreated: async (key, nativeId) => {
        await setMapping(nativeId, key);
        mapping.keyToNative[key] = nativeId;
        await refreshLock();
      },
    });

    await finish(rekeySnapshot(result.newBase, remoteRekey), startedAt);
    // Key -> when it was edited here, so other browsers can compare real edit times.
    const touched = new Map(Object.entries(state.localTouchedAt).map(([k, t]) => [result.localRekey.get(k) ?? k, t]));
    const sent: Record<NodeKey, number> = {};
    for (const o of result.ops) {
      if (o.target !== 'remote') continue;
      const k = o.type === 'create' ? o.node.key : o.key;
      sent[remoteRekey.get(k) ?? k] = touched.get(k) ?? startedAt;
    }
    const self = await shareDevices(client, settings.rootCollectionId, remote.devices, sent);
    const described = describeOps(
      result.ops,
      result.newBase,
      { local: rekeySnapshot(local, result.localRekey), remote: remote.snapshot },
      (key) => changedBy(remote.devices.doc, key, self),
      state.base === null,
    );
    await recordActivity({ kind: 'sync', msg: described.msg, details: described.details });
    return { status: 'ok', result };
  } catch (e) {
    return await failed(e);
  } finally {
    await releaseLock();
  }
}

/**
 * Offline is not an error: nothing is lost, local changes keep their touch times and go out
 * with the first sync that reaches Raindrop. Everything else is shown as an error.
 */
async function failed(e: unknown): Promise<SyncOutcome> {
  if (e instanceof RaindropNetworkError) {
    const { offlineSince } = await getState();
    if (offlineSince === null) {
      await saveState({ offlineSince: Date.now() });
      await recordActivity({ kind: 'warn', msg: msg('act.offline') });
    }
    await setBadge('');
    return { status: 'error', error: msg('act.offline') };
  }
  const error = e instanceof RaindropAuthError ? msg('common.tokenInvalid') : msg('act.error', { error: String(e) });
  await recordError(error);
  await setBadge('!');
  return { status: 'error', error };
}

const MAX_BACKUPS = 10;

/** Keeps a copy of this browser's bar before it is changed (docs/architecture.md, "Safety nets"). */
async function pushBackup(local: Snapshot): Promise<void> {
  const { backups } = await getState();
  await saveState({ backups: [{ at: Date.now(), snapshot: serializeSnapshot(local) }, ...backups].slice(0, MAX_BACKUPS) });
}

/**
 * Puts this browser's bar back to a backup, then syncs so Raindrop and the other browsers
 * follow. The current bar is backed up first, so a restore can itself be undone.
 */
export async function restoreBackup(at: number): Promise<SyncOutcome> {
  if (!(await acquireLock())) return { status: 'skipped', reason: 'sync already running' };
  try {
    const state = await getState();
    const backup = state.backups.find((b) => b.at === at);
    if (!backup) return { status: 'error', error: msg('act.error', { error: 'That backup no longer exists' }) };

    const { snapshot: local, barId } = await readLocalSnapshot(state.nativeToKey, state.unsyncable);
    // "n:<nativeId>" keys in the backup may have received a Raindrop key since.
    const target = rekeySnapshot(
      deserializeSnapshot(backup.snapshot),
      new Map(
        [...deserializeSnapshot(backup.snapshot).nodes.keys()]
          .filter((k) => k.startsWith('n:') && state.nativeToKey[k.slice(2)])
          .map((k) => [k, state.nativeToKey[k.slice(2)]!]),
      ),
    );

    // Treat the backup as the "other side" that changed everything relative to now: the
    // local ops of that merge turn the current bar into the backup.
    const result = merge({ base: local, local, remote: target, localTouchedAt: new Map(), remoteUpdatedAt: new Map() });
    const ops = result.ops.filter((o) => o.target === 'local');
    await pushBackup(local);

    const mapping = await getState();
    await applyLocalOps(ops, {
      barId,
      nativeIdOf: (key) => mapping.keyToNative[key] ?? nativeIdFromTempKey(key),
      onCreated: async (key, nativeId) => {
        await setMapping(nativeId, key);
        mapping.keyToNative[key] = nativeId;
        await refreshLock();
      },
    });

    // The restore is the newest local change for everything it touched.
    const now = Date.now();
    const touched = { ...(await getState()).localTouchedAt };
    for (const o of ops) touched[o.type === 'create' ? o.node.key : o.key] = now;
    await saveState({ localTouchedAt: touched });

    const described = describeOps(ops, result.newBase, { local, remote: target });
    await recordActivity({ kind: 'sync', msg: msg('act.restored', { date: at, n: ops.length }), details: described.details });
  } catch (e) {
    return await failed(e);
  } finally {
    await releaseLock();
  }
  return runSync();
}

function isMassDelete(deletes: number, size: number): boolean {
  return deletes >= MASS_DELETE_MIN || (deletes >= MASS_DELETE_RATIO_MIN && deletes / size > MASS_DELETE_RATIO);
}

/**
 * Records this browser and the keys it just sent in the shared devices record, and caches
 * the record for the UI. Cosmetic only, so failures are logged and never fail the sync.
 * Returns this device's id.
 */
async function shareDevices(
  client: RaindropClient,
  rootId: number,
  remote: RemoteRead['devices'],
  sent: Record<NodeKey, number>,
): Promise<string> {
  const device = await getDevice();
  const own = remote.doc.devices[device.id];
  const now = Date.now();
  let doc = remote.doc;
  if (Object.keys(sent).length || !own || own.name !== device.name || now - own.seenAt > SEEN_REFRESH_MS) {
    doc = recordDevice(doc, device, sent, now);
    try {
      await writeDevices(client, rootId, remote.raindropId, doc);
    } catch (e) {
      await recordActivity({ kind: 'warn', msg: msg('act.devicesFailed', { error: String(e) }) });
    }
  }
  await saveState({ devices: doc });
  return device.id;
}

/** Saves the new base, keeps mappings only for nodes that still exist, and drops touch times this sync consumed. */
async function finish(newBase: Snapshot, startedAt: number): Promise<void> {
  const s = await getState();
  const keep = (key: NodeKey) => newBase.nodes.has(key);
  await saveState({
    base: serializeSnapshot(newBase),
    nativeToKey: Object.fromEntries(Object.entries(s.nativeToKey).filter(([, k]) => keep(k))),
    keyToNative: Object.fromEntries(Object.entries(s.keyToNative).filter(([k]) => keep(k))),
    // Edits made while this sync was running are kept for the next one.
    localTouchedAt: Object.fromEntries(Object.entries(s.localTouchedAt).filter(([, t]) => t >= startedAt)),
    lastSyncAt: Date.now(),
    pendingConfirmation: null,
    offlineSince: null,
  });
  await setBadge('');
}

/** "n:<nativeId>" keys carry their native id. */
function nativeIdFromTempKey(key: NodeKey): string | undefined {
  return key.startsWith('n:') ? key.slice(2) : undefined;
}

async function rekeyMapping(from: NodeKey, to: NodeKey): Promise<void> {
  const s = await getState();
  const nativeId = s.keyToNative[from] ?? nativeIdFromTempKey(from);
  if (nativeId) await setMapping(nativeId, to);
}

async function acquireLock(): Promise<boolean> {
  const area = browser.storage.session ?? browser.storage.local;
  const held = (await area.get(LOCK_KEY))[LOCK_KEY] as number | undefined;
  if (held && Date.now() - held < LOCK_TIMEOUT_MS) return false;
  await area.set({ [LOCK_KEY]: Date.now() });
  return true;
}

/** True while a sync holds the lock (used by the UI to show "Syncing…"). */
export async function isSyncRunning(): Promise<boolean> {
  const area = browser.storage.session ?? browser.storage.local;
  const held = (await area.get(LOCK_KEY))[LOCK_KEY] as number | undefined;
  return !!held && Date.now() - held < LOCK_TIMEOUT_MS;
}

/** Long syncs (first sync of a big bar at 120 req/min) must not look like a dead worker's lock. */
async function refreshLock(): Promise<void> {
  const area = browser.storage.session ?? browser.storage.local;
  await area.set({ [LOCK_KEY]: Date.now() });
}

async function releaseLock(): Promise<void> {
  const area = browser.storage.session ?? browser.storage.local;
  await area.remove(LOCK_KEY);
}

async function setBadge(text: string): Promise<void> {
  await browser.action?.setBadgeText({ text });
}
