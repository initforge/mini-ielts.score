"use client";

import { useEffect } from "react";

/**
 * Component to clean up old localStorage keys (except theme)
 * and migrate them to sessionStorage if needed
 */
export default function StorageCleanup() {
  useEffect(() => {
    // List of keys that should be in sessionStorage, not localStorage
    const keysToMigrate = [
      "toeic-speaking-exam-state",
      "toeic-writing-exam-state",
    ];

    // Clean up old localStorage keys (except theme)
    keysToMigrate.forEach((key) => {
      const oldData = localStorage.getItem(key);
      if (oldData) {
        // If not already in sessionStorage, migrate it
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, oldData);
        }
        // Remove from localStorage
        localStorage.removeItem(key);
      }
    });

    // Clean up old writing-answer-* keys from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("writing-answer-")) {
        const oldData = localStorage.getItem(key);
        if (oldData) {
          // If not already in sessionStorage, migrate it
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, oldData);
          }
          // Remove from localStorage
          localStorage.removeItem(key);
        }
      }
    }
  }, []);

  return null;
}
