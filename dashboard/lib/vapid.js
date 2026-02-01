// Generate VAPID keys for push notifications
// Run this once to generate keys, then store them securely

const webpush = require('web-push');

function generateVapidKeys() {
  const vapidKeys = webpush.generateVAPIDKeys();
  
  console.log('VAPID Keys Generated:');
  console.log('Public Key:', vapidKeys.publicKey);
  console.log('Private Key:', vapidKeys.privateKey);
  console.log('\nAdd these to your .env.local file:');
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
  console.log(`VAPID_EMAIL=mailto:your-email@example.com`);
  
  return vapidKeys;
}

if (require.main === module) {
  generateVapidKeys();
}

module.exports = { generateVapidKeys };