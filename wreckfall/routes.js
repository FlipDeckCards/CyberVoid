// Wreckfall API routes, mounted from server.js under /api/wreckfall.
// The webhook route reads the raw body itself, so it must be mounted before express.json.
const express = require('express');
const { MintLedger, LedgerError } = require('./ledger');
const { handlePaymentWebhook } = require('./webhook');

module.exports = function mountWreckfall(app) {
  const ledger = new MintLedger();
  const testMode = process.env.WRECKFALL_TEST_MODE === '1';
  const secret = process.env.WRECKFALL_WEBHOOK_SECRET || '';
  const router = express.Router();

  // Real-money webhook. Raw body needed for the signature.
  router.post('/webhook', express.raw({ type: '*/*', limit: '20kb' }), (req, res) => {
    const r = handlePaymentWebhook(ledger, req.body || Buffer.alloc(0), req.get('X-Signature'), secret);
    res.status(r.status).json(r);
  });

  router.use(express.json({ limit: '20kb' }));

  // Test-mode only: lets the store demo credit fake Mint. Off unless WRECKFALL_TEST_MODE=1.
  router.post('/test-purchase', (req, res) => {
    if (!testMode) return res.status(404).json({ error: 'not found' });
    try {
      const { account, mint, payment_id } = req.body || {};
      ledger.creditPurchase(String(account || ''), Number(mint), String(payment_id || ''));
      res.json({ ok: true, balance: ledger.balanceOf(account) });
    } catch (e) {
      if (e instanceof LedgerError) return res.status(422).json({ error: e.message });
      throw e;
    }
  });

  router.post('/register', (req, res) => {
    try {
      const { account, age } = req.body || {};
      ledger.register(String(account || ''), Number(age));
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof LedgerError) return res.status(422).json({ error: e.message });
      throw e;
    }
  });

  router.get('/balance/:account', (req, res) => {
    res.json({ account: req.params.account, balance: ledger.balanceOf(req.params.account), test_mode: testMode });
  });

  app.use('/api/wreckfall', router);
};
