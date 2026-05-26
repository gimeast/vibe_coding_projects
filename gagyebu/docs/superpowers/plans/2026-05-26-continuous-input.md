# 연속 입력 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내역 추가 화면에 연속 입력 토글을 추가해, ON 상태에서 저장 시 화면을 닫지 않고 폼을 초기화(날짜 유지)해 연속으로 여러 건을 등록할 수 있게 한다.

**Architecture:** ViewModel에 `continuousMode`/`savedCount` StateFlow를 추가하고 `save()` 분기 처리. Screen의 TopAppBar에 토글 + 카운터 띠를 추가. 기존 단건 저장 흐름은 그대로 유지.

**Tech Stack:** Kotlin, Jetpack Compose, Material3, StateFlow

---

## 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/src/main/java/com/example/gagyebu/ui/viewmodel/AddTransactionViewModel.kt` | `continuousMode`, `savedCount` 상태 추가, `save()` 분기 수정 |
| `app/src/main/java/com/example/gagyebu/ui/screen/AddTransactionScreen.kt` | TopAppBar에 토글 추가, 카운터 띠 추가 |

---

## Task 1: ViewModel에 연속 입력 상태 및 로직 추가

**Files:**
- Modify: `app/src/main/java/com/example/gagyebu/ui/viewmodel/AddTransactionViewModel.kt`

- [ ] **Step 1: `_continuousMode`, `_savedCount` StateFlow 추가**

`AddTransactionViewModel` 클래스 내 기존 상태 선언 블록(예: `_photoUri` 아래)에 아래 코드를 추가한다.

```kotlin
private val _continuousMode = MutableStateFlow(false)
val continuousMode: StateFlow<Boolean> = _continuousMode.asStateFlow()

private val _savedCount = MutableStateFlow(0)
val savedCount: StateFlow<Int> = _savedCount.asStateFlow()
```

- [ ] **Step 2: `setContinuousMode()` 함수 추가**

기존 setter 함수들(`setType`, `setAmount` 등) 블록 아래에 추가한다.

```kotlin
fun setContinuousMode(enabled: Boolean) {
    _continuousMode.value = enabled
    if (!enabled) _savedCount.value = 0
}
```

- [ ] **Step 3: `save()` 함수 내 DB 저장 후 분기 수정**

`save()` 함수의 `viewModelScope.launch` 블록 안에서 현재 마지막 줄인 `_saveSuccess.emit(Unit)` 을 아래처럼 교체한다.

기존:
```kotlin
repository.insertTransaction(transaction)
_saveSuccess.emit(Unit)
```

변경 후:
```kotlin
repository.insertTransaction(transaction)
if (_continuousMode.value) {
    _amount.value = ""
    _selectedCategory.value = null
    _memo.value = ""
    _photoUri.value = ""
    _savedCount.value++
} else {
    _saveSuccess.emit(Unit)
}
```

- [ ] **Step 4: 빌드 확인**

Android Studio에서 `Build > Make Project` 또는 터미널에서 실행:
```
./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL, 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/src/main/java/com/example/gagyebu/ui/viewmodel/AddTransactionViewModel.kt
git commit -m "feat: AddTransactionViewModel에 연속 입력 모드 상태 및 로직 추가"
```

---

## Task 2: Screen에 토글 UI 및 저장 카운터 띠 추가

**Files:**
- Modify: `app/src/main/java/com/example/gagyebu/ui/screen/AddTransactionScreen.kt`

- [ ] **Step 1: 신규 state 수집 추가**

`AddTransactionScreen` Composable 내 기존 `val fieldError by viewModel.fieldError.collectAsState()` 아래에 추가한다.

```kotlin
val continuousMode by viewModel.continuousMode.collectAsState()
val savedCount by viewModel.savedCount.collectAsState()
```

- [ ] **Step 2: TopAppBar `topBar` 슬롯을 Column으로 감싸고 카운터 띠 추가**

현재 `Scaffold`의 `topBar` 파라미터는 `TopAppBar { ... }` 하나만 있다.
이것을 `Column`으로 감싸고, 카운터 띠를 그 아래에 조건부로 추가한다.

기존:
```kotlin
topBar = {
    TopAppBar(
        title = { Text(if (transactionId != -1L) "내역 수정" else "내역 추가") },
        ...
    )
},
```

변경 후:
```kotlin
topBar = {
    Column {
        TopAppBar(
            title = { Text(if (transactionId != -1L) "내역 수정" else "내역 추가") },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.Close, "닫기")
                }
            },
            actions = {
                if (transactionId == -1L) {
                    Text(
                        "연속",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (continuousMode) LocalAppColors.current.primary
                                else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                    )
                    Switch(
                        checked = continuousMode,
                        onCheckedChange = viewModel::setContinuousMode,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = LocalAppColors.current.primary
                        )
                    )
                    Spacer(Modifier.width(4.dp))
                }
                TextButton(onClick = viewModel::save) {
                    Text("저장", color = LocalAppColors.current.primary, fontWeight = FontWeight.Bold)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MaterialTheme.colorScheme.background
            )
        )
        if (continuousMode && savedCount > 0) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(IncomeGreen)
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Text(
                    "✓ ${savedCount}건 저장됨",
                    color = Color.White,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
},
```

`IncomeGreen`은 이미 `import com.example.gagyebu.ui.theme.*` 로 임포트돼 있다.

- [ ] **Step 3: 빌드 확인**

```
./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL, 에러 없음

- [ ] **Step 4: 앱 실행 후 동작 검증**

1. 앱 실행 후 내역 추가 화면 진입
2. 상단바 오른쪽에 "연속" 토글이 OFF로 보이는지 확인
3. 토글 ON → 금액·카테고리 입력 후 저장
   - 화면이 닫히지 않고 폼이 초기화되는지 확인 (날짜는 유지)
   - "✓ 1건 저장됨" 초록 띠가 나타나는지 확인
4. 한 건 더 입력 후 저장 → "✓ 2건 저장됨"으로 카운터 증가 확인
5. 토글 OFF → 저장 시 화면이 닫히는지 (기존 동작) 확인
6. 내역 수정 화면 진입 → 토글이 보이지 않는지 확인

- [ ] **Step 5: 커밋**

```bash
git add app/src/main/java/com/example/gagyebu/ui/screen/AddTransactionScreen.kt
git commit -m "feat: 연속 입력 모드 토글 및 저장 카운터 UI 추가"
```
