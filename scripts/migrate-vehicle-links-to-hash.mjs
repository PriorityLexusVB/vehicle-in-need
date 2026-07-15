/**
 * ONE-TIME cutover migration: reconcile vehicle_links (+ the current latest
 * allocation snapshot + orders.allocatedVehicleId) from the OLD positional
 * vehicle-IDs to the NEW content-stable HASH IDs.
 *
 * WHY: PR #275 fixed the live email-ingestion parser to emit content-stable
 * hash IDs (matching the reference/board parser). Existing snapshots + links
 * were written under the OLD positional IDs. Without this migration, the first
 * hash-ID email would orphan EVERY active vehicle_link at once (double-booking
 * risk). This rewrites the current latest snapshot's vehicle IDs + the links +
 * orders to hash IDs so everything stays consistent through the cutover.
 *
 * SAFETY: read-only until --apply. Always run --dry-run first, keep the backup.
 *
 * REQUIRES: a Firestore-reachable context (the CI sandbox could NOT reach
 * firestore.googleapis.com). Auth = a gcloud OWNER access token (IAM bypasses
 * rules) OR adapt to firebase-admin.
 *
 * USAGE (from a machine that can reach firestore.googleapis.com):
 *   TOKEN=$(gcloud auth print-access-token)
 *   node scripts/migrate-vehicle-links-to-hash.mjs "$TOKEN" --dry-run   # review
 *   node scripts/migrate-vehicle-links-to-hash.mjs "$TOKEN" --apply     # execute (writes backup first)
 *   node scripts/migrate-vehicle-links-to-hash.mjs "$TOKEN" --verify    # zero-orphan check
 *
 * CUTOVER ORDER: pause Apps Script allocation trigger → deploy functions
 * (npm run deploy:functions) → this --dry-run → --apply → --verify → resume trigger.
 *
 * QUIESCE ALL WRITERS during --apply, not just the email trigger. A manager
 * using the LIVE APP mid-run (unlink/relink a vehicle) would race this script and
 * could silently lose a claim. Run --apply off-hours with no one in the app. As a
 * backstop the --apply loop re-reads live link+order state immediately before each
 * write and ABORTS (no clobber) if it detects a concurrent change; --verify also
 * checks the reverse direction (every order.allocatedVehicleId has a link back).
 */
import { writeFileSync, existsSync } from "node:fs";

const TOKEN = process.argv[2];
const MODE = process.argv.includes("--apply") ? "apply" : process.argv.includes("--verify") ? "verify" : "dry-run";
const PROJECT = "vehicles-in-need";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: `Bearer ${TOKEN}`, "x-goog-user-project": PROJECT, "Content-Type": "application/json" };
if (!TOKEN) { console.error("Usage: node migrate-vehicle-links-to-hash.mjs <gcloud-token> [--dry-run|--apply|--verify]"); process.exit(1); }

// --- id logic (verbatim from src/utils/allocationParser.ts — validated by the parity test) ---
function hashString(v){let h=0x811c9dc5;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(36).toUpperCase();}
function normPart(v){const n=(v??"").trim().toUpperCase().replace(/[^A-Z0-9+]+/g,"-").replace(/^-+|-+$/g,"");return n||"NA";}
function buildBase(v){const o=[...(v.factoryAccessories||[]).map(x=>`FA:${x}`),...(v.postProductionOptions||[]).map(x=>`PPO:${x}`)].map(x=>x.trim().toUpperCase()).filter(Boolean).sort();const s=[v.code,v.sourceCode??"",v.grade,v.color,v.interiorColor,v.bos,...o].map(x=>(x??"").trim().toUpperCase()).join("|");return [normPart(v.sourceCode??v.code),normPart(v.code),hashString(s)].join("-");}
function fv(v){if(v==null)return null;if("stringValue"in v)return v.stringValue;if("integerValue"in v)return Number(v.integerValue);if("doubleValue"in v)return v.doubleValue;if("booleanValue"in v)return v.booleanValue;if("nullValue"in v)return null;if("timestampValue"in v)return v.timestampValue;if("arrayValue"in v)return (v.arrayValue.values||[]).map(fv);if("mapValue"in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,fv(x)]));return v;}
function toFsValue(x){if(x===null||x===undefined)return{nullValue:null};if(typeof x==="string")return{stringValue:x};if(typeof x==="boolean")return{booleanValue:x};if(typeof x==="number")return Number.isInteger(x)?{integerValue:String(x)}:{doubleValue:x};if(Array.isArray(x))return{arrayValue:{values:x.map(toFsValue)}};if(typeof x==="object")return{mapValue:{fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,toFsValue(v)]))}};return{stringValue:String(x)};}

