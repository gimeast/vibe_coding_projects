import express from 'express';
import { collectStockData } from '../api/stockDataCollector.js';

const router = express.Router();

// GET /api/stockdata/:code
router.get('/:code', async (req, res) => {
  try {
    const data = await collectStockData(req.params.code);
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
