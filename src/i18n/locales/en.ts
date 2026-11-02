import type { Message } from '../types';

/**
 * Source strings. Every other locale must have exactly these keys (checked by the type
 * system) and the same {placeholders} (checked by tests/i18n.test.ts).
 * Plural messages pick a form with Intl.PluralRules from the `n` parameter.
 */
const en = {
  // status
  'status.notConnected': 'Not connected',
  'status.chooseCollection': 'Choose a collection',
  'status.syncing': 'Syncing…',
  'status.paused': 'Paused',
  'status.offline': 'Offline',
  'status.error': 'Error',
  'status.waitingFirst': 'Waiting for first sync',
  'status.upToDate': 'Up to date',
  'status.offlineDetail': "Raindrop can't be reached (offline since {time}). Changes made here are kept and sync automatically when it is back.",
  'pause.local': 'This sync would delete {deletes} of {total} bookmarks in this browser.',
  'pause.remote': 'This sync would delete {deletes} of {total} items in Raindrop.',
  'pause.status': 'Sync is paused. {reason}',
  'time.never': 'never',

  // shared words
  'common.bookmarks': { one: '{n} bookmark', other: '{n} bookmarks' },
  'common.folders': { one: '{n} folder', other: '{n} folders' },
  'common.untitled': '(untitled)',
  'common.quoted': '“{text}”',
  'common.bar': 'Bookmarks bar',
  'common.tokenInvalid': 'Raindrop token is invalid',

  // actions
  'action.syncNow': 'Sync now',
  'action.syncing': 'Syncing…',
  'action.settings': 'Settings',

  // popup
  'popup.title': 'Bar Sync',
  'popup.setupText': 'Connect your Raindrop account and pick a collection to start syncing your bookmarks bar.',
  'popup.setup': 'Set up',
  'popup.collection': 'Collection',
  'popup.lastSync': 'Last sync',
  'popup.items': 'Synced items',
  'popup.device': 'This browser',
  'popup.lastChange': 'Last change',
  'popup.review': 'Review in settings →',

  // options: header
  'app.tagline': 'Keeps your bookmarks bar identical in every browser, through Raindrop.io.',
  'lang.label': 'Language',
  'lang.auto': 'Automatic ({language})',

  // options: account
  'account.title': 'Raindrop account',
  'account.help': 'Connect with a personal test token. It is stored only in this browser and does not expire.',
  'account.link': 'Settings → Integrations',
  'account.placeholder': 'Test token',
  'guide.title': 'How to get a test token',
  'guide.step1': 'On raindrop.io, open {link}.',
  'guide.step2': 'In the “For Developers” section, click “Create new app”.',
  'guide.step3': 'Enter any name (e.g. “Bar Sync”), tick “I accept the Raindrop.io API Terms & Guidelines” and click “Create”.',
  'guide.step4': 'Open the new app from the list, click “Create test token” at the bottom and copy the token.',
  'guide.step5': 'Paste it above and click “Connect”.',
  'guide.note': 'The token only gives access to your own Raindrop account. To revoke it, delete the app in the same place.',
  'account.connect': 'Connect',
  'account.connecting': 'Connecting…',
  'account.connected': 'Connected as {name}.',
  'account.failed': 'Connection failed: {error}',
  'account.denied': 'Permission for api.raindrop.io was denied.',

  // options: collection
  'collection.title': 'Collection',
  'collection.help': 'Your bookmarks bar is mirrored into this collection. Use the same one in every browser.',
  'collection.choose': 'Choose a collection…',
  'collection.new': 'New…',
  'collection.newPrompt': 'Name of the new Raindrop collection:',
  'collection.newDefault': 'Bookmarks Bar',
  'collection.createFailed': 'Could not create collection: {error}',

  // options: sync
  'sync.title': 'Sync',
  'sync.help': 'Changes in this browser sync within seconds; changes from elsewhere are pulled on the interval below.',
  'sync.lastSync': 'Last sync',
  'sync.bookmarks': 'Bookmarks',
  'sync.folders': 'Folders',
  'sync.preview': 'Preview changes',
  'sync.interval': 'Check Raindrop every {input} min',
  'sync.comparing': 'Comparing…',
  'sync.ifNow': 'If you sync now:',
  'sync.confirm': 'Warning: {reason}\n\n{changes}\n\nApply these changes?',
  'sync.cancelled': 'Cancelled. Sync stays paused until you confirm.',
  'sync.done': 'Synced.',
  'sync.failed': 'Sync failed: {error}',
  'sync.notConfigured': 'Connect and choose a collection first.',
  'sync.alreadyRunning': 'Another sync is already running.',
  'sync.pausedHint': 'Press “Sync now” to review the changes and confirm.',
  'sync.unsyncable': {
    one: '{n} bookmark stays only in this browser because Raindrop does not accept its link (e.g. javascript: bookmarklets).',
    other: '{n} bookmarks stay only in this browser because Raindrop does not accept their links (e.g. javascript: bookmarklets).',
  },
  'changes.thisBrowser': 'This browser: {parts}',
  'changes.raindrop': 'Raindrop: {parts}',
  'changes.added': '{n} added',
  'changes.edited': '{n} edited',
  'changes.moved': '{n} moved',
  'changes.deleted': '{n} deleted',
  'changes.none': 'no changes',

  // options: devices
  'devices.title': 'Devices',
  'devices.help': 'Browsers syncing with this collection. Give this one a name you recognise, e.g. “Helium” or “Work Chrome”.',
  'devices.rename': 'Rename',
  'devices.you': 'This browser',
  'devices.synced': 'synced {time}',
  'devices.notYet': 'not synced yet',

  // options: backups
  'backups.title': 'Backups',
  'backups.help': "Before a sync changes this browser's bar, a copy of it is kept here (last 10). Restoring puts the bar back to that point and syncs it to Raindrop and your other browsers. Your current bar is backed up first, so a restore can be undone.",
  'backups.restore': 'Restore',
  'backups.empty': 'No backups yet. One is made before the first sync that changes this browser.',
  'backups.size': '{bookmarks}, {folders} · {time}',
  'backups.confirm': "Put this browser's bookmarks bar back to how it was on {date}?\n\nThe result then syncs to Raindrop and your other browsers. Your current bar is backed up first, so you can undo this.",
  'backups.restored': 'Restored.',
  'backups.restoredPaused': 'Restored. Press “Sync now” to confirm the changes.',

  // options: misc
  'warn.nativeSync': "Turn off the browser's built-in bookmark sync (Chrome Sync / Firefox Sync bookmarks) while using this extension, otherwise both systems fight and create duplicates.",
  'inspect.title': 'Inspect both sides',
  'inspect.help': 'Current state, read-only.',
  'inspect.refresh': 'Refresh',
  'inspect.local': "This browser's bookmarks bar",
  'inspect.remote': 'Raindrop collection',
  'inspect.loading': 'Loading…',
  'inspect.localFailed': 'Could not read bookmarks: {error}',
  'inspect.remoteFailed': 'Could not read Raindrop: {error}',

  // activity log
  'activity.title': 'Activity log',
  'activity.empty': 'Nothing yet. Every sync that changes something shows up here.',
  'activity.clear': 'Clear',
  'activity.show': { one: 'Show change', other: 'Show {n} changes' },
  'act.synced': 'Synced: {parts}',
  'act.syncedBoth': 'Synced: {sent}, {received}',
  'act.firstSync': 'First sync: {parts}',
  'act.firstSyncBoth': 'First sync: {sent}, {received}',
  'act.sent': { one: '{n} change sent to Raindrop', other: '{n} changes sent to Raindrop' },
  'act.received': { one: '{n} change received from {source}', other: '{n} changes received from {source}' },
  'act.restored': {
    one: "Restored this browser's bar to {date} ({n} change)",
    other: "Restored this browser's bar to {date} ({n} changes)",
  },
  'act.paused': '{reason} Waiting for your confirmation.',
  'act.unsyncable': 'Kept only in this browser: {title} (Raindrop does not accept this link)',
  'act.offline': 'Raindrop is unreachable (offline?). Changes are kept and sync automatically when it is back.',
  'act.devicesFailed': 'Could not update the devices list: {error}',
  'act.orderTooLarge': 'Order of folder {folder} not saved: it has too many items.',
  'act.error': '{error}',
  'act.addedRemote': 'Added to Raindrop: {title}',
  'act.addedLocal': 'Added here: {title}',
  'act.renamedRemote': 'Renamed in Raindrop: {from} → {to}',
  'act.renamedLocal': 'Renamed here: {from} → {to}',
  'act.linkRemote': 'Link changed in Raindrop: {title}',
  'act.linkLocal': 'Link changed here: {title}',
  'act.reorderedRemote': 'Reordered in Raindrop: {title}',
  'act.reorderedLocal': 'Reordered here: {title}',
  'act.movedRemote': 'Moved in Raindrop: {title} → {folder}',
  'act.movedLocal': 'Moved here: {title} → {folder}',
  'act.deletedRemote': 'Deleted from Raindrop: {title}',
  'act.deletedLocal': 'Deleted here: {title}',
  'act.fromDevice': '{line} (from {device})',
  'act.more': { one: '…and {n} more', other: '…and {n} more' },

  // manifest
  'ext.description': 'Keeps your bookmarks bar in sync across browsers via Raindrop.io',
} satisfies Record<string, Message>;

export default en;
