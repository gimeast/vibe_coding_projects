# 주식 뉴스 수집 & PDF 리포트 생성 앱 — CLAUDE.md

## 프로젝트 개요
코스피/코스닥 관심 종목의 최신 뉴스를 자동으로 수집하고,
Ollama 로컬 AI(gemma4:26b)로 요약 후 PDF 리포트로 저장하는 웹 애플리케이션.

## 기술 스택
- **Frontend**: React (Vite) + TailwindCSS
- **Backend**: Node.js + Express
- **뉴스 수집**: 네이버 금융 RSS / 크롤링 (axios + cheerio)
- **AI 요약**: Ollama 로컬 모델 (gemma4:26b-a4b-it-q4_K_M) — `http://localhost:11434`
- **PDF 생성**: Puppeteer (HTML→PDF 변환, 한글 폰트 지원)
- **공시 수집**: DART OpenAPI (`opendart.fss.or.kr`)
- **스케줄러**: node-cron

## 디렉토리 구조
```
stock-news-app/
├── client/                    # React (Vite) 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   ├── StockManager.jsx
│   │   │   ├── NewsCard.jsx
│   │   │   ├── DartCard.jsx
│   │   │   ├── ModeToggle.jsx
│   │   │   ├── ProgressBar.jsx
│   │   │   └── ReportPreview.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
├── server/                    # Express 백엔드
│   ├── api/
│   │   ├── newsCollector.js
│   │   ├── dartCollector.js
│   │   ├── aiSummarizer.js
│   │   ├── pdfGenerator.js
│   │   └── scheduler.js
│   ├── utils/
│   │   ├── stockCodes.js
│   │   └── dartCorpCodes.js
│   └── index.js
├── reports/                   # 생성된 PDF 저장
├── docs/
│   └── design-system/
│       └── bmw-m-design-system.md  ← 디자인 시스템 참조
├── .env
├── package.json
└── CLAUDE.md
```

## 디자인 시스템
**반드시 BMW M 디자인 시스템을 따른다**: [`docs/design-system/bmw-m-design-system.md`](docs/design-system/bmw-m-design-system.md)

핵심 원칙:
- **배경**: 순수 블랙 (`#000000`) 캔버스
- **텍스트**: 흰색 (`#ffffff`) 헤드라인, `#bbbbbb` 본문
- **카드 표면**: `#1a1a1a` (surface-card), `#0d0d0d` (surface-soft)
- **구분선**: 1px `#3c3c3c` (hairline)
- **액센트 (브랜드 전용)**: M 트라이컬러 — `#0066b1` → `#1c69d4` → `#e22718` (버튼/배경 절대 금지)
- **버튼**: 0px 라디우스, UPPERCASE 레이블, 1.5px 자간
- **폰트**: Inter (700 헤드라인 / 300 본문) — BMW Type Next Latin 대체재
- **간격**: 4px 기본 단위, 섹션 간 96px

UI에서 상승요인 → 초록(`#0fa336`), 하락요인 → 빨간(`#e22718`), 중립 → 회색(`#7e7e7e`) 배지.

## 환경 변수 (.env)
```
DART_API_KEY=your_dart_api_key_here
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:26b-a4b-it-q4_K_M
PORT=3001
CLIENT_PORT=5173
```

## API 엔드포인트
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/stocks` | 관심 종목 목록 |
| POST | `/api/stocks` | 종목 추가 |
| DELETE | `/api/stocks/:code` | 종목 삭제 |
| GET | `/api/dart/:code` | 특정 종목 DART 공시 |
| POST | `/api/report/generate` | 즉시 리포트 생성 (SSE 진행상황) |
| GET | `/api/report/download/:filename` | PDF 다운로드 |
| POST | `/api/scheduler/set` | 자동 생성 시간 설정 |
| GET | `/api/scheduler/status` | 스케줄러 상태 |
| GET | `/api/health` | Ollama + DART 연결 상태 확인 |

## 주의사항
1. **크롤링**: robots.txt 준수, RSS 우선 사용
2. **DART API**: 일 10,000건 한도, 기업코드 매핑은 앱 시작 시 1회만 다운로드 후 캐싱
3. **Ollama**: 앱 시작 전 `ollama serve` 실행 필요. 미실행 시 헬스체크에서 안내
4. **Rate Limiting**: 종목당 수집 간격 1초 이상
5. **에러 핸들링**: 특정 종목 실패 시 건너뛰고 나머지 계속 진행
6. **한글 PDF**: Puppeteer 사용 시 시스템 한글 폰트(Malgun Gothic 등) 필요
7. **포트**: 백엔드 3001, 프론트엔드 5173 (개발), 프록시 설정 필요

## 개발 서버 실행
```bash
# 루트에서
npm run dev:server   # 백엔드 (nodemon)
npm run dev:client   # 프론트엔드 (Vite)
# 또는
npm run dev          # concurrently 동시 실행
```
