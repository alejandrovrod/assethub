import { describe, it, expect } from "vitest";
import { CORE_OFFLINE_VERSION } from "./index";

describe("core-offline smoke test", () => {
  it("exports valid version", () => {
    expect(CORE_OFFLINE_VERSION).toBe("0.1.0");
  });

  it("has indexedDB available via fake-indexeddb", () => {
    expect(globalThis.indexedDB).toBeDefined();
  });
});

