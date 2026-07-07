import { describe, expect, it } from 'vitest';

describe('Firebase Admin compatibility helper', () => {
  it('keeps the server handlers compatible with Firebase Admin modular exports', async () => {
    const module = await import('../src/lib/firebaseAdmin.cjs');
    const { admin } = module.default || module;

    expect(Array.isArray(admin.apps)).toBe(true);
    expect(typeof admin.auth).toBe('function');
    expect(typeof admin.firestore).toBe('function');
    expect(typeof admin.firestore.FieldValue.serverTimestamp).toBe('function');
    expect(typeof admin.firestore.FieldValue.increment).toBe('function');
    expect(typeof admin.firestore.FieldValue.delete).toBe('function');
  });
});
