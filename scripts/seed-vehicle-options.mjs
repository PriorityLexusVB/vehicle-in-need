#!/usr/bin/env node

/**
 * Seed Default Vehicle Options
 * 
 * This script seeds the Firestore database with default vehicle option codes.
 * These are common Lexus options that will be available in dropdowns when
 * creating vehicle orders.
 * 
 * Usage:
 *   node scripts/seed-vehicle-options.mjs --project <project-id> [--dry-run]
 * 
 * Options:
 *   --project <id>  Firebase project ID (required)
 *   --dry-run       Show what would be added without making changes
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Parse command line arguments
const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const isDryRun = args.includes('--dry-run');

if (projectIndex === -1 || !args[projectIndex + 1]) {
  console.error('Error: --project <project-id> is required');
  console.log('\nUsage:');
  console.log('  node scripts/seed-vehicle-options.mjs --project <project-id> [--dry-run]');
  process.exit(1);
}

const projectId = args[projectIndex + 1];

// Default vehicle options to seed
const defaultOptions = [
  // Exterior Options
  { code: 'PW01', name: 'Premium Wheel Package', type: 'exterior' },
  { code: 'SPW1', name: 'Sport Wheel Package', type: 'exterior' },
  { code: 'CF01', name: 'Carbon Fiber Package', type: 'exterior' },
  { code: 'PAIN', name: 'Premium Paint', type: 'exterior' },
  { code: 'ROOF', name: 'Panoramic Roof', type: 'exterior' },
  { code: 'SPOR', name: 'Sport Package', type: 'exterior' },
  { code: 'TOWH', name: 'Tow Hitch', type: 'exterior' },
  { code: 'CHRM', name: 'Chrome Package', type: 'exterior' },
  
  // Interior Options
  { code: 'LA40', name: 'Leather Package - Black', type: 'interior' },
  { code: 'LA41', name: 'Leather Package - Tan', type: 'interior' },
  { code: 'LA42', name: 'Leather Package - Gray', type: 'interior' },
  { code: 'PREM', name: 'Premium Interior Package', type: 'interior' },
  { code: 'NAV1', name: 'Navigation System', type: 'interior' },
  { code: 'MARK', name: 'Mark Levinson Audio', type: 'interior' },
  { code: 'HEAD', name: 'Head-Up Display', type: 'interior' },
  { code: 'HEAT', name: 'Heated/Ventilated Seats', type: 'interior' },
  { code: 'MASS', name: 'Massage Seats', type: 'interior' },
  { code: 'WOOD', name: 'Wood Trim Package', type: 'interior' },
];

// Initialize Firebase Admin
console.log(`Initializing Firebase for project: ${projectId}`);
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'APPLY CHANGES'}`);
console.log('');

try {
  initializeApp({
    projectId: projectId,
  });
} catch (error) {
  console.error('Error initializing Firebase:', error.message);
  process.exit(1);
}

const db = getFirestore();

async function seedVehicleOptions() {
  console.log('Starting vehicle options seed...\n');
  
  // Check existing options
  const existingOptions = await db.collection('vehicleOptions').get();
  const existingCodes = new Map();
  
  existingOptions.forEach(doc => {
    const data = doc.data();
    existingCodes.set(`${data.type}-${data.code}`, doc.id);
  });
  
  console.log(`Found ${existingOptions.size} existing options in database`);
  console.log('');
  
  let addedCount = 0;
  let skippedCount = 0;
  
  for (const option of defaultOptions) {
    const key = `${option.type}-${option.code}`;
    
    if (existingCodes.has(key)) {
      console.log(`⏭️  SKIP: ${option.code} (${option.name}) - already exists`);
      skippedCount++;
      continue;
    }
    
    if (isDryRun) {
      console.log(`✓ WOULD ADD: ${option.code} (${option.name}) - ${option.type}`);
      addedCount++;
    } else {
      try {
        await db.collection('vehicleOptions').add({
          code: option.code,
          name: option.name,
          type: option.type,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`✓ ADDED: ${option.code} (${option.name}) - ${option.type}`);
        addedCount++;
      } catch (error) {
        console.error(`✗ ERROR adding ${option.code}:`, error.message);
      }
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('Summary:');
  console.log(`  Total options to seed: ${defaultOptions.length}`);
  console.log(`  ${isDryRun ? 'Would add' : 'Added'}: ${addedCount}`);
  console.log(`  Skipped (already exist): ${skippedCount}`);
  console.log('═══════════════════════════════════════');
  
  if (isDryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Vehicle options seeded successfully!');
  }
}

// Run the seed
seedVehicleOptions()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
