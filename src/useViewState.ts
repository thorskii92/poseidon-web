import { useEffect, useState } from "react";

/**
 * useState that survives moving around the app — opening a record and
 * coming back, switching pages, a refresh — for as long as this browser
 * session lasts. Kept in sessionStorage, so it ends when the browser (or
 * tab) closes, and clearViewState() wipes it on sign-out so the next person
 * at the counter doesn't inherit someone else's filters.
 */

const PREFIX = "poseidon.view.";

function read<T>(key: string, initial: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw == null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

export function useViewState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* private window or storage blocked — it just won't be remembered */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

export function clearViewState() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* nothing stored */
  }
}
