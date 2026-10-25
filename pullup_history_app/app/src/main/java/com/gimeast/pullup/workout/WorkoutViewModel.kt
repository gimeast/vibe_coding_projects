package com.gimeast.pullup.workout

import android.app.Application
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.SystemClock
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.gimeast.pullup.data.AppDatabase
import com.gimeast.pullup.data.SessionEntity
import com.gimeast.pullup.data.SetEntity
import com.gimeast.pullup.notify.RestAlarm
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class Phase {
    /** 대기 중 — 세트를 시작할 수 있는 상태 */
    IDLE,

    /** 3 · 2 · 1 카운트다운 */
    COUNTDOWN,

    /** 스톱워치 작동 중 */
    RUNNING,

    /** 스톱워치 정지 후 횟수 · 휴식시간 입력 */
    LOGGING,

    /** 휴식 중 */
    RESTING,
}

data class WorkoutUiState(
    val phase: Phase = Phase.IDLE,
    val sessionId: Long? = null,
    val sessionStartedAt: Long = 0L,
    val sets: List<SetEntity> = emptyList(),

    /** 스톱워치 경과 시간 */
    val elapsedMs: Long = 0L,

    /** 카운트다운 남은 수. 0 이면 "GO!" */
    val countdownValue: Int = COUNTDOWN_FROM,

    /** 기록 입력 중인 세트의 수행 시간 */
    val pendingDurationMs: Long = 0L,

    val restRemainingMs: Long = 0L,
    val restTotalMs: Long = 0L,

    /** 다이얼로그 기본값으로 쓰이는 최근 입력값 */
    val lastReps: Int = 10,
    val lastRestSec: Int = 90,

    /** 휴식이 끝나면 자동으로 다음 세트 카운트다운을 시작할지 */
    val autoStartNext: Boolean = true,
) {
    val sessionActive: Boolean get() = sessionId != null
    val completedSetCount: Int get() = sets.size
    val nextSetNumber: Int get() = sets.size + 1
    val totalReps: Int get() = sets.sumOf { it.reps }
    val totalWorkMs: Long get() = sets.sumOf { it.durationMs }

    companion object {
        const val COUNTDOWN_FROM = 3
    }
}

class WorkoutViewModel(app: Application) : AndroidViewModel(app) {

    private val dao = AppDatabase.get(app).workoutDao()
    private val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val _ui = MutableStateFlow(
        WorkoutUiState(
            lastReps = prefs.getInt(KEY_LAST_REPS, 10),
            lastRestSec = prefs.getInt(KEY_LAST_REST, 90),
            autoStartNext = prefs.getBoolean(KEY_AUTO_START, true),
        ),
    )
    val ui = _ui.asStateFlow()

    /** 카운트다운 / 스톱워치 / 휴식 타이머를 도는 단일 잡 */
    private var timerJob: Job? = null

    /** 스톱워치 기준점 (기기 부팅 기준 시각이라 시스템 시계 변경에 영향받지 않음) */
    private var stopwatchBase = 0L

    /** 휴식 종료 예정 시각 (epoch millis) */
    private var restEndsAt = 0L

