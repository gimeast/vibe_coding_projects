# 주식 뉴스 수집 & PDF 리포트 생성 앱 — 설계 문서

**작성일**: 2026-05-27  
**상태**: 확정  

---

## 1. 프로젝트 개요

코스피/코스닥 관심 종목(최대 20개)의 최신 뉴스와 DART 전자공시를 자동 수집하고, Ollama 로컬 AI(gemma4:26b)로 요약한 뒤 PDF 리포트로 저장하는 데스크탑 웹 애플리케이션.

**목표 사용자**: 개인 투자자 — 매일 아침 관심 종목의 뉴스를 빠르게 파악하고 싶은 사람.

---

## 2. 확정된 기술 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 아키텍처 | React (Vite) + Express 분리형 | 명세서 구조 일치, node-cron/puppeteer 자유 사용 |
| 패키지 구조 | 루트 단일 `package.json` + concurrently | 단순함, 이 규모에 충분 |
| PDF 생성 | Puppeteer (HTML → Chromium → PDF) | 한글 자동 지원, CSS 100%, 레이아웃 자유 |
| 실시간 진행 | SSE (Server-Sent Events) | 단방향 push로 충분, 구현 단순 |
| 레이아웃 | 사이드바형 (왼쪽 종목 목록 + 오른쪽 메인) | 최대 20개 종목 관리 용이 |
| 디자인 시스템 | BMW M (블랙 캔버스, Inter 폰트) | 사용자 지정 |
| AI 모델 | Ollama gemma4:26b-a4b-it-q4_K_M | 로컬 실행, 사용자 지정 |
| 스타일링 | TailwindCSS v4 | 디자인 토큰 적용 용이 |

---

## 3. 아키텍처

### 3.1 디렉토리 구조

```
stock-news-app/
├── client/                        # Vite + React 프론트엔드
│   └── src/
│       ├── components/
│       │   ├── StockSidebar.jsx   # 종목 사이드바 (추가/삭제/목록)
│       │   ├── NewsCard.jsx       # 뉴스 카드 컴포넌트
│       │   ├── DartCard.jsx       # DART 공시 카드 컴포넌트
│       │   ├── ModeToggle.jsx     # 자동/수동 토글
│       │   ├── ProgressPanel.jsx  # SSE 실시간 프로그레스 바
│       │   └── ReportHistory.jsx  # 생성된 리포트 목록
│       ├── App.jsx
│       └── main.jsx
├── server/                        # Express 백엔드
│   ├── api/
│   │   ├── newsCollector.js       # 네이버/구글 RSS 수집 (axios + cheerio)
│   │   ├── dartCollector.js       # DART OpenAPI 공시 수집
│   │   ├── aiSummarizer.js        # Ollama API 호출 (gemma4)
│   │   └── pdfGenerator.js        # Puppeteer HTML→PDF
│   ├── utils/
│   │   ├── stockCodes.js          # 주요 종목 코드 매핑 (검색용)
│   │   └── dartCorpCodes.js       # DART 기업고유번호 매핑 (캐시)
│   ├── data/
│   │   └── stocks.json            # 관심 종목 영구 저장 (서버 사이드)
│   ├── routes/
│   │   ├── stocks.js              # 종목 CRUD
│   │   ├── news.js                # 뉴스 수집 조회
│   │   ├── dart.js                # DART 공시 조회
│   │   ├── report.js              # 리포트 생성 + SSE + 다운로드
│   │   └── scheduler.js           # 스케줄러 설정/상태 + node-cron
│   └── index.js                   # Express 진입점 + 헬스체크
├── reports/                       # 생성된 PDF 저장
├── docs/
│   ├── design-system/
│   │   └── bmw-m-design-system.md
│   └── superpowers/specs/
│       └── 2026-05-27-stock-news-report-design.md
├── .env
├── .gitignore
├── package.json                   # 단일 package.json (모든 의존성)
└── CLAUDE.md
```

### 3.2 포트 구성

| 서비스 | 포트 | 비고 |
|--------|------|------|
| Express 서버 | 3001 | API + SSE + PDF 다운로드 |
| Vite 개발 서버 | 5173 | React 개발 (HMR) |
| Ollama | 11434 | 로컬 AI 서버 (외부) |

Vite → Express 프록시 설정: `/api/*` → `http://localhost:3001`

---

## 4. 핵심 데이터 흐름

### 4.1 리포트 생성 플로우 (수동 모드)

