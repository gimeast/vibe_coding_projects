package com.example.gagyebu.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.gagyebu.data.db.DailyStat
import com.example.gagyebu.data.db.GagyebuRepository
import com.example.gagyebu.data.model.Transaction
import com.example.gagyebu.util.FormatUtil
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.YearMonth

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModel(private val repository: GagyebuRepository) : ViewModel() {

    private val _currentMonth = MutableStateFlow(YearMonth.now())
    val currentMonth: StateFlow<YearMonth> = _currentMonth.asStateFlow()

    // 홈 탭 재클릭 시 오늘 날짜 리셋 이벤트
    val resetHomeEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    val transactions: StateFlow<List<Transaction>> = _currentMonth
        .flatMapLatest { ym ->
            repository.getTransactionsByMonth(FormatUtil.toYearMonthString(ym))
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val monthlyIncome: StateFlow<Long> = _currentMonth
        .flatMapLatest { ym ->
            repository.getMonthlyIncome(FormatUtil.toYearMonthString(ym))
        }
        .map { it ?: 0L }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0L)

    val monthlyExpense: StateFlow<Long> = _currentMonth
        .flatMapLatest { ym ->
            repository.getMonthlyExpense(FormatUtil.toYearMonthString(ym))
        }
        .map { it ?: 0L }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0L)

    val dailyStats: StateFlow<List<DailyStat>> = _currentMonth
        .flatMapLatest { ym ->
            repository.getDailyStats(FormatUtil.toYearMonthString(ym))
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun previousMonth() { _currentMonth.value = _currentMonth.value.minusMonths(1) }
    fun nextMonth() { _currentMonth.value = _currentMonth.value.plusMonths(1) }
    fun setCurrentMonth(ym: YearMonth) { _currentMonth.value = ym }

    fun resetToToday() {
        _currentMonth.value = YearMonth.now()
        resetHomeEvent.tryEmit(Unit)
    }

    fun deleteTransaction(transaction: Transaction) {
        viewModelScope.launch {
            if (transaction.photoUri.isNotEmpty() && !transaction.photoUri.startsWith("content://")) {
                File(transaction.photoUri).delete()
            }
            repository.deleteTransaction(transaction)
        }
    }

    class Factory(private val repository: GagyebuRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(HomeViewModel::class.java)) {
                @Suppress("UNCHECKED_CAST")
                return HomeViewModel(repository) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class")
        }
    }
}
