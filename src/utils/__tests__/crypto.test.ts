import { describe, it, expect } from "vitest";

// Sanity check that crypto polyfill is available in tests

describe("crypto polyfill", () => {
  it("provides getRandomValues", () => {
    const c = globalThis.crypto as unknown as Crypto;
    expect(c).toBeDefined();
    expect(typeof c.getRandomValues).toBe("function");
    const arr = new Uint8Array(4);
    const out = c.getRandomValues(arr);
    expect(out).toBe(arr);
    expect(arr.length).toBe(4);
  });

  it("provides Buffer via polyfill", () => {
    const BufferConstructor = (globalThis as unknown as { Buffer: typeof Buffer }).Buffer;
    expect(BufferConstructor).toBeDefined();
    
    // Verify Buffer functionality
    const buf = BufferConstructor.from('hello', 'utf8');
    expect(buf).toBeDefined();
    expect(buf.toString()).toBe('hello');
  });

  it("can create and manipulate Buffers", () => {
    const BufferConstructor = (globalThis as unknown as { Buffer: typeof Buffer }).Buffer;
    
    // Create from string
    const buf1 = BufferConstructor.from([0x62, 0x75, 0x66, 0x66, 0x65, 0x72]);
    expect(buf1.toString()).toBe('buffer');
    
    // Create with alloc
    const buf2 = BufferConstructor.alloc(10);
    expect(buf2.length).toBe(10);
    
    // Verify it's filled with zeros
    expect(buf2.every((byte: number) => byte === 0)).toBe(true);
  });
});
