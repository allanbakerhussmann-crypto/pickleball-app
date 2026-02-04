/**
 * Run Seed Function - Calls seed_testData Cloud Function
 *
 * Usage: node runSeed.js
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS environment variable
 * or being authenticated via gcloud CLI
 */

const https = require('https');

const PROJECT_ID = 'pickleball-app-test';
const FUNCTION_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/seed_testData`;

// For callable functions, we need to send a specific format
const data = JSON.stringify({
  data: {}
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
};

console.log('🌱 Calling seed_testData function...');
console.log(`URL: ${FUNCTION_URL}`);
console.log('');

const req = https.request(FUNCTION_URL, options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('');

    try {
      const result = JSON.parse(body);
      if (result.result) {
        console.log('✅ Seed completed successfully!');
        console.log('');
        console.log('Summary:');
        console.log(`  - Organizers: ${result.result.summary.organizers}`);
        console.log(`  - Players: ${result.result.summary.players}`);
        console.log(`  - Clubs: ${result.result.summary.clubs}`);
        console.log('');
        console.log('Test Credentials:');
        console.log(`  - Organizers: organizer1@test.com ... organizer5@test.com`);
        console.log(`  - Players: player1@test.com ... player40@test.com`);
        console.log(`  - Password: test123`);
        console.log('');
        console.log('Clubs created:');
        result.result.clubs.forEach(c => {
          console.log(`  - ${c.name}`);
        });
      } else if (result.error) {
        console.log('❌ Error:', result.error.message);
      } else {
        console.log('Response:', body);
      }
    } catch (e) {
      console.log('Raw response:', body);
    }
  });
});

req.on('error', (error) => {
  console.error('Request failed:', error.message);
});

req.write(data);
req.end();