```
사용자 클릭 "GENERATE REPORT"
  → POST /api/report/generate
  → GET  /api/report/progress  (SSE 연결)

[서버 처리 — 종목별 순차 실행]
  for each 종목:
    1. 뉴스 수집 (RSS → 크롤링 fallback)    → SSE: "collecting_news"
    2. DART 공시 수집                        → SSE: "collecting_dart"
    3. Ollama AI 요약 (뉴스 × N건)           → SSE: "summarizing" (n/total)
    4. Ollama AI 요약 (공시 × N건)           → SSE: "summarizing_dart"
    종목 완료                                 → SSE: "stock_done"

  모든 종목 완료
    → Puppeteer HTML 렌더링 → PDF 저장       → SSE: "generating_pdf"
    → 완료                                   → SSE: "done" + {filename}

[클라이언트]
  SSE 이벤트 수신 → ProgressPanel 업데이트
  "done" 이벤트 → 자동 다운로드 + 완료 토스트
```

### 4.2 뉴스 수집 우선순위

```
1순위: 네이버 금융 뉴스 RSS
       https://finance.naver.com/item/news_news.naver?code={종목코드}
2순위: 구글 뉴스 RSS
       https://news.google.com/rss/search?q={종목명}+주식&hl=ko
3순위: 직접 크롤링 (RSS 실패 시 fallback)

수집 조건: 종목당 최대 10건, 24시간 이내 우선, URL 기준 중복 제거
수집 간격: 종목 간 1초 대기 (rate limiting)
```

### 4.3 DART 공시 수집

```
1. 앱 최초 실행 시 기업코드 XML 1회 다운로드 → dartCorpCodes.js 캐시
   GET https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={KEY}

2. 종목코드(6자리) → 기업고유번호(8자리) 변환

3. 공시 조회 (B: 주요사항보고, D: 지분공시 우선)
   GET https://opendart.fss.or.kr/api/list.json
       ?crtfc_key={KEY}&corp_code={CODE}
       &bgn_de={전날}&end_de={오늘}&sort=date&sort_mth=desc

4. 종목당 최대 10건, 없으면 "해당 기간 공시 없음" 표시
```

### 4.4 Ollama AI 요약

**API 호출**:
```javascript
POST http://localhost:11434/api/chat
{
  model: "gemma4:26b-a4b-it-q4_K_M",
  messages: [{ role: "user", content: prompt }],
  stream: false,
  format: "json"
}
```

**뉴스 프롬프트 → 응답**:
```json
{
  "summary": "2-3줄 핵심 요약",
  "impact": "상승요인 | 하락요인 | 중립",
  "reason": "주가 영향 이유 한 줄",
  "keywords": ["키워드1", "키워드2", "키워드3"]
}
```

**DART 프롬프트 → 응답**:
```json
{
  "summary": "공시 내용 2-3줄 요약",
  "impact": "상승요인 | 하락요인 | 중립",
  "reason": "주가 영향 이유 한 줄",
  "importance": "높음 | 보통 | 낮음"
}
```

---

## 5. API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | Ollama + DART 연결 상태 확인 |
| GET | `/api/stocks` | 관심 종목 목록 (server/data/stocks.json에서 읽기) |
| POST | `/api/stocks` | 종목 추가 (최대 20개 제한, stocks.json에 저장) |
| DELETE | `/api/stocks/:code` | 종목 삭제 |
| GET | `/api/stocks/search?q=` | 종목 검색 (stockCodes.js 기반) |
| GET | `/api/news/:code` | 특정 종목 최신 뉴스 수집 (실시간) |
| GET | `/api/dart/:code` | 특정 종목 DART 공시 조회 |
| POST | `/api/report/generate` | 리포트 생성 시작 (jobId 반환) |
| GET | `/api/report/progress/:jobId` | SSE 진행 상황 스트림 |
| GET | `/api/report/list` | 생성된 PDF 목록 |
| GET | `/api/report/download/:filename` | PDF 다운로드 |
| GET | `/api/scheduler/status` | 스케줄러 상태 |
| POST | `/api/scheduler/set` | 자동 생성 시간 설정 |

---

## 6. UI 설계

### 6.1 레이아웃 구조

```
┌─────────────────────────────────────────────────┐
│  STOCK NEWS REPORT    ● OLLAMA  [자동 ○ 수동]   │  ← 상단 네비 (52px)
├──────────────┬──────────────────────────────────┤
│  관심종목     │  삼성전자                         │
│  (3/20)      │  005930 · KOSPI · 2분 전         │  ← 종목 헤더
│  [검색창]    ├──────────────────────────────────┤
│  ───────     │  [뉴스(8)] [DART(2)] [요약]      │  ← 탭 바
│  삼성전자 ×  │                                   │
│  SK하이닉스× │  [프로그레스 패널 — 생성 중]       │
│  NAVER ×    │  ───────────────────────────────  │
│             │  최신 뉴스                         │
│  ───────    │  [뉴스 카드 목록]                  │
│  + 종목추가  │  [DART 카드 목록]                 │
│             │                                   │
│  ───────    │                                   │
│  GENERATE   │                                   │
│  REPORT     │                                   │
│  마지막:8시  │                                   │
└──────────────┴──────────────────────────────────┘
```

### 6.2 디자인 토큰 (BMW M 시스템 적용)

