import { defineConfig } from 'wxt';
import { LANGUAGES } from './src/i18n';

/** Browser `_locales` folder names for our language codes. */
const MANIFEST_LOCALE: Record<string, string> = { pt: 'pt_BR', zh: 'zh_CN', zh_TW: 'zh_TW' };

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: '.',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Raindrop Bar Sync',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['bookmarks', 'storage', 'alarms'],
    host_permissions: ['https://api.raindrop.io/*'],
    // Needed for the error / confirmation badge; not a permission.
    action: { default_title: 'Raindrop Bar Sync' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          // Add-on id used when signing on addons.mozilla.org.
          id: 'raindrop-bar-sync@goksel.dev',
          strict_min_version: '115.0',
        },
      },
    }),
  }),
  hooks: {
    // The store listing description in every UI language, generated from src/i18n.
    'build:publicAssets': (_wxt, files) => {
      for (const { code, messages } of LANGUAGES) {
        files.push({
          relativeDest: `_locales/${MANIFEST_LOCALE[code] ?? code}/messages.json`,
          contents: JSON.stringify({ extDescription: { message: messages['ext.description'] } }, null, 2),
        });
      }
    },
  },
});
