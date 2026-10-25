package com.gimeast.pullup.history

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.gimeast.pullup.data.SessionWithSets
import com.gimeast.pullup.data.SetEntity
import com.gimeast.pullup.ui.EditSetDialog
import com.gimeast.pullup.ui.formatClock
import com.gimeast.pullup.ui.formatDateHeader
import com.gimeast.pullup.ui.formatDuration
import com.gimeast.pullup.ui.formatRest
import com.gimeast.pullup.ui.toLocalDate

@Composable
fun HistoryScreen(
    state: HistoryUiState,
    onDeleteSession: (Long) -> Unit,
    onUpdateSet: (setId: Long, reps: Int, durationMs: Long, restSec: Int) -> Unit,
    onDeleteSet: (SetEntity) -> Unit,
    modifier: Modifier = Modifier,
) {
    // 수정 중인 세트 (전체 세션을 통틀어 하나만)
    var editingSetId by rememberSaveable { mutableStateOf<Long?>(null) }
    val editingSet = state.sessions
        .asSequence()
        .flatMap { it.sets.asSequence() }
        .firstOrNull { it.id == editingSetId }

    if (editingSet != null) {
        EditSetDialog(
            set = editingSet,
            onSave = { reps, durationMs, restSec ->
                onUpdateSet(editingSet.id, reps, durationMs, restSec)
                editingSetId = null
            },
            onDelete = {
                onDeleteSet(editingSet)
                editingSetId = null
            },
            onDismiss = { editingSetId = null },
        )
    }

    if (state.loaded && state.sessions.isEmpty()) {
        EmptyHistory(modifier)
        return
    }

    // 날짜별로 묶어서 보여준다
    val grouped = remember(state.sessions) {
        state.sessions.groupBy { it.session.startedAt.toLocalDate() }
            .toList()
            .sortedByDescending { it.first }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { StatsCard(state.stats) }

        if (state.stats.recentSessionReps.size >= 2) {
            item { TrendCard(state.stats.recentSessionReps) }
        }

        grouped.forEach { (date, sessions) ->
            item(key = "header-$date") {
                Text(
                    text = formatDateHeader(sessions.first().session.startedAt),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
                )
            }
            items(sessions, key = { it.session.id }) { session ->
                SessionCard(
                    session = session,
                    onDelete = { onDeleteSession(session.session.id) },
                    onEditSet = { editingSetId = it.id },
                )
            }
        }
    }
}

@Composable
private fun EmptyHistory(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🏋️", style = MaterialTheme.typography.displayMedium)
            Spacer(Modifier.height(12.dp))
            Text(
                "아직 운동 기록이 없습니다",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "운동 탭에서 첫 세트를 시작해 보세요",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ------------------------------------------------------------------ 요약

@Composable
private fun StatsCard(stats: HistoryStats) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "이번 주 누적 횟수",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = "${stats.thisWeekReps}",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Black,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "회",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                StatTile("운동 횟수", "${stats.totalSessions}번")
                StatTile("총 세트", "${stats.totalSets}세트")
                StatTile("누적 풀업", "${stats.totalReps}회")
            }
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                StatTile("한 세트 최다", "${stats.bestSetReps}회")
                StatTile("한 운동 최다", "${stats.bestSessionReps}회")
                StatTile(
                    "운동당 평균",
                    if (stats.totalSessions > 0) "${stats.totalReps / stats.totalSessions}회" else "-",
                )
            }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String) {
    Column(
        modifier = Modifier.width(100.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun TrendCard(reps: List<Int>) {
    val max = (reps.maxOrNull() ?: 1).coerceAtLeast(1)
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "최근 운동별 총 횟수",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "최다 ${max}회",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(14.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(90.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                reps.forEach { value ->
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Bottom,
                    ) {
                        Text(
                            text = "$value",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(2.dp))
                        Box(
                            modifier = Modifier
                                // 기록이 적을 때 막대가 지나치게 뚱뚱해지지 않도록
                                .widthIn(max = 34.dp)
                                .fillMaxWidth()
                                .height((60 * value / max).coerceAtLeast(4).dp)
                                .background(
                                    MaterialTheme.colorScheme.primary,
                                    RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp),
                                ),
                        )
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ 세션 카드

@Composable
private fun SessionCard(
    session: SessionWithSets,
    onDelete: () -> Unit,
    onEditSet: (SetEntity) -> Unit,
) {
    var expanded by rememberSaveable(session.session.id) { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded }
                    .padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = formatClock(session.session.startedAt),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Badge("${session.sets.size}세트")
                        Badge("총 ${session.totalReps}회", highlight = true)
                        Badge("운동 ${formatDuration(session.totalDurationMs)}")
                    }
                }
                Icon(
                    imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = if (expanded) "접기" else "펼치기",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            AnimatedVisibility(visible = expanded) {
                Column {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    SetTable(session, onEditSet)
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "총 소요 ${formatDuration(session.elapsedMs)} · 세트를 탭하면 수정",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .weight(1f)
                                .padding(start = 8.dp),
                        )
                        IconButton(onClick = { confirmDelete = true }) {
                            Icon(
                                Icons.Filled.DeleteOutline,
                                contentDescription = "이 운동 삭제",
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("이 운동 기록을 삭제할까요?") },
            text = { Text("${session.sets.size}세트 · ${session.totalReps}회 기록이 사라집니다.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text("삭제", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("취소") } },
        )
    }
}

@Composable
private fun Badge(text: String, highlight: Boolean = false) {
    Surface(
        color = if (highlight) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.surfaceVariant
        },
        shape = CircleShape,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (highlight) FontWeight.Bold else FontWeight.Normal,
            color = if (highlight) {
                MaterialTheme.colorScheme.onPrimaryContainer
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun SetTable(session: SessionWithSets, onEditSet: (SetEntity) -> Unit) {
    val sets = session.orderedSets
    val maxReps = session.bestSetReps.coerceAtLeast(1)

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Row(modifier = Modifier.fillMaxWidth()) {
            TableHeader("세트", 0.16f)
            TableHeader("횟수", 0.18f)
            TableHeader("시간", 0.22f)
            TableHeader("휴식", 0.20f)
            Spacer(Modifier.weight(0.24f))
        }
        Spacer(Modifier.height(6.dp))

        sets.forEach { set ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onEditSet(set) }
                    .padding(vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.weight(0.16f),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "${set.setNumber}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Text(
                    text = "${set.reps}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(0.18f),
                )
                Text(
                    text = formatDuration(set.durationMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(0.22f),
                )
                Text(
                    text = formatRest(set.restSec),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(0.20f),
                )
                Box(
                    modifier = Modifier
                        .weight(0.24f)
                        .padding(start = 4.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(3.dp),
                            ),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(
                                (set.reps.toFloat() / maxReps.toFloat()).coerceIn(0.06f, 1f),
                            )
                            .height(6.dp)
                            .background(
                                MaterialTheme.colorScheme.primary,
                                RoundedCornerShape(3.dp),
                            ),
                    )
                }
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TableHeader(text: String, weight: Float) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Start,
        modifier = Modifier.weight(weight),
    )
}
