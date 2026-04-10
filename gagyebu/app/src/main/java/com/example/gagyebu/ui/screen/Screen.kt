package com.example.gagyebu.ui.screen

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object Calendar : Screen("calendar")
    object Stats : Screen("stats")
    object Settings : Screen("settings")
    object AddTransaction : Screen("add_transaction?transactionId={transactionId}&type={type}") {
        fun createRoute(transactionId: Long = -1L, type: String = "EXPENSE") =
            "add_transaction?transactionId=$transactionId&type=$type"
    }
    object CategoryManage : Screen("category_manage")
}
