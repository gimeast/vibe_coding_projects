package com.gimeast.pullup.history

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.gimeast.pullup.data.AppDatabase
import com.gimeast.pullup.data.SessionWithSets
import com.gimeast.pullup.data.SetEntity
import com.gimeast.pullup.ui.toLocalDate
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

data class HistoryStats(
    val totalSessions: Int = 0,
    val totalSets: Int = 0,
    val totalReps: Int = 0,
    val thisWeekReps: Int = 0,
    val bestSetReps: Int = 0,
    val bestSessionReps: Int = 0,
    /** 최근 12회 운동의 총 횟수 (오래된 것 → 최신 순) */
    val recentSessionReps: List<Int> = emptyList(),
)

data class HistoryUiState(
    val sessions: List<SessionWithSets> = emptyList(),
    val stats: HistoryStats = HistoryStats(),
    val loaded: Boolean = false,
)

class HistoryViewModel(app: Application) : AndroidViewModel(app) {

    private val dao = AppDatabase.get(app).workoutDao()

    val ui = dao.observeSessions()
        .map { all ->
            // 세트가 하나도 없는(진행 중이거나 버려진) 세션은 히스토리에서 제외
            val sessions = all.filter { it.sets.isNotEmpty() }
            HistoryUiState(
                sessions = sessions,
                stats = calcStats(sessions),
                loaded = true,
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HistoryUiState())

    fun deleteSession(sessionId: Long) = viewModelScope.launch {
        dao.deleteSession(sessionId)
    }

    fun updateSet(setId: Long, reps: Int, durationMs: Long, restSec: Int) = viewModelScope.launch {
        dao.updateSet(setId, reps, durationMs, restSec)
    }

    /** 세트를 지우고 번호를 당긴다. 마지막 세트였다면 세션도 함께 지운다. */
    fun deleteSet(set: SetEntity) = viewModelScope.launch {
        dao.deleteSet(set.id)
        dao.shiftSetNumbers(set.sessionId, set.setNumber)
        if (dao.countSets(set.sessionId) == 0) {
            dao.deleteSession(set.sessionId)
        }
    }

    private fun calcStats(sessions: List<SessionWithSets>): HistoryStats {
        if (sessions.isEmpty()) return HistoryStats()

        val weekStart = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val thisWeek = sessions.filter { !it.session.startedAt.toLocalDate().isBefore(weekStart) }

        return HistoryStats(
            totalSessions = sessions.size,
            totalSets = sessions.sumOf { it.sets.size },
            totalReps = sessions.sumOf { it.totalReps },
            thisWeekReps = thisWeek.sumOf { it.totalReps },
            bestSetReps = sessions.maxOf { it.bestSetReps },
            bestSessionReps = sessions.maxOf { it.totalReps },
            // sessions 는 최신순 → 그래프는 오래된 것부터 그린다
            recentSessionReps = sessions.take(12).map { it.totalReps }.reversed(),
        )
    }
}
