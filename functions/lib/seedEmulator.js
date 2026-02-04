"use strict";
/**
 * Seed Emulator with Test Data
 *
 * Run with: npx ts-node src/seedEmulator.ts
 *
 * Creates test users and a club for local testing.
 * Only works when connected to the Firebase Emulator.
 *
 * @version 07.57
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
// Connect to emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
// Initialize Firebase Admin
admin.initializeApp({
    projectId: 'pickleball-app-dev',
});
const db = admin.firestore();
const auth = admin.auth();
// Generate test users: 1 organizer + 12 players
function generateTestUsers() {
    const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'Tom', 'Emily', 'Chris', 'Lisa', 'David', 'Anna', 'James', 'Kate'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Moore', 'White'];
    const users = [];
    // First user is always an organizer
    users.push({
        email: 'organizer@test.com',
        password: 'test123',
        displayName: 'Test Organizer',
        role: 'organizer',
    });
    // Generate 12 players
    for (let i = 0; i < 12; i++) {
        users.push({
            email: `player${i + 1}@test.com`,
            password: 'test123',
            displayName: `${firstNames[i]} ${lastNames[i]}`,
            role: 'player',
        });
    }
    return users;
}
async function seedUsers(users) {
    console.log(`\n Creating ${users.length} test users...`);
    const userIds = [];
    for (const user of users) {
        try {
            // Create Auth user
            const authUser = await auth.createUser({
                email: user.email,
                password: user.password,
                displayName: user.displayName,
                emailVerified: true,
            });
            // Create Firestore profile
            await db.collection('users').doc(authUser.uid).set({
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                skillLevel: Math.random() > 0.5 ? 'intermediate' : 'advanced',
                location: 'Christchurch, NZ',
            });
            userIds.push(authUser.uid);
            console.log(`  ✓ Created: ${user.email} (${user.role})`);
        }
        catch (error) {
            if (error.code === 'auth/email-already-exists') {
                console.log(`  - Skipped: ${user.email} (already exists)`);
                // Get existing user ID
                const existingUser = await auth.getUserByEmail(user.email);
                userIds.push(existingUser.uid);
            }
            else {
                console.error(`  ✗ Failed: ${user.email}`, error.message);
            }
        }
    }
    return userIds;
}
async function seedClub(organizerId) {
    console.log('\n Creating test club...');
    const clubRef = db.collection('clubs').doc();
    await clubRef.set({
        name: 'Test Pickleball Club',
        description: 'A club for testing Weekly Meetups',
        location: 'Christchurch, NZ',
        ownerId: organizerId,
        createdByUserId: organizerId,
        members: [organizerId],
        admins: [organizerId],
        stripeAccountId: 'acct_test123', // Fake Stripe account for testing
        stripeAccountStatus: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Also add to members subcollection
    await clubRef.collection('members').doc(organizerId).set({
        userId: organizerId,
        role: 'owner',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ Created club: ${clubRef.id}`);
    return clubRef.id;
}
async function main() {
    console.log('='.repeat(50));
    console.log(' FIREBASE EMULATOR SEED SCRIPT (Simple)');
    console.log('='.repeat(50));
    console.log('\nConnecting to emulators:');
    console.log('  - Firestore: 127.0.0.1:8080');
    console.log('  - Auth: 127.0.0.1:9099');
    try {
        // Generate and seed users (1 organizer + 12 players)
        const testUsers = generateTestUsers();
        const userIds = await seedUsers(testUsers);
        // Get organizer ID (first user)
        const organizerId = userIds[0];
        // Seed club for the organizer
        await seedClub(organizerId);
        console.log('\n' + '='.repeat(50));
        console.log(' SEED COMPLETE!');
        console.log('='.repeat(50));
        console.log('\nTest Credentials:');
        console.log('  Organizer: organizer@test.com / test123');
        console.log('  Players:   player1@test.com ... player12@test.com / test123');
        console.log('\nNext Steps:');
        console.log('  1. Login as organizer@test.com');
        console.log('  2. Go to the club and create a Weekly Meetup');
        console.log('  3. Login as player1@test.com to test registration');
        console.log('\nView data at: http://127.0.0.1:4000');
    }
    catch (error) {
        console.error('\nSeed failed:', error);
        process.exit(1);
    }
    process.exit(0);
}
main();
//# sourceMappingURL=seedEmulator.js.map