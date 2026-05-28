import express from 'express';
import { collectMarketData } from '../api/marketCollector.js';

const router = express.Router();

// GET /api/market — KOSPI/KOSDAQ 지수 + 시장 뉴스
router.get('/', async (req, res) => {
  try {
    const data = await collectMarketData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
