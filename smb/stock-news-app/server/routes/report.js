import express from 'express';
import { readFile } from 'fs/promises';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { collectNews } from '../api/newsCollector.js';
import { collectDart } from '../api/dartCollector.js';
import { summarizeNews, summarizeDart } from '../api/aiSummarizer.js';
import { generatePDF } from '../api/pdfGenerator.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const STOCKS_FILE = join(__dirname, '../data/stocks.json');
const REPORTS_DIR = join(__dirname, '../../reports');

// 진행 중인 작업 저장 (jobId → { status, progress })
const jobs = new Map();

function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// POST /api/report/generate → { jobId }
router.post('/generate', async (req, res) => {
  const jobId = Date.now().toString();
  jobs.set(jobId, { status: 'pending', stocks: [], error: null });
  res.json({ jobId });

  // 비동기로 리포트 생성 시작
  runReportJob(jobId).catch(err => {
    const job = jobs.get(jobId);
    if (job) { job.status = 'error'; job.error = err.message; }
  });
});

// GET /api/report/progress/:jobId — SSE 스트림
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const job = jobs.get(jobId);
  if (!job) {
    sendSSE(res, 'error', { message: '작업을 찾을 수 없습니다' });
    return res.end();
  }

  // 이미 완료된 경우 즉시 응답
  if (job.status === 'done') {
    sendSSE(res, 'done', { filename: job.filename });
    return res.end();
  }
  if (job.status === 'error') {
    sendSSE(res, 'error', { message: job.error });
    return res.end();
  }

  // 진행 중이면 폴링으로 이벤트 전송
  job.sseRes = res;

  req.on('close', () => {
    job.sseRes = null;
  });
});

async function runReportJob(jobId) {
  const job = jobs.get(jobId);
  const stocksRaw = await readFile(STOCKS_FILE, 'utf-8');
  const stocks = JSON.parse(stocksRaw);

  if (stocks.length === 0) {
    job.status = 'error';
    job.error = '등록된 종목이 없습니다';
    emitSSE(job, 'error', { message: job.error });
    return;
  }

  job.status = 'running';
  const reportStocks = [];

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    emitSSE(job, 'stock_start', { stockName: stock.name, index: i, total: stocks.length });

    // 1. 뉴스 수집
    emitSSE(job, 'collecting_news', { stockName: stock.name });
    let newsItems = [];
    try {
      newsItems = await collectNews(stock);
    } catch { /* 실패해도 계속 */ }

    // 2. DART 공시 수집
    emitSSE(job, 'collecting_dart', { stockName: stock.name });
    let dartItems = [];
    try {
      dartItems = await collectDart(stock);
    } catch { /* 실패해도 계속 */ }

    // 3. 뉴스 AI 요약
    const newsWithAI = [];
    for (let j = 0; j < newsItems.length; j++) {
      emitSSE(job, 'summarizing', { stockName: stock.name, current: j + 1, total: newsItems.length });
      const ai = await summarizeNews(stock.name, newsItems[j].title, newsItems[j].description).catch(() => null);
      newsWithAI.push({ ...newsItems[j], ai });
    }

    // 4. DART AI 요약
    const dartWithAI = [];
    for (let j = 0; j < dartItems.length; j++) {
      emitSSE(job, 'summarizing_dart', { stockName: stock.name, current: j + 1, total: dartItems.length });
      const ai = await summarizeDart(stock.name, dartItems[j].type, dartItems[j].title).catch(() => null);
      dartWithAI.push({ ...dartItems[j], ai });
    }

    reportStocks.push({ ...stock, news: newsWithAI, dart: dartWithAI });
    emitSSE(job, 'stock_done', { stockName: stock.name, index: i });
  }

  // 5. PDF 생성
  emitSSE(job, 'generating_pdf', {});
  const reportData = { stocks: reportStocks, generatedAt: new Date().toISOString() };
  const filename = await generatePDF(reportData);

  job.status = 'done';
  job.filename = filename;
  emitSSE(job, 'done', { filename });
}

function emitSSE(job, event, data) {
  if (job.sseRes) {
    sendSSE(job.sseRes, event, data);
  }
}

// GET /api/report/list
router.get('/list', (req, res) => {
  try {
    const files = readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.pdf'))
      .sort()
      .reverse()
      .slice(0, 20);
    res.json(files);
  } catch {
    res.json([]);
  }
});

// GET /api/report/download/:filename
router.get('/download/:filename', (req, res) => {
  const filePath = join(REPORTS_DIR, req.params.filename);
  res.download(filePath, err => {
    if (err) res.status(404).json({ error: '파일을 찾을 수 없습니다' });
  });
});

export default router;
