import { GlobalRegistrator } from "@happy-dom/global-registrator";
import "fake-indexeddb/auto";

// Bun has neither a DOM nor IndexedDB; both are needed by the extraction and
// db tests and are harmless for the pure ones.
if (typeof document === "undefined") {
  GlobalRegistrator.register();
}
