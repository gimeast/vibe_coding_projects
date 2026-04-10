package com.example.gagyebu.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.gagyebu.data.db.CategoryStat
import com.example.gagyebu.data.db.DailyStat
import com.example.gagyebu.data.db.GagyebuRepository
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.util.FormatUtil
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import java.time.YearMonth

@OptIn(ExperimentalCoroutinesApi::class)
class StatsViewModel(private val repository: GagyebuRepository) : ViewModel() {

    private val _currentMonth = MutableStateFlow(YearMonth.now())
    val currentMonth: StateFlow<YearMonth> = _currentMonth.asStateFlow()

    private val _statsType = MutableStateFlow(TransactionType.EXPENSE)
    val statsType: StateFlow<TransactionType> = _statsType.asStateFlow()

    val monthlyIncome: StateFlow<Long> = _currentMonth
        .flatMapLatest { ym -> repository.getMonthlyIncome(FormatUtil.toYearMonthString(ym)) }
        .map { it ?: 0L }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0L)

    val monthlyExpense: StateFlow<Long> = _currentMonth
        .flatMapLatest { ym -> repository.getMonthlyExpense(FormatUtil.toYearMonthString(ym)) }
        .map { it ?: 0L }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0L)

    val categoryStats: StateFlow<List<CategoryStat>> = combine(_currentMonth, _statsType) { ym, type ->
        Pair(FormatUtil.toYearMonthString(ym), type.name)
    }.flatMapLatest { (ymStr, typeStr) ->
        repository.getCategoryStats(ymStr, typeStr)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val dailyStats: StateFlow<List<DailyStat>> = _currentMonth
        .flatMapLatest { ym -> repository.getDailyStats(FormatUtil.toYearMonthString(ym)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun previousMonth() { _currentMonth.value = _currentMonth.value.minusMonths(1) }
    fun nextMonth() { _currentMonth.value = _currentMonth.value.plusMonths(1) }
    fun setMonth(ym: YearMonth) { _currentMonth.value = ym }
    fun setStatsType(t: TransactionType) { _statsType.value = t }

    class Factory(private val repository: GagyebuRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return StatsViewModel(repository) as T
        }
    }
}
