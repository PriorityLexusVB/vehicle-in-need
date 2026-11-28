/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- mock signatures mirror the real SDK */
/**
 * In-memory stand-in for "firebase/firestore" used ONLY by the preview-mock
 * build (vite.mock.config.ts aliases the real module to this file).
 *
 * It implements the subset of the modular Firestore API the app and its
 * services actually call, backed by a plain Map seeded with synthetic data
 * (see ./seed.ts). Reads, listeners, writes, batches and transactions all run
 * against memory, so the real App.tsx / services / components execute
 * unmodified. Nothing here talks to the network.
 */
import { seedDatabase } from "./seed";

// ─── Timestamp + sentinels ──────────────────────────────────────────────────

export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }

  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }

  valueOf(): string {
    return String(this.toMillis()).padStart(20, "0");
  }

  toJSON() {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
}

class FieldSentinel {
  constructor(readonly kind: "serverTimestamp" | "delete") {}
}

export function serverTimestamp(): any {
  return new FieldSentinel("serverTimestamp");
}

export function deleteField(): any {
  return new FieldSentinel("delete");
}

export class FirestoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "FirebaseError";
  }
}

// Type-only names some files import; exported as harmless values so any
// non-erased import still resolves.
export class QuerySnapshot {}
export class DocumentSnapshot {}
export class QueryDocumentSnapshot {}
export class DocumentReference {}
export class CollectionReference {}
export class Query {}
export class Transaction {}
export class WriteBatch {}
export class Firestore {}
export const DocumentData = undefined;
export const Unsubscribe = undefined;

// ─── Store ──────────────────────────────────────────────────────────────────

type DocData = Record<string, any>;
/** collectionPath -> (docId -> data) */
const store = new Map<string, Map<string, DocData>>();
let autoIdCounter = 0;

function getCollection(path: string): Map<string, DocData> {
  let coll = store.get(path);
  if (!coll) {
    coll = new Map();
    store.set(path, coll);
  }
  return coll;
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Timestamp || value instanceof FieldSentinel) return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as unknown as T;
  const out: Record<string, any> = {};
  for (const [key, inner] of Object.entries(value as Record<string, any>)) out[key] = clone(inner);
  return out as T;
}

function resolveSentinels(data: DocData, base: DocData | undefined): DocData {
  const out: DocData = base ? clone(base) : {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof FieldSentinel) {
      if (value.kind === "delete") {
        deleteAtPath(out, key);
      } else {
        setAtPath(out, key, Timestamp.now());
      }
      continue;
    }
    if (value instanceof Date) {
      setAtPath(out, key, Timestamp.fromDate(value));
      continue;
    }
    setAtPath(out, key, clone(value));
  }
  return out;
}

function setAtPath(target: DocData, path: string, value: any) {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cursor[parts[i]] !== "object" || cursor[parts[i]] === null) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function deleteAtPath(target: DocData, path: string) {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor?.[parts[i]];
    if (!cursor) return;
  }
  delete cursor[parts[parts.length - 1]];
}

function getAtPath(data: DocData, path: string): any {
  return path.split(".").reduce((acc: any, part) => (acc == null ? undefined : acc[part]), data);
}

// ─── References ─────────────────────────────────────────────────────────────

const dbInstance = { type: "firestore", app: null as unknown, __mock: true };

interface CollRef {
  type: "collection";
  path: string;
  id: string;
  firestore: typeof dbInstance;
}

interface DocRef {
  type: "document";
  path: string;
  id: string;
  parent: CollRef;
  firestore: typeof dbInstance;
}

interface Constraint {
  kind: "where" | "orderBy" | "limit";
  field?: string;
  op?: string;
  value?: any;
  direction?: "asc" | "desc";
  count?: number;
}

interface QueryRef {
  type: "query";
  collPath: string;
  constraints: Constraint[];
  firestore: typeof dbInstance;
}

function makeCollRef(path: string): CollRef {
  const segments = path.split("/");
  return { type: "collection", path, id: segments[segments.length - 1], firestore: dbInstance };
}

function makeDocRef(collPath: string, id: string): DocRef {
  return { type: "document", path: `${collPath}/${id}`, id, parent: makeCollRef(collPath), firestore: dbInstance };
}

function autoId(): string {
  autoIdCounter += 1;
  return `mock${Date.now().toString(36)}${autoIdCounter.toString(36).padStart(4, "0")}`;
}

function joinSegments(segments: string[]): string {
  return segments
    .flatMap((segment) => String(segment).split("/"))
    .filter((segment) => segment.length > 0)
    .join("/");
}

