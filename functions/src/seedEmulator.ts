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

import * as admin from 'firebase-admin';

// Connect to emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// Initialize Firebase Admin
admin.initializeApp({
  projectId: 'pickleball-app-dev',
});

const db = admin.firestore();
const auth = admin.auth();

interface TestUser {
  email: string;
  password: string;
  displayName: string;
  role: 'player' | 'organizer' | 'app_admin';
}

// Generate test users: 1 organizer + 12 players
function generateTestUsers(): TestUser[] {
  const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'Tom', 'Emily', 'Chris', 'Lisa', 'David', 'Anna', 'James', 'Kate'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Moore', 'White'];

  const users: TestUser[] = [];

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

async function seedUsers(users: TestUser[]): Promise<string[]> {
  console.log(`\n Creating ${users.length} test users...`);
  const userIds: string[] = [];

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
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        console.log(`  - Skipped: ${user.email} (already exists)`);
        // Get existing user ID
        const existingUser = await auth.getUserByEmail(user.email);
        userIds.push(existingUser.uid);
      } else {
        console.error(`  ✗ Failed: ${user.email}`, error.message);
      }
    }
  }

  return userIds;
}

async function seedClub(organizerId: string): Promise<string> {
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

  } catch (error) {
    console.error('\nSeed failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
