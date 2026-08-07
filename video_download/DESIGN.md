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

#### 사례 연구 — v.daum.net (실측)

Phase 2 가 필요한 이유를 보여주는 전형적인 케이스라 기록해 둔다.
뉴스 기사 URL `https://v.daum.net/v/<id>` 를 넣었을 때:

1. yt-dlp 에 `daum.net`, `Kakao` 추출기가 **있는데도** `Unsupported URL` 이 난다.
   추출기가 옛 URL 형태(`tvpot.daum.net` 등)에 묶여 있어 현재 기사 URL 을 못 잡는다.
   `tvpot.daum.net/v/<id>` 형태로 바꿔 넣으면 Kakao 추출기로 가지만 ID 를 잘못
   잘라내며 404.
2. 기사 페이지 HTML 에는 `<video>` 도, `.m3u8/.mpd/.mp4` 도 **하나도 없다**.
   플레이어는 cross-origin `<iframe>`(`www.daum.net/video/embed/player/<vid>`) 안에 있다.
3. 그 embed 페이지도 Next.js SPA 라 정적 HTML 에 미디어 참조가 없다.
   런타임에 JS 가 API 를 호출해 주소를 받아온다.
4. 플레이어는 hls.js / dash.js + MSE 를 쓴다. `video.src` 는 `blob:` URL 이다.
5. 실제 소스는 XHR 로 요청되는 DASH 매니페스트였다:
   `vsak1.play.daum.net/.../dash/vhs/plain/adaptive.mpd?px-time=…&px-hash=…`
   이 URL 을 yt-dlp 에 직접 넘기니 포맷 7개(240p~1080p avc1 + m4a 오디오 2종)가
   정상 반환됐다. DRM 없음, 그대로 받을 수 있다.

**이 사례가 설계에 주는 교훈 세 가지**

- **DOM 스캔은 보조 수단으로 내려야 한다.** 요즘 플레이어는 `video.src` 가 `blob:` 라
  DOM 을 훑어봐야 아무것도 안 나온다. 네트워크 가로채기가 사실상 유일한 경로다.
- **서명 URL 의 만료를 다뤄야 한다.** 위 매니페스트는 `px-time` 으로 3시간짜리 토큰이
  걸려 있었다. 쿼리스트링을 한 글자도 손대지 않고 넘겨야 하고, 해석 결과(`MediaInfo`)를
  오래 캐시했다가 나중에 받으면 실패한다. 만료 시 재해석하는 경로가 필요하다.
- **iframe 을 자연히 커버한다.** `session.webRequest` 는 cross-origin iframe 의
  하위 요청까지 모두 본다. 별도 처리 없이 위 2~5 단계가 한 번에 풀린다.
  Tauri 대신 Electron 을 고른 이유가 정확히 이 지점이다.

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

### Phase 2 — 2차 경로 (스니퍼) ✅
- [x] hidden BrowserWindow + webRequest 후킹 (`sniffer.ts`)
- [x] 후보 URL 수집·중복 제거·우선순위 판정 (매니페스트 > progressive)
- [x] 자동 재생 트리거 — 모든 프레임에 `video.play()` + 재생 버튼 클릭 주입
- [x] 세그먼트 소음 제거 — `.m4s`/`.ts`, `init.*`, 번호 붙은 조각 제외
- [x] referer / User-Agent / 쿠키를 yt-dlp에 전달
- [x] **서명 매니페스트 재작성** (`manifest.ts`) — 아래 참고
- [x] 페이지 메타데이터(og:title, og:image)로 제목·썸네일·파일명 채우기
- [x] 서명 URL 만료 감지 후 안내 (경과 시간 기반)
- [x] 로그인용 가시 창 (동일 파티션)
- [ ] DOM 스캔 (`<video>`, `<source>`) — 보조 수단. `blob:` 인 경우가 많아 실익이 적어
      뒤로 미룸
- [ ] 만료 시 **자동** 재해석 (현재는 안내만)
- [ ] HLS(.m3u8) 서명 매니페스트 재작성 — 아래 참고

#### 서명 매니페스트 재작성이 필요한 이유

v.daum.net 사례에서 매니페스트는 받아지는데 **조각마다 403** 이 났다.
CDN 이 `?px-time=…&px-hash=…` 로 경로를 서명해 두는데, 브라우저의 dash.js 는
그 쿼리를 모든 조각 요청에 물려 보내는 반면 **yt-dlp 는 전파하지 않는다.**
(실측: 같은 조각 URL 이 쿼리 없이 403, 붙이면 200)

그래서 매니페스트를 직접 받아
1. `initialization` / `media` 템플릿에 쿼리를 덧붙이고 (XML 이라 `&` → `&amp;`)
2. 상대 경로가 풀리도록 절대 `<BaseURL>` 을 주입한 뒤

임시 파일로 저장하고 그 `file://` 주소를 yt-dlp 에 넘긴다.
yt-dlp 는 file:// 을 기본 차단하므로 **우리가 만든 파일에 한해서만**
`--enable-file-urls` 를 붙인다 (사용자 입력 URL 에는 절대 붙이지 않는다).

HLS 는 마스터 → 변형 플레이리스트로 이어지는 다단 구조라 재귀적으로 받아 고쳐야 한다.
실제 사례를 만나기 전에 넣으면 검증되지 않은 코드가 되므로 미뤄 뒀다.

#### 그 밖에 실측으로 드러난 것

- **`app.getAppPath()` 는 실행 방식에 따라 값이 달라진다.** `electron .` 이면 프로젝트
  루트지만 `electron out/main/foo.js` 면 그 파일의 디렉터리다. 동봉 바이너리를 못 찾고
  조용히 낡은 시스템 yt-dlp 로 폴백해 YouTube 가 통째로 실패했다. 후보 경로를 여러 개
  두어 해결.
- **동봉 yt-dlp 는 실행마다 ~9초를 쓴다.** PyInstaller 번들이라 매번 자기 자신을 풀어낸다.
  `--version` 조차 9초가 걸려서 타임아웃 10초로는 간헐적으로 "없음" 이 떴다.
- **숨김 창을 파괴하면 `window-all-closed` 가 발생한다.** 리스너가 없으면 Electron 이
  앱을 종료한다. 본 앱은 메인 창이 항상 떠 있어 무사하지만, 진단용 진입점에서는
  결과를 찍기도 전에 죽었다.

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
