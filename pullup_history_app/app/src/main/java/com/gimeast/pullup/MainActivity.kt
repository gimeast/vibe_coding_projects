package com.gimeast.pullup

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.gimeast.pullup.history.HistoryScreen
import com.gimeast.pullup.history.HistoryViewModel
import com.gimeast.pullup.ui.theme.PullupTheme
import com.gimeast.pullup.workout.WorkoutScreen
import com.gimeast.pullup.workout.WorkoutViewModel

private enum class Tab(val label: String) { WORKOUT("운동"), HISTORY("히스토리") }

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PullupTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppRoot()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppRoot() {
    RequestNotificationPermission()

    var tab by rememberSaveable { mutableStateOf(Tab.WORKOUT) }
    var showFinishConfirm by rememberSaveable { mutableStateOf(false) }

    val workoutVm: WorkoutViewModel = viewModel()
    val historyVm: HistoryViewModel = viewModel()

    val workoutState by workoutVm.ui.collectAsStateWithLifecycle()
    val historyState by historyVm.ui.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = if (tab == Tab.WORKOUT) "운동" else "히스토리",
                            fontWeight = FontWeight.Bold,
                        )
                        if (tab == Tab.WORKOUT && workoutState.sessionActive) {
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "진행 중",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                },
                actions = {
                    if (tab == Tab.WORKOUT && workoutState.sessionActive) {
                        TextButton(onClick = { showFinishConfirm = true }) {
                            Text("운동 종료", fontWeight = FontWeight.SemiBold)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                NavigationBarItem(
                    selected = tab == Tab.WORKOUT,
                    onClick = { tab = Tab.WORKOUT },
                    icon = { Icon(Icons.Filled.FitnessCenter, contentDescription = null) },
                    label = { Text(Tab.WORKOUT.label) },
                )
                NavigationBarItem(
                    selected = tab == Tab.HISTORY,
                    onClick = { tab = Tab.HISTORY },
                    icon = { Icon(Icons.Filled.History, contentDescription = null) },
                    label = { Text(Tab.HISTORY.label) },
                )
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (tab) {
                Tab.WORKOUT -> WorkoutScreen(
                    state = workoutState,
                    onStartSet = workoutVm::startSet,
                    onStopSet = workoutVm::stopSet,
                    onCancelCountdown = workoutVm::cancelCountdown,
                    onSaveSet = workoutVm::saveSet,
                    onResumeSet = workoutVm::resumeSet,
                    onAdjustRest = workoutVm::adjustRest,
                    onSkipRest = workoutVm::skipRest,
                    onUpdateSet = workoutVm::updateSet,
                    onDeleteSet = workoutVm::deleteSet,
                    onAutoStartChange = workoutVm::setAutoStartNext,
                    modifier = Modifier.fillMaxWidth(),
                )

                Tab.HISTORY -> HistoryScreen(
                    state = historyState,
                    onDeleteSession = historyVm::deleteSession,
                    onUpdateSet = historyVm::updateSet,
                    onDeleteSet = historyVm::deleteSet,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    if (showFinishConfirm) {
        AlertDialog(
            onDismissRequest = { showFinishConfirm = false },
            title = { Text("운동을 종료할까요?") },
            text = {
                Text(
                    if (workoutState.sets.isEmpty()) {
                        "기록된 세트가 없어서 이번 운동은 저장되지 않습니다."
                    } else {
                        "${workoutState.completedSetCount}세트 · 총 ${workoutState.totalReps}회가 " +
                            "히스토리에 저장됩니다."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showFinishConfirm = false
                    workoutVm.finishWorkout()
                }) { Text("종료") }
            },
            dismissButton = {
                TextButton(onClick = { showFinishConfirm = false }) { Text("계속하기") }
            },
        )
    }
}

@Composable
private fun RequestNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return

    var asked by rememberSaveable { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { },
    )
    LaunchedEffect(Unit) {
        if (!asked) {
            asked = true
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
