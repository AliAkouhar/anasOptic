import type { DB } from "@/lib/types";

/**
 * Builds the deterministic seed for `anchor`, in a Web Worker when available so the ~4 MB
 * generation never blocks the UI; falls back to the main thread (tests, old browsers).
 */
export async function loadSeed(anchor: Date): Promise<DB> {
  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    try {
      return await new Promise<DB>((resolve, reject) => {
        const worker = new Worker(new URL("./seed.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (e: MessageEvent<string>) => {
          resolve(JSON.parse(e.data) as DB);
          worker.terminate();
        };
        worker.onerror = (e) => {
          reject(e);
          worker.terminate();
        };
        worker.postMessage({ anchor: anchor.toISOString() });
      });
    } catch {
      // fall through to the main thread
    }
  }
  const { generateSeed } = await import("./seed");
  return generateSeed(anchor);
}
