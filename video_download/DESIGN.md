# 비디오 다운로더 — 설계 문서

URL을 입력하면 해당 페이지에서 동영상을 찾아 다운로드하는 데스크톱 앱. Windows / macOS 지원.

---

## 1. 결정 사항

| 항목 | 선택 | 근거 |
|---|---|---|
| 스택 | Electron + TypeScript + React | Chromium 내장 → 네트워크 스니핑이 공짜. 임의 페이지 대응의 핵심 |
| 빌드 | electron-vite | main/preload/renderer 3중 번들 처리, 렌더러 HMR |
| 다운로드 엔진 | yt-dlp (sidecar 바이너리) | 1800+ 사이트 추출기. 직접 구현 대상 아님 |
| 후처리 | ffmpeg (sidecar 바이너리) | 영상+음성 병합, 오디오 추출 |
| 배포 | 서명 없음, 개인용 | Apple 공증·Windows 인증서 생략 |
| UX | 프리셋 우선 + 고급 옵션 펼침 | 평소엔 원클릭, 필요할 때만 전체 포맷 목록 |

### 범위 밖

- **DRM 보호 콘텐츠** (Netflix, Disney+, 국내 OTT 등). Widevine 복호화는 기술적으로 막혀 있고 법적으로도 선을 넘음.
- 대상 사이트의 이용약관과 저작권은 사용자 책임 영역. 앱은 우회 수단을 제공하지 않음.

---

## 2. 아키텍처

```
┌──────────────────────────────────────────────┐
│ Renderer (React)                             │
│   URL 입력 · 프리셋 선택 · 진행률 · 고급 옵션    │
└──────────────┬───────────────────────────────┘
               │ IPC (contextBridge)
┌──────────────▼───────────────────────────────┐
│ Main Process (Node)                          │
│                                              │
│ ① Resolver — 2단 파이프라인                   │
│    1차  yt-dlp --dump-single-json            │
│         → 추출기 매칭되면 포맷 목록 확보          │
│    2차  실패 시 hidden BrowserWindow 로드      │
│         → webRequest 훅으로 .m3u8/.mpd/.mp4   │
│           낚아채기 + DOM <video>/<source> 스캔  │
│    3차  찾은 URL을 referer·쿠키와 함께 yt-dlp에  │
│                                              │
│ ② Downloader — 프로세스 관리, 진행률 파싱       │
│ ③ Muxer — ffmpeg 병합 / 오디오 추출            │
└──────────────────────────────────────────────┘
   resources/bin/{darwin-arm64, win32-x64}/
```

### 디렉터리

```
video_download/
├─ electron.vite.config.ts
├─ resources/bin/
│   ├─ darwin-arm64/{yt-dlp, ffmpeg}
│   └─ win32-x64/{yt-dlp.exe, ffmpeg.exe}
└─ src/
   ├─ main/
   │   ├─ index.ts            # 부트스트랩, 창 생성
   │   ├─ ipc.ts              # 채널 정의
   │   ├─ binaries.ts         # 경로 해석 + yt-dlp 자동 업데이트
   │   ├─ resolver/
   │   │   ├─ ytdlp.ts        # 1차 경로
   │   │   ├─ sniffer.ts      # 2차 경로
   │   │   └─ index.ts        # 오케스트레이션 + 폴백
   │   └─ download/
   │       ├─ job.ts          # 작업 1건 상태머신
   │       ├─ queue.ts        # 동시 실행 제한
   │       └─ progress.ts     # stdout 파싱
   ├─ preload/index.ts        # contextIsolation 유지
   └─ renderer/               # React
```

---

## 3. 핵심 설계 포인트

### 3.1 스니퍼와 로그인은 같은 문제

숨김 창에 `partition: 'persist:sniff'`를 주면 쿠키가 디스크에 유지된다.

```ts
const win = new BrowserWindow({
  show: false,
  webPreferences: { partition: 'persist:sniff' },
})

win.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
  if (/\.(m3u8|mpd)(\?|$)/.test(d.url))    candidates.push({ url: d.url, kind: 'manifest' })
  else if (/\.mp4(\?|$)/.test(d.url))      candidates.push({ url: d.url, kind: 'progressive' })
  cb({})
})
```

로그인이 필요한 페이지는 **같은 파티션의 창을 `show: true`로 띄워 사용자가 직접 로그인**하게 하고, 그 세션을 스니핑에 재사용한다. 시스템 브라우저에서 쿠키를 가져오는 `--cookies-from-browser` 방식보다 깔끔하고 덜 침습적이다.

우선순위: `manifest`(HLS/DASH) > `progressive`(단일 mp4). 매니페스트 쪽이 보통 최고 화질을 담고 있다.

