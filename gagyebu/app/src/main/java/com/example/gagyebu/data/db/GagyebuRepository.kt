package com.example.gagyebu.data.db

import com.example.gagyebu.data.model.Category
import com.example.gagyebu.data.model.Transaction
import com.example.gagyebu.data.model.TransactionType
import kotlinx.coroutines.flow.Flow

class GagyebuRepository(
    private val transactionDao: TransactionDao,
    private val categoryDao: CategoryDao
) {
    // Transaction
    fun getAllTransactions(): Flow<List<Transaction>> = transactionDao.getAllTransactions()

    fun getTransactionsByMonth(yearMonth: String): Flow<List<Transaction>> =
        transactionDao.getTransactionsByMonth(yearMonth)

    fun getTransactionsByDate(date: String): Flow<List<Transaction>> =
        transactionDao.getTransactionsByDate(date)

    fun getMonthlyIncome(yearMonth: String): Flow<Long?> =
        transactionDao.getMonthlyIncome(yearMonth)

    fun getMonthlyExpense(yearMonth: String): Flow<Long?> =
        transactionDao.getMonthlyExpense(yearMonth)

    fun getCategoryStats(yearMonth: String, type: String): Flow<List<CategoryStat>> =
        transactionDao.getCategoryStats(yearMonth, type)

    fun getDailyStats(yearMonth: String): Flow<List<DailyStat>> =
        transactionDao.getDailyStats(yearMonth)

    suspend fun insertTransaction(transaction: Transaction): Long =
        transactionDao.insert(transaction)

    suspend fun updateTransaction(transaction: Transaction) =
        transactionDao.update(transaction)

    suspend fun deleteTransaction(transaction: Transaction) =
        transactionDao.delete(transaction)

    suspend fun getTransactionById(id: Long): Transaction? =
        transactionDao.getById(id)

    suspend fun getAllPhotoUris(): List<String> =
        transactionDao.getAllPhotoUris()

    // Category
    fun getAllCategories(): Flow<List<Category>> = categoryDao.getAllCategories()

    fun getCategoriesByType(type: TransactionType): Flow<List<Category>> =
        categoryDao.getCategoriesByType(type)

    suspend fun getCategoryById(id: Long): Category? = categoryDao.getById(id)

    suspend fun insertCategory(category: Category): Long = categoryDao.insert(category)

    suspend fun updateCategory(category: Category) = categoryDao.update(category)

    suspend fun reassignTransactionsCategory(oldCategoryId: Long, newCategoryId: Long, newCategoryName: String) =
        transactionDao.reassignCategory(oldCategoryId, newCategoryId, newCategoryName)

    suspend fun deleteCategory(category: Category) = categoryDao.delete(category)
}
