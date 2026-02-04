"use strict";
/**
 * Seed Test Data - Cloud Function
 *
 * Creates test users, clubs, and courts for the TEST environment only.
 * SAFETY: Will refuse to run on production project.
 *
 * Usage: Call seed_testData from the app or Firebase Console
 *
 * @version 07.57
 * FILE LOCATION: functions/src/seedTestData.ts
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
exports.seed_clearTestData = exports.seed_testData = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const envGuard_1 = require("./envGuard");
const db = admin.firestore();
const auth = admin.auth();
// ============================================
// TEST DATA CONFIGURATION
// ============================================
// 40 unique first names (mix of male/female)
const FIRST_NAMES = [
    'James', 'Sarah', 'Michael', 'Emma', 'David', 'Olivia', 'Daniel', 'Sophia',
    'Matthew', 'Isabella', 'Andrew', 'Mia', 'Joshua', 'Charlotte', 'Ethan', 'Amelia',
    'Christopher', 'Harper', 'Joseph', 'Evelyn', 'William', 'Abigail', 'Ryan', 'Emily',
    'Nathan', 'Elizabeth', 'Brandon', 'Sofia', 'Tyler', 'Avery', 'Kevin', 'Ella',
    'Justin', 'Scarlett', 'Aaron', 'Grace', 'Adam', 'Chloe', 'Benjamin', 'Victoria',
];
// 40 unique last names
const LAST_NAMES = [
    'Anderson', 'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis',
    'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright',
    'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson',
    'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker',
    'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed',
];
// 5 Organizer names
const ORGANIZER_NAMES = [
    'Rachel Organizer',
    'Tom Director',
    'Lisa Manager',
    'Mark Coordinator',
    'Anna Admin',
];
// 5 Clubs with details
const CLUBS = [
    {
        name: 'Christchurch Pickleball Club',
        location: 'Christchurch, NZ',
        description: 'The premier pickleball club in Canterbury, offering competitive and social play for all skill levels.',
        courts: [
            { name: 'Court 1', surface: 'indoor', hourlyRate: 15 },
            { name: 'Court 2', surface: 'indoor', hourlyRate: 15 },
            { name: 'Court 3', surface: 'outdoor', hourlyRate: 10 },
            { name: 'Court 4', surface: 'outdoor', hourlyRate: 10 },
        ],
    },
    {
        name: 'Auckland Central Pickleball',
        location: 'Auckland, NZ',
        description: 'Auckland\'s largest pickleball community with state-of-the-art facilities in the heart of the city.',
        courts: [
            { name: 'Main Court 1', surface: 'indoor', hourlyRate: 20 },
            { name: 'Main Court 2', surface: 'indoor', hourlyRate: 20 },
            { name: 'Main Court 3', surface: 'indoor', hourlyRate: 20 },
            { name: 'Outdoor A', surface: 'outdoor', hourlyRate: 12 },
            { name: 'Outdoor B', surface: 'outdoor', hourlyRate: 12 },
            { name: 'Outdoor C', surface: 'outdoor', hourlyRate: 12 },
        ],
    },
    {
        name: 'Wellington Smashers',
        location: 'Wellington, NZ',
        description: 'A vibrant pickleball community in the capital, known for competitive leagues and friendly atmosphere.',
        courts: [
            { name: 'Arena Court 1', surface: 'indoor', hourlyRate: 18 },
            { name: 'Arena Court 2', surface: 'indoor', hourlyRate: 18 },
            { name: 'Practice Court', surface: 'indoor', hourlyRate: 12 },
        ],
    },
    {
        name: 'Hamilton Pickleball Association',
        location: 'Hamilton, NZ',
        description: 'Serving the Waikato region with quality pickleball facilities and regular tournaments.',
        courts: [
            { name: 'Court A', surface: 'indoor', hourlyRate: 14 },
            { name: 'Court B', surface: 'indoor', hourlyRate: 14 },
            { name: 'Court C', surface: 'outdoor', hourlyRate: 8 },
            { name: 'Court D', surface: 'outdoor', hourlyRate: 8 },
        ],
    },
    {
        name: 'Dunedin Dinks',
        location: 'Dunedin, NZ',
        description: 'The friendly southern pickleball club, welcoming players of all ages and abilities.',
        courts: [
            { name: 'Indoor 1', surface: 'indoor', hourlyRate: 12 },
            { name: 'Indoor 2', surface: 'indoor', hourlyRate: 12 },
        ],
    },
];
// NZ Cities for player locations
const NZ_CITIES = [
    'Auckland, NZ', 'Wellington, NZ', 'Christchurch, NZ', 'Hamilton, NZ',
    'Tauranga, NZ', 'Dunedin, NZ', 'Palmerston North, NZ', 'Napier, NZ',
    'Nelson, NZ', 'Rotorua, NZ', 'New Plymouth, NZ', 'Whangarei, NZ',
];
// ============================================
// HELPER FUNCTIONS
// ============================================
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomFloat(min, max, decimals = 2) {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(decimals));
}
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function generateAge() {
    // Pickleball players range from 18 to 75, with a bell curve around 45-55
    const ranges = [
        { min: 18, max: 25, weight: 10 },
        { min: 26, max: 35, weight: 15 },
        { min: 36, max: 45, weight: 20 },
        { min: 46, max: 55, weight: 25 },
        { min: 56, max: 65, weight: 20 },
        { min: 66, max: 75, weight: 10 },
    ];
    const totalWeight = ranges.reduce((sum, r) => sum + r.weight, 0);
    let random = Math.random() * totalWeight;
    for (const range of ranges) {
        random -= range.weight;
        if (random <= 0) {
            return randomInt(range.min, range.max);
        }
    }
    return randomInt(45, 55);
}
function generateSkillLevel() {
    const rand = Math.random();
    if (rand < 0.25)
        return 'beginner';
    if (rand < 0.70)
        return 'intermediate';
    return 'advanced';
}
function generateDuprRating(skillLevel) {
    switch (skillLevel) {
        case 'beginner':
            return randomFloat(2.5, 3.5, 2);
        case 'intermediate':
            return randomFloat(3.5, 4.5, 2);
        case 'advanced':
            return randomFloat(4.5, 5.5, 2);
        default:
            return randomFloat(3.0, 4.5, 2);
    }
}
async function createUser(email, displayName, role, extraData = {}) {
    try {
        // Check if user already exists
        try {
            const existingUser = await auth.getUserByEmail(email);
            console.log(`  - User exists: ${email}`);
            return {
                id: existingUser.uid,
                email,
                displayName,
                role,
            };
        }
        catch (e) {
            if (e.code !== 'auth/user-not-found') {
                throw e;
            }
        }
        // Create Auth user
        const authUser = await auth.createUser({
            email,
            password: 'test123',
            displayName,
            emailVerified: true,
        });
        // Create Firestore profile
        // Use roles ARRAY (not singular 'role') to match AuthContext pattern
        let roles;
        if (role === 'app_admin') {
            roles = ['player', 'organizer', 'app_admin'];
        }
        else if (role === 'organizer') {
            roles = ['player', 'organizer'];
        }
        else {
            roles = ['player'];
        }
        await db.collection('users').doc(authUser.uid).set(Object.assign({ email,
            displayName,
            roles, createdAt: admin.firestore.FieldValue.serverTimestamp() }, extraData));
        console.log(`  ✓ Created: ${email} (${role})`);
        return {
            id: authUser.uid,
            email,
            displayName,
            role,
        };
    }
    catch (error) {
        console.error(`  ✗ Failed: ${email}`, error.message);
        return null;
    }
}
async function seedAdmin() {
    console.log('\n👑 Creating app admin...');
    const admin = await createUser('admin@test.com', 'Test Admin', 'app_admin', {
        location: 'Auckland, NZ',
        skillLevel: 'advanced',
        duprDoublesRating: 4.5,
        duprSinglesRating: 4.5,
        age: 35,
        isAppAdmin: true, // Legacy field some components check
    });
    return admin;
}
async function seedOrganizers() {
    console.log('\n📋 Creating 5 organizers...');
    const organizers = [];
    for (let i = 0; i < 5; i++) {
        const user = await createUser(`organizer${i + 1}@test.com`, ORGANIZER_NAMES[i], 'organizer', {
            location: CLUBS[i].location,
            skillLevel: 'advanced',
            duprDoublesRating: randomFloat(4.0, 5.0, 2),
            duprSinglesRating: randomFloat(4.0, 5.0, 2),
            age: generateAge(),
        });
        if (user)
            organizers.push(user);
    }
    return organizers;
}
async function seedPlayers() {
    console.log('\n👥 Creating 40 players...');
    const players = [];
    for (let i = 0; i < 40; i++) {
        const firstName = FIRST_NAMES[i];
        const lastName = LAST_NAMES[i];
        const displayName = `${firstName} ${lastName}`;
        const skillLevel = generateSkillLevel();
        const age = generateAge();
        const user = await createUser(`player${i + 1}@test.com`, displayName, 'player', {
            location: randomChoice(NZ_CITIES),
            skillLevel,
            duprDoublesRating: generateDuprRating(skillLevel),
            duprSinglesRating: generateDuprRating(skillLevel),
            age,
            bio: `Hi, I'm ${firstName}! ${age} years old, ${skillLevel} player from ${randomChoice(NZ_CITIES).split(',')[0]}.`,
        });
        if (user)
            players.push(user);
    }
    return players;
}
async function seedClubs(organizers) {
    console.log('\n🏢 Creating 5 clubs with courts...');
    const clubs = [];
    for (let i = 0; i < CLUBS.length; i++) {
        const clubData = CLUBS[i];
        const organizer = organizers[i];
        if (!organizer) {
            console.log(`  ✗ Skipping club ${clubData.name} - no organizer`);
            continue;
        }
        try {
            // Check if club already exists by name
            const existingClub = await db.collection('clubs')
                .where('name', '==', clubData.name)
                .limit(1)
                .get();
            if (!existingClub.empty) {
                console.log(`  - Club exists: ${clubData.name}`);
                const clubDoc = existingClub.docs[0];
                clubs.push({
                    id: clubDoc.id,
                    name: clubData.name,
                    ownerId: organizer.id,
                });
                continue;
            }
            // Create the club
            const clubRef = db.collection('clubs').doc();
            await clubRef.set({
                name: clubData.name,
                description: clubData.description,
                location: clubData.location,
                ownerId: organizer.id,
                createdByUserId: organizer.id,
                members: [organizer.id],
                admins: [organizer.id],
                stripeAccountId: `acct_test_${clubRef.id.substring(0, 8)}`,
                stripeAccountStatus: 'active',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Add organizer to members subcollection
            await clubRef.collection('members').doc(organizer.id).set({
                userId: organizer.id,
                role: 'owner',
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Create courts
            for (const court of clubData.courts) {
                const courtRef = clubRef.collection('courts').doc();
                await courtRef.set({
                    name: court.name,
                    surface: court.surface,
                    hourlyRate: court.hourlyRate,
                    isActive: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            console.log(`  ✓ Created: ${clubData.name} (${clubData.courts.length} courts)`);
            clubs.push({
                id: clubRef.id,
                name: clubData.name,
                ownerId: organizer.id,
            });
        }
        catch (error) {
            console.error(`  ✗ Failed: ${clubData.name}`, error.message);
        }
    }
    return clubs;
}
// ============================================
// MAIN SEED FUNCTION (Callable)
// ============================================
exports.seed_testData = functions.https.onCall(async (data, context) => {
    // SAFETY: Only allow on test project
    if (!envGuard_1.isTestProject) {
        throw new functions.https.HttpsError('failed-precondition', 'seed_testData can only run on the TEST project (pickleball-app-test)');
    }
    console.log('='.repeat(60));
    console.log(' SEED TEST DATA - Starting');
    console.log('='.repeat(60));
    console.log(`Project: ${process.env.GCLOUD_PROJECT}`);
    try {
        // 1. Create admin user
        const adminUser = await seedAdmin();
        console.log(`\n✅ Created admin: ${(adminUser === null || adminUser === void 0 ? void 0 : adminUser.email) || 'failed'}`);
        // 2. Create organizers
        const organizers = await seedOrganizers();
        console.log(`\n✅ Created ${organizers.length} organizers`);
        // 3. Create players
        const players = await seedPlayers();
        console.log(`\n✅ Created ${players.length} players`);
        // 4. Create clubs with courts
        const clubs = await seedClubs(organizers);
        console.log(`\n✅ Created ${clubs.length} clubs`);
        console.log('\n' + '='.repeat(60));
        console.log(' SEED COMPLETE!');
        console.log('='.repeat(60));
        return {
            success: true,
            summary: {
                admin: adminUser ? 1 : 0,
                organizers: organizers.length,
                players: players.length,
                clubs: clubs.length,
            },
            credentials: {
                admin: 'admin@test.com',
                organizers: organizers.map((o) => o.email),
                players: 'player1@test.com ... player40@test.com',
                password: 'test123',
            },
            clubs: clubs.map((c) => ({ name: c.name, id: c.id })),
        };
    }
    catch (error) {
        console.error('Seed failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
// ============================================
// CLEANUP FUNCTION (Callable)
// ============================================
exports.seed_clearTestData = functions.https.onCall(async (data, context) => {
    // SAFETY: Only allow on test project
    if (!envGuard_1.isTestProject) {
        throw new functions.https.HttpsError('failed-precondition', 'seed_clearTestData can only run on the TEST project');
    }
    console.log('🗑️ Clearing test data...');
    let deletedUsers = 0;
    let deletedClubs = 0;
    try {
        // Delete admin user
        try {
            const adminUser = await auth.getUserByEmail('admin@test.com');
            await auth.deleteUser(adminUser.uid);
            await db.collection('users').doc(adminUser.uid).delete();
            deletedUsers++;
            console.log('  ✓ Deleted admin@test.com');
        }
        catch (e) {
            // User doesn't exist
        }
        // Delete organizers
        for (let i = 1; i <= 5; i++) {
            try {
                const user = await auth.getUserByEmail(`organizer${i}@test.com`);
                await auth.deleteUser(user.uid);
                await db.collection('users').doc(user.uid).delete();
                deletedUsers++;
            }
            catch (e) {
                // User doesn't exist
            }
        }
        // Delete players
        for (let i = 1; i <= 40; i++) {
            try {
                const user = await auth.getUserByEmail(`player${i}@test.com`);
                await auth.deleteUser(user.uid);
                await db.collection('users').doc(user.uid).delete();
                deletedUsers++;
            }
            catch (e) {
                // User doesn't exist
            }
        }
        // Delete clubs by name
        for (const clubData of CLUBS) {
            const clubQuery = await db.collection('clubs')
                .where('name', '==', clubData.name)
                .get();
            for (const doc of clubQuery.docs) {
                // Delete subcollections
                const membersSnap = await doc.ref.collection('members').get();
                for (const member of membersSnap.docs) {
                    await member.ref.delete();
                }
                const courtsSnap = await doc.ref.collection('courts').get();
                for (const court of courtsSnap.docs) {
                    await court.ref.delete();
                }
                // Delete club
                await doc.ref.delete();
                deletedClubs++;
            }
        }
        console.log(`✅ Deleted ${deletedUsers} users, ${deletedClubs} clubs`);
        return {
            success: true,
            deleted: {
                users: deletedUsers,
                clubs: deletedClubs,
            },
        };
    }
    catch (error) {
        console.error('Clear failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=seedTestData.js.map