# MacTemp

Apple Silicon 맥의 온도를 상단 메뉴바에 표시하는 가벼운 메뉴바 앱.

![menubar](https://img.shields.io/badge/macOS-13%2B-black) ![arch](https://img.shields.io/badge/arch-Apple%20Silicon-black)

## 특징

- **sudo 불필요.** `powermetrics` 와 달리 관리자 권한 없이 동작한다.
- **Dock 아이콘 없음.** 메뉴바에만 상주하는 `LSUIElement` 앱.
- 온도에 따라 글자 색이 바뀐다 (80°C 이상 주황, 95°C 이상 빨강).
- 감지된 모든 센서를 그룹별로 나눠서 볼 수 있다.
- 의존성 없음. Swift + AppKit 만 사용한다.

## 빌드 & 설치

```bash
./build.sh --install
```

`dist/MacTemp.app` 을 만들고 `/Applications` 에 복사한 뒤 실행한다.
설치 없이 빌드만 하려면 인자 없이 `./build.sh` 를 실행하고 `open dist/MacTemp.app`.

종료는 메뉴바 아이콘 > **MacTemp 종료**.

## 메뉴

| 항목 | 설명 |
| --- | --- |
| 그룹별 요약 | SoC / 배터리 / 저장장치 / 보드의 평균·최대 온도 |
| 모든 센서 | 감지된 센서 전체 목록 (M3 Pro 기준 약 46개) |
| 메뉴바 표시 항목 | SoC 평균 · SoC 최대 · 전체 최고 · 배터리 중 선택 |
| 단위 | °C / °F, 메뉴바에 단위 표시 여부 |
| 갱신 주기 | 1 / 2 / 5 / 10초 |
| 로그인 시 자동 실행 | `SMAppService` 로 로그인 항목 등록 |

설정은 `UserDefaults` 에 저장된다.

## 온도를 읽는 방법

인텔 맥은 SMC 키(`TC0P` 등)로 온도를 읽었지만, Apple Silicon 은 그 키들을 제공하지 않는다.
대신 온도 센서가 IOKit 의 HID 이벤트 시스템에 서비스로 올라와 있다.

```
IOHIDEventSystemClientCreate
  → SetMatching { PrimaryUsagePage: 0xff00, PrimaryUsage: 0x0005 }
  → CopyServices
  → IOHIDServiceClientCopyEvent(service, kIOHIDEventTypeTemperature /* 15 */)
  → IOHIDEventGetFloatValue(event, 15 << 16)
```

이 심볼들은 `IOKit.framework` 가 export 하지만 공개 헤더에는 없어서
[`HIDSensors.swift`](Sources/MacTemp/HIDSensors.swift) 에서 `@_silgen_name` 으로 직접 선언한다.
비공개 API 이므로 향후 macOS 업데이트에서 동작이 바뀔 수 있다.

### 센서 이름에 대하여

M2/M3 계열은 센서 이름이 `PMU tdie1`, `PMU tdev3` 처럼 일반적인 형태로 올라온다.
Apple 이 사람이 읽을 수 있는 이름(`CPU`, `GPU` 등)을 노출하지 않기 때문에
[`SensorReader.swift`](Sources/MacTemp/SensorReader.swift) 에서 이름 규칙으로 분류한다.

| 패턴 | 분류 | 의미 |
| --- | --- | --- |
| `PMU tdie*`, `tcal` | SoC (칩) | 칩 다이 온도 — CPU/GPU 를 포함한 실제 발열 지표 |
| `PMU tdev*` | 보드·주변부 | 다이 주변 기판 온도 |
| `gas gauge battery` | 배터리 | 배터리 셀 온도 |
| `NAND CH*` | 저장장치 | SSD 온도 |

따라서 "CPU 온도" 에 가장 가까운 값은 **SoC 최대**다. 개별 `tdie` 코어를 특정 코어에
정확히 대응시킬 방법은 없으므로 그룹 단위로만 보여준다.

## 성능

M3 Pro / 2초 갱신 기준 실측:

| 항목 | 값 |
| --- | --- |
| CPU 시간 | 180초 동안 0.29초 = **1코어의 0.16%** (12코어 전체로는 0.013%) |
| 메모리 (RSS) | 약 43MB, 8분간 증가 없음 |
| 메인 스레드 | 5초 샘플 중 4452/4458 이 idle |

센서 하나를 읽을 때 CPU 자체는 거의 안 쓰지만 HID 데몬 응답을 기다리느라 **호출당 약 0.8ms 블로킹**된다.
46개를 다 읽으면 38ms 라서 두 가지를 적용했다.

1. 읽기를 전용 시리얼 큐로 옮겨 메인 스레드가 멈추지 않게 했다.
   메뉴를 그릴 때만 동기로 읽는다 (사용자가 방금 클릭한 시점이라 지연이 드러나지 않는다).
2. 메뉴가 닫혀 있으면 메뉴바 숫자에 필요한 그룹만 읽는다.
   기본값인 "SoC 평균" 이면 46개 대신 22개만 읽어 한 주기가 38ms → 16ms 로 줄어든다.

## 알려진 제약

- Apple Silicon 전용. 인텔 맥은 센서 서비스가 잡히지 않아 "온도 센서를 읽을 수 없습니다" 가 뜬다.
- 팬 회전수는 표시하지 않는다 (SMC 를 따로 읽어야 함).
- 애드혹 서명이라 Gatekeeper 가 처음 실행 시 경고할 수 있다.
  이 경우 우클릭 > 열기, 또는 시스템 설정 > 개인정보 보호 및 보안에서 허용.
