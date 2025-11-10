#!/usr/bin/env node
/**
 * Firebase MCP server (stdio JSON-RPC v2.0).
 * Methods:
 *  - ping -> { ok: true }
 *  - firestore.listCollections -> string[]
 *  - firestore.getDoc { path } -> { exists, data|null }
 *  - firestore.queryCollection { collection, where? } -> { documents: [...] }
 *
 * Env Vars:
 *  - FIREBASE_SERVICE_ACCOUNT_FILE (preferred) OR FIREBASE_SERVICE_ACCOUNT_JSON
 *  - FIREBASE_PROJECT_ID
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

// --- Initialization ---------------------------------------------------------
function loadServiceAccount() {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (file && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    return JSON.parse(inline);
  }
  throw new Error(
    "Missing service account: set FIREBASE_SERVICE_ACCOUNT_FILE or FIREBASE_SERVICE_ACCOUNT_JSON"
  );
}

function initFirebase() {
  if (admin.apps.length) return admin.apps[0];
  const serviceAccount = loadServiceAccount();
  const projectId =
    process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });
  return admin.app();
}

initFirebase();
const db = admin.firestore();

// --- JSON-RPC Utilities -----------------------------------------------------
function send(resultObj) {
  process.stdout.write(JSON.stringify(resultObj) + "\n");
}

function makeError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}

// --- Firestore Helpers ------------------------------------------------------
async function listCollectionsRoot() {
  const cols = await db.listCollections();
  return cols.map((c) => c.id);
}

function parsePath(p) {
  // path like collection/doc[/subcollection/subdoc...]
  const segments = p.split("/").filter(Boolean);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new Error(
      "Invalid document path: must have even number of segments >= 2"
    );
  }
  return segments;
}

async function getDoc(pathStr) {
  const segments = parsePath(pathStr);
  let ref = db.collection(segments[0]).doc(segments[1]);
  for (let i = 2; i < segments.length; i += 2) {
    ref = ref.collection(segments[i]).doc(segments[i + 1]);
  }
  const snap = await ref.get();
  return { exists: snap.exists, data: snap.exists ? snap.data() : null };
}

async function queryCollection({ collection, where }) {
  if (!collection) throw new Error("collection required");
  let q = db.collection(collection);
  if (where) {
    const [field, op, value] = where;
    q = q.where(field, op, value);
  }
  const snap = await q.limit(50).get();
  return { documents: snap.docs.map((d) => ({ id: d.id, data: d.data() })) };
}

// --- Method Dispatch --------------------------------------------------------
async function dispatch(id, method, params = {}) {
  try {
    switch (method) {
      case "ping":
        return ok(id, { ok: true, ts: Date.now() });
      case "firestore.listCollections":
        return ok(id, await listCollectionsRoot());
      case "firestore.getDoc":
        if (!params.path) throw new Error("path param required");
        return ok(id, await getDoc(params.path));
      case "firestore.queryCollection":
        return ok(id, await queryCollection(params));
      default:
        return makeError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return makeError(id, -32000, err.message, { stack: err.stack });
  }
}

// --- Stdio Loop -------------------------------------------------------------
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      send(makeError(null, -32700, "Parse error"));
      continue;
    }
    const { id, method, params, jsonrpc } = msg;
    if (jsonrpc !== "2.0") {
      send(makeError(id, -32600, "Invalid Request: jsonrpc must be 2.0"));
      continue;
    }
    if (!method) {
      send(makeError(id, -32600, "Invalid Request: method required"));
      continue;
    }
    Promise.resolve(dispatch(id, method, params)).then(send);
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

process.on("uncaughtException", (e) => {
  send(
    makeError(null, -32099, "Server exception", {
      message: e.message,
      stack: e.stack,
    })
  );
});

process.on("SIGINT", () => process.exit(0));
