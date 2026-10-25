package com.gimeast.pullup.workout

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gimeast.pullup.data.SetEntity
import com.gimeast.pullup.ui.EditSetDialog
import com.gimeast.pullup.ui.formatCountdown
import com.gimeast.pullup.ui.formatDuration
import com.gimeast.pullup.ui.formatRest
import com.gimeast.pullup.ui.formatStopwatch

@Composable
fun WorkoutScreen(
    state: WorkoutUiState,
    onStartSet: () -> Unit,
    onStopSet: () -> Unit,
    onCancelCountdown: () -> Unit,
    onSaveSet: (reps: Int, restSec: Int) -> Unit,
    onResumeSet: () -> Unit,
    onAdjustRest: (Int) -> Unit,
    onSkipRest: () -> Unit,
    onUpdateSet: (setId: Long, reps: Int, durationMs: Long, restSec: Int) -> Unit,
    onDeleteSet: (setId: Long) -> Unit,
    onAutoStartChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    // 운동 중에는 화면이 꺼지지 않도록
    val view = LocalView.current
    val keepOn = state.phase != Phase.IDLE || state.sessionActive
    DisposableEffect(keepOn) {
        view.keepScreenOn = keepOn
        onDispose { view.keepScreenOn = false }
    }

    // 수정 중인 세트
    var editingSetId by rememberSaveable { mutableStateOf<Long?>(null) }
    val editingSet = state.sets.firstOrNull { it.id == editingSetId }

    // 세트를 고칠 수 있는 단계 (카운트다운 · 기록 입력 중에는 잠근다)
    val editable = state.phase == Phase.IDLE ||
        state.phase == Phase.RESTING ||
        state.phase == Phase.RUNNING

    // 휴식·대기 중에는 스테이지를 줄여 기록 목록에 화면을 더 준다
    val stageHeight by animateDpAsState(
        targetValue = when (state.phase) {
            Phase.IDLE -> if (state.sessionActive) 218.dp else 300.dp
            Phase.COUNTDOWN -> 260.dp
            Phase.RUNNING, Phase.LOGGING -> 276.dp
            Phase.RESTING -> 186.dp
        },
        animationSpec = tween(220),
        label = "stage-height",
    )

    Column(modifier = modifier.fillMaxSize()) {

        SessionSummaryBar(state)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(stageHeight),
            contentAlignment = Alignment.Center,
        ) {
            when (state.phase) {
                Phase.IDLE -> IdleStage(state, onStartSet)
                Phase.COUNTDOWN -> CountdownStage(state, onCancelCountdown)
                Phase.RUNNING -> RunningStage(state, onStopSet)
                Phase.LOGGING -> RunningStage(state, onStopSet, dimmed = true)
                Phase.RESTING -> RestingStage(state, onAdjustRest, onSkipRest, onAutoStartChange)
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        SetListHeader(state, editable)

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (state.sets.isEmpty()) {
                item {
                    Text(
                        text = if (state.sessionActive) {
                            "첫 세트를 끝내면 여기에 쌓입니다."
                        } else {
                            "운동을 시작하면 세트가 여기에 기록됩니다."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 28.dp),
                        textAlign = TextAlign.Center,
                    )
                }
            }
            items(state.sets.reversed(), key = { it.id }) { set ->
                CompactSetRow(
                    set = set,
                    editable = editable,
                    onClick = { editingSetId = set.id },
                )
            }
        }
    }

    if (state.phase == Phase.LOGGING) {
        LogSetDialog(
            setNumber = state.nextSetNumber,
            durationMs = state.pendingDurationMs,
            defaultReps = state.lastReps,
            defaultRestSec = state.lastRestSec,
            autoStartNext = state.autoStartNext,
            onAutoStartChange = onAutoStartChange,
            onSave = onSaveSet,
            onDismiss = onResumeSet,
        )
    }

    if (editingSet != null) {
        EditSetDialog(
            set = editingSet,
            onSave = { reps, durationMs, restSec ->
                onUpdateSet(editingSet.id, reps, durationMs, restSec)
                editingSetId = null
            },
            onDelete = {
                onDeleteSet(editingSet.id)
                editingSetId = null
            },
            onDismiss = { editingSetId = null },
        )
    }
}

// ------------------------------------------------------------------ 상단 요약

@Composable
private fun SessionSummaryBar(state: WorkoutUiState) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SummaryStat("완료 세트", "${state.completedSetCount}")
            SummaryStat("총 횟수", "${state.totalReps}회")
            SummaryStat("운동 시간", formatDuration(state.totalWorkMs))
            SummaryStat(
                "한 세트 최다",
                state.sets.maxOfOrNull { it.reps }?.let { "${it}회" } ?: "-",
            )
        }
    }
}

