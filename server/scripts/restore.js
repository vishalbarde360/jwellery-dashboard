// Usage: npm run restore -- <backup.ndjson.gz> <target-database-name>
// Refuses to write into a database that already has data.
import 'dotenv/config';
import mongoose from 'mongoose';
import { restoreInto } from '../src/backup/backup.js';

const [file, dbName] = process.argv.slice(2);
if (!file || !dbName) { console.error('Usage: npm run restore -- <backup file> <target database name>'); process.exit(1); }
await mongoose.connect(process.env.MONGO_URI);
const target = mongoose.connection.getClient().db(dbName);
if ((await target.listCollections().toArray()).length) { console.error(`Database "${dbName}" is not empty. Choose a new name.`); process.exit(1); }
const r = await restoreInto(file, target);
console.log(r.ok ? `Restored into "${dbName}"` : 'RESTORE PROBLEMS', r.restored, r.problems);
await mongoose.disconnect();
process.exit(r.ok ? 0 : 1);