async function runQuery(body){const r=await fetch(`${BASE}:runQuery`,{method:"POST",headers:H,body:JSON.stringify(body)});if(!r.ok)throw new Error(`runQuery ${r.status}: ${await r.text()}`);return r.json();}
async function listAll(coll){const out=[];let pt="";do{const r=await fetch(`${BASE}/${coll}?pageSize=300${pt?`&pageToken=${pt}`:""}`,{headers:H});if(!r.ok)throw new Error(`list ${coll} ${r.status}: ${await r.text()}`);const j=await r.json();(j.documents||[]).forEach(d=>out.push(d));pt=j.nextPageToken||"";}while(pt);return out;}
async function patchDoc(path,fields,mask){const u=`${BASE}/${path}?`+mask.map(f=>`updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");const r=await fetch(u,{method:"PATCH",headers:H,body:JSON.stringify({fields})});if(!r.ok)throw new Error(`patch ${path} ${r.status}: ${await r.text()}`);return r.json();}
// Idempotent create: a 409 (already exists) is treated as "already migrated" so
// a re-run after a partial failure is safe (does NOT overwrite/duplicate).
async function createDoc(coll,id,fields){const r=await fetch(`${BASE}/${coll}?documentId=${encodeURIComponent(id)}`,{method:"POST",headers:H,body:JSON.stringify({fields})});if(r.status===409)return "exists";if(!r.ok)throw new Error(`create ${coll}/${id} ${r.status}: ${await r.text()}`);return r.json();}
// Idempotent delete: a 404 (already deleted) is fine on a re-run.
async function deleteDoc(path){const r=await fetch(`${BASE}/${path}`,{method:"DELETE",headers:H});if(r.status===404)return;if(!r.ok)throw new Error(`delete ${path} ${r.status}: ${await r.text()}`);}
async function getDoc(path){const r=await fetch(`${BASE}/${path}`,{headers:H});if(r.status===404)return null;if(!r.ok)throw new Error(`get ${path} ${r.status}: ${await r.text()}`);return r.json();}

(async()=>{
  const q=await runQuery({structuredQuery:{from:[{collectionId:"allocationSnapshots"}],where:{fieldFilter:{field:{fieldPath:"isLatest"},op:"EQUAL",value:{booleanValue:true}}},orderBy:[{field:{fieldPath:"publishedAt"},direction:"DESCENDING"}],limit:1}});
  const snap=q.find(x=>x.document)?.document;
  if(!snap){console.log("No latest snapshot — nothing to migrate.");return;}
  const snapId=snap.name.split("/").pop();
  const vehicles=fv(snap.fields.vehicles)||[];
  const counts=new Map(),posToHash=new Map(),hashSet=new Set();
  for(const v of vehicles){const b=buildBase(v);const n=(counts.get(b)||0)+1;counts.set(b,n);const hid=`${b}-U${String(n).padStart(2,"0")}`;hashSet.add(hid);posToHash.set(v.id,hid);}
  const links=await listAll("vehicle_links");
  // Three buckets: clean = positional link that maps to a current snapshot vehicle
  // (needs migrating); alreadyHash = link whose id is ALREADY a current-snapshot
  // hash id (migrated by a prior partial run — leave it, do NOT treat as orphan);
  // orphan = neither (positional id absent from the snapshot — genuinely unmapped).
  const clean=[],orphan=[],alreadyHash=[];
  for(const l of links){const pos=l.name.split("/").pop();const hid=posToHash.get(pos);if(hid)clean.push({pos,hid,raw:l.fields||{},data:Object.fromEntries(Object.entries(l.fields||{}).map(([k,x])=>[k,fv(x)]))});else if(hashSet.has(pos))alreadyHash.push(pos);else orphan.push(pos);}
  console.log(`Snapshot ${snapId}: ${vehicles.length} vehicles. Links: ${links.length} (${clean.length} map to hash, ${alreadyHash.length} already hash-keyed from a prior run, ${orphan.length} orphan).`);
  if(orphan.length)console.log("Orphan links (not in current snapshot — resolve before cutover):",orphan.join(", "));

  if(MODE==="verify"){
    // (a0) the SNAPSHOT itself must have been rewritten to hash ids. A late apply
    //      crash (links migrated, snapshot patch failed) leaves hash links + a
    //      positional snapshot — the app keys claimed state off BOTH, so this must
    //      hard-fail, not silently pass.
    if(vehicles.length>0 && !vehicles.every(v=>hashSet.has(v.id))){
      const stale=vehicles.filter(v=>!hashSet.has(v.id)).map(v=>v.id);
      console.log(`VERIFY FAIL: snapshot ${snapId} still has ${stale.length} positional vehicle id(s): ${stale.slice(0,10).join(", ")}`);process.exit(1);
    }
    // (a) every link is a current-snapshot hash id
    const missing=links.filter(l=>!hashSet.has(l.name.split("/").pop()));
    if(missing.length){console.log(`VERIFY FAIL: ${missing.length} link(s) not a snapshot hash id: ${missing.map(l=>l.name.split("/").pop()).join(", ")}`);process.exit(1);}
    // (b) every link has an orderId, an EXISTING order doc, and that order points
    //     BACK at the link's hash id. Missing orderId / missing order doc / blank
    //     or mismatched allocatedVehicleId are ALL hard failures (no silent pass).
    let bad=0;
    for(const l of links){
      const id=l.name.split("/").pop();const oid=fv(l.fields?.orderId);
      if(!oid){bad++;console.log(`  link ${id} has no orderId`);continue;}
      const o=await getDoc(`orders/${oid}`);
      if(!o){bad++;console.log(`  link ${id} -> order ${oid} MISSING`);continue;}
      const av=fv(o.fields?.allocatedVehicleId);
      if(av!==id){bad++;console.log(`  order ${oid}.allocatedVehicleId=${av||"(blank)"} != link ${id}`);}
    }
    // (c) REVERSE direction: every ACTIVE order with a non-null allocatedVehicleId
    //     must have a vehicle_links doc at that id pointing BACK at the order.
    //     Catches a link deleted out from under a still-pointing order (a claim
    //     silently lost to a concurrent write) — invisible to the forward checks.
    //     SKIP secured orders (Received/Delivered/Secured): securing DELETES the
    //     live link by design and keeps history in securedVehicleInfo, so a secured
    //     order legitimately carries a stale allocatedVehicleId mirror with no link
    //     (e.g. the known legacy Delivered order in STATE.md). Flagging those = false
    //     positive. Mirrors the backfill's "skip inactive/secured orders" rule.
    const SECURED=new Set(["Received","Delivered","Secured"]);
    const allOrders=await listAll("orders");
    for(const o of allOrders){
      const oid=o.name.split("/").pop();const av=fv(o.fields?.allocatedVehicleId);
      if(!av)continue;
      if(SECURED.has(fv(o.fields?.status)))continue; // no live link expected for secured orders
      const lk=await getDoc(`vehicle_links/${av}`);
      if(!lk){bad++;console.log(`  active order ${oid}.allocatedVehicleId=${av} but no vehicle_links/${av} exists (claim lost)`);continue;}
      const lkOrder=fv(lk.fields?.orderId);
      if(lkOrder!==oid){bad++;console.log(`  active order ${oid} -> link ${av}, but that link belongs to order ${lkOrder}`);}
    }
    if(bad>0){console.log(`VERIFY FAIL: ${bad} link/order mismatch(es).`);process.exit(1);}
    console.log("VERIFY OK: links⇄orders consistent both directions, every link is a snapshot hash id.");
    return;
  }

  // Guard: if the snapshot already uses hash ids, the migration already ran — do
  // NOT re-map (that would key positional->hash off hash ids). Run --verify instead.
  if(vehicles.length>0 && vehicles.every(v=>hashSet.has(v.id))){console.log("Snapshot already uses hash ids — migration appears complete. Run --verify.");return;}

  // Refuse to cut over while any link doesn't map to the current snapshot. These
  // "orphan" links (positional ids absent from the latest snapshot) can't be
  // migrated by this script AND would make --verify fail (it requires every link
  // to be a snapshot hash id). A freshly-launched system should have zero; if any
  // exist, investigate/clean them before the cutover rather than silently skip.
  if(orphan.length){console.log(`\nABORT — ${orphan.length} link(s) don't map to the current snapshot (can't migrate; --verify would flag them):`);console.log("  "+orphan.join(", "));console.log("Resolve these (delete stale links or investigate), then re-run --dry-run.");process.exit(1);}

  // Only links whose positional id != hash id need migrating (pos===hid is already correct).
  const toMigrate=clean.filter(m=>m.pos!==m.hid);
  const already=clean.length-toMigrate.length;
  if(already)console.log(`${already} link(s) already hash-keyed — leaving untouched.`);

  // PRE-FLIGHT VALIDATION (read-only) — runs in BOTH dry-run and apply. Every
  // problem is a HARD failure and the whole cutover is ALL-OR-NOTHING: we refuse
  // to migrate ANY link (and refuse to rewrite the snapshot) unless EVERY mapped
  // positional link can migrate safely. A half-migrated set + a hash-rewritten
  // snapshot would orphan the un-migrated link — exactly the double-booking
  // failure this migration exists to prevent.
  const problems=[];
  for(const m of toMigrate){
    if(!m.data.orderId){problems.push(`link ${m.pos} has no orderId (dangling — clean up manually)`);continue;}
    const o=await getDoc(`orders/${m.data.orderId}`);
    if(!o){problems.push(`link ${m.pos} -> order ${m.data.orderId} MISSING (dangling — clean up manually)`);continue;}
    const ex=await getDoc(`vehicle_links/${m.hid}`);
    if(ex){const exOrder=fv(ex.fields?.orderId);if(exOrder!==m.data.orderId)problems.push(`hash link ${m.hid} already exists for a DIFFERENT order (${exOrder}), not ${m.pos}'s order (${m.data.orderId})`);}
  }
  if(problems.length){console.log(`\nABORT — ${problems.length} problem(s) block a safe cutover (NO writes made):`);problems.forEach(p=>console.log(`  - ${p}`));console.log("Resolve each, then re-run --dry-run and --apply.");process.exit(1);}

  if(MODE==="dry-run"){console.log("\nDRY-RUN — all mapped links validated safe to migrate. Sample:");toMigrate.slice(0,10).forEach(m=>console.log(`  ${m.pos} -> ${m.hid} (order ${m.data.orderId})`));console.log(`\n${toMigrate.length} link(s) would migrate. No writes. Re-run with --apply to execute.`);return;}

  // --apply  (validated above → every write below is known-safe; links FIRST, snapshot LAST)
  const backup={when:new Date().toISOString(),snapId,vehicles,links:links.map(l=>({id:l.name.split("/").pop(),data:l.fields}))};
  // Preserve the ORIGINAL (clean, pre-migration) backup across re-runs — never
  // overwrite it with already-mutated state, or the rollback artifact is lost.
  const bpath=`vehicle-links-migration-backup-${snapId}.json`;
  if(existsSync(bpath)){console.log(`Backup already exists from a prior run — preserving the original (clean) rollback artifact: ${bpath}`);}
  else{writeFileSync(bpath,JSON.stringify(backup,null,2));console.log(`Backup written: ${bpath}`);}
  // 1) migrate LINKS FIRST — the snapshot stays positional so a mid-run failure is re-runnable.
  for(const m of toMigrate){
    // TOCTOU GUARD: the link list was read once at start. Re-read LIVE state right
    // before writing. If a manager used the app mid-run (unlink/relink this vehicle),
    // the captured plan is stale — clobbering it would resurrect a stale claim and
    // delete a legitimate one. Detect any drift and ABORT (no write), rather than
    // corrupt silently. (Belt to the runbook's "quiesce all writers" braces.)
    const liveLink=await getDoc(`vehicle_links/${m.pos}`);
    if(!liveLink){console.error(`  CONCURRENT CHANGE: positional link ${m.pos} vanished mid-run (a live writer touched it). ABORTING with no further writes. Ensure NO app writers during --apply, then re-run.`);process.exit(1);}
    const liveLinkOrder=fv(liveLink.fields?.orderId);
    if(liveLinkOrder!==m.data.orderId){console.error(`  CONCURRENT CHANGE: link ${m.pos} now belongs to order ${liveLinkOrder}, not ${m.data.orderId}. ABORTING. Ensure NO app writers during --apply, then re-run.`);process.exit(1);}
    const liveOrder=await getDoc(`orders/${m.data.orderId}`);
    if(!liveOrder){console.error(`  CONCURRENT CHANGE: order ${m.data.orderId} vanished mid-run. ABORTING. Ensure NO app writers during --apply, then re-run.`);process.exit(1);}
    const liveAv=fv(liveOrder.fields?.allocatedVehicleId);
    // liveAv === m.pos  → not yet migrated (normal path).
    // liveAv === m.hid  → OUR OWN prior partial progress (a previous run patched the
    //                     order but died before deleting the positional link). This is
    //                     resumable, NOT external drift — fall through to finish it.
    // anything else      → a live writer moved this order → real drift → ABORT.
    if(liveAv!==m.pos && liveAv!==m.hid){console.error(`  CONCURRENT CHANGE: order ${m.data.orderId}.allocatedVehicleId is now ${liveAv||"(blank)"}, not ${m.pos} (nor our target ${m.hid}). ABORTING. Ensure NO app writers during --apply, then re-run.`);process.exit(1);}
    // Live state matches the plan. Recreate from the FRESH live fields (faithful
    // copy — preserves linkedAt as a Timestamp; never round-trips through
    // fv()/toFsValue() which would coerce the Timestamp to a string).
    await createDoc("vehicle_links",m.hid,liveLink.fields||{});
    // Point the order at the hash id BEFORE deleting the positional link. patchDoc
    // THROWS on failure → aborts before the delete, never leaving the order pointed
    // at a deleted vehicle id.
    await patchDoc(`orders/${m.data.orderId}`,{allocatedVehicleId:toFsValue(m.hid)},["allocatedVehicleId"]);
    await deleteDoc(`vehicle_links/${m.pos}`);
    console.log(`  migrated link ${m.pos} -> ${m.hid} (order ${m.data.orderId})`);
  }
  // 2) rewrite snapshot vehicle ids -> hash LAST (after every link is migrated).
  const newVehicles=vehicles.map(v=>({...v,id:posToHash.get(v.id)}));
  await patchDoc(`allocationSnapshots/${snapId}`,{vehicles:toFsValue(newVehicles)},["vehicles"]);
  console.log(`Snapshot ${snapId} vehicle ids rewritten to hash.`);
  console.log(`\nAPPLIED. Run with --verify to confirm zero orphans. Backup: ${bpath}`);
  console.log("NOTE: the Apps Script allocation trigger AND all live app writers (managers) MUST have been quiesced for this run. If an email ingested OR a manager relinked mid-cutover, restore from the backup JSON and re-run the full cutover.");
})().catch(e=>{console.error("ERROR:",e.message);process.exit(1);});