@Composable
private fun SummaryStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ------------------------------------------------------------------ 메인 스테이지

@Composable
private fun IdleStage(state: WorkoutUiState, onStart: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        BigCircleButton(
            label = if (state.sessionActive) "${state.nextSetNumber}세트\n시작" else "운동\n시작",
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            icon = Icons.Filled.PlayArrow,
            onClick = onStart,
            size = if (state.sessionActive) 140.dp else 168.dp,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            text = "3 · 2 · 1 카운트다운 후 스톱워치가 시작됩니다",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CountdownStage(state: WorkoutUiState, onCancel: () -> Unit) {
    val isGo = state.countdownValue == 0
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "${state.nextSetNumber}세트 준비",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = if (isGo) "GO!" else "${state.countdownValue}",
            fontSize = if (isGo) 88.sp else 128.sp,
            fontWeight = FontWeight.Black,
            color = if (isGo) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
        )
        TextButton(onClick = onCancel) { Text("취소") }
    }
}

@Composable
private fun RunningStage(state: WorkoutUiState, onStop: () -> Unit, dimmed: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "${state.nextSetNumber}세트 진행 중",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = formatStopwatch(state.elapsedMs),
            fontFamily = FontFamily.Monospace,
            fontSize = 56.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(18.dp))
        BigCircleButton(
            label = "세트\n종료",
            containerColor = MaterialTheme.colorScheme.error,
            contentColor = MaterialTheme.colorScheme.onError,
            icon = Icons.Filled.Stop,
            onClick = onStop,
            enabled = !dimmed,
            size = 124.dp,
        )
    }
}

/** 휴식 중에는 가로로 눕혀서 높이를 아낀다. */
@Composable
private fun RestingStage(
    state: WorkoutUiState,
    onAdjust: (Int) -> Unit,
    onSkip: () -> Unit,
    onAutoStartChange: (Boolean) -> Unit,
) {
    val progress = if (state.restTotalMs > 0) {
        (state.restRemainingMs.toFloat() / state.restTotalMs.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val trackColor = MaterialTheme.colorScheme.outlineVariant
    val progressColor = MaterialTheme.colorScheme.secondary

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Canvas(modifier = Modifier.size(132.dp)) {
                val stroke = 11.dp.toPx()
                val inset = stroke / 2
                val arcSize = Size(size.width - stroke, size.height - stroke)
                drawArc(
                    color = trackColor,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
                drawArc(
                    color = progressColor,
                    startAngle = -90f,
                    sweepAngle = -360f * progress,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "휴식",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = formatCountdown(state.restRemainingMs),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "다음 ${state.nextSetNumber}세트",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(
                    onClick = { onAdjust(-30) },
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                ) { Text("−30초") }
                OutlinedButton(
                    onClick = { onAdjust(30) },
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                ) { Text("+30초") }
            }
            Button(
                onClick = onSkip,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) { Text("건너뛰고 시작") }
            Row(
                modifier = Modifier.clickable { onAutoStartChange(!state.autoStartNext) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.Bolt,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = if (state.autoStartNext) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = if (state.autoStartNext) "자동 시작 켜짐" else "자동 시작 꺼짐",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (state.autoStartNext) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

@Composable
private fun BigCircleButton(
    label: String,
    containerColor: Color,
    contentColor: Color,
    icon: ImageVector,
    onClick: () -> Unit,
    enabled: Boolean = true,
    size: Dp = 160.dp,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        modifier = Modifier.size(size),
        contentPadding = PaddingValues(0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
        ),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(32.dp))
            Text(
                text = label,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
                lineHeight = 20.sp,
            )
        }
    }
}

// ------------------------------------------------------------------ 세트 목록

@Composable
private fun SetListHeader(state: WorkoutUiState, editable: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "이번 운동 기록",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.weight(1f))
        if (state.sets.isNotEmpty() && editable) {
            Text(
                text = "탭해서 수정",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** 한 줄짜리 압축 행 — 한 화면에 최대한 많이 보이도록. */
@Composable
private fun CompactSetRow(
    set: SetEntity,
    editable: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (editable) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "${set.setNumber}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.width(12.dp))
            Text(
                text = "${set.reps}회",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = formatDuration(set.durationMs),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "휴식 ${formatRest(set.restSec)}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (editable) {
                Spacer(Modifier.width(8.dp))
                Icon(
                    Icons.Filled.Edit,
                    contentDescription = "수정",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
