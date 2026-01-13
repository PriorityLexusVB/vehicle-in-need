import { describe, it, beforeAll, beforeEach } from "vitest";
import {
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getTestEnv, clearTestData } from "./test-env";

let testEnv: RulesTestEnvironment;

describe("Firestore Security Rules - Order Notes Subcollection", () => {
  beforeAll(async () => {
    testEnv = await getTestEnv();
  });

  beforeEach(async () => {
    await clearTestData();

    // Seed users and an order (rules disabled)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      await setDoc(doc(adminDb, "users", "owner123"), {
        email: "owner@example.com",
        displayName: "Owner User",
        isManager: false,
      });

      await setDoc(doc(adminDb, "users", "other456"), {
        email: "other@example.com",
        displayName: "Other User",
        isManager: false,
      });

      await setDoc(doc(adminDb, "users", "manager999"), {
        email: "manager@example.com",
        displayName: "Manager",
        isManager: true,
      });

      await setDoc(doc(adminDb, "orders", "orderA"), {
        createdByUid: "owner123",
        createdByEmail: "owner@example.com",
        createdAt: new Date(),
        status: "Factory Order",
      });

      // Seed a note document
      await setDoc(doc(adminDb, "orders", "orderA", "notes", "note1"), {
        text: "Initial manager note",
        createdAt: new Date(),
        createdByUid: "manager999",
        createdByName: "Manager",
        createdByEmail: "manager@example.com",
        createdByRole: "manager",
      });
    });
  });

  it("denies unauthenticated read of notes", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    const noteRef = doc(unauthedDb, "orders", "orderA", "notes", "note1");
    await assertFails(getDoc(noteRef));
  });

  it("allows order owner to read notes on their order", async () => {
    const ownerDb = testEnv
      .authenticatedContext("owner123", { email: "owner@example.com" })
      .firestore();

    const notesCol = collection(ownerDb, "orders", "orderA", "notes");
    await assertSucceeds(getDocs(notesCol));
  });

  it("denies non-owner non-manager reading notes on someone else's order", async () => {
    const otherDb = testEnv
      .authenticatedContext("other456", { email: "other@example.com" })
      .firestore();

    const notesCol = collection(otherDb, "orders", "orderA", "notes");
    await assertFails(getDocs(notesCol));
  });

  it("allows manager to read notes on any order (via Firestore user doc fallback)", async () => {
    const managerDb = testEnv
      .authenticatedContext("manager999", { email: "manager@example.com" })
      .firestore();

    const notesCol = collection(managerDb, "orders", "orderA", "notes");
    await assertSucceeds(getDocs(notesCol));
  });

  it("denies non-manager creating a note", async () => {
    const ownerDb = testEnv
      .authenticatedContext("owner123", { email: "owner@example.com" })
      .firestore();

    const newNoteRef = doc(ownerDb, "orders", "orderA", "notes", "note2");
    await assertFails(
      setDoc(newNoteRef, {
        text: "Owner tries to add note",
        createdAt: new Date(),
        createdByUid: "owner123",
        createdByName: "Owner User",
        createdByEmail: "owner@example.com",
        createdByRole: "manager",
      })
    );
  });

  it("allows manager creating a note with required schema", async () => {
    const managerDb = testEnv
      .authenticatedContext("manager999", { email: "manager@example.com" })
      .firestore();

    const newNoteRef = doc(managerDb, "orders", "orderA", "notes", "note2");
    await assertSucceeds(
      setDoc(newNoteRef, {
        text: "Manager process update",
        createdAt: new Date(),
        createdByUid: "manager999",
        createdByName: "Manager",
        createdByEmail: "manager@example.com",
        createdByRole: "manager",
      })
    );
  });

  it("denies manager creating a note with wrong role value", async () => {
    const managerDb = testEnv
      .authenticatedContext("manager999", { email: "manager@example.com" })
      .firestore();

    const newNoteRef = doc(managerDb, "orders", "orderA", "notes", "note3");
    await assertFails(
      setDoc(newNoteRef, {
        text: "Manager note but wrong role",
        createdAt: new Date(),
        createdByUid: "manager999",
        createdByName: "Manager",
        createdByEmail: "manager@example.com",
        createdByRole: "admin",
      })
    );
  });
});
