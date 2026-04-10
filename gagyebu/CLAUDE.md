# 가계부 (Gagyebu) Android 프로젝트

> 동적 정보(버전, 알려진 이슈, 최근 변경사항)는 `CLAUDE.local.md`를 참조할 것.

## 프로젝트 구조

Kotlin + Jetpack Compose 기반 Android 가계부 앱.

```
app/src/main/java/com/example/gagyebu/
├── data/
│   ├── db/          # Room DAO, Repository, AppDatabase
│   └── model/       # Entity (Transaction, Category)
├── ui/
│   ├── screen/      # Composable 화면
│   ├── viewmodel/   # ViewModel
│   └── theme/       # 색상, 테마
└── util/            # FormatUtil 등 공용 유틸
```

## 아키텍처 규칙

- **패턴**: MVVM — View(Composable) → ViewModel(StateFlow) → Repository → Room
- 화면 간 공유 상태는 ViewModel에서 관리, Composable에 직접 비즈니스 로직 작성 금지
- Repository는 DAO를 감싸는 단순 위임 계층으로 유지
- DB 쿼리 결과는 `Flow`로 노출, ViewModel에서 `stateIn`으로 변환

## 코딩 컨벤션

- ViewModel 상태: `MutableStateFlow` (private) + `asStateFlow()` (public)
- 일회성 이벤트(저장 성공 등): `MutableSharedFlow`
- 날짜: `LocalDate`, 포맷은 항상 `FormatUtil` 사용 (`yyyy-MM-dd`)
- 금액: `Long` (원 단위), 표시는 `FormatUtil.formatAmount()` 사용
- 카테고리 이름은 Transaction에 스냅샷으로 저장 (`categoryName: String`)

## DB 마이그레이션 규칙

- DB 스키마 변경 시 반드시 `Migration` 추가, `fallbackToDestructiveMigration()` 사용 금지
- 카테고리 삭제 시 해당 카테고리를 사용하는 거래내역의 `categoryId`, `categoryName`을 "기타"(지출 id=8)로 업데이트할 것
- version 관리는 수동으로 진행 — `CLAUDE.local.md`의 현재 버전 확인 후 작업

## 작업 전 체크리스트

1. `CLAUDE.local.md` 확인 (현재 DB 버전, 알려진 이슈)
2. `gradle/libs.versions.toml` 확인 (라이브러리 버전)
3. `app/build.gradle.kts` 확인 (SDK, Java 버전)
333