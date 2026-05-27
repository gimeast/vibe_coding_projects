import express from 'express';
import { collectNews } from '../api/newsCollector.js';

const router = express.Router();

// GET /api/news/:code?name=종목명
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  const name = req.query.name || code;
  try {
    const news = await collectNews({ code, name });
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
