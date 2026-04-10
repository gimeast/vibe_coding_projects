package com.example.gagyebu.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.time.LocalDate

@Entity(tableName = "transactions")
data class Transaction(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val type: TransactionType,       // INCOME or EXPENSE
    val amount: Long,                // 금액 (원 단위)
    val categoryId: Long,            // 카테고리 ID
    val categoryName: String,        // 카테고리 이름 (스냅샷)
    val categoryIcon: String = "",   // 카테고리 아이콘 emoji (스냅샷)
    val categoryColor: String = "",  // 카테고리 색상 hex (스냅샷)
    val memo: String = "",           // 메모
    val photoUri: String = "",       // 사진 URI
    val date: String,                // "yyyy-MM-dd" 형식
    val time: String = "",           // "HH:mm" 형식
    val createdAt: Long = System.currentTimeMillis()
)

enum class TransactionType {
    INCOME, EXPENSE
}