    private val toneGenerator: ToneGenerator? by lazy {
        runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 90) }.getOrNull()
    }

    init {
        restoreOpenSession()
    }

    // ---------------------------------------------------------------- 세션 복구

    /**
     * 앱이 종료됐다가 다시 열렸을 때, 끝내지 않은 세션이 있으면 이어서 진행한다.
     * 마지막 기록이 [STALE_SESSION_MS] 보다 오래됐으면 자동으로 마감한다.
     */
    private fun restoreOpenSession() = viewModelScope.launch {
        val open = dao.findOpenSession() ?: return@launch
        val sets = dao.getSets(open.id)
        val lastActivity = sets.maxOfOrNull { it.recordedAt } ?: open.startedAt

        if (sets.isEmpty()) {
            dao.deleteSession(open.id)
            return@launch
        }
        if (System.currentTimeMillis() - lastActivity > STALE_SESSION_MS) {
            dao.closeSession(open.id, lastActivity)
            return@launch
        }

        _ui.update {
            it.copy(
                phase = Phase.IDLE,
                sessionId = open.id,
                sessionStartedAt = open.startedAt,
                sets = sets,
            )
        }
    }

    // ---------------------------------------------------------------- 세트 진행

    /** 운동 시작 / 다음 세트 시작 — 3·2·1 카운트다운 후 스톱워치가 돌아간다. */
    fun startSet() {
        if (_ui.value.phase == Phase.COUNTDOWN || _ui.value.phase == Phase.RUNNING) return
        RestAlarm.cancel(getApplication())

        viewModelScope.launch {
            ensureSession()
            runCountdown()
        }
    }

    private suspend fun ensureSession() {
        if (_ui.value.sessionId != null) return
        val startedAt = System.currentTimeMillis()
        val id = dao.insertSession(SessionEntity(startedAt = startedAt))
        _ui.update { it.copy(sessionId = id, sessionStartedAt = startedAt, sets = emptyList()) }
    }

    private fun runCountdown() {
        timerJob?.cancel()
        _ui.update {
            it.copy(
                phase = Phase.COUNTDOWN,
                countdownValue = WorkoutUiState.COUNTDOWN_FROM,
                restRemainingMs = 0L,
                elapsedMs = 0L,
            )
        }
        timerJob = viewModelScope.launch {
            for (n in WorkoutUiState.COUNTDOWN_FROM downTo 1) {
                _ui.update { it.copy(countdownValue = n) }
                beep(ToneGenerator.TONE_PROP_BEEP, 150)
                delay(1000)
            }
            // "GO!"
            _ui.update { it.copy(countdownValue = 0) }
            beep(ToneGenerator.TONE_PROP_BEEP2, 400)
            delay(450)
            startStopwatch()
        }
    }

    private fun startStopwatch() {
        timerJob?.cancel()
        stopwatchBase = SystemClock.elapsedRealtime()
        _ui.update { it.copy(phase = Phase.RUNNING, elapsedMs = 0L) }
        timerJob = viewModelScope.launch {
            while (isActive) {
                _ui.update { it.copy(elapsedMs = SystemClock.elapsedRealtime() - stopwatchBase) }
                delay(37)
            }
        }
    }

    /** 스톱워치 정지 → 기록 입력 단계로 */
    fun stopSet() {
        if (_ui.value.phase != Phase.RUNNING) return
        timerJob?.cancel()
        val duration = SystemClock.elapsedRealtime() - stopwatchBase
        beep(ToneGenerator.TONE_PROP_ACK, 200)
        _ui.update { it.copy(phase = Phase.LOGGING, pendingDurationMs = duration, elapsedMs = duration) }
    }

    /** 기록 입력 취소 — 스톱워치를 멈춘 지점부터 이어서 다시 잰다. */
    fun resumeSet() {
        if (_ui.value.phase != Phase.LOGGING) return
        val already = _ui.value.pendingDurationMs
        timerJob?.cancel()
        stopwatchBase = SystemClock.elapsedRealtime() - already
        _ui.update { it.copy(phase = Phase.RUNNING) }
        timerJob = viewModelScope.launch {
            while (isActive) {
                _ui.update { it.copy(elapsedMs = SystemClock.elapsedRealtime() - stopwatchBase) }
                delay(37)
            }
        }
    }

    /** 세트를 저장하고 휴식으로 넘어간다. [restSec] 이 0 이면 곧바로 다음 세트 대기 상태가 된다. */
    fun saveSet(reps: Int, restSec: Int) {
        val state = _ui.value
        if (state.phase != Phase.LOGGING) return
        val sessionId = state.sessionId ?: return

        viewModelScope.launch {
            val entity = SetEntity(
                sessionId = sessionId,
                setNumber = state.nextSetNumber,
                durationMs = state.pendingDurationMs,
                reps = reps,
                restSec = restSec,
                recordedAt = System.currentTimeMillis(),
            )
            val id = dao.insertSet(entity)

            prefs.edit {
                putInt(KEY_LAST_REPS, reps)
                if (restSec > 0) putInt(KEY_LAST_REST, restSec)
            }

            _ui.update {
                it.copy(
                    sets = it.sets + entity.copy(id = id),
                    lastReps = reps,
                    lastRestSec = if (restSec > 0) restSec else it.lastRestSec,
                    pendingDurationMs = 0L,
                    elapsedMs = 0L,
                )
            }

            if (restSec > 0) startRest(restSec) else _ui.update { it.copy(phase = Phase.IDLE) }
        }
    }

    // ---------------------------------------------------------------- 휴식

    private fun startRest(seconds: Int) {
        restEndsAt = System.currentTimeMillis() + seconds * 1000L
        RestAlarm.schedule(getApplication(), restEndsAt, _ui.value.nextSetNumber)

        _ui.update {
            it.copy(
                phase = Phase.RESTING,
                restTotalMs = seconds * 1000L,
                restRemainingMs = seconds * 1000L,
            )
        }
        runRestTicker()
    }

    private fun runRestTicker() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (isActive) {
                val remaining = restEndsAt - System.currentTimeMillis()
                if (remaining <= 0) {
                    _ui.update { it.copy(restRemainingMs = 0L) }
                    onRestFinished()
                    break
                }
                _ui.update { it.copy(restRemainingMs = remaining) }
                delay(100)
            }
        }
    }

    /** 휴식 시간을 [deltaSec] 만큼 늘리거나 줄인다. */
    fun adjustRest(deltaSec: Int) {
        if (_ui.value.phase != Phase.RESTING) return
        val now = System.currentTimeMillis()
        val newEndsAt = (restEndsAt + deltaSec * 1000L).coerceAtLeast(now + 1000L)
        val added = newEndsAt - restEndsAt
        restEndsAt = newEndsAt

        RestAlarm.schedule(getApplication(), restEndsAt, _ui.value.nextSetNumber)
        _ui.update {
            it.copy(
                restTotalMs = (it.restTotalMs + added).coerceAtLeast(1000L),
                restRemainingMs = (restEndsAt - now).coerceAtLeast(0L),
            )
        }
    }

    /** 휴식을 건너뛰고 바로 다음 세트로. 자동 시작 설정과 무관하게 곧바로 시작한다. */
    fun skipRest() {
        if (_ui.value.phase != Phase.RESTING) return
        timerJob?.cancel()
        RestAlarm.cancel(getApplication())
        _ui.update { it.copy(restRemainingMs = 0L) }
        onRestFinished(forceStart = true)
    }

    private fun onRestFinished(forceStart: Boolean = false) {
        _ui.update { it.copy(phase = Phase.IDLE, restRemainingMs = 0L) }
        if (forceStart || _ui.value.autoStartNext) {
            // 곧바로 3 · 2 · 1 비프음이 이어지므로 따로 알리지 않는다.
            runCountdown()
        } else {
            // 자동 시작이 꺼져 있으면 휴식이 끝났다는 신호가 없으므로 한 번 울린다.
            beep(ToneGenerator.TONE_PROP_BEEP2, 400)
        }
    }

    // ---------------------------------------------------------------- 기타

    fun setAutoStartNext(enabled: Boolean) {
        prefs.edit { putBoolean(KEY_AUTO_START, enabled) }
        _ui.update { it.copy(autoStartNext = enabled) }
    }

    /** 이미 저장된 세트의 기록을 고친다. (휴식 중에도 가능) */
    fun updateSet(setId: Long, reps: Int, durationMs: Long, restSec: Int) {
        val sessionId = _ui.value.sessionId ?: return
        viewModelScope.launch {
            dao.updateSet(setId, reps, durationMs, restSec)
            _ui.update { it.copy(sets = dao.getSets(sessionId)) }
        }
    }

    /** 저장된 세트를 지우고 뒤 세트 번호를 당긴다. */
    fun deleteSet(setId: Long) {
        val state = _ui.value
        val sessionId = state.sessionId ?: return
        val target = state.sets.firstOrNull { it.id == setId } ?: return
        viewModelScope.launch {
            dao.deleteSet(target.id)
            dao.shiftSetNumbers(sessionId, target.setNumber)
            _ui.update { it.copy(sets = dao.getSets(sessionId)) }
        }
    }

    /** 운동 종료 — 세트가 하나도 없으면 세션 자체를 지운다. */
    fun finishWorkout() {
        val sessionId = _ui.value.sessionId ?: return
        val hadSets = _ui.value.sets.isNotEmpty()

        timerJob?.cancel()
        RestAlarm.cancel(getApplication())

        viewModelScope.launch {
            if (hadSets) {
                dao.closeSession(sessionId, System.currentTimeMillis())
            } else {
                dao.deleteSession(sessionId)
            }
            _ui.update {
                WorkoutUiState(
                    lastReps = it.lastReps,
                    lastRestSec = it.lastRestSec,
                    autoStartNext = it.autoStartNext,
                )
            }
        }
    }

    /** 카운트다운 중 취소 — 세트를 시작하기 전 상태로 되돌린다. */
    fun cancelCountdown() {
        if (_ui.value.phase != Phase.COUNTDOWN) return
        timerJob?.cancel()
        _ui.update { it.copy(phase = Phase.IDLE, countdownValue = WorkoutUiState.COUNTDOWN_FROM) }
    }

    override fun onCleared() {
        timerJob?.cancel()
        toneGenerator?.release()
        super.onCleared()
    }

    private fun beep(tone: Int, durationMs: Int) {
        runCatching { toneGenerator?.startTone(tone, durationMs) }
    }

    private companion object {
        const val PREFS = "pullup_prefs"
        const val KEY_LAST_REPS = "last_reps"
        const val KEY_LAST_REST = "last_rest"
        const val KEY_AUTO_START = "auto_start_next"

        /** 3시간 넘게 방치된 세션은 이어서 진행하지 않는다. */
        const val STALE_SESSION_MS = 3 * 60 * 60 * 1000L
    }
}
