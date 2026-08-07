# Video Download

URL을 입력하면 해당 페이지에서 동영상을 찾아 다운로드하는 데스크톱 앱. Windows / macOS.

설계와 로드맵은 [DESIGN.md](DESIGN.md) 참고.

## 시작하기

```bash
npm install
npm run fetch:bin   # yt-dlp 바이너리를 resources/bin/ 에 내려받음
npm run dev
```

`ffmpeg` 는 별도로 필요하다. 없으면 병합과 오디오 추출이 실패한다.

```bash
brew install ffmpeg          # macOS
winget install Gyan.FFmpeg   # Windows
```

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 모드 실행 (렌더러 HMR) |
| `npm run build` | 타입체크 + 3개 번들 빌드 |
| `npm run typecheck` | main / renderer 타입체크만 |
| `npm run fetch:bin` | 현재 플랫폼용 yt-dlp 내려받기 (`--all` 로 전 플랫폼) |
| `npm run pack:mac` / `pack:win` | 배포용 패키징 (Phase 4) |

## 바이너리 해석 순서

1. `resources/bin/<platform>-<arch>/` 의 동봉본
2. 시스템 `PATH`
3. macOS 한정으로 `/opt/homebrew/bin`, `/usr/local/bin` 등 추가 탐색

3번이 필요한 이유는 Finder로 띄운 앱이 로그인 셸의 `PATH` 를 물려받지 않기 때문이다.
Homebrew로 깐 yt-dlp가 `PATH` 에 없는 게 이 환경에서는 정상 동작이다.

## yt-dlp 버전 주의

사이트들이 수시로 추출기를 깨뜨려서 yt-dlp는 거의 주 단위로 릴리스된다.
**몇 달만 방치해도 주요 플랫폼이 통째로 실패한다.**

앱은 시작할 때 마지막 갱신으로부터 7일이 지났으면 백그라운드로 `yt-dlp -U` 를 돌리고,
하단 상태바의 "업데이트" 버튼으로 직접 갱신할 수도 있다. 다만 **시스템에 설치된
yt-dlp는 패키지 매니저 소관이라 자동 갱신을 건너뛴다** — 이 경우 `brew upgrade yt-dlp`
로 직접 올려야 한다.

## 범위

DRM으로 보호된 콘텐츠(주요 OTT 등)는 지원하지 않으며 우회 수단도 제공하지 않는다.
대상 사이트의 이용약관과 저작권 준수는 사용자 책임이다.
