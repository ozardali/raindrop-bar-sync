import { browser } from 'wxt/browser';
import type { LanguageSetting } from '../../i18n';
import type { Msg } from '../../i18n/types';
import { appendActivity, type ActivityEntry } from './activity';
import type { DevicesDoc } from './devices';
import { ROOT_KEY, type NodeKey, type SerializedSnapshot } from './types';

/**
 * Everything persistent lives here. The MV3 service worker can die at any time,
 * so nothing may be kept only in module scope. See docs/architecture.md, "Sync cycle".
 */
export interface SyncSettings {
  token: string;
  rootCollectionId: number | null;
  /** Display name of the root collection, for the UI only. */
  rootCollectionTitle: string;
  /** UI language; "auto" follows the browser. */
  language: LanguageSetting;
  pullIntervalMinutes: number;
  enabled: boolean;
}

export interface SyncState {
  /** nativeId -> NodeKey and reverse. */
  nativeToKey: Record<string, NodeKey>;
  keyToNative: Record<NodeKey, string>;
  base: SerializedSnapshot | null;
  /** Epoch ms of the last local change per NodeKey (Chrome has no "modified" field). */
  localTouchedAt: Record<NodeKey, number>;
  /** nativeId -> reason. Bookmarks Raindrop rejected; kept local-only and never deleted (docs/architecture.md). */
  unsyncable: Record<string, string>;
  lastSyncAt: number | null;
  /** Why automatic sync is paused until the user confirms (mass-delete guard), else null. */
  pendingConfirmation: Msg | null;
  /** Epoch ms since Raindrop has been unreachable, else null. */
  offlineSince: number | null;
  /** `message` only in entries from before translations. */
  lastErrors: { at: number; msg?: Msg; message?: string }[];
  /** Newest first. What happened, for the activity log (docs/architecture.md, "Safety nets"). */
  activity: ActivityEntry[];
  /** Last known shared devices record, for the UI (docs/architecture.md, "Devices"). */
  devices: DevicesDoc | null;
  /** Rolling local snapshots for "restore" (docs/architecture.md, "Safety nets"). */
  backups: { at: number; snapshot: SerializedSnapshot }[];
}

const DEFAULT_SETTINGS: SyncSettings = {
  token: '',
  rootCollectionId: null,
  rootCollectionTitle: '',
  language: 'auto',
  pullIntervalMinutes: 1,
  enabled: false,
};

const DEFAULT_STATE: SyncState = {
  nativeToKey: {},
  keyToNative: {},
  base: null,
  localTouchedAt: {},
  unsyncable: {},
  lastSyncAt: null,
  pendingConfirmation: null,
  offlineSince: null,
  lastErrors: [],
  activity: [],
  devices: null,
  backups: [],
};

export async function getSettings(): Promise<SyncSettings> {
  const { settings } = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<SyncSettings> | undefined) };
}

export async function saveSettings(patch: Partial<SyncSettings>): Promise<void> {
  await browser.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}

export async function getState(): Promise<SyncState> {
  const { state } = await browser.storage.local.get('state');
  return { ...DEFAULT_STATE, ...(state as Partial<SyncState> | undefined) };
}

export async function saveState(patch: Partial<SyncState>): Promise<void> {
  await browser.storage.local.set({ state: { ...(await getState()), ...patch } });
}

export async function touchLocal(nativeId: string, barId: string, at = Date.now()): Promise<void> {
  const s = await getState();
  const key = nativeId === barId ? ROOT_KEY : (s.nativeToKey[nativeId] ?? `n:${nativeId}`);
  await saveState({ localTouchedAt: { ...s.localTouchedAt, [key]: at } });
}

/** Points `nativeId` at `key` in both directions, dropping any previous pairing of either. */
export async function setMapping(nativeId: string, key: NodeKey): Promise<void> {
  const s = await getState();
  const nativeToKey = { ...s.nativeToKey };
  const keyToNative = { ...s.keyToNative };
  const oldKey = nativeToKey[nativeId];
  if (oldKey !== undefined) delete keyToNative[oldKey];
  const oldNative = keyToNative[key];
  if (oldNative !== undefined) delete nativeToKey[oldNative];
  nativeToKey[nativeId] = key;
  keyToNative[key] = nativeId;
  await saveState({ nativeToKey, keyToNative });
}

export async function markUnsyncable(nativeId: string, reason: string): Promise<void> {
  const s = await getState();
  await saveState({ unsyncable: { ...s.unsyncable, [nativeId]: reason } });
}

export async function recordError(error: Msg): Promise<void> {
  const s = await getState();
  await saveState({
    lastErrors: [{ at: Date.now(), msg: error }, ...s.lastErrors].slice(0, 20),
    activity: appendActivity(s.activity, { at: Date.now(), kind: 'error', msg: error }),
  });
}

export async function recordActivity(entry: Omit<ActivityEntry, 'at'>): Promise<void> {
  const s = await getState();
  await saveState({ activity: appendActivity(s.activity, { at: Date.now(), ...entry }) });
}

export async function clearActivity(): Promise<void> {
  await saveState({ activity: [], lastErrors: [] });
}

/** Clears mapping and base, e.g. when the root collection changes. Forces a first-sync merge. The activity log is kept. */
export async function resetSyncState(): Promise<void> {
  const { activity } = await getState();
  await browser.storage.local.set({ state: { ...DEFAULT_STATE, activity } });
}
