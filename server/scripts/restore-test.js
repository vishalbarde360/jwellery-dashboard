// Usage: npm run restore:test [path-to-backup.ndjson.gz]
import 'dotenv/config';
import mongoose from 'mongoose';
import { latestBackupFile, restoreTest } from '../src/backup/backup.js';

const file = process.argv[2] || latestBackupFile();
if (!file) { console.error('No backup found. Run: npm run backup'); process.exit(1); }
await mongoose.connect(process.env.MONGO_URI);
const r = await restoreTest(file, mongoose.connection.getClient());
console.log(r.ok ? 'RESTORE TEST PASSED' : 'RESTORE TEST FAILED', JSON.stringify(r.restored), r.problems);
await mongoose.disconnect();
process.exit(r.ok ? 0 : 1);
