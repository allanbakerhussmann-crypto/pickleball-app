"use strict";
/**
 * Seed SMS Bundles Script
 *
 * Run this once to populate the sms_bundles collection with default bundles.
 *
 * Usage: npx ts-node src/seedSMSBundles.ts
 *
 * FILE LOCATION: functions/src/seedSMSBundles.ts
 * VERSION: 07.19
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin with default credentials
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const DEFAULT_SMS_BUNDLES = [
    {
        name: 'Starter Pack',
        description: '50 SMS credits - great for small tournaments',
        credits: 50,
        priceNZD: 1000, // $10.00
        isActive: true,
        sortOrder: 1,
    },
    {
        name: 'Pro Pack',
        description: '200 SMS credits - best value for regular organizers',
        credits: 200,
        priceNZD: 3500, // $35.00
        isActive: true,
        sortOrder: 2,
    },
    {
        name: 'Enterprise Pack',
        description: '500 SMS credits - for high-volume events',
        credits: 500,
        priceNZD: 7500, // $75.00
        isActive: true,
        sortOrder: 3,
    },
];
async function seedSMSBundles() {
    console.log('🌱 Seeding SMS Bundles...\n');
    const now = Date.now();
    const bundlesRef = db.collection('sms_bundles');
    // Check if bundles already exist
    const existingBundles = await bundlesRef.get();
    if (!existingBundles.empty) {
        console.log(`⚠️  Found ${existingBundles.size} existing bundles.`);
        console.log('   Existing bundles:');
        existingBundles.docs.forEach(doc => {
            const data = doc.data();
            console.log(`   - ${data.name}: ${data.credits} credits for $${(data.priceNZD / 100).toFixed(2)}`);
        });
        console.log('\n   Skipping seed to avoid duplicates.');
        console.log('   Delete existing bundles first if you want to re-seed.\n');
        return;
    }
    // Seed bundles
    const batch = db.batch();
    for (const bundle of DEFAULT_SMS_BUNDLES) {
        const docRef = bundlesRef.doc();
        const fullBundle = Object.assign(Object.assign({}, bundle), { createdAt: now, updatedAt: now });
        batch.set(docRef, fullBundle);
        console.log(`📦 Adding: ${bundle.name}`);
        console.log(`   Credits: ${bundle.credits}`);
        console.log(`   Price: $${(bundle.priceNZD / 100).toFixed(2)} NZD`);
        console.log(`   Per SMS: $${(bundle.priceNZD / bundle.credits / 100).toFixed(3)}`);
        console.log('');
    }
    await batch.commit();
    console.log('✅ SMS Bundles seeded successfully!\n');
    console.log('Summary:');
    console.log('─────────────────────────────────────');
    console.log('| Bundle          | Credits | Price  |');
    console.log('─────────────────────────────────────');
    DEFAULT_SMS_BUNDLES.forEach(b => {
        const name = b.name.padEnd(15);
        const credits = String(b.credits).padStart(7);
        const price = `$${(b.priceNZD / 100).toFixed(2)}`.padStart(6);
        console.log(`| ${name} | ${credits} | ${price} |`);
    });
    console.log('─────────────────────────────────────\n');
}
// Run the seed
seedSMSBundles()
    .then(() => {
    console.log('Done!');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Error seeding bundles:', error);
    process.exit(1);
});
//# sourceMappingURL=seedSMSBundles.js.map