export function getFirestore(..._args: unknown[]) {
  return dbInstance;
}

export function collection(parent: any, ...pathSegments: string[]): CollRef {
  const base = parent && parent.type === "document" ? parent.path : "";
  const path = joinSegments([base, ...pathSegments]);
  return makeCollRef(path);
}

export function doc(parent: any, ...pathSegments: string[]): DocRef {
  if (parent && parent.type === "collection") {
    if (pathSegments.length === 0) return makeDocRef(parent.path, autoId());
    const full = joinSegments([parent.path, ...pathSegments]).split("/");
    return makeDocRef(full.slice(0, -1).join("/"), full[full.length - 1]);
  }
  const base = parent && parent.type === "document" ? parent.path : "";
  const full = joinSegments([base, ...pathSegments]).split("/");
  return makeDocRef(full.slice(0, -1).join("/"), full[full.length - 1]);
}

export function where(field: string, op: string, value: any): Constraint {
  return { kind: "where", field, op, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): Constraint {
  return { kind: "orderBy", field, direction };
}

export function limit(count: number): Constraint {
  return { kind: "limit", count };
}

export function query(base: any, ...constraints: Constraint[]): QueryRef {
  if (base.type === "query") {
    return { ...base, constraints: [...base.constraints, ...constraints] };
  }
  return { type: "query", collPath: base.path, constraints, firestore: dbInstance };
}

// ─── Snapshots ──────────────────────────────────────────────────────────────

const metadata = { fromCache: false, hasPendingWrites: false, isEqual: () => true };

function makeDocSnapshot(collPath: string, id: string, data: DocData | undefined) {
  const ref = makeDocRef(collPath, id);
  return {
    id,
    ref,
    metadata,
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : clone(data)),
    get: (field: string) => (data === undefined ? undefined : clone(getAtPath(data, field))),
  };
}

function comparable(value: any): any {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

function compareValues(a: any, b: any): number {
  const left = comparable(a);
  const right = comparable(b);
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  return left < right ? -1 : 1;
}

function matchesWhere(data: DocData, constraint: Constraint): boolean {
  const actual = comparable(getAtPath(data, constraint.field!));
  const expected = comparable(constraint.value);
  switch (constraint.op) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "in":
      return Array.isArray(expected) && expected.map(comparable).includes(actual);
    case "not-in":
      return Array.isArray(expected) && !expected.map(comparable).includes(actual);
    case "array-contains":
      return Array.isArray(actual) && actual.includes(expected);
    case "array-contains-any":
      return Array.isArray(actual) && Array.isArray(expected) && expected.some((v) => actual.includes(v));
    default:
      return false;
  }
}

function runQuery(ref: CollRef | QueryRef) {
  const collPath = ref.type === "collection" ? ref.path : ref.collPath;
  const constraints = ref.type === "query" ? ref.constraints : [];
  let rows = [...getCollection(collPath).entries()];
  for (const constraint of constraints) {
    if (constraint.kind === "where") rows = rows.filter(([, data]) => matchesWhere(data, constraint));
  }
  const orderings = constraints.filter((c) => c.kind === "orderBy");
  if (orderings.length > 0) {
    rows.sort(([, a], [, b]) => {
      for (const ordering of orderings) {
        const result = compareValues(getAtPath(a, ordering.field!), getAtPath(b, ordering.field!));
        if (result !== 0) return ordering.direction === "desc" ? -result : result;
      }
      return 0;
    });
  }
  const limitConstraint = constraints.find((c) => c.kind === "limit");
  if (limitConstraint) rows = rows.slice(0, limitConstraint.count);

  const docs = rows.map(([id, data]) => makeDocSnapshot(collPath, id, data));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata,
    query: ref,
    forEach: (cb: (snap: any) => void) => docs.forEach(cb),
    docChanges: () => docs.map((snap, newIndex) => ({ type: "added", doc: snap, oldIndex: -1, newIndex })),
  };
}

// ─── Listeners ──────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
let notifyScheduled = false;

function notifyAll() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    for (const listener of [...listeners]) listener();
  }, 0);
}

