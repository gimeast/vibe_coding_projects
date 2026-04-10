package com.example.gagyebu.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Pink80,
    secondary = PinkGrey80,
    tertiary = Red80,
    background = SurfaceDark,
    surface = CardDark,
    onPrimary = TextPrimary,
    onBackground = TextPrimaryDark,
    onSurface = TextPrimaryDark,
)

private val LightColorScheme = lightColorScheme(
    primary = PrimaryPink,
    secondary = PinkGrey40,
    tertiary = Red40,
    background = SurfaceLight,
    surface = CardLight,
    onPrimary = CardLight,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
)

@Composable
fun GagyebuTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    primaryHex: String = "#FF6B8A",
    content: @Composable () -> Unit
) {
    val theme = ThemeOptions.find { it.hex == primaryHex } ?: ThemeOptions.first()

    val colorScheme = if (darkTheme) {
        DarkColorScheme.copy(primary = theme.primary, primaryContainer = theme.primaryLight)
    } else {
        LightColorScheme.copy(primary = theme.primary, primaryContainer = theme.primaryLight)
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    // 다크모드에서는 파스텔 배경 대신 primary 반투명을 사용해 어두운 배경과 조화
    val appColors = if (darkTheme) {
        AppColors(theme.primary, theme.primary.copy(alpha = 0.18f), theme.primary.copy(alpha = 0.7f))
    } else {
        AppColors(theme.primary, theme.primaryLight, theme.primaryDark)
    }

    CompositionLocalProvider(
        LocalAppColors provides appColors
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
