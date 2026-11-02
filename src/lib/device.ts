import { browser } from 'wxt/browser';

/**
 * Identity of this browser profile for the activity log and the devices list. The id is
 * random and permanent, so two profiles of the same browser (or two Chromium browsers that
 * report the same brand, e.g. Helium as "Chromium") are still told apart. The name is a
 * detected default the user can override.
 */
export interface Device {
  id: string;
  name: string;
  /** True when the user chose the name. */
  custom: boolean;
}

const KEY = 'device';

interface StoredDevice {
  id?: string;
  name?: string;
}

export async function getDevice(): Promise<Device> {
  const stored = ((await browser.storage.local.get(KEY))[KEY] ?? {}) as StoredDevice;
  let id = stored.id;
  if (!id) {
    id = crypto.randomUUID();
    await browser.storage.local.set({ [KEY]: { ...stored, id } });
  }
  const custom = !!stored.name?.trim();
  return { id, name: custom ? stored.name!.trim() : await detectDeviceName(), custom };
}

/** Empty name = back to the detected default. */
export async function renameDevice(name: string): Promise<void> {
  const stored = ((await browser.storage.local.get(KEY))[KEY] ?? {}) as StoredDevice;
  await browser.storage.local.set({ [KEY]: { ...stored, name: name.trim() || undefined } });
}

/** e.g. "Firefox on macOS", "Chrome on Windows", "Chromium on macOS". */
export async function detectDeviceName(): Promise<string> {
  const os = await browser.runtime.getPlatformInfo().then((p) => OS_NAMES[p.os] ?? p.os, () => '');
  const name = await detectBrowserName();
  return os ? `${name} on ${os}` : name;
}

const OS_NAMES: Record<string, string> = {
  mac: 'macOS',
  win: 'Windows',
  linux: 'Linux',
  cros: 'ChromeOS',
  openbsd: 'OpenBSD',
  fuchsia: 'Fuchsia',
};

/** Most specific brand first; many Chromium forks (Helium, Vivaldi, ungoogled) only say "Chromium". */
const BRANDS: [string, string][] = [
  ['Microsoft Edge', 'Edge'],
  ['Brave', 'Brave'],
  ['Opera', 'Opera'],
  ['Vivaldi', 'Vivaldi'],
  ['Google Chrome', 'Chrome'],
  ['Chromium', 'Chromium'],
];

async function detectBrowserName(): Promise<string> {
  const runtime = browser.runtime as { getBrowserInfo?: () => Promise<{ name: string }> };
  if (runtime.getBrowserInfo) {
    try {
      return (await runtime.getBrowserInfo()).name; // Firefox (and forks such as LibreWolf)
    } catch {
      // fall through
    }
  }
  const nav = globalThis.navigator as Navigator & {
    userAgentData?: { brands: { brand: string }[] };
    brave?: unknown;
  };
  if (nav.brave) return 'Brave';
  const brands = new Set(nav.userAgentData?.brands.map((b) => b.brand) ?? []);
  return BRANDS.find(([brand]) => brands.has(brand))?.[1] ?? 'Chromium';
}
