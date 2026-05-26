package com.example.gagyebu.ui.screen

import android.content.Context
import android.net.Uri
import java.io.File
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import coil.compose.AsyncImage
import com.example.gagyebu.data.model.Category
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.ui.theme.*
import com.example.gagyebu.ui.viewmodel.AddTransactionViewModel
import com.example.gagyebu.ui.viewmodel.FormField
import com.example.gagyebu.util.FormatUtil
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun AddTransactionScreen(
    viewModel: AddTransactionViewModel,
    transactionId: Long,
    typeStr: String,
    onNavigateBack: () -> Unit
) {
    LaunchedEffect(transactionId, typeStr) {
        viewModel.init(transactionId, typeStr)
    }

    LaunchedEffect(Unit) {
        viewModel.saveSuccess.collect { onNavigateBack() }
    }

    val type by viewModel.type.collectAsState()
    val amount by viewModel.amount.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val memo by viewModel.memo.collectAsState()
    val photoUri by viewModel.photoUri.collectAsState()
    val date by viewModel.date.collectAsState()
    val categories by viewModel.categories.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    val fieldError by viewModel.fieldError.collectAsState()
    val continuousMode by viewModel.continuousMode.collectAsState()

    val amountBivr = remember { BringIntoViewRequester() }
    val categoryBivr = remember { BringIntoViewRequester() }
    val memoFocusRequester = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current

    // 에러 발생 시 해당 필드로 자동 스크롤
    LaunchedEffect(Unit) {
        viewModel.scrollToField.collect { field ->
            when (field) {
                FormField.AMOUNT -> amountBivr.bringIntoView()
                FormField.CATEGORY -> { keyboardController?.hide(); categoryBivr.bringIntoView() }
            }
        }
    }

    // 에러 메시지 1.5초 후 서서히 사라짐
    var visibleError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(errorMessage) {
        if (errorMessage != null) {
            visibleError = errorMessage
            delay(1500)
            viewModel.clearError()
        }
    }

    val scrollState = rememberScrollState()

    // 연속 저장 토스트 1.5초 후 서서히 사라짐 + 상단 스크롤
    var visibleSavedToast by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        viewModel.savedToast.collect { msg ->
            scrollState.animateScrollTo(0)
            visibleSavedToast = msg
            delay(1500)
            visibleSavedToast = null
        }
    }

    var showDatePicker by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val imagePickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            val path = copyImageToInternalStorage(context, it)
            viewModel.setPhotoUri(path ?: it.toString())
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (transactionId != -1L) "내역 수정" else "내역 추가") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.Close, "닫기")
                    }
                },
                actions = {
                    if (transactionId == -1L) {
                        Text(
                            "연속",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = if (continuousMode) LocalAppColors.current.primary
                                    else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                        )
                        Spacer(Modifier.width(8.dp))
                        Switch(
                            checked = continuousMode,
                            onCheckedChange = viewModel::setContinuousMode,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = LocalAppColors.current.primary
                            )
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    TextButton(onClick = viewModel::save) {
                        Text("저장", color = LocalAppColors.current.primary, fontWeight = FontWeight.Bold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Type toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surface),
                horizontalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                TypeTab(
                    label = "지출",
                    selected = type == TransactionType.EXPENSE,
                    color = ExpenseRed,
                    modifier = Modifier.weight(1f)
                ) { viewModel.setType(TransactionType.EXPENSE) }
                TypeTab(
                    label = "수입",
                    selected = type == TransactionType.INCOME,
                    color = IncomeGreen,
                    modifier = Modifier.weight(1f)
                ) { viewModel.setType(TransactionType.INCOME) }
            }

            // Date
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.clickable { showDatePicker = true }
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("날짜", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                        Text(FormatUtil.formatDateFull(FormatUtil.formatDate(date)), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    }
                    Icon(Icons.Default.CalendarMonth, "날짜선택", tint = LocalAppColors.current.primary)
                }
            }

            // Amount input
            Card(
                modifier = Modifier.bringIntoViewRequester(amountBivr),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = if (fieldError == FormField.AMOUNT) BorderStroke(2.dp, ExpenseRed) else null
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("금액", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (type == TransactionType.EXPENSE) "-" else "+",
                            style = MaterialTheme.typography.headlineLarge,
                            color = if (type == TransactionType.EXPENSE) ExpenseRed else IncomeGreen,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(8.dp))
                        OutlinedTextField(
                            value = amount,
                            onValueChange = { newValue ->
                                if (newValue.isEmpty() || (newValue.all { it.isDigit() } && newValue.toLongOrNull()?.let { it <= 1_000_000_000L } == true)) {
                                    viewModel.setAmount(newValue)
                                }
                            },
                            placeholder = { Text("0", style = MaterialTheme.typography.headlineLarge) },
                            textStyle = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Next),
                            keyboardActions = KeyboardActions(onNext = { keyboardController?.hide(); scope.launch { categoryBivr.bringIntoView() } }),
                            visualTransformation = NumberCommaTransformation,
                            suffix = { Text("원", style = MaterialTheme.typography.titleLarge) },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = if (type == TransactionType.EXPENSE) ExpenseRed else IncomeGreen,
                                unfocusedBorderColor = Color.Transparent
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            // Category
            Card(
                modifier = Modifier.bringIntoViewRequester(categoryBivr),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = if (fieldError == FormField.CATEGORY) BorderStroke(2.dp, ExpenseRed) else null
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("카테고리", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    Spacer(Modifier.height(12.dp))
                    if (categories.isEmpty()) {
                        Text("카테고리 로딩 중...", style = MaterialTheme.typography.bodyMedium)
                    } else {
                        categories.chunked(4).forEach { row ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                row.forEach { cat ->
                                    CategoryChip(
                                        category = cat,
                                        selected = selectedCategory?.id == cat.id,
                                        modifier = Modifier.weight(1f)
                                    ) { viewModel.setCategory(cat) }
                                }
                                repeat(4 - row.size) {
                                    Spacer(Modifier.weight(1f))
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                        }
                    }
                }
            }

            // Memo
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("메모", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    OutlinedTextField(
                        value = memo,
                        onValueChange = viewModel::setMemo,
                        placeholder = { Text("메모를 입력하세요 (선택사항)") },
                        modifier = Modifier.fillMaxWidth().focusRequester(memoFocusRequester),
                        maxLines = 3,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = LocalAppColors.current.primary,
                            unfocusedBorderColor = Color.Transparent
                        )
                    )
                }
            }

            // Photo
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("사진 첨부", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                        TextButton(onClick = { imagePickerLauncher.launch("image/*") }) {
                            Icon(Icons.Default.AddPhotoAlternate, null, Modifier.size(18.dp), tint = LocalAppColors.current.primary)
                            Spacer(Modifier.width(4.dp))
                            Text("사진 선택", color = LocalAppColors.current.primary)
                        }
                    }
                    if (photoUri.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Box {
                            AsyncImage(
                                model = photoUri,
                                contentDescription = "첨부 사진",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                                contentScale = ContentScale.Crop
                            )
                            IconButton(
                                onClick = { viewModel.setPhotoUri("") },
                                modifier = Modifier.align(Alignment.TopEnd)
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    "삭제",
                                    tint = Color.White,
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(Color.Black.copy(alpha = 0.4f))
                                        .padding(2.dp)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
        }
    }

    // Error snackbar - 1.5초 표시 후 서서히 사라짐
    AnimatedVisibility(
        visible = errorMessage != null,
        enter = fadeIn(tween(200)),
        exit = fadeOut(tween(600))
    ) {
        Snackbar(
            modifier = Modifier.padding(16.dp),
            containerColor = ExpenseRed,
            contentColor = Color.White
        ) { Text(visibleError ?: "") }
    }

    // 연속 저장 토스트 - 1.5초 표시 후 서서히 사라짐
    AnimatedVisibility(
        visible = visibleSavedToast != null,
        enter = fadeIn(tween(200)),
        exit = fadeOut(tween(600))
    ) {
        Snackbar(
            modifier = Modifier.padding(16.dp),
            containerColor = IncomeGreen,
            contentColor = Color.White
        ) { Text(visibleSavedToast ?: "") }
    }

    // Date picker
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = date.toEpochDay() * 86400000L
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let {
                        viewModel.setDate(LocalDate.ofEpochDay(it / 86400000L))
                    }
                    showDatePicker = false
                }) { Text("확인", color = LocalAppColors.current.primary) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("취소") }
            }
        ) {
            DatePicker(state = datePickerState, colors = DatePickerDefaults.colors(
                selectedDayContainerColor = LocalAppColors.current.primary,
                todayDateBorderColor = LocalAppColors.current.primary
            ))
        }
    }
}

