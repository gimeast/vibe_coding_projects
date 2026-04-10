package com.example.gagyebu.ui.screen

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gagyebu.data.model.Transaction
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.ui.theme.*
import com.example.gagyebu.ui.viewmodel.HomeViewModel
import com.example.gagyebu.util.FormatUtil
import kotlinx.coroutines.flow.drop
import java.time.LocalDate
import java.time.YearMonth

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onAddTransaction: (String) -> Unit,
    onEditTransaction: (Long) -> Unit,
    onNavigateToStats: () -> Unit
) {
    val currentMonth by viewModel.currentMonth.collectAsState()
    val transactions by viewModel.transactions.collectAsState()
    val monthlyIncome by viewModel.monthlyIncome.collectAsState()
    val monthlyExpense by viewModel.monthlyExpense.collectAsState()
    val dailyStats by viewModel.dailyStats.collectAsState()

    var showDeleteDialog by remember { mutableStateOf<Transaction?>(null) }
    var showFab by remember { mutableStateOf(false) }

    // selectedDate를 pager 밖에서 관리 (탭 재클릭 리셋, 월 변경 리셋 가능)
    var selectedDate by remember { mutableStateOf<LocalDate?>(null) }

    val baseMonth = remember { YearMonth.now() }
    val centerPage = 5000
    val initialPage = remember {
        val vm = viewModel.currentMonth.value
        centerPage + (vm.year - baseMonth.year) * 12 + (vm.monthValue - baseMonth.monthValue)
    }
    val pagerState = rememberPagerState(initialPage = initialPage) { 10000 }

    // 탭 재클릭 리셋 이벤트 수신 → selectedDate 초기화
    LaunchedEffect(Unit) {
        viewModel.resetHomeEvent.collect {
            selectedDate = null
        }
    }

    // 페이지 안착 시 ViewModel 월 업데이트 + selectedDate 초기화
    // drop(1): 복원된 pager 초기값은 무시하고 사용자 스와이프 시에만 반응
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }
            .drop(1)
            .collect { page ->
                val newMonth = baseMonth.plusMonths((page - centerPage).toLong())
                if (newMonth != viewModel.currentMonth.value) {
                    viewModel.setCurrentMonth(newMonth)
                    selectedDate = null
                }
            }
    }

    // ViewModel 월 변경 시 pager 동기화 (스와이프 중 개입 방지) + selectedDate 초기화
    LaunchedEffect(currentMonth) {
        val targetPage = centerPage +
            (currentMonth.year - baseMonth.year) * 12 +
            (currentMonth.monthValue - baseMonth.monthValue)
        if (pagerState.currentPage != targetPage && !pagerState.isScrollInProgress) {
            pagerState.animateScrollToPage(targetPage)
        }
        selectedDate = null
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (showFab) {
                    FloatingActionButton(
                        onClick = { onAddTransaction("INCOME"); showFab = false },
                        containerColor = IncomeGreen,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(Icons.Default.Add, "수입", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    FloatingActionButton(
                        onClick = { onAddTransaction("EXPENSE"); showFab = false },
                        containerColor = ExpenseRed,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(Icons.Default.Remove, "지출", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                }
                FloatingActionButton(
                    onClick = { showFab = !showFab },
                    containerColor = LocalAppColors.current.primary,
                ) {
                    Icon(
                        if (showFab) Icons.Default.Close else Icons.Default.Add,
                        "추가",
                        tint = Color.White
                    )
                }
            }
        }
    ) { padding ->
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize().padding(padding)
        ) { page ->
            val pageMonth = baseMonth.plusMonths((page - centerPage).toLong())

            val grouped = remember(transactions, selectedDate) {
                val filtered = if (selectedDate != null)
                    transactions.filter { it.date == FormatUtil.formatDate(selectedDate!!) }
                else transactions
                filtered.groupBy { it.date }
                    .toSortedMap(compareByDescending { it })
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                item {
                    MonthHeader(
                        currentMonth = pageMonth,
                        income = monthlyIncome,
                        expense = monthlyExpense,
                        onPrev = viewModel::previousMonth,
                        onNext = viewModel::nextMonth,
                        onNavigateToStats = onNavigateToStats
                    )
                }

                item {
                    CalendarStrip(
                        yearMonth = pageMonth,
                        selectedDate = selectedDate,
                        dailyStats = dailyStats.associate { it.date to it.expense },
                        onDateSelected = { date ->
                            selectedDate = if (selectedDate == date) null else date
                        }
                    )
                }

                if (selectedDate != null) {
                    item {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            FilterChip(
                                selected = true,
                                onClick = { selectedDate = null },
                                label = { Text(FormatUtil.formatDateFull(FormatUtil.formatDate(selectedDate!!))) },
                                trailingIcon = { Icon(Icons.Default.Close, null, Modifier.size(16.dp)) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = LocalAppColors.current.primaryLight,
                                    selectedLabelColor = LocalAppColors.current.primaryDark
                                )
                            )
                        }
                    }
                }

                if (grouped.isEmpty()) {
                    item { EmptyState() }
                } else {
                    grouped.forEach { (date, dayTransactions) ->
                        item {
                            DateHeader(date = date, transactions = dayTransactions)
                        }
                        items(dayTransactions, key = { it.id }) { transaction ->
                            TransactionItem(
                                transaction = transaction,
                                onEdit = { onEditTransaction(transaction.id) },
                                onDelete = { showDeleteDialog = transaction }
                            )
                        }
                    }
                }
            }
        }
    }

    showDeleteDialog?.let { t ->
        AlertDialog(
            onDismissRequest = { showDeleteDialog = null },
            title = { Text("내역 삭제") },
            text = { Text("'${t.categoryName}' 내역을 삭제할까요?") },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.deleteTransaction(t); showDeleteDialog = null },
                    colors = ButtonDefaults.textButtonColors(contentColor = ExpenseRed)
                ) { Text("삭제") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = null }) { Text("취소") }
            }
        )
    }

}

