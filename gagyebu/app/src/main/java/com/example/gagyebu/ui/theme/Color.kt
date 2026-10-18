package com.example.gagyebu.ui.theme

import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

// Primary Blue (Modern Fintech)
val Blue80 = Color(0xFF93C5FD)
val BlueGrey80 = Color(0xFFCBD5E1)
val Blue40 = Color(0xFF3182F6)
val BlueGrey40 = Color(0xFF64748B)

// App specific
val PrimaryBlue = Color(0xFF3182F6)
val PrimaryBlueLight = Color(0xFFEBF4FF)
val PrimaryBlueDark = Color(0xFF1B64DA)
val AccentOrange = Color(0xFFFF8C61)

val IncomeGreen = Color(0xFF00B493)
val ExpenseRed = Color(0xFFF04452)

val SurfaceLight = Color(0xFFF8FAFC)
val SurfaceDark = Color(0xFF0F172A)
val CardLight = Color(0xFFFFFFFF)
val CardDark = Color(0xFF1E293B)

val TextPrimary = Color(0xFF0F172A)
val TextSecondary = Color(0xFF64748B)
val TextPrimaryDark = Color(0xFFF8FAFC)
val TextSecondaryDark = Color(0xFF94A3B8)

// 앱 테마 색상 ─ CompositionLocal로 전파
data class AppColors(
    val primary: Color,
    val primaryLight: Color,
    val primaryDark: Color,
)

val LocalAppColors = compositionLocalOf {
    AppColors(Color(0xFF3182F6), Color(0xFFEBF4FF), Color(0xFF1B64DA))
}

// 사용자 선택 가능한 테마 색상 목록
data class AppColorTheme(val hex: String, val name: String, val primary: Color, val primaryLight: Color, val primaryDark: Color)

val ThemeOptions = listOf(
    // Modern Fintech
    AppColorTheme("#3182F6", "모던블루",   Color(0xFF3182F6), Color(0xFFEBF4FF), Color(0xFF1B64DA)),
    AppColorTheme("#10B981", "에메랄드",   Color(0xFF10B981), Color(0xFFD1FAE5), Color(0xFF047857)),
    AppColorTheme("#6366F1", "인디고",     Color(0xFF6366F1), Color(0xFFEEF2FF), Color(0xFF4338CA)),
    AppColorTheme("#1E293B", "슬레이트",   Color(0xFF1E293B), Color(0xFFE2E8F0), Color(0xFF0F172A)),
    // Soft / Romantic
    AppColorTheme("#F06292", "로즈",       Color(0xFFF06292), Color(0xFFFFE0EE), Color(0xFFC2185B)),
    AppColorTheme("#E8A598", "피치",       Color(0xFFE8A598), Color(0xFFFAECE9), Color(0xFFB5625A)),
    // Powerful
    AppColorTheme("#D92323", "레드",       Color(0xFFD92323), Color(0xFFFFE0E0), Color(0xFF8B0000)),
    AppColorTheme("#BC0808", "크림슨",     Color(0xFFBC0808), Color(0xFFFFDFDF), Color(0xFF7A0004)),
    // Warm
    AppColorTheme("#D97230", "번트오렌지", Color(0xFFD97230), Color(0xFFF5E0CE), Color(0xFF9A4A15)),
    AppColorTheme("#D98473", "테라코타",   Color(0xFFD98473), Color(0xFFF5DDD8), Color(0xFFA65638)),
    AppColorTheme("#F2CC4A", "골든옐로",   Color(0xFFF2CC4A), Color(0xFFFFF8D6), Color(0xFFA88A00)),
    // Natural
    AppColorTheme("#9A8C3E", "올리브골드", Color(0xFF9A8C3E), Color(0xFFEFEBD4), Color(0xFF6A5E20)),
    AppColorTheme("#4C5938", "올리브",     Color(0xFF4C5938), Color(0xFFDEE4D7), Color(0xFF2A3318)),
    // Cool / Vintage
    AppColorTheme("#88A487", "세이지",     Color(0xFF88A487), Color(0xFFE4EEE4), Color(0xFF4A6B49)),
    AppColorTheme("#558C74", "포레스트",   Color(0xFF558C74), Color(0xFFDCEDE6), Color(0xFF2E6050)),
    AppColorTheme("#748C7E", "빈티지민트", Color(0xFF748C7E), Color(0xFFDEE9E2), Color(0xFF3D5E49)),
    // Traditional
    AppColorTheme("#00898C", "틸",         Color(0xFF00898C), Color(0xFFD4EEEF), Color(0xFF005B5D)),
    AppColorTheme("#54A18F", "틸그린",     Color(0xFF54A18F), Color(0xFFD8EEE9), Color(0xFF2A6050)),
    AppColorTheme("#3F7EA6", "클래식블루", Color(0xFF3F7EA6), Color(0xFFD5E8F5), Color(0xFF1F4F70)),
    // Futuristic
    AppColorTheme("#165F8C", "딥블루",     Color(0xFF165F8C), Color(0xFFD4E8F5), Color(0xFF0A3B5C)),
    AppColorTheme("#180D4C", "네이비",     Color(0xFF180D4C), Color(0xFFD5D2E8), Color(0xFF0A0628)),
    AppColorTheme("#8F0981", "딥퍼플",     Color(0xFF8F0981), Color(0xFFEFDDF5), Color(0xFF4A1257)),
    // Modern / Exclusive
    AppColorTheme("#736A5A", "모카",       Color(0xFF736A5A), Color(0xFFEDE9E3), Color(0xFF4A4033)),
    AppColorTheme("#402B2C", "와인",       Color(0xFF402B2C), Color(0xFFE8DADA), Color(0xFF261516)),
)

// 통계 파이차트용 - 이미지 팔레트 기반 12색
private val ChartPalette = listOf(
    Color(0xFFD92323), // 레드       (Powerful)
    Color(0xFF165F8C), // 딥블루     (Futuristic)
    Color(0xFF4C5938), // 올리브     (Natural)
    Color(0xFFD97230), // 번트오렌지 (Warm)
    Color(0xFF8F0981), // 딥퍼플     (Futuristic)
    Color(0xFF00898C), // 틸         (Cool)
    Color(0xFFA65638), // 마룬       (Warm)
    Color(0xFF3F7EA6), // 클래식블루 (Traditional)
    Color(0xFF9A8C3E), // 올리브골드 (Natural)
    Color(0xFF558C74), // 포레스트   (Exclusive)
    Color(0xFFF2CC4A), // 골든옐로   (Warm)
    Color(0xFF748C7E), // 빈티지민트 (Vintage)
)

val ExpenseCategoryColors = ChartPalette
val IncomeCategoryColors  = ChartPalette

val CategoryColors = ChartPalette
