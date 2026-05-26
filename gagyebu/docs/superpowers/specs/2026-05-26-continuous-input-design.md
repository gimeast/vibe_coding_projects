# 연속 입력 모드 설계

**날짜:** 2026-05-26
**범위:** 내역 추가 화면에서 한 번에 여러 건을 등록할 수 있는 기능

---

## 요구사항

현재 내역 추가 화면은 저장 시 화면이 닫혀 한 번에 한 건만 등록 가능하다.
여러 건을 연속으로 입력할 때 매번 화면을 다시 열어야 하는 불편함을 해소한다.

---

## 결정된 방식

| 항목 | 결정 |
|------|------|
| UX 방식 | 저장 후 폼 유지 (화면 안 닫힘) |
| 저장 후 초기화 필드 | 금액, 카테고리, 메모, 사진 |
| 저장 후 유지 필드 | 날짜, 지출/수입 타입 |
| UI 진입점 | 상단바 토글 스위치 (기본 OFF) |
| 수정 화면 | 토글 숨김 (수정은 연속 입력 불필요) |

---

## 동작 흐름

```
[토글 OFF - 기본]
저장 버튼 → DB 저장 → _saveSuccess emit → 화면 닫힘 (기존 동작)

[토글 ON - 연속 입력 모드]
저장 버튼 → DB 저장 → 금액/카테고리/메모/사진 초기화
                     → 날짜·타입 유지
                     → savedCount +1
                     → "✓ N건 저장됨" 초록 띠 표시
                     → 폼 대기 (화면 유지)

X 버튼 → 화면 닫힘 (모드 무관)
```

---

## 변경 파일

### 1. `AddTransactionViewModel.kt`

**추가할 상태:**
```kotlin
private val _continuousMode = MutableStateFlow(false)
val continuousMode: StateFlow<Boolean> = _continuousMode.asStateFlow()

private val _savedCount = MutableStateFlow(0)
val savedCount: StateFlow<Int> = _savedCount.asStateFlow()
```

**추가할 함수:**
```kotlin
fun setContinuousMode(enabled: Boolean) {
    _continuousMode.value = enabled
    if (!enabled) _savedCount.value = 0
}
```

**`save()` 수정:**
- 기존 유효성 검사 (금액, 카테고리) 동일
- DB 저장 후:
  - 연속 모드 OFF → `_saveSuccess.emit(Unit)` (기존 동작)
  - 연속 모드 ON → 폼 초기화 + `_savedCount.value++`

**폼 초기화 로직 (연속 모드 ON 저장 후):**
- `_amount.value = ""`
- `_selectedCategory.value = null`
- `_memo.value = ""`
- `_photoUri.value = ""`
- `_date.value` 유지 (변경 없음)
- `_type.value` 유지 (변경 없음)

### 2. `AddTransactionScreen.kt`

**TopAppBar actions 변경:**
- `transactionId == -1L` (추가 화면)일 때만 토글 표시
- 토글: "연속" 라벨 + Switch 컴포넌트
- 기존 "저장" TextButton 유지

**저장 카운터 표시:**
- 연속 모드 ON && savedCount > 0 일 때
- TopAppBar 하단에 `"✓ N건 저장됨"` 초록(IncomeGreen) 배경 띠 표시

---

## 에러 처리

- 연속 모드 ON 상태에서도 기존 에러 처리 동일 (금액 미입력, 카테고리 미선택 시 스낵바)
- DB 저장 실패 시 연속 모드 여부와 무관하게 에러 메시지 표시

---

## 비고

- `init()` 호출 시 `_continuousMode`, `_savedCount`는 초기화하지 않음
  (수정 화면 진입 시 토글 자체가 숨겨지므로 상관없음)
- 기존 `_saveSuccess` → `onNavigateBack()` 흐름은 그대로 유지
