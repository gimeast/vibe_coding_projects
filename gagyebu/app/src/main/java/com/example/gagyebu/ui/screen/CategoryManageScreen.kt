package com.example.gagyebu.ui.screen

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gagyebu.data.model.Category
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.ui.theme.*
import com.example.gagyebu.ui.viewmodel.CategoryViewModel

// 아이콘 picker에 표시할 emoji 목록 (행 × 8개)
private val ICON_ROWS = listOf(
    listOf("🍜", "🍕", "🍔", "🍱", "☕", "🧃", "🍺", "🍰"),
    listOf("🚗", "🚌", "✈️", "🚂", "⛽", "🛵", "🚕", "🚲"),
    listOf("🏠", "💡", "🛒", "🏥", "💊", "🧴", "🎮", "🎬"),
    listOf("🛍️", "👗", "💄", "👟", "💑", "👶", "🐶", "🎁"),
    listOf("💰", "💳", "💵", "📊", "💼", "📱", "🏦", "📚"),
    listOf("💪", "🏋️", "🏃", "⚽", "🎯", "🌱", "🎵", "🎨"),
    listOf("✂️", "🔧", "🏖️", "🎪", "🎂", "⭐", "📦", "✨"),
    listOf("👥", "🤝", "💱", "🥂", "🍻", "🎰", "🎲", "🏧"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryManageScreen(
    viewModel: CategoryViewModel,
    onNavigateBack: () -> Unit
) {
    val categories by viewModel.allCategories.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    var editTarget by remember { mutableStateOf<Category?>(null) }
    var deleteTarget by remember { mutableStateOf<Category?>(null) }

    val expenseCategories = categories.filter { it.type == TransactionType.EXPENSE }
    val incomeCategories = categories.filter { it.type == TransactionType.INCOME }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("카테고리 관리") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "뒤로")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }, containerColor = LocalAppColors.current.primary) {
                Icon(Icons.Default.Add, "추가", tint = Color.White)
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                Text("지출", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            items(expenseCategories, key = { it.id }) { cat ->
                CategoryRow(
                    category = cat,
                    onEdit = if (!cat.isDefault) { { editTarget = cat } } else null,
                    onDelete = if (!cat.isDefault) { { deleteTarget = cat } } else null
                )
            }
            item {
                Spacer(Modifier.height(8.dp))
                Text("수입", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            items(incomeCategories, key = { it.id }) { cat ->
                CategoryRow(
                    category = cat,
                    onEdit = if (!cat.isDefault) { { editTarget = cat } } else null,
                    onDelete = if (!cat.isDefault) { { deleteTarget = cat } } else null
                )
            }
        }
    }

    if (showAddDialog) {
        CategoryDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { name, icon, type, color ->
                viewModel.addCategory(name, icon, type, color)
                showAddDialog = false
            }
        )
    }

    editTarget?.let { cat ->
        CategoryDialog(
            initial = cat,
            onDismiss = { editTarget = null },
            onConfirm = { name, icon, type, color ->
                viewModel.updateCategory(cat.copy(name = name, icon = icon, type = type, colorHex = color))
                editTarget = null
            }
        )
    }

    deleteTarget?.let { cat ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("카테고리 삭제") },
            text = { Text("'${cat.name}' 카테고리를 삭제할까요?\n해당 카테고리의 기록은 유지됩니다.") },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.deleteCategory(cat); deleteTarget = null },
                    colors = ButtonDefaults.textButtonColors(contentColor = ExpenseRed)
                ) { Text("삭제") }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("취소") }
            }
        )
    }
}

