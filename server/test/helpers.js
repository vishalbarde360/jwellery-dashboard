// Shared test harness. Black-box: starts the REAL server (src/index.js) against a throw-away
// database, so nothing in the app has to change to be testable.
//
// Needs MongoDB running as a replica set (same requirement as the app itself).
//   TEST_MONGO_BASE   default mongodb://127.0.0.1:27017
// The database name MUST contain "test" because the seed script wipes it.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serverDir = path.resolve(here, '..');
const BASE = process.env.TEST_MONGO_BASE || 'mongodb://127.0.0.1:27017';

export async function startApp({ dbName, port }) {
  if (!/test/i.test(dbName)) throw new Error('Refusing: test database name must contain "test"');
  const env = {
    ...process.env,
    MONGO_URI: `${BASE}/${dbName}`,
    PORT: String(port),
    JWT_SECRET: 'test-secret-not-for-production',
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173',
    BACKUP_ENABLED: 'false',
  };
  const seed = spawnSync('node', ['src/seed.js'], { cwd: serverDir, env, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error('Seed failed:\n' + seed.stdout + seed.stderr);

  const child = spawn('node', ['src/index.js'], { cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url + '/api/health')).ok) break; } catch {}
    if (child.exitCode !== null) throw new Error('Server exited early:\n' + log);
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99) throw new Error('Server did not start:\n' + log);
  }

  const client = await new MongoClient(env.MONGO_URI).connect();
  const db = client.db(dbName);
  const tenants = {
    demo: (await db.collection('tenants').findOne({ code: 'DEMO' }))._id,
    rival: (await db.collection('tenants').findOne({ code: 'RIVAL' }))._id,
  };

  const tokens = {};
  const call = async (token, method, p, body, headers = {}) => {
    const t0 = performance.now();
    const res = await fetch(url + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const ms = performance.now() - t0;
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers, ms };
  };
  // Logins are rate limited (20 / 15 min), so each user signs in once and the token is reused.
  const login = async (username, password) => {
    if (tokens[username]) return tokens[username];
    const r = await call(null, 'POST', '/api/auth/login', { username, password: password || username + '123' });
    if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return (tokens[username] = r.body.token);
  };
  const as = async (username, password) => {
    const token = await login(username, password);
    return (method, p, body, headers) => call(token, method, p, body, headers);
  };

  const key = () => 'test-' + crypto.randomUUID();
  let n = 0;
  // Direct-to-database fixture: one physical piece in stock, with its opening stock movement.
  const addItem = async (o = {}, tenant = tenants.demo) => {
    const barcode = o.barcode || `T${Date.now().toString(36).toUpperCase()}${(n++).toString().padStart(4, '0')}`;
    const now = new Date();
    const product = await db.collection('products').insertOne({ tenant, name: o.name || 'Test piece', metal: o.metal || 'gold', purity: o.purity || '22K', createdAt: now, updatedAt: now });
    const item = {
      tenant, product: product.insertedId, barcode, name: o.name || 'Test piece', metal: o.metal || 'gold', purity: o.purity || '22K',
      grossWeight: 10, stoneWeight: 0, netWeight: 10, stoneValue: 0, costPrice: 1000, priceMethod: 'weight', fixedPrice: 0,
      wastagePercent: 0, makingType: 'percent', makingValue: 0, hsn: '7113', status: 'available', attrs: {}, createdAt: now, updatedAt: now, ...o,
    };
    item.barcode = barcode;
    const r = await db.collection('items').insertOne(item);
    await db.collection('stockmovements').insertOne({ tenant, item: r.insertedId, type: 'purchase', toStatus: item.status, createdAt: now, updatedAt: now });
    return { ...item, _id: r.insertedId };
  };

  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((r) => { child.on('exit', r); setTimeout(r, 3000); });
    await client.close();
  };
  return { url, env, db, client, tenants, call, as, login, key, addItem, stop, log: () => log, dbName, mongoBase: BASE };
}

export const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
export const median = (arr) => pct(arr, 50);
