package com.example.gagyebu.ui.screen

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gagyebu.data.db.DailyStat
import com.example.gagyebu.data.model.Transaction
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.ui.theme.*
import com.example.gagyebu.ui.viewmodel.HomeViewModel
import com.example.gagyebu.util.FormatUtil
import kotlinx.coroutines.flow.drop
import java.time.LocalDate
import java.time.YearMonth

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun CalendarScreen(
    viewModel: HomeViewModel,
    onEditTransaction: (Long) -> Unit
) {
    val currentMonth by viewModel.currentMonth.collectAsState()
    val transactions by viewModel.transactions.collectAsState()
    val dailyStats by viewModel.dailyStats.collectAsState()

    val baseMonth = remember { YearMonth.now() }
    val centerPage = 5000
    val initialPage = remember {
        centerPage + (currentMonth.year - baseMonth.year) * 12 +
                (currentMonth.monthValue - baseMonth.monthValue)
    }
    val pagerState = rememberPagerState(initialPage = initialPage) { 10000 }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }
            .drop(1)
            .collect { page ->
                val newMonth = baseMonth.plusMonths((page - centerPage).toLong())
                if (newMonth != viewModel.currentMonth.value) viewModel.setCurrentMonth(newMonth)
            }
    }

    LaunchedEffect(currentMonth) {
        val targetPage = centerPage + (currentMonth.year - baseMonth.year) * 12 +
                (currentMonth.monthValue - baseMonth.monthValue)
        if (pagerState.currentPage != targetPage && !pagerState.isScrollInProgress) {
            pagerState.animateScrollToPage(targetPage)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // Month navigation
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = viewModel::previousMonth) {
                Icon(Icons.Default.ChevronLeft, "이전달")
            }
            Text(
                FormatUtil.formatYearMonth(currentMonth),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            IconButton(onClick = viewModel::nextMonth) {
                Icon(Icons.Default.ChevronRight, "다음달")
            }
        }

        // Day of week header (고정)
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            listOf("일", "월", "화", "수", "목", "금", "토").forEachIndexed { i, label ->
                Text(
                    label,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelMedium,
                    color = when (i) {
                        0 -> Color(0xFFE53E6A)
                        6 -> Color(0xFF4FC3F7)
                        else -> MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                    },
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        Spacer(Modifier.height(4.dp))

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            val pageMonth = baseMonth.plusMonths((page - centerPage).toLong())

            var selectedDate by remember { mutableStateOf<LocalDate?>(
                if (page == initialPage) LocalDate.now() else null
            ) }

            val dailyMap = remember(dailyStats) {
                dailyStats.associate { it.date to it }
            }
            val transactionsByDate = remember(transactions, selectedDate) {
                if (selectedDate == null) emptyList()
                else transactions.filter { it.date == FormatUtil.formatDate(selectedDate!!) }
            }

            Column(modifier = Modifier.fillMaxSize()) {
                // Calendar grid
                val firstDay = pageMonth.atDay(1)
                val firstDayOfWeek = firstDay.dayOfWeek.value % 7
                val daysInMonth = pageMonth.lengthOfMonth()
                val totalCells = firstDayOfWeek + daysInMonth
                val weeks = (totalCells + 6) / 7
                val today = LocalDate.now()

                Column(modifier = Modifier.padding(horizontal = 8.dp)) {
                    (0 until weeks).forEach { week ->
                        Row(modifier = Modifier.fillMaxWidth()) {
                            (0..6).forEach { dow ->
                                val dayNum = week * 7 + dow - firstDayOfWeek + 1
                                if (dayNum < 1 || dayNum > daysInMonth) {
                                    Spacer(Modifier.weight(1f).height(64.dp))
                                } else {
                                    val date = pageMonth.atDay(dayNum)
                                    val dateStr = FormatUtil.formatDate(date)
                                    val stat = dailyMap[dateStr]
                                    CalendarCell(
                                        date = date,
                                        isToday = date == today,
                                        isSelected = date == selectedDate,
                                        income = stat?.income ?: 0L,
                                        expense = stat?.expense ?: 0L,
                                        modifier = Modifier.weight(1f),
                                        isSunday = dow == 0,
                                        isSaturday = dow == 6
                                    ) { selectedDate = if (selectedDate == date) null else date }
                                }
                            }
                        }
                    }
                }

                Divider(modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f))

                if (selectedDate != null && transactionsByDate.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                    ) {
                        Text(
                            FormatUtil.formatDateFull(FormatUtil.formatDate(selectedDate!!)),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                        )
                        transactionsByDate.forEach { t ->
                            TransactionItem(
                                transaction = t,
                                onEdit = { onEditTransaction(t.id) },
                                onDelete = { viewModel.deleteTransaction(t) }
                            )
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                } else if (selectedDate != null) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("이 날은 기록이 없어요", color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.3f))
                    }
                }
            }
        }
    }
}

@Composable
fun CalendarCell(
    date: LocalDate,
    isToday: Boolean,
    isSelected: Boolean,
    income: Long,
    expense: Long,
    modifier: Modifier,
    isSunday: Boolean,
    isSaturday: Boolean,
    onClick: () -> Unit
) {
    Column(
        modifier = modifier
            .height(64.dp)
            .padding(2.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    isSelected -> LocalAppColors.current.primary
                    isToday -> LocalAppColors.current.primaryLight
                    else -> Color.Transparent
                }
            )
            .clickable(onClick = onClick)
            .padding(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            date.dayOfMonth.toString(),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (isToday || isSelected) FontWeight.Bold else FontWeight.Normal,
            color = when {
                isSelected -> Color.White
                isSunday -> Color(0xFFE53E6A)
                isSaturday -> Color(0xFF4FC3F7)
                else -> MaterialTheme.colorScheme.onBackground
            }
        )
        if (expense > 0) {
            Text(
                "-${FormatUtil.formatAmountCalendar(expense)}",
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.White.copy(alpha = 0.9f) else ExpenseRed,
                fontSize = 9.sp,
                maxLines = 1
            )
        }
        if (income > 0) {
            Text(
                "+${FormatUtil.formatAmountCalendar(income)}",
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.White.copy(alpha = 0.9f) else IncomeGreen,
                fontSize = 9.sp,
                maxLines = 1
            )
        }
    }
}
