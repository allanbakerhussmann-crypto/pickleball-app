/**
 * Quick script to call seed functions on the deployed TEST project
 * Usage: node callSeed.js [clear|seed|both]
 */

const admin = require('firebase-admin');

// Initialize with test project
admin.initializeApp({
  projectId: 'pickleball-app-test',
});

const db = admin.firestore();
const auth = admin.auth();

async function clearTestData() {
  console.log('🗑️  Clearing test data...');
  let deletedUsers = 0;
  let deletedClubs = 0;

  // Delete admin
  try {
    const adminUser = await auth.getUserByEmail('admin@test.com');
    await auth.deleteUser(adminUser.uid);
    await db.collection('users').doc(adminUser.uid).delete();
    deletedUsers++;
    console.log('  ✓ Deleted admin@test.com');
  } catch (e) {}

  // Delete organizers
  for (let i = 1; i <= 5; i++) {
    try {
      const user = await auth.getUserByEmail(`organizer${i}@test.com`);
      await auth.deleteUser(user.uid);
      await db.collection('users').doc(user.uid).delete();
      deletedUsers++;
      console.log(`  ✓ Deleted organizer${i}@test.com`);
    } catch (e) {}
  }

  // Delete players
  for (let i = 1; i <= 40; i++) {
    try {
      const user = await auth.getUserByEmail(`player${i}@test.com`);
      await auth.deleteUser(user.uid);
      await db.collection('users').doc(user.uid).delete();
      deletedUsers++;
    } catch (e) {}
  }
  console.log(`  ✓ Deleted ${deletedUsers} users`);

  // Delete test clubs
  const clubNames = [
    'Christchurch Pickleball Club',
    'Auckland Central Pickleball',
    'Wellington Smashers',
    'Hamilton Pickleball Association',
    'Dunedin Dinks',
  ];
  for (const name of clubNames) {
    const snap = await db.collection('clubs').where('name', '==', name).get();
    for (const doc of snap.docs) {
      // Delete subcollections
      const members = await doc.ref.collection('members').get();
      for (const m of members.docs) await m.ref.delete();
      const courts = await doc.ref.collection('courts').get();
      for (const c of courts.docs) await c.ref.delete();
      await doc.ref.delete();
      deletedClubs++;
    }
  }
  console.log(`  ✓ Deleted ${deletedClubs} clubs`);
  console.log('✅ Clear complete!');
}

async function seedTestData() {
  console.log('🌱 Seeding test data...');

  // Create admin
  console.log('\n👑 Creating admin...');
  try {
    const adminAuth = await auth.createUser({
      email: 'admin@test.com',
      password: 'test123',
      displayName: 'Test Admin',
      emailVerified: true,
    });
    await db.collection('users').doc(adminAuth.uid).set({
      email: 'admin@test.com',
      displayName: 'Test Admin',
      roles: ['player', 'organizer', 'app_admin'],
      isAppAdmin: true,
      location: 'Auckland, NZ',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✓ Created admin@test.com');
  } catch (e) {
    console.log('  - admin@test.com already exists or error:', e.message);
  }

  // Create 5 organizers
  console.log('\n📋 Creating organizers...');
  const organizerNames = ['Rachel Organizer', 'Tom Director', 'Lisa Manager', 'Mark Coordinator', 'Anna Admin'];
  const locations = ['Christchurch, NZ', 'Auckland, NZ', 'Wellington, NZ', 'Hamilton, NZ', 'Dunedin, NZ'];
  const organizerIds = [];

  for (let i = 0; i < 5; i++) {
    try {
      const userAuth = await auth.createUser({
        email: `organizer${i + 1}@test.com`,
        password: 'test123',
        displayName: organizerNames[i],
        emailVerified: true,
      });
      await db.collection('users').doc(userAuth.uid).set({
        email: `organizer${i + 1}@test.com`,
        displayName: organizerNames[i],
        roles: ['player', 'organizer'],
        location: locations[i],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      organizerIds.push(userAuth.uid);
      console.log(`  ✓ Created organizer${i + 1}@test.com`);
    } catch (e) {
      console.log(`  - organizer${i + 1}@test.com already exists`);
      try {
        const existing = await auth.getUserByEmail(`organizer${i + 1}@test.com`);
        organizerIds.push(existing.uid);
      } catch (e2) {}
    }
  }

  // Create 40 players
  console.log('\n👥 Creating 40 players...');
  for (let i = 1; i <= 40; i++) {
    try {
      const userAuth = await auth.createUser({
        email: `player${i}@test.com`,
        password: 'test123',
        displayName: `Test Player ${i}`,
        emailVerified: true,
      });
      await db.collection('users').doc(userAuth.uid).set({
        email: `player${i}@test.com`,
        displayName: `Test Player ${i}`,
        roles: ['player'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {}
  }
  console.log('  ✓ Created 40 players');

  // Create clubs
  console.log('\n🏢 Creating clubs...');
  const clubs = [
    { name: 'Christchurch Pickleball Club', location: 'Christchurch, NZ', courts: 4 },
    { name: 'Auckland Central Pickleball', location: 'Auckland, NZ', courts: 6 },
    { name: 'Wellington Smashers', location: 'Wellington, NZ', courts: 3 },
    { name: 'Hamilton Pickleball Association', location: 'Hamilton, NZ', courts: 4 },
    { name: 'Dunedin Dinks', location: 'Dunedin, NZ', courts: 2 },
  ];

  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    const ownerId = organizerIds[i];
    if (!ownerId) continue;

    const existing = await db.collection('clubs').where('name', '==', club.name).limit(1).get();
    if (!existing.empty) {
      console.log(`  - ${club.name} already exists`);
      continue;
    }

    const clubRef = db.collection('clubs').doc();
    await clubRef.set({
      name: club.name,
      location: club.location,
      ownerId,
      createdByUserId: ownerId,
      members: [ownerId],
      admins: [ownerId],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await clubRef.collection('members').doc(ownerId).set({
      userId: ownerId,
      role: 'owner',
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    for (let c = 1; c <= club.courts; c++) {
      await clubRef.collection('courts').doc().set({
        name: `Court ${c}`,
        surface: c <= 2 ? 'indoor' : 'outdoor',
        hourlyRate: c <= 2 ? 15 : 10,
        isActive: true,
      });
    }
    console.log(`  ✓ Created ${club.name}`);
  }

  console.log('\n✅ Seed complete!');
  console.log('\nCredentials:');
  console.log('  admin@test.com / test123');
  console.log('  organizer1@test.com ... organizer5@test.com / test123');
  console.log('  player1@test.com ... player40@test.com / test123');
}

async function main() {
  const action = process.argv[2] || 'both';

  try {
    if (action === 'clear' || action === 'both') {
      await clearTestData();
    }
    if (action === 'seed' || action === 'both') {
      await seedTestData();
    }
  } catch (err) {
    console.error('Error:', err);
  }

  process.exit(0);
}

main();
