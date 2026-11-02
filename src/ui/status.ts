import { msg, type Msg, type MessageKey } from '../i18n/types';
import { isSyncRunning } from '../lib/sync/engine';
import { getSettings, getState, type SyncSettings, type SyncState } from '../lib/sync/state';

export type StatusKind = 'setup' | 'ok' | 'busy' | 'warn' | 'error';

export interface SyncStatus {
  kind: StatusKind;
  label: MessageKey;
  /** Longer explanation for errors, pauses and offline. */
  detail?: Msg | string;
  paused: boolean;
  settings: SyncSettings;
  state: SyncState;
}

/** One summary of where sync stands, shared by the popup and the options page. */
export async function getSyncStatus(): Promise<SyncStatus> {
  const [settings, state, running] = await Promise.all([getSettings(), getState(), isSyncRunning()]);
  const base = { settings, state, paused: false };
  if (!settings.token) return { ...base, kind: 'setup', label: 'status.notConnected' };
  if (settings.rootCollectionId === null) return { ...base, kind: 'setup', label: 'status.chooseCollection' };
  if (running) return { ...base, kind: 'busy', label: 'status.syncing' };
  if (state.pendingConfirmation) {
    return { ...base, kind: 'warn', label: 'status.paused', paused: true, detail: msg('pause.status', { reason: state.pendingConfirmation }) };
  }
  if (state.offlineSince) return { ...base, kind: 'warn', label: 'status.offline' };
  const lastError = state.lastErrors[0];
  if (lastError && (!state.lastSyncAt || lastError.at > state.lastSyncAt)) {
    return { ...base, kind: 'error', label: 'status.error', detail: lastError.msg ?? lastError.message ?? '' };
  }
  if (!state.lastSyncAt) return { ...base, kind: 'busy', label: 'status.waitingFirst' };
  return { ...base, kind: 'ok', label: 'status.upToDate' };
}

export function countItems(state: SyncState): { folders: number; bookmarks: number } {
  const nodes = state.base?.nodes ?? [];
  const folders = nodes.filter((n) => n.kind === 'folder').length;
  return { folders, bookmarks: nodes.length - folders };
}

export const raindropCollectionUrl = (id: number) => `https://app.raindrop.io/my/${id}`;
