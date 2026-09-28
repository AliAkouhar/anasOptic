/// <reference lib="webworker" />
// Generates the mock database off the main thread (the seed is regenerated on every load).
// It is sent back as a JSON string: JSON.parse on the main thread is much cheaper than
// deserializing ~20k small objects through structured clone.
import { generateSeed } from "./seed";

self.onmessage = (event: MessageEvent<{ anchor: string }>) => {
  const db = generateSeed(new Date(event.data.anchor));
  (self as unknown as Worker).postMessage(JSON.stringify(db));
};
