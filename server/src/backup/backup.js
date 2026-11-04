// Automated backups with a TESTED restore.
// A backup is one gzip file (every collection, exact types) + a manifest with record counts and a SHA-256 checksum.
// "Tested restore" = restore the file into a scratch database, compare every count, then drop it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { EJSON } from 'bson';

export const backupDir = () => path.resolve(process.env.BACKUP_DIR || './backups');
const manifestPath = (file) => file.replace(/\.ndjson\.gz$/, '.manifest.json');

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

export async function runBackup(db) {
  fs.mkdirSync(backupDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir(), `${db.databaseName}-${stamp}.ndjson.gz`);
  const gzip = zlib.createGzip();
  const out = fs.createWriteStream(file);
  const finished = new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
  gzip.pipe(out);
  const write = (s) => new Promise((res, rej) => gzip.write(s, (e) => (e ? rej(e) : res())));

  const counts = {};
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue;
    counts[name] = 0;
    for await (const doc of db.collection(name).find({})) {
      await write(JSON.stringify({ c: name, d: EJSON.stringify(doc, { relaxed: false }) }) + '\n');
      counts[name]++;
    }
  }
  gzip.end();
  await finished;

  const manifest = { file: path.basename(file), db: db.databaseName, createdAt: new Date().toISOString(), counts, sha256: await hashFile(file), bytes: fs.statSync(file).size };
  fs.writeFileSync(manifestPath(file), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function restoreInto(file, targetDb) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath(file), 'utf8'));
  if ((await hashFile(file)) !== manifest.sha256) throw new Error('Backup file is damaged (checksum does not match)');

  const buf = {};
  const seen = {};
  const flush = async (c) => { if (buf[c]?.length) { await targetDb.collection(c).insertMany(buf[c]); buf[c] = []; } };
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const { c, d } = JSON.parse(line);
    (buf[c] ||= []).push(EJSON.parse(d));
    seen[c] = (seen[c] || 0) + 1;
    if (buf[c].length >= 500) await flush(c);
  }
  for (const c of Object.keys(buf)) await flush(c);

  const problems = [];
  for (const [c, n] of Object.entries(manifest.counts)) {
    if ((seen[c] || 0) !== n) problems.push(`${c}: backup holds ${n}, read ${seen[c] || 0}`);
    if (n > 0) { const real = await targetDb.collection(c).countDocuments(); if (real !== n) problems.push(`${c}: restored database holds ${real}, expected ${n}`); }
  }
  return { ok: !problems.length, manifest, restored: seen, problems };
}

// Restore into a throw-away database, check it, and always remove it again.
export async function restoreTest(file, client) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath(file), 'utf8'));
  const scratch = client.db(`${manifest.db}_restoretest_${Date.now()}`);
  try { return await restoreInto(file, scratch); }
  finally { await scratch.dropDatabase().catch(() => {}); }
}

export function listBackups() {
  if (!fs.existsSync(backupDir())) return [];
  return fs.readdirSync(backupDir()).filter((f) => f.endsWith('.manifest.json')).sort().reverse()
    .map((f) => JSON.parse(fs.readFileSync(path.join(backupDir(), f), 'utf8')));
}

export const latestBackupFile = () => { const b = listBackups()[0]; return b ? path.join(backupDir(), b.file) : null; };

export function pruneBackups(keep = 14) {
  for (const m of listBackups().slice(keep)) {
    for (const f of [m.file, m.file.replace(/\.ndjson\.gz$/, '.manifest.json')]) fs.rmSync(path.join(backupDir(), f), { force: true });
  }
}

const statusFile = () => path.join(backupDir(), 'last-run.json');
export const saveStatus = (s) => { fs.mkdirSync(backupDir(), { recursive: true }); fs.writeFileSync(statusFile(), JSON.stringify(s, null, 2)); };
export const readStatus = () => (fs.existsSync(statusFile()) ? JSON.parse(fs.readFileSync(statusFile(), 'utf8')) : null);

// One full cycle: back up, prune old ones, and prove the new backup restores.
export async function backupAndVerify(mongoose) {
  const status = { at: new Date().toISOString() };
  try {
    const manifest = await runBackup(mongoose.connection.db);
    pruneBackups(Number(process.env.BACKUP_KEEP) || 14);
    status.backup = { file: manifest.file, counts: manifest.counts };
    if (process.env.BACKUP_VERIFY !== 'false') {
      const t = await restoreTest(path.join(backupDir(), manifest.file), mongoose.connection.getClient());
      status.restoreTest = { ok: t.ok, problems: t.problems };
    }
    status.ok = !status.restoreTest || status.restoreTest.ok;
  } catch (e) { status.ok = false; status.error = e.message; }
  saveStatus(status);
  return status;
}
