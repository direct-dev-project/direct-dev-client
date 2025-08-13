// fallback storage in case localStorage is unavailable; used to ensure that
// localStorage still acts as a global storage in cases where multiple
// DirectRPCClients are instantiated within a single session
const fallbackStorage = new Map<string, string>();

/**
 * safely read from local storage
 */
export function readFromLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(`direct.dev__${key}`);
  } catch {
    return fallbackStorage.get(key) ?? null;
  }
}

/**
 * safely write values to local storage
 */
export function writeToLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(`direct.dev__${key}`, value);
  } catch {
    fallbackStorage.set(key, value);
  }
}

/**
 * safely remove a value from local storage
 */
export function deleteFromLocalStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    fallbackStorage.delete(key);
  }
}
