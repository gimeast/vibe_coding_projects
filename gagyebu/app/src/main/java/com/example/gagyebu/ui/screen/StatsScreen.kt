package com.example.gagyebu.ui.screen

import androidx.compose.animation.core.*
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gagyebu.data.db.CategoryStat
import com.example.gagyebu.data.db.DailyStat
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.ui.theme.*
import com.example.gagyebu.ui.viewmodel.StatsViewModel
import com.example.gagyebu.util.FormatUtil
import kotlinx.coroutines.flow.drop
import java.time.YearMonth

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun StatsScreen(viewModel: StatsViewModel) {
    val currentMonth by viewModel.currentMonth.collectAsState()
    val income by viewModel.monthlyIncome.collectAsState()
    val expense by viewModel.monthlyExpense.collectAsState()
    val categoryStats by viewModel.categoryStats.collectAsState()
    val dailyStats by viewModel.dailyStats.collectAsState()
    val statsType by viewModel.statsType.collectAsState()

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
                if (newMonth != viewModel.currentMonth.value) viewModel.setMonth(newMonth)
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
        // Month nav (고정)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
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

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { _ ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
            ) {
                // Summary row
                Row(modifier = Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SummaryCard("수입", income, IncomeGreen, Modifier.weight(1f))
                    SummaryCard("지출", expense, ExpenseRed, Modifier.weight(1f))
                    SummaryCard("잔액", income - expense, if (income >= expense) IncomeGreen else ExpenseRed, Modifier.weight(1f))
                }

                Spacer(Modifier.height(16.dp))

                // Type toggle
                Row(
                    modifier = Modifier
                        .padding(horizontal = 16.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surface)
                ) {
                    TypeTab("지출", statsType == TransactionType.EXPENSE, ExpenseRed, Modifier.weight(1f)) {
                        viewModel.setStatsType(TransactionType.EXPENSE)
                    }
                    TypeTab("수입", statsType == TransactionType.INCOME, IncomeGreen, Modifier.weight(1f)) {
                        viewModel.setStatsType(TransactionType.INCOME)
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Pie chart
                if (categoryStats.isNotEmpty()) {
                    PieChartSection(categoryStats = categoryStats, type = statsType)
                } else {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("데이터가 없어요", color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f))
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Daily bar chart
                if (dailyStats.isNotEmpty()) {
                    DailyBarChart(dailyStats = dailyStats, type = statsType)
                }

                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

@Composable
fun SummaryCard(label: String, amount: Long, color: Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
            Text(
                FormatUtil.formatAmountCompact(Math.abs(amount)),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = color,
                maxLines = 1
            )
        }
    }
}

@Composable
fun PieChartSection(categoryStats: List<CategoryStat>, type: TransactionType) {
    val total = categoryStats.sumOf { it.total }.takeIf { it > 0 } ?: 1L
    val animProgress = remember { Animatable(0f) }

    LaunchedEffect(categoryStats) {
        animProgress.snapTo(0f)
        animProgress.animateTo(1f, animationSpec = tween(800, easing = EaseOutCubic))
    }

    val chartColors = if (type == TransactionType.INCOME) IncomeCategoryColors else ExpenseCategoryColors

    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text("카테고리별 분석", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(16.dp))

            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                // Pie chart
                Box(modifier = Modifier.size(140.dp), contentAlignment = Alignment.Center) {
                    androidx.compose.foundation.Canvas(modifier = Modifier.size(140.dp)) {
                        var startAngle = -90f
                        val stroke = 32f
                        val inset = stroke / 2
                        val arcSize = Size(size.width - stroke, size.height - stroke)
                        val arcOffset = Offset(inset / 2, inset / 2)

                        categoryStats.forEachIndexed { index, stat ->
                            val sweep = (stat.total.toFloat() / total) * 360f * animProgress.value
                            drawArc(
                                color = chartColors[index % chartColors.size],
                                startAngle = startAngle,
                                sweepAngle = sweep,
                                useCenter = false,
                                topLeft = arcOffset,
                                size = arcSize,
                                style = Stroke(width = stroke)
                            )
                            startAngle += sweep
                        }
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("합계", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                        Text(
                            "${total / 10000}만",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(Modifier.width(16.dp))

                // Legend
                Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                    categoryStats.take(6).forEachIndexed { index, stat ->
                        val percent = (stat.total.toFloat() / total * 100).toInt()
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(chartColors[index % chartColors.size])
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                stat.categoryName,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                "$percent%",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = chartColors[index % chartColors.size]
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Divider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            Spacer(Modifier.height(12.dp))

            // Detail list
            categoryStats.forEachIndexed { index, stat ->
                val percent = (stat.total.toFloat() / total * 100)
                val color = chartColors[index % chartColors.size]
                Column(modifier = Modifier.padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
                            Spacer(Modifier.width(8.dp))
                            Text(stat.categoryName, style = MaterialTheme.typography.bodyMedium)
                        }
                        Text(
                            FormatUtil.formatAmount(stat.total),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(color.copy(alpha = 0.15f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(percent / 100f * animProgress.value)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(2.dp))
                                .background(color)
                        )
                    }
                }
                if (index < categoryStats.size - 1) Spacer(Modifier.height(4.dp))
            }
        }
    }
}

@Composable
fun DailyBarChart(dailyStats: List<DailyStat>, type: TransactionType) {
    val maxVal = dailyStats.maxOf { if (type == TransactionType.EXPENSE) it.expense else it.income }.takeIf { it > 0 } ?: 1L
    val barColor = if (type == TransactionType.EXPENSE) ExpenseRed else IncomeGreen
    val animProgress = remember { Animatable(0f) }
    var selectedStat by remember { mutableStateOf<DailyStat?>(null) }

    LaunchedEffect(dailyStats, type) {
        animProgress.snapTo(0f)
        animProgress.animateTo(1f, animationSpec = tween(600))
        selectedStat = null
    }

    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("일별 추이", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (selectedStat != null) {
                    val selValue = if (type == TransactionType.EXPENSE) selectedStat!!.expense else selectedStat!!.income
                    val selDay = selectedStat!!.date.takeLast(2).trimStart('0')
                    Text(
                        "${selDay}일 · ${FormatUtil.formatAmount(selValue)}",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = barColor
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .height(140.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                dailyStats.forEach { stat ->
                    val value = if (type == TransactionType.EXPENSE) stat.expense else stat.income
                    val fraction = (value.toFloat() / maxVal) * animProgress.value
                    val day = stat.date.takeLast(2).trimStart('0')
                    val isSelected = selectedStat?.date == stat.date

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .width(24.dp)
                            .fillMaxHeight()
                            .clickable {
                                selectedStat = if (isSelected) null else stat
                            }
                    ) {
                        // 막대 영역
                        Box(
                            modifier = Modifier
                                .width(16.dp)
                                .weight(1f),
                            contentAlignment = Alignment.BottomCenter
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(16.dp)
                                    .fillMaxHeight(fraction.coerceIn(0.02f, 1f))
                                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                    .background(
                                        when {
                                            value <= 0 -> barColor.copy(alpha = 0.15f)
                                            isSelected -> barColor
                                            else -> barColor.copy(alpha = 0.45f)
                                        }
                                    )
                            )
                        }
                        // 레이블 영역
                        Spacer(Modifier.height(4.dp))
                        Text(
                            day,
                            style = MaterialTheme.typography.labelMedium,
                            fontSize = 9.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            color = if (isSelected) barColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }
}
