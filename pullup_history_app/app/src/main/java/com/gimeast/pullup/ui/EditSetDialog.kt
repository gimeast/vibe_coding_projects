package com.gimeast.pullup.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.gimeast.pullup.data.SetEntity

/**
 * 이미 저장된 세트를 수정하는 다이얼로그. 운동 화면과 히스토리 화면이 함께 쓴다.
 *
 * @param onSave (횟수, 소요시간ms, 휴식초)
 */
@Composable
fun EditSetDialog(
    set: SetEntity,
    onSave: (reps: Int, durationMs: Long, restSec: Int) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val totalSec = (set.durationMs + 500) / 1000

    var repsText by rememberSaveable(set.id) { mutableStateOf(set.reps.toString()) }
    var minuteText by rememberSaveable(set.id) { mutableStateOf((totalSec / 60).toString()) }
    var secondText by rememberSaveable(set.id) { mutableStateOf((totalSec % 60).toString()) }
    var restSec by rememberSaveable(set.id) { mutableIntStateOf(set.restSec) }
    var confirmDelete by rememberSaveable(set.id) { mutableStateOf(false) }

    val reps = repsText.toIntOrNull() ?: 0
    val durationMs = ((minuteText.toIntOrNull() ?: 0) * 60L + (secondText.toIntOrNull() ?: 0)) * 1000L

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${set.setNumber}세트 수정", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                SectionLabel("횟수")
                RepsPicker(repsText) { repsText = it }

                Spacer(Modifier.height(18.dp))

                SectionLabel("소요 시간")
                DurationPicker(
                    minuteText = minuteText,
                    secondText = secondText,
                    onMinuteChange = { minuteText = it },
                    onSecondChange = { secondText = it },
                )

                Spacer(Modifier.height(18.dp))

                SectionLabel("휴식 시간")
                RestPicker(restSec) { restSec = it }
                Spacer(Modifier.height(10.dp))
                RestPresetChips(restSec) { restSec = it }

                Spacer(Modifier.height(16.dp))

                TextButton(onClick = { confirmDelete = true }) {
                    Text("이 세트 삭제", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(reps, durationMs, restSec) },
                enabled = reps > 0,
            ) {
                Text("저장", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("취소") }
        },
    )

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("${set.setNumber}세트를 삭제할까요?") },
            text = { Text("${set.reps}회 기록이 사라지고, 뒤 세트 번호가 하나씩 당겨집니다.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text("삭제", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("취소") }
            },
        )
    }
}
