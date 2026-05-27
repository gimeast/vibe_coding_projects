import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import stocksRouter from './routes/stocks.js';
import newsRouter from './routes/news.js';
import dartRouter from './routes/dart.js';
import reportRouter from './routes/report.js';
import schedulerRouter from './routes/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// reports 폴더 보장
const reportsDir = join(__dirname, '../reports');
if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

// stocks.json 초기화
const stocksFile = join(__dirname, 'data/stocks.json');
if (!existsSync(stocksFile)) {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  writeFileSync(stocksFile, '[]', 'utf-8');
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 헬스체크
app.get('/api/health', async (req, res) => {
  const status = { server: 'ok', ollama: 'unknown', dart: !!process.env.DART_API_KEY };
  try {
    const { default: axios } = await import('axios');
    await axios.get(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`, { timeout: 2000 });
    status.ollama = 'ok';
  } catch {
    status.ollama = 'offline';
  }
  res.json(status);
});

// 라우트 등록
app.use('/api/stocks', stocksRouter);
app.use('/api/news', newsRouter);
app.use('/api/dart', dartRouter);
app.use('/api/report', reportRouter);
app.use('/api/scheduler', schedulerRouter);

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📊 Ollama: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
  console.log(`🔑 DART API: ${process.env.DART_API_KEY ? '설정됨' : '⚠️ 미설정'}`);
});

export default app;