@Composable
fun MonthHeader(
    currentMonth: YearMonth,
    income: Long,
    expense: Long,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onNavigateToStats: () -> Unit
) {
    val balance = income - expense
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = onPrev) {
                Icon(Icons.Default.ChevronLeft, "이전달", tint = MaterialTheme.colorScheme.onBackground)
            }
            Text(
                text = FormatUtil.formatYearMonth(currentMonth),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            IconButton(onClick = onNext) {
                Icon(Icons.Default.ChevronRight, "다음달", tint = MaterialTheme.colorScheme.onBackground)
            }
        }

        Spacer(Modifier.height(12.dp))

        Card(
            modifier = Modifier.fillMaxWidth().clickable { onNavigateToStats() },
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = LocalAppColors.current.primary)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("이번달 잔액", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                Text(
                    FormatUtil.formatAmount(balance),
                    style = MaterialTheme.typography.displayLarge.copy(fontSize = 28.sp),
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("수입", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                        Text(
                            "+${FormatUtil.formatAmount(income)}",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("지출", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                        Text(
                            "-${FormatUtil.formatAmount(expense)}",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CalendarStrip(
    yearMonth: YearMonth,
    selectedDate: LocalDate?,
    dailyStats: Map<String, Long>,
    onDateSelected: (LocalDate) -> Unit
) {
    val today = LocalDate.now()
    val daysInMonth = yearMonth.lengthOfMonth()
    val days = (1..daysInMonth).map { yearMonth.atDay(it) }

    val scrollState = rememberScrollState()
    val todayIndex = if (yearMonth.year == today.year && yearMonth.month == today.month) {
        today.dayOfMonth - 1
    } else 0

    val density = LocalDensity.current
    val configuration = LocalConfiguration.current

    // 오늘 날짜가 스트립 중앙에 오도록 스크롤
    LaunchedEffect(yearMonth) {
        val cellWidthPx = with(density) { 48.dp.toPx() }
        val rowPaddingPx = with(density) { 8.dp.toPx() }
        val screenWidthPx = with(density) { configuration.screenWidthDp.dp.toPx() }
        val todayCenter = todayIndex * cellWidthPx + cellWidthPx / 2f + rowPaddingPx
        val scrollTarget = (todayCenter - screenWidthPx / 2f).toInt().coerceAtLeast(0)
        scrollState.animateScrollTo(scrollTarget)
    }

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .padding(horizontal = 8.dp),
        ) {
            days.forEach { date ->
                DayCell(
                    date = date,
                    isToday = date == today,
                    isSelected = date == selectedDate,
                    expense = dailyStats[FormatUtil.formatDate(date)] ?: 0L,
                    onSelected = onDateSelected
                )
            }
        }
        Divider(color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
    }
}

@Composable
fun DayCell(
    date: LocalDate,
    isToday: Boolean,
    isSelected: Boolean,
    expense: Long,
    onSelected: (LocalDate) -> Unit
) {
    val isSunday = date.dayOfWeek.value == 7
    val isSaturday = date.dayOfWeek.value == 6
    val textColor = when {
        isSelected -> Color.White
        isSunday -> Color(0xFFE53E6A)
        isSaturday -> Color(0xFF4FC3F7)
        else -> MaterialTheme.colorScheme.onBackground
    }

    Column(
        modifier = Modifier
            .width(48.dp)
            .padding(vertical = 8.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (isSelected) LocalAppColors.current.primary
                else if (isToday) LocalAppColors.current.primaryLight
                else Color.Transparent
            )
            .clickable { onSelected(date) }
            .padding(horizontal = 4.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            FormatUtil.formatDayOfWeek(date),
            style = MaterialTheme.typography.labelMedium,
            color = if (isSelected) Color.White.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
            fontSize = 10.sp
        )
        Text(
            date.dayOfMonth.toString(),
            style = MaterialTheme.typography.titleMedium,
            color = textColor,
            fontWeight = if (isToday || isSelected) FontWeight.Bold else FontWeight.Normal
        )
        if (expense > 0) {
            Text(
                "-${FormatUtil.formatAmountCalendar(expense)}",
                style = MaterialTheme.typography.labelMedium,
                color = if (isSelected) Color.White.copy(alpha = 0.8f) else ExpenseRed,
                fontSize = 9.sp,
                maxLines = 1
            )
        } else {
            Spacer(Modifier.height(14.dp))
        }
    }
}

@Composable
fun DateHeader(date: String, transactions: List<Transaction>) {
    val dayIncome = transactions.filter { it.type == TransactionType.INCOME }.sumOf { it.amount }
    val dayExpense = transactions.filter { it.type == TransactionType.EXPENSE }.sumOf { it.amount }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = FormatUtil.formatDateFull(date),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (dayIncome > 0) Text("+${FormatUtil.formatAmount(dayIncome)}", style = MaterialTheme.typography.bodySmall, color = IncomeGreen)
            if (dayExpense > 0) Text("-${FormatUtil.formatAmount(dayExpense)}", style = MaterialTheme.typography.bodySmall, color = ExpenseRed)
        }
    }
}

@Composable
fun TransactionItem(
    transaction: Transaction,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var showImageDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 2.dp)
            .clickable { expanded = !expanded },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(
                                if (transaction.categoryColor.isNotEmpty())
                                    try { Color(android.graphics.Color.parseColor(transaction.categoryColor)).copy(alpha = 0.2f) }
                                    catch (e: Exception) { if (transaction.type == TransactionType.INCOME) IncomeGreen.copy(alpha = 0.15f) else ExpenseRed.copy(alpha = 0.15f) }
                                else if (transaction.type == TransactionType.INCOME) IncomeGreen.copy(alpha = 0.15f)
                                else ExpenseRed.copy(alpha = 0.15f)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            transaction.categoryIcon.ifEmpty { getCategoryEmoji(transaction.categoryName) },
                            fontSize = 18.sp
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            transaction.categoryName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        if (transaction.memo.isNotEmpty()) {
                            Text(
                                transaction.memo,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                maxLines = if (expanded) Int.MAX_VALUE else 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        } else if (transaction.time.isNotEmpty()) {
                            Text(
                                transaction.time,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                            )
                        }
                    }
                }
                Text(
                    text = FormatUtil.formatAmountWithSign(transaction.amount, transaction.type == TransactionType.EXPENSE),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (transaction.type == TransactionType.INCOME) IncomeGreen else ExpenseRed
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                ) {
                    if (transaction.photoUri.isNotEmpty()) {
                        AsyncImage(
                            model = transaction.photoUri,
                            contentDescription = "첨부 사진",
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(160.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { showImageDialog = true },
                            contentScale = ContentScale.Crop
                        )
                        Spacer(Modifier.height(4.dp))
                    }

                    if (showImageDialog) {
                        Dialog(
                            onDismissRequest = { showImageDialog = false },
                            properties = DialogProperties(usePlatformDefaultWidth = false)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(Color.Black.copy(alpha = 0.9f))
                                    .clickable { showImageDialog = false },
                                contentAlignment = Alignment.Center
                            ) {
                                AsyncImage(
                                    model = transaction.photoUri,
                                    contentDescription = "첨부 사진 원본",
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentScale = ContentScale.Fit
                                )
                            }
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = onEdit) {
                            Icon(Icons.Default.Edit, null, Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("수정")
                        }
                        TextButton(
                            onClick = onDelete,
                            colors = ButtonDefaults.textButtonColors(contentColor = ExpenseRed)
                        ) {
                            Icon(Icons.Default.Delete, null, Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("삭제")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("💸", fontSize = 48.sp)
        Spacer(Modifier.height(12.dp))
        Text(
            "기록된 내역이 없어요",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
        )
        Text(
            "+ 버튼을 눌러 추가하세요",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.3f)
        )
    }
}

fun getCategoryEmoji(name: String): String = when (name) {
    "식비" -> "🍜"
    "교통" -> "🚌"
    "병원" -> "🏥"
    "통신" -> "📱"
    "쇼핑" -> "🛍️"
    "급여" -> "💰"
    "기타수입" -> "💵"
    else -> "📦"
}

