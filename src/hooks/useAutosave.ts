import { useEffect, useRef, useCallback } from "react";

interface AutosaveOptions {
  storageKey: string;
  debounceMs?: number;
  onSave?: (data: any) => void;
  onRestore?: (data: any) => void;
  maxAgeMs?: number; // Max age for recovery data
}

interface AutosaveState<T = any> {
  save: (data: T) => void;
  restore: () => T | null;
  clear: () => void;
  getLastSaved: () => Date | null;
}

const SAVE_KEY = "toeic-autosave-meta";

interface SaveMeta {
  [key: string]: {
    savedAt: string;
    version: number;
  };
}

function getMeta(): SaveMeta {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setMeta(meta: SaveMeta): void {
  sessionStorage.setItem(SAVE_KEY, JSON.stringify(meta));
}

export function useAutosave<T extends Record<string, any>>({
  storageKey,
  debounceMs = 1000,
  onSave,
  onRestore,
  maxAgeMs = 30 * 60 * 1000, // 30 minutes default
}: AutosaveOptions): AutosaveState<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<Date | null>(null);

  // Load last saved time from meta
  useEffect(() => {
    const meta = getMeta();
    if (meta[storageKey]) {
      lastSavedRef.current = new Date(meta[storageKey].savedAt);
    }
  }, [storageKey]);

  const save = useCallback(
    (data: T) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce save
      timeoutRef.current = setTimeout(() => {
        try {
          const now = new Date();
          const meta = getMeta();
          meta[storageKey] = {
            savedAt: now.toISOString(),
            version: (meta[storageKey]?.version || 0) + 1,
          };
          setMeta(meta);

          sessionStorage.setItem(storageKey, JSON.stringify(data));
          lastSavedRef.current = now;
          onSave?.(data);
        } catch (err) {
          console.error(`[Autosave] Failed to save to ${storageKey}:`, err);
        }
      }, debounceMs);
    },
    [storageKey, debounceMs, onSave]
  );

  const restore = useCallback((): T | null => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;

      // Check max age
      const meta = getMeta();
      if (meta[storageKey]) {
        const savedAt = new Date(meta[storageKey].savedAt);
        const age = Date.now() - savedAt.getTime();
        if (age > maxAgeMs) {
          return null; // Too old
        }
      }

      const data = JSON.parse(raw);
      lastSavedRef.current = meta[storageKey] ? new Date(meta[storageKey].savedAt) : null;
      onRestore?.(data);
      return data;
    } catch (err) {
      console.error(`[Autosave] Failed to restore from ${storageKey}:`, err);
      return null;
    }
  }, [storageKey, maxAgeMs, onRestore]);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
      const meta = getMeta();
      delete meta[storageKey];
      setMeta(meta);
      lastSavedRef.current = null;
    } catch (err) {
      console.error(`[Autosave] Failed to clear ${storageKey}:`, err);
    }
  }, [storageKey]);

  const getLastSaved = useCallback((): Date | null => {
    return lastSavedRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    save,
    restore,
    clear,
    getLastSaved,
  };
}