### 3.2 진행률 파싱

기본 출력은 `\r` 기반이라 파싱이 어렵다. 템플릿을 지정해 한 줄씩 받는다.

```
--newline --no-colors
--progress-template "PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.speed)s|%(progress.eta)s"
```

`readline` 인터페이스로 `PROG|` 접두사만 걸러 파싱.

### 3.3 yt-dlp 자동 업데이트는 필수

사이트가 수시로 추출기를 깨뜨려 yt-dlp는 거의 주 단위로 릴리스된다. 방치하면 몇 달 뒤 YouTube조차 실패한다.

- 앱 시작 시 마지막 갱신으로부터 **7일 경과 시 백그라운드로 `yt-dlp -U`** 실행
- 설정 화면에 수동 "지금 업데이트" 버튼
- Phase 1부터 포함

### 3.4 작업 상태머신

```
queued → resolving → ready → downloading → muxing → done
             │          │          │
             ↓          ↓          ↓
          failed    canceled   canceled
```

`resolving` 1차 실패 시 자동으로 2차 스니퍼 폴백. 둘 다 실패하면 `failed` +
"이 페이지에서 영상을 찾지 못했습니다" 안내와 함께 브라우저 창 직접 열기 버튼 제공.

---

## 4. 프리셋 정의

| 프리셋 | yt-dlp 인자 |
|---|---|
| 최고 화질 (MP4) | `-f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b" --merge-output-format mp4` |
| 1080p 이하 | `-f "bv*[height<=1080]+ba/b[height<=1080]"` |
| 720p 이하 | `-f "bv*[height<=720]+ba/b[height<=720]"` |
| 오디오만 (M4A) | `-f "ba[ext=m4a]/ba"` |
| 오디오만 (MP3) | `-x --audio-format mp3 --audio-quality 0` |

**고급 펼침** 시 `--dump-single-json`으로 받아둔 전체 포맷 목록을 표로 표시
(해상도 · 코덱 · fps · 용량 · format_id), 직접 선택 가능.

---

## 5. 로드맵

### Phase 1 — 뼈대와 1차 경로 ✅
- [x] electron-vite 스캐폴딩, TS 설정, IPC 배선
- [x] sidecar 바이너리 경로 해석 (dev / packaged 분기, 시스템 PATH 폴백)
- [x] yt-dlp `--dump-single-json` 기반 메타데이터 조회
- [x] 프리셋 UI + 다운로드 실행 + 진행률 표시
- [x] 취소 처리 (프로세스 트리 kill + `.part` 정리)
- [x] yt-dlp 자동 업데이트 + `scripts/fetch-binaries.mjs`

이 단계만으로 YouTube 등 주요 플랫폼은 전부 동작한다.

**검증 기록** — 로컬 HTTP 서버의 단일 mp4로 인자 체인(진행률·`FINAL` 경로·종료코드)을
먼저 확인했고, 이후 실제 YouTube 영상으로 영상/음성 분리 스트림의 ffmpeg 병합
경로까지 확인했다 (720p60 AV1 + AAC, 단일 mp4로 결합됨).

§3.3 의 노후 문제는 가설이 아니라 실측이다. 개발 머신에 깔려 있던 Homebrew yt-dlp
(2025.04.30, 약 15개월 경과) 로는 YouTube 가 SABR 로 전환한 뒤라 실영상 포맷이
하나도 잡히지 않고 스토리보드 이미지만 남았다. 최신 바이너리(2026.07.04)로 바꾸자
포맷 33개(영상 23개, 4K 포함)가 정상 반환됐다.

### Phase 2 — 2차 경로 (스니퍼)
- [ ] hidden BrowserWindow + webRequest 후킹
- [ ] 후보 URL 수집·중복 제거·우선순위 판정
- [ ] DOM 스캔 (`<video>`, `<source>`)
- [ ] referer / User-Agent / 쿠키를 yt-dlp에 전달
- [ ] 로그인용 가시 창 (동일 파티션)

### Phase 3 — 다듬기
- [ ] 오디오 추출 프리셋 완성
- [ ] 큐 + 동시 실행 제한
- [ ] 에러 메시지 사람 말로 번역 (yt-dlp stderr → 안내문)
- [ ] 설정 (저장 경로, 파일명 템플릿, 동시 실행 수)

### Phase 4 — 패키징
- [ ] electron-builder 설정 (mac arm64, win x64)
- [ ] 바이너리 동봉 및 실행 권한 처리
- [ ] 서명 없이 실행하는 방법 안내 (mac 우클릭-열기 / win SmartScreen)

### 이후 후보
자막 다운로드 · 재생목록 일괄 · 다운로드 히스토리 · 구간 잘라내기