@Composable
fun CategoryRow(category: Category, onEdit: (() -> Unit)?, onDelete: (() -> Unit)?) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(
                            try { Color(android.graphics.Color.parseColor(category.colorHex)).copy(alpha = 0.2f) }
                            catch (e: Exception) { LocalAppColors.current.primaryLight }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(category.icon, fontSize = 16.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(category.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    if (category.isDefault) {
                        Text("기본", style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
                    }
                }
            }
            Row {
                if (onEdit != null) {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Default.Edit, "수정", tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
                    }
                }
                if (onDelete != null) {
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, "삭제", tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryDialog(
    initial: Category? = null,
    onDismiss: () -> Unit,
    onConfirm: (String, String, TransactionType, String) -> Unit
) {
    val isEditMode = initial != null
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var type by remember { mutableStateOf(initial?.type ?: TransactionType.EXPENSE) }
    val selectedColor = remember { mutableStateOf(initial?.colorHex ?: "#FF6B8A") }
    val selectedIcon = remember { mutableStateOf(initial?.icon ?: "📦") }

    val colorRows = listOf(
        // Warm / Powerful / Soft
        listOf("#D92323", "#BC0808", "#D97230", "#F2CC4A", "#D98473", "#A65638", "#F06292", "#E8A598"),
        // Natural / Vintage / Exclusive
        listOf("#4C5938", "#9A8C3E", "#88A487", "#558C74", "#748C7E", "#54A18F", "#736A5A", "#402B2C"),
        // Cool / Traditional / Futuristic
        listOf("#00898C", "#3F7EA6", "#165F8C", "#180D4C", "#8F0981", "#8D3D3D", "#595958", "#3F4031"),
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isEditMode) "카테고리 수정" else "카테고리 추가") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("카테고리 이름") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LocalAppColors.current.primary)
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.background)
                ) {
                    TypeTab("지출", type == TransactionType.EXPENSE, ExpenseRed, Modifier.weight(1f)) {
                        type = TransactionType.EXPENSE
                    }
                    TypeTab("수입", type == TransactionType.INCOME, IncomeGreen, Modifier.weight(1f)) {
                        type = TransactionType.INCOME
                    }
                }

                // 아이콘 선택
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("아이콘", style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(
                                try { Color(android.graphics.Color.parseColor(selectedColor.value)).copy(alpha = 0.2f) }
                                catch (e: Exception) { LocalAppColors.current.primaryLight }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(selectedIcon.value, fontSize = 16.sp)
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    ICON_ROWS.forEach { row ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.horizontalScroll(rememberScrollState())
                        ) {
                            row.forEach { emoji ->
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            if (selectedIcon.value == emoji)
                                                try { Color(android.graphics.Color.parseColor(selectedColor.value)).copy(alpha = 0.25f) }
                                                catch (e: Exception) { LocalAppColors.current.primaryLight }
                                            else MaterialTheme.colorScheme.surfaceVariant
                                        )
                                        .border(
                                            if (selectedIcon.value == emoji) 1.5.dp else 0.dp,
                                            if (selectedIcon.value == emoji)
                                                try { Color(android.graphics.Color.parseColor(selectedColor.value)) }
                                                catch (e: Exception) { LocalAppColors.current.primary }
                                            else Color.Transparent,
                                            RoundedCornerShape(8.dp)
                                        )
                                        .clickable { selectedIcon.value = emoji },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(emoji, fontSize = 18.sp)
                                }
                            }
                        }
                    }
                }

                // 색상 선택
                Text("색상", style = MaterialTheme.typography.labelMedium)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    colorRows.forEach { row ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.horizontalScroll(rememberScrollState())
                        ) {
                            row.forEach { hex ->
                                val color = try { Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { LocalAppColors.current.primary }
                                Box(
                                    modifier = Modifier
                                        .size(28.dp)
                                        .clip(CircleShape)
                                        .background(color)
                                        .border(
                                            if (selectedColor.value == hex) 2.dp else 0.dp,
                                            Color.Black.copy(alpha = 0.3f),
                                            CircleShape
                                        )
                                        .clickable { selectedColor.value = hex }
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (name.isNotBlank()) {
                        onConfirm(name.trim(), selectedIcon.value, type, selectedColor.value)
                    }
                },
                colors = ButtonDefaults.textButtonColors(contentColor = LocalAppColors.current.primary)
            ) { Text(if (isEditMode) "저장" else "추가", fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("취소") }
        }
    )
}
