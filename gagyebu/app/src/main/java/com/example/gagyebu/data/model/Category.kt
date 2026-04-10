package com.example.gagyebu.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "categories")
data class Category(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String,
    val icon: String,           // Material icon name (string key)
    val type: TransactionType,  // INCOME or EXPENSE
    val isDefault: Boolean = false,
    val colorHex: String = "#FF6B8A",
    val sortOrder: Int = 0
)

// 기본 카테고리 데이터
object DefaultCategories {
    val list = listOf(
        // 지출
        Category(id = 1, name = "식비", icon = "🍜", type = TransactionType.EXPENSE, isDefault = true, colorHex = "#FF6B8A", sortOrder = 0),
        Category(id = 3, name = "교통", icon = "🚌", type = TransactionType.EXPENSE, isDefault = true, colorHex = "#4FC3F7", sortOrder = 1),
        Category(id = 4, name = "병원", icon = "🏥", type = TransactionType.EXPENSE, isDefault = true, colorHex = "#81C784", sortOrder = 2),
        Category(id = 5, name = "통신", icon = "📱", type = TransactionType.EXPENSE, isDefault = true, colorHex = "#CE93D8", sortOrder = 3),
        Category(id = 6, name = "쇼핑", icon = "🛍️", type = TransactionType.EXPENSE, isDefault = true, colorHex = "#FFB74D", sortOrder = 4),
        Category(id = 8, name = "기타", icon = "📦", type = TransactionType.EXPENSE, isDefault = true, colorHex = "#90A4AE", sortOrder = 5),
        // 수입
        Category(id = 9, name = "급여", icon = "💰", type = TransactionType.INCOME, isDefault = true, colorHex = "#66BB6A", sortOrder = 0),
        Category(id = 11, name = "기타수입", icon = "💵", type = TransactionType.INCOME, isDefault = true, colorHex = "#FFA726", sortOrder = 1),
    )
}
