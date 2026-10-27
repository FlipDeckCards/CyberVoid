// Mint ledger for Wreckfall (Node port of Economy/mint_ledger.py, test mode).
// Rules: Mint is bought only from a verified payment, can never be withdrawn,
// buys NFTs and skin forging, and moves between players minus a house fee.
// Extraction moves an NFT to a wallet and moves no Mint.
// In memory for now: balances reset when the server restarts.

const HOUSE = '__house__';
const MARKETPLACE_FEE_BPS = 1000; // 10% on player-to-player trades
const SKIN_FORGE_FEE = 50;
const MIN_AGE = 18;

class LedgerError extends Error {}

class MintLedger {
  constructor() {
    this.balances = new Map();
    this.nfts = new Map();        // nftId -> owner account or 'extracted:<wallet>'
    this.playerAge = new Map();
    this.entries = [];
    this.paymentRefs = new Set();
    this.seq = 0;
    this.nftSeq = 0;
  }

  _post(kind, account, amount, ref = '') {
    const next = (this.balances.get(account) || 0) + amount;
    if (next < 0) throw new LedgerError(`insufficient Mint for ${account}`);
    this.balances.set(account, next);
    this.entries.push({ seq: ++this.seq, kind, account, amount, ref });
  }

  _requireAdult(account) {
    if ((this.playerAge.get(account) || 0) < MIN_AGE) {
      throw new LedgerError(`${account} must be ${MIN_AGE} or older for NFT purchases`);
    }
  }

  register(account, age) {
    if (this.playerAge.has(account)) throw new LedgerError('account already registered');
    this.playerAge.set(account, age);
    if (!this.balances.has(account)) this.balances.set(account, 0);
  }

  creditPurchase(account, mint, paymentRef) {
    if (!this.playerAge.has(account)) throw new LedgerError('unknown account');
    if (!(mint > 0)) throw new LedgerError('amount must be positive');
    if (this.paymentRefs.has(paymentRef)) return; // webhook retry, already credited
    this.paymentRefs.add(paymentRef);
    this._post('purchase', account, mint, paymentRef);
  }

  mintNft(account, price, nftId) {
    this._requireAdult(account);
    if (!(price > 0)) throw new LedgerError('price must be positive');
    nftId = nftId || `nft-${++this.nftSeq}`;
    if (this.nfts.has(nftId)) throw new LedgerError('duplicate nft id');
    this._post('nft_buy', account, -price, nftId);
    this._post('nft_buy', HOUSE, price, nftId);
    this.nfts.set(nftId, account);
    return nftId;
  }

  forgeSkin(account, skinId) {
    this._requireAdult(account);
    if (this.nfts.has(skinId)) throw new LedgerError('skin already forged');
    this._post('forge', account, -SKIN_FORGE_FEE, skinId);
    this._post('forge', HOUSE, SKIN_FORGE_FEE, skinId);
    this.nfts.set(skinId, account);
    return skinId;
  }

  tradeNft(seller, buyer, nftId, price) {
    this._requireAdult(buyer);
    if (this.nfts.get(nftId) !== seller) throw new LedgerError('seller does not own this NFT');
    if (!(price > 0)) throw new LedgerError('price must be positive');
    const fee = Math.floor((price * MARKETPLACE_FEE_BPS) / 10000);
    this._post('trade', buyer, -price, nftId);
    this._post('trade', seller, price - fee, nftId);
    this._post('trade', HOUSE, fee, nftId);
    this.nfts.set(nftId, buyer);
  }

  extractNft(account, nftId, wallet) {
    if (this.nfts.get(nftId) !== account) throw new LedgerError('account does not own this NFT');
    this.nfts.set(nftId, `extracted:${wallet}`);
    this.entries.push({ seq: ++this.seq, kind: 'extract', account, amount: 0, ref: nftId });
  }

  importNft(account, nftId, wallet) {
    if (this.nfts.get(nftId) !== `extracted:${wallet}`) throw new LedgerError('NFT is not extracted to this wallet');
    this.nfts.set(nftId, account);
    this.entries.push({ seq: ++this.seq, kind: 'import', account, amount: 0, ref: nftId });
  }

  balanceOf(account) { return this.balances.get(account) || 0; }

  totalMinted() {
    return this.entries.filter(e => e.kind === 'purchase').reduce((s, e) => s + e.amount, 0);
  }

  totalHeld() {
    let s = 0;
    for (const v of this.balances.values()) s += v;
    return s;
  }
}

module.exports = { MintLedger, LedgerError, HOUSE, MARKETPLACE_FEE_BPS, SKIN_FORGE_FEE, MIN_AGE };
