const CURRENT_PREFIX = "novelfoundry.";
const LEGACY_PREFIX = "ai-novel.";

function migrationKey(key: string): string {
  return `${key}.legacy-migrated`;
}

export function readBrandedPreference(key: string): string | null {
  const storage = window.localStorage;
  const current = storage.getItem(key);
  if (current !== null) {
    try {
      storage.setItem(migrationKey(key), "true");
    } catch {
      // A readable preference still applies when storage cannot accept writes.
    }
    return current;
  }
  if (storage.getItem(migrationKey(key)) === "true") {
    return null;
  }
  const legacyKey = key.startsWith(CURRENT_PREFIX)
    ? `${LEGACY_PREFIX}${key.slice(CURRENT_PREFIX.length)}`
    : key;
  const legacy = storage.getItem(legacyKey);
  try {
    if (legacy !== null) {
      storage.setItem(key, legacy);
    }
    // Retain legacy values, but never re-import a preference after it is cleared.
    storage.setItem(migrationKey(key), "true");
  } catch {
    // Migration can wait until storage is writable; honor the existing value.
  }
  return legacy;
}

export function writeBrandedPreference(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  window.localStorage.setItem(migrationKey(key), "true");
}

export function clearBrandedPreference(key: string): void {
  window.localStorage.setItem(migrationKey(key), "true");
  window.localStorage.removeItem(key);
}
