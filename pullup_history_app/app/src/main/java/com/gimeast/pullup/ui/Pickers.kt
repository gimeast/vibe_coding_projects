package com.gimeast.pullup.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

val REST_PRESETS = listOf(60, 90, 120, 180)

@Composable
fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 6.dp),
    )
}

@Composable
fun StepButton(icon: ImageVector, enabled: Boolean, onClick: () -> Unit) {
    FilledTonalIconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(48.dp),
    ) {
        Icon(icon, contentDescription = null)
    }
}

/** −/+ 버튼이 달린 횟수 입력. [repsText] 는 빈 문자열도 허용한다. */
@Composable
fun RepsPicker(repsText: String, onChange: (String) -> Unit) {
    val reps = repsText.toIntOrNull() ?: 0
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StepButton(Icons.Filled.Remove, enabled = reps > 0) {
            onChange((reps - 1).coerceAtLeast(0).toString())
        }
        OutlinedTextField(
            value = repsText,
            onValueChange = { input ->
                if (input.length <= 3 && input.all { it.isDigit() }) onChange(input)
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.headlineSmall.copy(
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
            ),
            trailingIcon = { Text("회") },
            modifier = Modifier.weight(1f),
        )
        StepButton(Icons.Filled.Add, enabled = reps < 999) {
            onChange((reps + 1).coerceAtMost(999).toString())
        }
    }
}

/** ±15초 스테퍼 + 프리셋 칩. */
@Composable
fun RestPicker(restSec: Int, onChange: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StepButton(Icons.Filled.Remove, enabled = restSec > 0) {
            onChange((restSec - 15).coerceAtLeast(0))
        }
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            Text(
                text = formatRest(restSec),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }
        StepButton(Icons.Filled.Add, enabled = restSec < 900) {
            onChange((restSec + 15).coerceAtMost(900))
        }
    }
}

@Composable
fun RestPresetChips(restSec: Int, onChange: (Int) -> Unit) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        REST_PRESETS.forEach { preset ->
            FilterChip(
                selected = restSec == preset,
                onClick = { onChange(preset) },
                label = { Text(formatRest(preset)) },
            )
        }
        FilterChip(
            selected = restSec == 0,
            onClick = { onChange(0) },
            label = { Text("없음") },
        )
    }
}

/** 분 · 초 두 칸으로 나눠 받는 소요시간 입력. */
@Composable
fun DurationPicker(
    minuteText: String,
    secondText: String,
    onMinuteChange: (String) -> Unit,
    onSecondChange: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OutlinedTextField(
            value = minuteText,
            onValueChange = { if (it.length <= 2 && it.all { c -> c.isDigit() }) onMinuteChange(it) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.titleLarge.copy(
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
            ),
            trailingIcon = { Text("분") },
            modifier = Modifier.weight(1f),
        )
        OutlinedTextField(
            value = secondText,
            onValueChange = { input ->
                if (input.length <= 2 && input.all { c -> c.isDigit() }) {
                    val v = input.toIntOrNull()
                    if (input.isEmpty() || (v != null && v <= 59)) onSecondChange(input)
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MaterialTheme.typography.titleLarge.copy(
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
            ),
            trailingIcon = { Text("초") },
            modifier = Modifier.weight(1f),
        )
    }
}
