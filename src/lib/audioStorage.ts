/**
 * Audio Storage Utility using IndexedDB
 * IndexedDB can store much larger data (hundreds of MB) compared to sessionStorage/localStorage (5-10MB)
 */

const DB_NAME = "toeic-audio-storage";
const DB_VERSION = 1;
const STORE_NAME = "audio-recordings";

interface AudioMetadata {
  questionId: string;
  recordedAt: string;
  duration?: number;
  size?: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB database
 */
export async function initAudioDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "questionId" });
        objectStore.createIndex("recordedAt", "recordedAt", { unique: false });
      }
    };
  });
}

/**
 * Store audio blob in IndexedDB
 */
export async function storeAudio(
  questionId: string,
  audioBlob: Blob,
  metadata?: Partial<AudioMetadata>
): Promise<void> {
  try {
    const db = await initAudioDB();
    
    // Convert blob to ArrayBuffer for storage
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    const data = {
      questionId,
      audioData: arrayBuffer,
      mimeType: audioBlob.type,
      recordedAt: metadata?.recordedAt || new Date().toISOString(),
      duration: metadata?.duration,
      size: metadata?.size || audioBlob.size,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to store audio in IndexedDB"));
      };
    });
  } catch (error) {
    console.error("Error storing audio:", error);
    throw error;
  }
}

/**
 * Retrieve audio blob from IndexedDB
 */
export async function getAudio(questionId: string): Promise<Blob | null> {
  try {
    const db = await initAudioDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(questionId);

      request.onsuccess = () => {
        const result = request.result;
        if (result && result.audioData) {
          // Convert ArrayBuffer back to Blob
          const blob = new Blob([result.audioData], { type: result.mimeType || "audio/webm" });
          resolve(blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error("Failed to retrieve audio from IndexedDB"));
      };
    });
  } catch (error) {
    console.error("Error retrieving audio:", error);
    return null;
  }
}

/**
 * Get audio metadata without loading the full blob
 */
export async function getAudioMetadata(questionId: string): Promise<AudioMetadata | null> {
  try {
    const db = await initAudioDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(questionId);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            questionId: result.questionId,
            recordedAt: result.recordedAt,
            duration: result.duration,
            size: result.size,
          });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error("Failed to retrieve audio metadata"));
      };
    });
  } catch (error) {
    console.error("Error retrieving audio metadata:", error);
    return null;
  }
}

/**
 * Delete audio from IndexedDB
 */
export async function deleteAudio(questionId: string): Promise<void> {
  try {
    const db = await initAudioDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(questionId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to delete audio from IndexedDB"));
      };
    });
  } catch (error) {
    console.error("Error deleting audio:", error);
    throw error;
  }
}

/**
 * Clear all audio recordings (useful for reset exam)
 */
export async function clearAllAudio(): Promise<void> {
  try {
    const db = await initAudioDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to clear audio storage"));
      };
    });
  } catch (error) {
    console.error("Error clearing audio storage:", error);
    throw error;
  }
}

/**
 * Get all stored question IDs
 */
export async function getAllStoredQuestionIds(): Promise<string[]> {
  try {
    const db = await initAudioDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        reject(new Error("Failed to get stored question IDs"));
      };
    });
  } catch (error) {
    console.error("Error getting stored question IDs:", error);
    return [];
  }
}
