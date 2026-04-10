package com.example.gagyebu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.example.gagyebu.ui.screen.*
import com.example.gagyebu.ui.theme.GagyebuTheme
import com.example.gagyebu.ui.viewmodel.*
import java.time.YearMonth

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            GagyebuApp(application as GagyebuApplication)
        }
    }
}

sealed class BottomTab(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    object Home : BottomTab("home", "홈", Icons.Outlined.Home, Icons.Filled.Home)
    object Calendar : BottomTab("calendar", "달력", Icons.Outlined.CalendarMonth, Icons.Filled.CalendarMonth)
    object Stats : BottomTab("stats", "통계", Icons.Outlined.BarChart, Icons.Filled.BarChart)
    object Settings : BottomTab("settings", "설정", Icons.Outlined.Settings, Icons.Filled.Settings)
}

val bottomTabs = listOf(BottomTab.Home, BottomTab.Calendar, BottomTab.Stats, BottomTab.Settings)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GagyebuApp(app: GagyebuApplication) {
    val isDarkMode by app.settings.isDarkMode.collectAsState(initial = false)
    val themeColor by app.settings.themeColor.collectAsState(initial = "#FF6B8A")
    val scope = rememberCoroutineScope()

    GagyebuTheme(darkTheme = isDarkMode, primaryHex = themeColor) {
        val navController = rememberNavController()

        val homeVm: HomeViewModel = viewModel(factory = HomeViewModel.Factory(app.repository))
        val addVm: AddTransactionViewModel = viewModel(factory = AddTransactionViewModel.Factory(app.repository))
        val statsVm: StatsViewModel = viewModel(factory = StatsViewModel.Factory(app.repository))
        val categoryVm: CategoryViewModel = viewModel(factory = CategoryViewModel.Factory(app.repository))

        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentRoute = navBackStackEntry?.destination?.route

        val showBottomBar = bottomTabs.any { currentRoute == it.route }

        Scaffold(
            modifier = Modifier.fillMaxSize(),
            bottomBar = {
                if (showBottomBar) {
                    NavigationBar {
                        bottomTabs.forEach { tab ->
                            val selected = navBackStackEntry?.destination?.hierarchy?.any { it.route == tab.route } == true
                            NavigationBarItem(
                                selected = selected,
                                onClick = {
                                    if (currentRoute == tab.route) {
                                        // 같은 탭 재클릭 → 현재 월로 리셋
                                        homeVm.resetToToday()
                                        if (tab == BottomTab.Stats) statsVm.setMonth(YearMonth.now())
                                    } else {
                                        // 탭 이동 시점에 월 동기화 (실시간 양방향 sync 대신)
                                        when {
                                            tab == BottomTab.Stats ->
                                                statsVm.setMonth(homeVm.currentMonth.value)
                                            currentRoute == BottomTab.Stats.route ->
                                                homeVm.setCurrentMonth(statsVm.currentMonth.value)
                                        }
                                    }
                                    navController.navigate(tab.route) {
                                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(if (selected) tab.selectedIcon else tab.icon, tab.label) },
                                label = { Text(tab.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = com.example.gagyebu.ui.theme.LocalAppColors.current.primary,
                                    selectedTextColor = com.example.gagyebu.ui.theme.LocalAppColors.current.primary,
                                    indicatorColor = com.example.gagyebu.ui.theme.LocalAppColors.current.primaryLight
                                )
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = BottomTab.Home.route,
                modifier = Modifier.padding(innerPadding)
            ) {
                composable(BottomTab.Home.route) {
                    HomeScreen(
                        viewModel = homeVm,
                        onAddTransaction = { type ->
                            navController.navigate(Screen.AddTransaction.createRoute(type = type))
                        },
                        onEditTransaction = { id ->
                            navController.navigate(Screen.AddTransaction.createRoute(transactionId = id))
                        },
                        onNavigateToStats = {
                            statsVm.setMonth(homeVm.currentMonth.value)
                            navController.navigate(BottomTab.Stats.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = false
                            }
                        }
                    )
                }

                composable(BottomTab.Calendar.route) {
                    CalendarScreen(
                        viewModel = homeVm,
                        onEditTransaction = { id ->
                            navController.navigate(Screen.AddTransaction.createRoute(transactionId = id))
                        }
                    )
                }

                composable(BottomTab.Stats.route) {
                    StatsScreen(viewModel = statsVm)
                }

                composable(BottomTab.Settings.route) {
                    SettingsScreen(
                        isDarkMode = isDarkMode,
                        onDarkModeToggle = { scope.launch { app.settings.setDarkMode(it) } },
                        themeColor = themeColor,
                        onThemeColorChange = { scope.launch { app.settings.setThemeColor(it) } },
                        onCategoryManage = { navController.navigate(Screen.CategoryManage.route) }
                    )
                }

                composable(
                    route = Screen.AddTransaction.route,
                    arguments = listOf(
                        navArgument("transactionId") { type = NavType.LongType; defaultValue = -1L },
                        navArgument("type") { type = NavType.StringType; defaultValue = "EXPENSE" }
                    )
                ) { backStackEntry ->
                    val transactionId = backStackEntry.arguments?.getLong("transactionId") ?: -1L
                    val type = backStackEntry.arguments?.getString("type") ?: "EXPENSE"
                    AddTransactionScreen(
                        viewModel = addVm,
                        transactionId = transactionId,
                        typeStr = type,
                        onNavigateBack = { navController.popBackStack() }
                    )
                }

                composable(Screen.CategoryManage.route) {
                    CategoryManageScreen(
                        viewModel = categoryVm,
                        onNavigateBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}
