// fallback storage in case sessionStorage is unavailable; used to ensure that
// sessionStorage still acts as a global storage in cases where multiple
// DirectRPCClients are instantiated within a single session
const fallbackStorage = new Map<string, string>();

/**
 * safely read from session storage
 */
export function readFromSessionStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(`direct.dev__${key}`);
  } catch {
    return fallbackStorage.get(key) ?? null;
  }
}

/**
 * safely write values to session storage
 */
export function writeToSessionStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(`direct.dev__${key}`, value);
  } catch {
    fallbackStorage.set(key, value);
  }
}
