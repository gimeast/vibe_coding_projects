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
import stockdataRouter from './routes/stockdata.js';
import marketRouter from './routes/market.js';
import { initCorpCodes } from './utils/dartCorpCodes.js';

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
app.get('/api/health', (req, res) => {
  res.json({ server: 'ok', dart: !!process.env.DART_API_KEY });
});

// 라우트 등록
app.use('/api/stocks', stocksRouter);
app.use('/api/news', newsRouter);
app.use('/api/dart', dartRouter);
app.use('/api/report', reportRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/stockdata', stockdataRouter);
app.use('/api/market', marketRouter);

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log(`🔑 DART API: ${process.env.DART_API_KEY ? '설정됨' : '⚠️ 미설정'}`);

  // DART 기업코드 백그라운드 초기화 (첫 실행 시 다운로드, 이후 캐시 사용)
  initCorpCodes().catch(err => console.error('[DART] 초기화 오류:', err.message));
});

export default app;
