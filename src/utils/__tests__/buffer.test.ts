import { describe, it, expect } from "vitest";

describe("Buffer polyfill", () => {
  it("exists on global and can encode/decode", () => {
    // Ensure global Buffer is available in the test environment
    // @ts-expect-error - Buffer is injected by polyfill in Vitest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B: typeof Buffer | undefined = (globalThis as any).Buffer;
    expect(B).toBeDefined();

    const b = B!.from("abc", "utf8");
    expect(b.length).toBe(3);
    expect(b.toString("hex")).toBe("616263");
  });
});
import { describe, it, expect } from "vitest";

describe("Buffer polyfill", () => {
  it("Buffer exists in test env", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((globalThis as any).Buffer).toBeDefined();
  });
});
