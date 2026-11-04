import 'dotenv/config';
import mongoose from 'mongoose';
import { backupAndVerify } from '../src/backup/backup.js';

await mongoose.connect(process.env.MONGO_URI);
const s = await backupAndVerify(mongoose);
console.log(JSON.stringify(s, null, 2));
await mongoose.disconnect();
process.exit(s.ok ? 0 : 1);
