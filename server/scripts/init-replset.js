/* One-time helper: initiates a single-node replica set on a local mongod started with --replSet rs0.
   Usage: node scripts/init-replset.js [host:port]   (default 127.0.0.1:27017) */
const { MongoClient } = require('mongoose').mongo;
const host = process.argv[2] || '127.0.0.1:27017';
(async () => {
  const client = new MongoClient(`mongodb://${host}/?directConnection=true`, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    await client.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host }] } });
    console.log('Replica set rs0 initiated.');
  } catch (e) {
    if (e.code === 23 || /already initialized/i.test(e.message)) console.log('Replica set already initialised.');
    else { console.error('Failed:', e.message); process.exitCode = 1; }
  } finally { await client.close(); }
})();
