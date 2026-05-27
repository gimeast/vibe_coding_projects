import express from 'express';
import { collectDart } from '../api/dartCollector.js';

const router = express.Router();

// GET /api/dart/:code?name=종목명
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  const name = req.query.name || code;
  try {
    const disclosures = await collectDart({ code, name });
    res.json(disclosures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
