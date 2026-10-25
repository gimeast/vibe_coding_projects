package com.gimeast.pullup.ui

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val zone: ZoneId = ZoneId.systemDefault()

fun Long.toLocalDateTime(): LocalDateTime =
    Instant.ofEpochMilli(this).atZone(zone).toLocalDateTime()

fun Long.toLocalDate(): LocalDate = toLocalDateTime().toLocalDate()

private val dateFormatter = DateTimeFormatter.ofPattern("M월 d일 (E)", Locale.KOREAN)
private val timeFormatter = DateTimeFormatter.ofPattern("a h:mm", Locale.KOREAN)
private val yearDateFormatter = DateTimeFormatter.ofPattern("yyyy년 M월 d일 (E)", Locale.KOREAN)

fun formatDateHeader(millis: Long): String {
    val date = millis.toLocalDate()
    val today = LocalDate.now()
    return when (date) {
        today -> "오늘 · ${date.format(dateFormatter)}"
        today.minusDays(1) -> "어제 · ${date.format(dateFormatter)}"
        else -> if (date.year == today.year) date.format(dateFormatter) else date.format(yearDateFormatter)
    }
}

fun formatClock(millis: Long): String = millis.toLocalDateTime().format(timeFormatter)

/** 스톱워치용 — mm:ss.d */
fun formatStopwatch(ms: Long): String {
    val safe = ms.coerceAtLeast(0)
    val minutes = safe / 60_000
    val seconds = (safe % 60_000) / 1000
    val tenths = (safe % 1000) / 100
    return String.format(Locale.US, "%02d:%02d.%d", minutes, seconds, tenths)
}

/** 카운트다운용 — mm:ss (올림) */
fun formatCountdown(ms: Long): String {
    val totalSec = Math.ceil(ms.coerceAtLeast(0) / 1000.0).toInt()
    return String.format(Locale.US, "%02d:%02d", totalSec / 60, totalSec % 60)
}

/** 기록 표시용 — 1분 미만은 "42초", 이상은 "1분 12초" */
fun formatDuration(ms: Long): String {
    val totalSec = (ms.coerceAtLeast(0) + 500) / 1000
    val minutes = totalSec / 60
    val seconds = totalSec % 60
    return when {
        minutes == 0L -> "${seconds}초"
        seconds == 0L -> "${minutes}분"
        else -> "${minutes}분 ${seconds}초"
    }
}

/** 휴식시간 표시용 — "1분 30초" / "90초" 대신 짧게 */
fun formatRest(sec: Int): String = when {
    sec <= 0 -> "없음"
    sec < 60 -> "${sec}초"
    sec % 60 == 0 -> "${sec / 60}분"
    else -> "${sec / 60}분 ${sec % 60}초"
}
