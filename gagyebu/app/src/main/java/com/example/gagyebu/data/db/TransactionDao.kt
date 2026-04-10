package com.example.gagyebu.data.db

import androidx.room.*
import com.example.gagyebu.data.model.Transaction
import com.example.gagyebu.data.model.TransactionType
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {

    @Query("SELECT * FROM transactions ORDER BY date DESC, createdAt DESC")
    fun getAllTransactions(): Flow<List<Transaction>>

    @Query("SELECT * FROM transactions WHERE date LIKE :yearMonth || '%' ORDER BY date DESC, createdAt DESC")
    fun getTransactionsByMonth(yearMonth: String): Flow<List<Transaction>>

    @Query("SELECT * FROM transactions WHERE date = :date ORDER BY createdAt DESC")
    fun getTransactionsByDate(date: String): Flow<List<Transaction>>

    @Query("SELECT SUM(amount) FROM transactions WHERE date LIKE :yearMonth || '%' AND type = 'INCOME'")
    fun getMonthlyIncome(yearMonth: String): Flow<Long?>

    @Query("SELECT SUM(amount) FROM transactions WHERE date LIKE :yearMonth || '%' AND type = 'EXPENSE'")
    fun getMonthlyExpense(yearMonth: String): Flow<Long?>

    @Query("""
        SELECT categoryName, categoryId, SUM(amount) as total 
        FROM transactions 
        WHERE date LIKE :yearMonth || '%' AND type = :type
        GROUP BY categoryId, categoryName
        ORDER BY total DESC
    """)
    fun getCategoryStats(yearMonth: String, type: String): Flow<List<CategoryStat>>

    @Query("""
        SELECT date, SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END) as income,
               SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END) as expense
        FROM transactions
        WHERE date LIKE :yearMonth || '%'
        GROUP BY date
        ORDER BY date ASC
    """)
    fun getDailyStats(yearMonth: String): Flow<List<DailyStat>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: Transaction): Long

    @Update
    suspend fun update(transaction: Transaction)

    @Delete
    suspend fun delete(transaction: Transaction)

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun getById(id: Long): Transaction?

    @Query("UPDATE transactions SET categoryId = :newCategoryId, categoryName = :newCategoryName WHERE categoryId = :oldCategoryId")
    suspend fun reassignCategory(oldCategoryId: Long, newCategoryId: Long, newCategoryName: String)

    @Query("SELECT photoUri FROM transactions WHERE photoUri != ''")
    suspend fun getAllPhotoUris(): List<String>
}

data class CategoryStat(
    val categoryName: String,
    val categoryId: Long,
    val total: Long
)

data class DailyStat(
    val date: String,
    val income: Long,
    val expense: Long
)
