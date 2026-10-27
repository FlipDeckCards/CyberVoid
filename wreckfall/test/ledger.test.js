const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { MintLedger, LedgerError, MARKETPLACE_FEE_BPS, SKIN_FORGE_FEE, HOUSE } = require('../ledger');
const { handlePaymentWebhook } = require('../webhook');

function fresh() {
  const l = new MintLedger();
  l.register('alice', 25);
  l.register('bob', 30);
  l.register('kid', 16);
  return l;
}

test('purchase credits once even on webhook retry', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.creditPurchase('alice', 1000, 'pay_1');
  assert.equal(l.balanceOf('alice'), 1000);
});

test('purchase rejects unknown account and bad amount', () => {
  const l = fresh();
  assert.throws(() => l.creditPurchase('nobody', 100, 'x'), LedgerError);
  assert.throws(() => l.creditPurchase('alice', 0, 'y'), LedgerError);
});

test('mintNft spends Mint and gives ownership, fee goes to house', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.mintNft('alice', 400, 'rifle-1');
  assert.equal(l.balanceOf('alice'), 600);
  assert.equal(l.nfts.get('rifle-1'), 'alice');
  assert.equal(l.balanceOf(HOUSE), 400);
});

test('cannot spend more than balance', () => {
  const l = fresh();
  l.creditPurchase('alice', 100, 'pay_1');
  assert.throws(() => l.mintNft('alice', 500), LedgerError);
});

test('under 18 cannot buy NFTs', () => {
  const l = fresh();
  l.creditPurchase('kid', 1000, 'pay_k');
  assert.throws(() => l.mintNft('kid', 100), LedgerError);
});

test('forging a skin charges the fee once', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.forgeSkin('alice', 'skin-a');
  assert.equal(l.balanceOf('alice'), 1000 - SKIN_FORGE_FEE);
  assert.throws(() => l.forgeSkin('alice', 'skin-a'), LedgerError);
});

test('trade moves Mint and NFT with the 10% fee', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.creditPurchase('bob', 1000, 'pay_2');
  l.mintNft('alice', 400, 'rifle-1');
  l.tradeNft('alice', 'bob', 'rifle-1', 400);
  const fee = Math.floor((400 * MARKETPLACE_FEE_BPS) / 10000);
  assert.equal(MARKETPLACE_FEE_BPS, 1000);
  assert.equal(l.nfts.get('rifle-1'), 'bob');
  assert.equal(l.balanceOf('bob'), 600);
  assert.equal(l.balanceOf('alice'), 600 + 400 - fee);
});

test('trade requires the actual owner', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.creditPurchase('bob', 1000, 'pay_2');
  l.mintNft('alice', 400, 'rifle-1');
  assert.throws(() => l.tradeNft('bob', 'alice', 'rifle-1', 100), LedgerError);
});

test('extract and import move no Mint', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.mintNft('alice', 400, 'rifle-1');
  const before = new Map(l.balances);
  l.extractNft('alice', 'rifle-1', '0xWALLET');
  assert.equal(l.nfts.get('rifle-1'), 'extracted:0xWALLET');
  l.importNft('alice', 'rifle-1', '0xWALLET');
  assert.equal(l.nfts.get('rifle-1'), 'alice');
  assert.deepEqual(new Map(l.balances), before);
});

test('no withdraw path exists', () => {
  assert.equal(typeof MintLedger.prototype.withdraw, 'undefined');
  assert.equal(typeof MintLedger.prototype.cashOut, 'undefined');
});

test('invariant: total minted equals total held', () => {
  const l = fresh();
  l.creditPurchase('alice', 1000, 'pay_1');
  l.creditPurchase('bob', 500, 'pay_2');
  l.mintNft('alice', 400, 'rifle-1');
  l.tradeNft('alice', 'bob', 'rifle-1', 300);
  l.forgeSkin('bob', 'skin-b');
  assert.equal(l.totalMinted(), l.totalHeld());
});

const SECRET = 'test-secret';
const sign = body => crypto.createHmac('sha256', SECRET).update(body).digest('hex');
const evt = (o = {}) => Buffer.from(JSON.stringify({ event: 'payment_succeeded', account: 'alice', mint: 1000, payment_id: 'pay_1', ...o }));

test('webhook: valid event credits Mint', () => {
  const l = fresh();
  const b = evt();
  assert.equal(handlePaymentWebhook(l, b, sign(b), SECRET).status, 200);
  assert.equal(l.balanceOf('alice'), 1000);
});

test('webhook: bad signature credits nothing', () => {
  const l = fresh();
  assert.equal(handlePaymentWebhook(l, evt(), 'forged', SECRET).status, 401);
  assert.equal(l.balanceOf('alice'), 0);
});

test('webhook: no secret configured rejects everything', () => {
  const l = fresh();
  const b = evt();
  assert.equal(handlePaymentWebhook(l, b, sign(b), '').status, 401);
});

test('webhook: retry is idempotent', () => {
  const l = fresh();
  const b = evt();
  handlePaymentWebhook(l, b, sign(b), SECRET);
  handlePaymentWebhook(l, b, sign(b), SECRET);
  assert.equal(l.balanceOf('alice'), 1000);
});

test('webhook: unknown event ignored, unknown account rejected', () => {
  const l = fresh();
  const ignored = evt({ event: 'refund_created' });
  assert.equal(handlePaymentWebhook(l, ignored, sign(ignored), SECRET).ignored, true);
  const unknown = evt({ account: 'nobody' });
  assert.equal(handlePaymentWebhook(l, unknown, sign(unknown), SECRET).status, 422);
});
