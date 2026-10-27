// Payment webhook for Mint purchases (test mode). Node port of Economy/payment_webhook.py.
// PLACEHOLDER SIGNATURE: HMAC-SHA256 over the raw body. Replace verifySignature() with
// Xsolla's real webhook scheme once the account is approved. Until a secret is set in
// WRECKFALL_WEBHOOK_SECRET, every webhook is rejected.
const crypto = require('crypto');
const { LedgerError } = require('./ledger');

const ALLOWED_EVENTS = new Set(['payment_succeeded']);

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handlePaymentWebhook(ledger, rawBody, signature, secret) {
  if (!verifySignature(rawBody, signature, secret)) return { status: 401, error: 'bad signature' };
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch (e) { return { status: 400, error: 'bad json' }; }
  if (!ALLOWED_EVENTS.has(event.event)) return { status: 200, ignored: true };
  const mint = Number(event.mint);
  if (!event.account || !Number.isFinite(mint) || !event.payment_id) return { status: 400, error: 'missing fields' };
  try {
    ledger.creditPurchase(event.account, mint, String(event.payment_id));
  } catch (e) {
    if (e instanceof LedgerError) return { status: 422, error: e.message };
    throw e;
  }
  return { status: 200, credited: mint };
}

module.exports = { handlePaymentWebhook, verifySignature };
