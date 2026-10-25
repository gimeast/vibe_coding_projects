package com.gimeast.pullup.workout

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gimeast.pullup.ui.RestPicker
import com.gimeast.pullup.ui.RestPresetChips
import com.gimeast.pullup.ui.RepsPicker
import com.gimeast.pullup.ui.SectionLabel
import com.gimeast.pullup.ui.formatDuration
import com.gimeast.pullup.ui.formatStopwatch

@Composable
fun LogSetDialog(
    setNumber: Int,
    durationMs: Long,
    defaultReps: Int,
    defaultRestSec: Int,
    autoStartNext: Boolean,
    onAutoStartChange: (Boolean) -> Unit,
    onSave: (reps: Int, restSec: Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var repsText by rememberSaveable { mutableStateOf(defaultReps.toString()) }
    var restSec by rememberSaveable { mutableIntStateOf(defaultRestSec) }

    val reps = repsText.toIntOrNull() ?: 0

    AlertDialog(
        onDismissRequest = { /* 실수로 닫히지 않도록 바깥 터치는 무시 */ },
        title = { Text("${setNumber}세트 기록", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                // 스톱워치 결과
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(vertical = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = "소요 시간",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = formatStopwatch(durationMs),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = formatDuration(durationMs),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))

                SectionLabel("횟수")
                RepsPicker(repsText) { repsText = it }

                Spacer(Modifier.height(18.dp))

                SectionLabel("휴식 시간")
                RestPicker(restSec) { restSec = it }
                Spacer(Modifier.height(10.dp))
                RestPresetChips(restSec) { restSec = it }

                Spacer(Modifier.height(6.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onAutoStartChange(!autoStartNext) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Start,
                ) {
                    Checkbox(checked = autoStartNext, onCheckedChange = onAutoStartChange)
                    Spacer(Modifier.width(2.dp))
                    Text(
                        text = "휴식 끝나면 다음 세트 자동 시작",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(reps, restSec) }, enabled = reps > 0) {
                Text("저장", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("계속 측정") }
        },
    )
}
