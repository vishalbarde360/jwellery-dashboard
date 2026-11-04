import IdempotencyKey from '../models/IdempotencyKey.js';

// Send header  Idempotency-Key: <unique code>  on every money-creating request.
// Repeating the same key returns the first result instead of creating a second bill.
export async function idempotent(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key || key.length < 8 || key.length > 100) {
    return res.status(400).json({ message: 'Idempotency-Key header (8 to 100 characters) is required' });
  }
  req.idempotencyKey = key;

  let rec;
  try {
    rec = await IdempotencyKey.create({ key, user: req.user._id, method: req.method, path: req.originalUrl });
  } catch (e) {
    if (e.code !== 11000) return next(e);
    const old = await IdempotencyKey.findOne({ key }).lean();
    if (old?.status === 'done') {
      res.set('Idempotent-Replay', 'true');
      return res.status(old.responseStatus).json(old.responseBody);
    }
    // A request that died half-way leaves a stale key. After 30 s it can be retried; the invoice's own unique key still blocks a duplicate.
    if (old && Date.now() - new Date(old.createdAt).getTime() > 30000) {
      await IdempotencyKey.deleteOne({ _id: old._id });
      return idempotent(req, res, next);
    }
    return res.status(409).json({ message: 'This request is still being processed. Wait a moment.' });
  }

  const send = res.json.bind(res);
  res.json = (body) => {
    res.json = send;
    // Failed requests created nothing, so the key is released and the cashier can fix and retry.
    if (res.statusCode >= 400) IdempotencyKey.deleteOne({ _id: rec._id }).catch(() => {});
    else IdempotencyKey.updateOne({ _id: rec._id }, { status: 'done', responseStatus: res.statusCode, responseBody: body }).catch(() => {});
    return send(body);
  };
  next();
}
