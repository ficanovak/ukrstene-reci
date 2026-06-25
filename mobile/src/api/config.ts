/**
 * API base-URL configuration (Task 4.4).
 *
 * Resolution order:
 *  1. `expo-constants` → `expoConfig.extra.apiBaseUrl` (set per build/profile in
 *     app.json's `expo.extra.apiBaseUrl`, or via an EAS build profile / app.config).
 *  2. Fallback to the local dev server `http://localhost:3000`.
 *
 * DEVICE / VPS NOTES:
 *  - `localhost` only works for the iOS Simulator / web. A physical device on the
 *    same LAN must use the host machine's LAN IP (e.g. http://192.168.1.x:3000),
 *    and the Android emulator uses http://10.0.2.2:3000. Set `extra.apiBaseUrl`
 *    accordingly during development.
 *  - In staging/production the real backend lives on the VPS; point
 *    `extra.apiBaseUrl` at its public HTTPS origin (e.g. https://api.ukrstene.app)
 *    via the corresponding EAS build profile / app.config so no code change is
 *    needed to retarget environments.
 *
 * The import is wrapped defensively so this module is usable in plain Node/Jest
 * (the API client tests pass an explicit baseUrl and never hit this path).
 */

const DEFAULT_BASE_URL = "http://localhost:3000";

/** Resolve the configured API base URL (see module doc for the order). */
export function getApiBaseUrl(): string {
  try {
    // Lazy require so a missing/unmockable expo-constants doesn't break import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require("expo-constants").default as {
      expoConfig?: { extra?: { apiBaseUrl?: string } };
    };
    const fromExtra = Constants?.expoConfig?.extra?.apiBaseUrl;
    if (typeof fromExtra === "string" && fromExtra.length > 0) {
      return fromExtra;
    }
  } catch {
    // expo-constants unavailable (e.g. plain Node) — fall through to the default.
  }
  return DEFAULT_BASE_URL;
}
