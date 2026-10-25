# 풀업 히스토리 (Pullup History)

풀업 세트를 스톱워치로 재고, 횟수와 휴식 시간을 기록해서 히스토리로 쌓아 보는 안드로이드 앱.

- Kotlin + Jetpack Compose (Material 3)
- Room (로컬 DB, `pullup.db`)
- AlarmManager 정확 알람 + 알림 채널로 휴식 종료 알림
- minSdk 26 / targetSdk 35

## 메뉴

| 탭 | 하는 일 |
| --- | --- |
| **운동** | 카운트다운 → 스톱워치 → 기록 입력 → 휴식 → 다음 세트 |
| **히스토리** | 요약 통계, 최근 추이 그래프, 날짜별 운동 기록 |

## 운동 흐름

1. **운동 시작** 버튼 → **3 · 2 · 1** 카운트다운(비프음 + 진동) → **GO!**
2. 스톱워치가 시작된다. (`mm:ss.d`)
3. **세트 종료** → 기록 다이얼로그
   - 소요 시간은 스톱워치 값이 자동으로 들어간다
   - **횟수**를 직접 입력 (± 버튼 또는 숫자 입력)
   - **휴식 시간** 선택 (± 15초, 프리셋 1분/1분30초/2분/3분/없음)
   - `계속 측정`을 누르면 멈춘 지점부터 스톱워치가 이어서 돈다
4. **저장** → 휴식 카운트다운 시작
   - `−30초` / `+30초` / `건너뛰고 시작`
5. 휴식이 끝나면 **알림 배너**가 뜨고, 이어서 다음 세트 카운트다운(3 · 2 · 1 비프음)이 자동으로 시작된다
   - 알람음과 진동은 쓰지 않는다. 카운트다운 비프음이 신호 역할을 한다
   - 자동 시작을 꺼두면 휴식이 끝날 때 비프음이 한 번 울린다
   - 자동 시작이 싫으면 `휴식 끝나면 다음 세트 자동 시작` 스위치를 끄면 된다
6. 세트 수 제한은 없다. 끝나면 **운동 종료**를 눌러 세션을 저장한다.

세트가 하나도 없는 세션은 저장되지 않는다. 앱이 종료됐다 켜져도 3시간 안의 미완료 세션은 이어서 진행된다.

## 데이터 구조

- `sessions` — 운동 1회 (`startedAt`, `endedAt`)
- `sets` — 세트 1개 (`setNumber`, `durationMs`, `reps`, `restSec`, `recordedAt`)

세션을 지우면 딸린 세트도 함께 지워진다(FK CASCADE).

## 권한

| 권한 | 이유 |
| --- | --- |
| `POST_NOTIFICATIONS` | 휴식 종료 알림 |
| `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` | 휴식 종료 시각에 정확히 울리기 위해 |

알림 채널은 무음이고 진동도 쓰지 않는다. 소리는 앱이 내는 비프음(`ToneGenerator`)뿐이라,
알림 권한을 거부해도 비프음은 그대로 울리고 배너만 뜨지 않는다.

기록 수정: 운동 중에는 `이번 운동 기록`의 행을, 히스토리에서는 운동을 펼친 뒤 세트 행을 탭하면
횟수 · 소요시간 · 휴식시간을 고치거나 그 세트를 지울 수 있다. 세트를 지우면 뒤 번호가 당겨진다.

## 빌드

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

결과물: `app/build/outputs/apk/debug/app-debug.apk`

기기에 설치:

```bash
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```