@Composable
fun TypeTab(label: String, selected: Boolean, color: Color, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) color else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        )
    }
}

@Composable
fun CategoryChip(category: Category, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (selected) try { Color(android.graphics.Color.parseColor(category.colorHex)).copy(alpha = 0.2f) }
                catch (e: Exception) { LocalAppColors.current.primaryLight }
                else MaterialTheme.colorScheme.background
            )
            .border(
                1.dp,
                if (selected) try { Color(android.graphics.Color.parseColor(category.colorHex)) }
                catch (e: Exception) { LocalAppColors.current.primary }
                else Color.Transparent,
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(category.icon, fontSize = 20.sp)
        Text(
            category.name,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            maxLines = 1
        )
    }
}

private val NumberCommaTransformation = VisualTransformation { text ->
    val original = text.text
    val formatted = buildString {
        original.forEachIndexed { i, c ->
            append(c)
            val digitsLeft = original.length - i - 1
            if (digitsLeft > 0 && digitsLeft % 3 == 0) append(',')
        }
    }
    val offsetMapping = object : OffsetMapping {
        override fun originalToTransformed(offset: Int): Int {
            var commas = 0
            for (i in 0 until minOf(offset, original.length)) {
                val digitsLeft = original.length - i - 1
                if (digitsLeft > 0 && digitsLeft % 3 == 0) commas++
            }
            return offset + commas
        }
        override fun transformedToOriginal(offset: Int): Int {
            val commas = formatted.take(offset).count { it == ',' }
            return (offset - commas).coerceIn(0, original.length)
        }
    }
    TransformedText(AnnotatedString(formatted), offsetMapping)
}

private fun copyImageToInternalStorage(context: Context, uri: Uri): String? {
    return try {
        val dir = File(context.filesDir, "photos").apply { mkdirs() }
        val file = File(dir, "${System.currentTimeMillis()}.jpg")
        context.contentResolver.openInputStream(uri)?.use { input ->
            file.outputStream().use { output -> input.copyTo(output) }
        }
        file.absolutePath
    } catch (e: Exception) {
        null
    }
}
