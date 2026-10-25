package com.gimeast.pullup.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Mint = Color(0xFF7BE3A3)
val MintDark = Color(0xFF1F7A4C)
val Coral = Color(0xFFFF6B6B)
val Amber = Color(0xFFFFC46B)

private val DarkColors = darkColorScheme(
    primary = Mint,
    onPrimary = Color(0xFF06301A),
    primaryContainer = Color(0xFF17452F),
    onPrimaryContainer = Color(0xFFB9F6D2),
    secondary = Amber,
    onSecondary = Color(0xFF3A2600),
    tertiary = Color(0xFF8FB8FF),
    error = Coral,
    onError = Color(0xFF3A0A0A),
    background = Color(0xFF10131A),
    onBackground = Color(0xFFE6EAF2),
    surface = Color(0xFF171B24),
    onSurface = Color(0xFFE6EAF2),
    surfaceVariant = Color(0xFF232A38),
    onSurfaceVariant = Color(0xFFAEB8CC),
    outline = Color(0xFF3A445A),
    outlineVariant = Color(0xFF2A3243),
)

private val LightColors = lightColorScheme(
    primary = MintDark,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFC8F5DC),
    onPrimaryContainer = Color(0xFF08301C),
    secondary = Color(0xFFA16A00),
    tertiary = Color(0xFF2E5AAC),
    error = Color(0xFFC0392B),
    background = Color(0xFFF7F9FC),
    onBackground = Color(0xFF141821),
    surface = Color.White,
    onSurface = Color(0xFF141821),
    surfaceVariant = Color(0xFFE7ECF4),
    onSurfaceVariant = Color(0xFF4A5468),
    outline = Color(0xFFB9C2D2),
    outlineVariant = Color(0xFFDCE3ED),
)

/** 타이머 숫자는 자리수가 흔들리지 않도록 고정폭으로. */
val TimerTextStyle = TextStyle(
    fontFamily = FontFamily.Monospace,
    fontWeight = FontWeight.Bold,
    fontSize = 64.sp,
    letterSpacing = (-1).sp,
)

private val AppTypography = Typography()

@Composable
fun PullupTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content,
    )
}
