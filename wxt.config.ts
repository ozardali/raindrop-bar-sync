import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: '.',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Raindrop Bar Sync',
    description: 'Keeps your bookmarks bar in sync across browsers via Raindrop.io',
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
});