```css
/* 배경 */
--canvas: #000000;
--surface-soft: #0d0d0d;
--surface-card: #1a1a1a;
--surface-elevated: #262626;

/* 텍스트 */
--text-primary: #ffffff;
--text-body: #bbbbbb;
--text-muted: #7e7e7e;

/* 구분선 */
--hairline: #3c3c3c;

/* M 트라이컬러 (브랜드 전용 — 버튼/배경 금지) */
--m-blue-light: #0066b1;
--m-blue-dark: #1c69d4;
--m-red: #e22718;

/* 시맨틱 */
--up: #0fa336;      /* 상승요인 배지 */
--down: #e22718;    /* 하락요인 배지 */
--neutral: #3c3c3c; /* 중립 배지 */

/* 폰트: Inter 700(헤드라인) / 300(본문) */
/* 버튼: 0px 라디우스, UPPERCASE, 1.5px 자간 */
```

### 6.3 뉴스 카드 구조

```
┌──────────────────────────────────────┐
│ [언론사 · 시간]          [상승요인]  │
│                                      │
│ 기사 제목 (700 weight)               │
│                                      │
│ AI 요약 2-3줄 (300 weight, #bbb)    │
│                                      │
│ [키워드1] [키워드2] [키워드3]        │
│                                      │
│ 날짜시간                원문 보기 → │
└──────────────────────────────────────┘
```

### 6.4 DART 카드 구조

```
┌──────────────────────────────────────┐
│ [DART 공시 · 시간]  [중요도높음][하락│
│                                      │
│ [주요사항보고] 공시 제목              │
│                                      │
│ AI 요약 2-3줄 (300 weight, #bbb)    │
│                                      │
│ 날짜시간               공시 보기 → │
└──────────────────────────────────────┘
```

---

## 7. PDF 리포트 구성

**파일명**: `stock_report_YYYYMMDD_HHMM.pdf`  
**생성 방식**: HTML 템플릿 → Puppeteer → `reports/` 저장

```
[표지]
  제목: 주식 뉴스 리포트
  생성 날짜/시간
  포함 종목 목록

[종목별 섹션] × 종목 수
  종목명 + 종목코드 헤더
  [DART 공시] 전날~당일
    - 공시 제목, 유형, 날짜
    - AI 요약, 중요도 배지, 원문 링크
    - 없으면 "해당 기간 공시 없음"
  [뉴스] 최신순
    - 제목, 출처, 날짜
    - AI 요약, 영향 배지, 원문 링크

[요약 페이지]
  종목별 상승/하락/중립 건수 테이블
  종목별 DART 공시 건수
```

---

## 8. 에러 핸들링 전략

| 상황 | 처리 방식 |
|------|-----------|
| Ollama 미실행 | 앱 시작 시 헬스체크 → 상단 경고 배너 표시 |
| DART API 키 없음 | 공시 섹션 숨김, 뉴스만 수집 |
| 특정 종목 수집 실패 | 해당 종목만 건너뜀, 나머지 계속 |
| RSS 수집 실패 | 구글 뉴스 RSS → 크롤링 순서로 fallback |
| AI 요약 실패 | 원문 제목만 표시, 요약 없이 진행 |
| 한글 PDF 폰트 | Windows: Malgun Gothic 자동 사용 |

---

## 9. 환경 변수

```env
DART_API_KEY=your_dart_api_key_here
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:26b-a4b-it-q4_K_M
PORT=3001
CLIENT_PORT=5173
```

---

## 10. 개발 순서

1. **기반 세팅**: package.json, Vite 설정, Express 진입점, TailwindCSS, concurrently
2. **종목 관리**: 사이드바 UI + `/api/stocks` CRUD (server/data/stocks.json 영구 저장)
3. **뉴스 수집**: RSS 파서 → 크롤링 fallback → `/api/news/:code`
4. **DART 수집**: 기업코드 매핑 → 공시 조회 → `/api/dart/:code`
5. **AI 요약**: Ollama 연동 → 뉴스/공시 프롬프트 → 결과 파싱
6. **SSE 진행 상황**: `/api/report/generate` + `/api/report/progress/:jobId`
7. **PDF 생성**: Puppeteer HTML 템플릿 → PDF 저장 → 자동 다운로드
8. **스케줄러**: node-cron 자동 생성 모드 + 시간 설정 UI
9. **UI 완성**: BMW M 디자인 토큰 정교화, 에러 상태, 빈 상태, 토스트
10. **테스트 & 마무리**: 에러 핸들링, .env 예시 파일, README

---

## 11. 주요 의존성

```json
{
  "dependencies": {
    "express": "^4",
    "axios": "^1",
    "cheerio": "^1",
    "puppeteer": "^22",
    "node-cron": "^3",
    "cors": "^2",
    "dotenv": "^16",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4",
    "concurrently": "^9",
    "nodemon": "^3"
  }
}
```