export function onSnapshot(ref: any, ...args: any[]): () => void {
  let onNext: (snap: any) => void;
  let onError: ((error: Error) => void) | undefined;
  let rest = args;
  // Optional SnapshotListenOptions as the first trailing arg.
  if (rest[0] && typeof rest[0] === "object" && typeof rest[0].next !== "function") rest = rest.slice(1);
  if (rest[0] && typeof rest[0] === "object") {
    onNext = rest[0].next?.bind(rest[0]) ?? (() => undefined);
    onError = rest[0].error?.bind(rest[0]);
  } else {
    onNext = rest[0];
    onError = rest[1];
  }

  let active = true;
  const deliver = () => {
    if (!active) return;
    try {
      if (ref.type === "document") {
        const data = getCollection(ref.parent.path).get(ref.id);
        onNext(makeDocSnapshot(ref.parent.path, ref.id, data));
      } else {
        onNext(runQuery(ref));
      }
    } catch (error) {
      if (onError) onError(error as Error);
      else console.error("[mock firestore] listener error", error);
    }
  };
  listeners.add(deliver);
  setTimeout(deliver, 0);
  return () => {
    active = false;
    listeners.delete(deliver);
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getDoc(ref: DocRef) {
  return makeDocSnapshot(ref.parent.path, ref.id, getCollection(ref.parent.path).get(ref.id));
}

export async function getDocs(ref: CollRef | QueryRef) {
  return runQuery(ref);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

function applySet(ref: DocRef, data: DocData, options?: { merge?: boolean }) {
  const coll = getCollection(ref.parent.path);
  const base = options?.merge ? coll.get(ref.id) : undefined;
  coll.set(ref.id, resolveSentinels(data, base));
}

function applyUpdate(ref: DocRef, dataOrField: any, ...moreFieldsAndValues: any[]) {
  const coll = getCollection(ref.parent.path);
  const existing = coll.get(ref.id);
  if (!existing) throw new FirestoreError("not-found", `No document to update: ${ref.path}`);
  let patch: DocData = dataOrField;
  if (typeof dataOrField === "string") {
    patch = { [dataOrField]: moreFieldsAndValues[0] };
    for (let i = 1; i + 1 < moreFieldsAndValues.length; i += 2) {
      patch[moreFieldsAndValues[i]] = moreFieldsAndValues[i + 1];
    }
  }
  coll.set(ref.id, resolveSentinels(patch, existing));
}

function applyDelete(ref: DocRef) {
  getCollection(ref.parent.path).delete(ref.id);
}

export async function setDoc(ref: DocRef, data: DocData, options?: { merge?: boolean }) {
  applySet(ref, data, options);
  notifyAll();
}

export async function addDoc(collRef: CollRef, data: DocData) {
  const ref = makeDocRef(collRef.path, autoId());
  applySet(ref, data);
  notifyAll();
  return ref;
}

export async function updateDoc(ref: DocRef, dataOrField: any, ...rest: any[]) {
  applyUpdate(ref, dataOrField, ...rest);
  notifyAll();
}

export async function deleteDoc(ref: DocRef) {
  applyDelete(ref);
  notifyAll();
}

export function writeBatch(..._args: unknown[]) {
  const ops: Array<() => void> = [];
  const batch = {
    set(ref: DocRef, data: DocData, options?: { merge?: boolean }) {
      ops.push(() => applySet(ref, data, options));
      return batch;
    },
    update(ref: DocRef, dataOrField: any, ...rest: any[]) {
      ops.push(() => applyUpdate(ref, dataOrField, ...rest));
      return batch;
    },
    delete(ref: DocRef) {
      ops.push(() => applyDelete(ref));
      return batch;
    },
    async commit() {
      ops.forEach((op) => op());
      notifyAll();
    },
  };
  return batch;
}

export async function runTransaction<T>(_db: unknown, updateFn: (transaction: any) => Promise<T>): Promise<T> {
  const ops: Array<() => void> = [];
  const transaction = {
    async get(ref: DocRef) {
      return getDoc(ref);
    },
    set(ref: DocRef, data: DocData, options?: { merge?: boolean }) {
      ops.push(() => applySet(ref, data, options));
      return transaction;
    },
    update(ref: DocRef, dataOrField: any, ...rest: any[]) {
      ops.push(() => applyUpdate(ref, dataOrField, ...rest));
      return transaction;
    },
    delete(ref: DocRef) {
      ops.push(() => applyDelete(ref));
      return transaction;
    },
  };
  const result = await updateFn(transaction);
  ops.forEach((op) => op());
  notifyAll();
  return result;
}

// Misc no-ops some Firebase setups call.
export function connectFirestoreEmulator() {}
export function enableIndexedDbPersistence() {
  return Promise.resolve();
}
export function initializeFirestore() {
  return dbInstance;
}

// ─── Seed ───────────────────────────────────────────────────────────────────

for (const [collPath, docs] of Object.entries(seedDatabase(Timestamp))) {
  const coll = getCollection(collPath);
  for (const [id, data] of Object.entries(docs)) coll.set(id, data);
}
