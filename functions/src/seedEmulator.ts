/**
 * Seed Emulator with Test Data
 *
 * Run with: npx ts-node src/seedEmulator.ts
 *
 * Creates test users, clubs, and standing meetups for local testing.
 * Only works when connected to the Firebase Emulator.
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

// Generate test users
function generateTestUsers(count: number): TestUser[] {
  const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'Tom', 'Emily', 'Chris', 'Lisa', 'David', 'Anna'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor'];

  const users: TestUser[] = [];

  // First user is always an organizer
  users.push({
    email: 'organizer@test.com',
    password: 'test123',
    displayName: 'Test Organizer',
    role: 'organizer',
  });

  // Second user is an admin
  users.push({
    email: 'admin@test.com',
    password: 'test123',
    displayName: 'Test Admin',
    role: 'app_admin',
  });

  // Generate remaining players
  for (let i = 0; i < count - 2; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    users.push({
      email: `player${i + 1}@test.com`,
      password: 'test123',
      displayName: `${firstName} ${lastName}`,
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
    description: 'A club for testing the Standing Meetup feature',
    location: 'Christchurch, NZ',
    ownerId: organizerId,
    stripeAccountId: 'acct_test123', // Fake Stripe account for testing
    stripeAccountStatus: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Add organizer as club member
  await clubRef.collection('members').doc(organizerId).set({
    userId: organizerId,
    role: 'owner',
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`  ✓ Created club: ${clubRef.id}`);
  return clubRef.id;
}

async function seedStandingMeetup(clubId: string, organizerId: string): Promise<string> {
  console.log('\n Creating test standing meetup...');

  // Calculate next Monday
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(18, 0, 0, 0);

  const meetupRef = db.collection('standingMeetups').doc();
  await meetupRef.set({
    name: 'Monday Night Pickleball',
    description: 'Weekly competitive play every Monday evening',
    clubId: clubId,
    organizerId: organizerId,
    recurrence: 'weekly',
    dayOfWeek: 1, // Monday
    startTime: '18:00',
    endTime: '20:00',
    timezone: 'Pacific/Auckland',
    venue: {
      name: 'Test Sports Centre',
      address: '123 Test Street, Christchurch',
    },
    capacity: 16,
    pricing: {
      type: 'subscription',
      weeklyAmount: 1500, // $15.00 NZD
      currency: 'nzd',
    },
    stripePriceId: 'price_test123', // Fake Stripe price for testing
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    nextOccurrence: admin.firestore.Timestamp.fromDate(nextMonday),
  });

  console.log(`  ✓ Created standing meetup: ${meetupRef.id}`);
  return meetupRef.id;
}

async function main() {
  console.log('='.repeat(50));
  console.log(' FIREBASE EMULATOR SEED SCRIPT');
  console.log('='.repeat(50));
  console.log('\nConnecting to emulators:');
  console.log('  - Firestore: 127.0.0.1:8080');
  console.log('  - Auth: 127.0.0.1:9099');

  try {
    // Generate and seed users
    const testUsers = generateTestUsers(20);
    const userIds = await seedUsers(testUsers);

    // Get organizer ID (first user)
    const organizerId = userIds[0];

    // Seed club
    const clubId = await seedClub(organizerId);

    // Seed standing meetup
    await seedStandingMeetup(clubId, organizerId);

    console.log('\n' + '='.repeat(50));
    console.log(' SEED COMPLETE!');
    console.log('='.repeat(50));
    console.log('\nTest Credentials:');
    console.log('  Organizer: organizer@test.com / test123');
    console.log('  Admin: admin@test.com / test123');
    console.log('  Players: player1@test.com ... player18@test.com / test123');
    console.log('\nView data at: http://127.0.0.1:4000');

  } catch (error) {
    console.error('\nSeed failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
