package com.example.gagyebu.util

import java.text.NumberFormat
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

object FormatUtil {
    private val korLocale = Locale.KOREA
    private val numberFormat = NumberFormat.getNumberInstance(korLocale)

    fun formatAmount(amount: Long): String {
        return "${numberFormat.format(amount)}원"
    }

    // 달력 셀용 초소형 포맷 (단위 없이 숫자만 최대한 짧게)
    fun formatAmountCalendar(amount: Long): String {
        val abs = Math.abs(amount)
        return when {
            abs >= 100_000_000L -> {
                val uk = abs / 100_000_000L
                val decimal = (abs % 100_000_000L) / 10_000_000L
                if (decimal == 0L) "${uk}억" else "${uk}.${decimal}억"
            }
            abs >= 10_000L -> {
                val man = abs / 10_000L
                val decimal = (abs % 10_000L) / 1_000L
                if (decimal == 0L) "${man}만" else "${man}.${decimal}만"
            }
            abs >= 1_000L -> {
                val chun = abs / 1_000L
                val decimal = (abs % 1_000L) / 100L
                if (decimal == 0L) "${chun}천" else "${chun}.${decimal}천"
            }
            else -> abs.toString()
        }
    }

    fun formatAmountCompact(amount: Long): String {
        val abs = Math.abs(amount)
        return when {
            abs >= 100_000_000L -> {
                val uk = abs / 100_000_000L
                val decimal = (abs % 100_000_000L) / 10_000_000L
                if (decimal == 0L) "${uk}억" else "${uk}.${decimal}억"
            }
            abs >= 10_000L -> {
                val man = abs / 10_000L
                val decimal = (abs % 10_000L) / 1_000L
                if (decimal == 0L) "${man}만" else "${man}.${decimal}만"
            }
            abs >= 1_000L -> {
                val chun = abs / 1_000L
                val decimal = (abs % 1_000L) / 100L
                if (decimal == 0L) "${chun}천" else "${chun}.${decimal}천"
            }
            else -> formatAmount(abs)
        }
    }

    fun formatAmountWithSign(amount: Long, isExpense: Boolean): String {
        val sign = if (isExpense) "-" else "+"
        return "$sign${numberFormat.format(amount)}원"
    }

    fun formatNumber(amount: Long): String {
        return numberFormat.format(amount)
    }

    fun parseDate(dateStr: String): LocalDate? {
        return try {
            LocalDate.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (e: Exception) {
            null
        }
    }

    fun formatDate(date: LocalDate): String {
        return date.format(DateTimeFormatter.ISO_LOCAL_DATE)
    }

    fun formatYearMonth(yearMonth: YearMonth): String {
        return "${yearMonth.year}년 ${yearMonth.monthValue}월"
    }

    fun toYearMonthString(yearMonth: YearMonth): String {
        return yearMonth.format(DateTimeFormatter.ofPattern("yyyy-MM"))
    }

    fun formatDayOfWeek(date: LocalDate): String {
        return when (date.dayOfWeek.value) {
            1 -> "월"
            2 -> "화"
            3 -> "수"
            4 -> "목"
            5 -> "금"
            6 -> "토"
            7 -> "일"
            else -> ""
        }
    }

    fun formatDateFull(dateStr: String): String {
        val date = parseDate(dateStr) ?: return dateStr
        val dow = formatDayOfWeek(date)
        return "${date.monthValue}월 ${date.dayOfMonth}일 $dow"
    }
}
