import express from 'express';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { searchStocks } from '../utils/stockCodes.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const STOCKS_FILE = join(__dirname, '../data/stocks.json');

async function readStocks() {
  const raw = await readFile(STOCKS_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function writeStocks(stocks) {
  await writeFile(STOCKS_FILE, JSON.stringify(stocks, null, 2), 'utf-8');
}

// GET /api/stocks
router.get('/', async (req, res) => {
  try {
    const stocks = await readStocks();
    res.json(stocks);
  } catch {
    res.status(500).json({ error: '종목 목록 조회 실패' });
  }
});

// GET /api/stocks/search?q=
router.get('/search', (req, res) => {
  const { q } = req.query;
  res.json(searchStocks(q || ''));
});

// POST /api/stocks  body: { code, name, market }
router.post('/', async (req, res) => {
  const { code, name, market } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'code와 name이 필요합니다' });

  const stocks = await readStocks();
  if (stocks.length >= 20) return res.status(400).json({ error: '최대 20개까지 등록 가능합니다' });
  if (stocks.find(s => s.code === code)) return res.status(409).json({ error: '이미 등록된 종목입니다' });

  const newStock = { code, name, market: market || 'KOSPI', addedAt: new Date().toISOString() };
  stocks.push(newStock);
  await writeStocks(stocks);
  res.status(201).json(newStock);
});

// DELETE /api/stocks/:code
router.delete('/:code', async (req, res) => {
  const stocks = await readStocks();
  const filtered = stocks.filter(s => s.code !== req.params.code);
  if (filtered.length === stocks.length) return res.status(404).json({ error: '종목을 찾을 수 없습니다' });
  await writeStocks(filtered);
  res.status(204).send();
});

export default router;
