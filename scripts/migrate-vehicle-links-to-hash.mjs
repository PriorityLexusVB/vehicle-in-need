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
 */
import { writeFileSync } from "node:fs";

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
async function createDoc(coll,id,fields){const r=await fetch(`${BASE}/${coll}?documentId=${encodeURIComponent(id)}`,{method:"POST",headers:H,body:JSON.stringify({fields})});if(!r.ok)throw new Error(`create ${coll}/${id} ${r.status}: ${await r.text()}`);return r.json();}
async function deleteDoc(path){const r=await fetch(`${BASE}/${path}`,{method:"DELETE",headers:H});if(!r.ok)throw new Error(`delete ${path} ${r.status}: ${await r.text()}`);}

(async()=>{
  const q=await runQuery({structuredQuery:{from:[{collectionId:"allocationSnapshots"}],where:{fieldFilter:{field:{fieldPath:"isLatest"},op:"EQUAL",value:{booleanValue:true}}},orderBy:[{field:{fieldPath:"publishedAt"},direction:"DESCENDING"}],limit:1}});
  const snap=q.find(x=>x.document)?.document;
  if(!snap){console.log("No latest snapshot — nothing to migrate.");return;}
  const snapId=snap.name.split("/").pop();
  const vehicles=fv(snap.fields.vehicles)||[];
  const counts=new Map(),posToHash=new Map(),hashSet=new Set();
  for(const v of vehicles){const b=buildBase(v);const n=(counts.get(b)||0)+1;counts.set(b,n);const hid=`${b}-U${String(n).padStart(2,"0")}`;hashSet.add(hid);posToHash.set(v.id,hid);}
  const links=await listAll("vehicle_links");
  const clean=[],orphan=[];
  for(const l of links){const pos=l.name.split("/").pop();const hid=posToHash.get(pos);if(hid)clean.push({pos,hid,data:Object.fromEntries(Object.entries(l.fields||{}).map(([k,x])=>[k,fv(x)]))});else orphan.push(pos);}
  console.log(`Snapshot ${snapId}: ${vehicles.length} vehicles. Links: ${links.length} (${clean.length} map to hash, ${orphan.length} already-orphan).`);
  if(orphan.length)console.log("Already-orphan links (not in current snapshot — left as-is):",orphan.join(", "));

  if(MODE==="verify"){
    const missing=links.filter(l=>!hashSet.has(l.name.split("/").pop()));
    console.log(missing.length===0?"VERIFY OK: every vehicle_links id is a hash id in the current snapshot.":`VERIFY FAIL: ${missing.length} links not in snapshot hash set: ${missing.map(l=>l.name.split("/").pop()).join(", ")}`);
    return;
  }
  if(MODE==="dry-run"){console.log("\nDRY-RUN sample:");clean.slice(0,10).forEach(m=>console.log(`  ${m.pos} -> ${m.hid} (order ${m.data.orderId})`));console.log("\nNo writes. Re-run with --apply to execute.");return;}

  // --apply
  const backup={when:new Date().toISOString(),snapId,vehicles,links:links.map(l=>({id:l.name.split("/").pop(),data:l.fields}))};
  const bpath=`vehicle-links-migration-backup-${snapId}.json`;writeFileSync(bpath,JSON.stringify(backup,null,2));console.log(`Backup written: ${bpath}`);
  // 1) rewrite snapshot vehicle ids -> hash
  const newVehicles=vehicles.map(v=>({...v,id:posToHash.get(v.id)}));
  await patchDoc(`allocationSnapshots/${snapId}`,{vehicles:toFsValue(newVehicles)},["vehicles"]);
  console.log(`Snapshot ${snapId} vehicle ids rewritten to hash.`);
  // 2) recreate links under hash id + delete positional; update order.allocatedVehicleId
  for(const m of clean){
    await createDoc("vehicle_links",m.hid,{orderId:toFsValue(m.data.orderId),linkedAt:toFsValue(m.data.linkedAt),linkedByUid:toFsValue(m.data.linkedByUid)});
    await deleteDoc(`vehicle_links/${m.pos}`);
    if(m.data.orderId)await patchDoc(`orders/${m.data.orderId}`,{allocatedVehicleId:toFsValue(m.hid)},["allocatedVehicleId"]).catch(e=>console.warn(`  order ${m.data.orderId} patch skipped: ${e.message}`));
    console.log(`  migrated link ${m.pos} -> ${m.hid} (order ${m.data.orderId})`);
  }
  console.log(`\nAPPLIED. Run with --verify to confirm zero orphans. Backup: ${bpath}`);
})().catch(e=>{console.error("ERROR:",e.message);process.exit(1);});
