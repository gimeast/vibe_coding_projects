package com.example.gagyebu.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.gagyebu.data.model.Category
import com.example.gagyebu.data.model.DefaultCategories
import com.example.gagyebu.data.model.Transaction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// 삭제된 카테고리: 카페(2), 문화/여가(7), 용돈(10)
// 해당 카테고리 사용 내역 → 기타(8) / 기타수입(11)으로 이동
private val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("UPDATE transactions SET categoryId = 8, categoryName = '기타' WHERE categoryId = 2")
        db.execSQL("UPDATE transactions SET categoryId = 8, categoryName = '기타' WHERE categoryId = 7")
        db.execSQL("UPDATE transactions SET categoryId = 11, categoryName = '기타수입' WHERE categoryId = 10")
        db.execSQL("DELETE FROM categories WHERE id IN (2, 7, 10)")
        db.execSQL("UPDATE categories SET sortOrder = 1 WHERE id = 3")
        db.execSQL("UPDATE categories SET sortOrder = 2 WHERE id = 4")
        db.execSQL("UPDATE categories SET sortOrder = 3 WHERE id = 5")
        db.execSQL("UPDATE categories SET sortOrder = 4 WHERE id = 6")
        db.execSQL("UPDATE categories SET sortOrder = 5 WHERE id = 8")
        db.execSQL("UPDATE categories SET sortOrder = 1 WHERE id = 11")
    }
}

// transactions에 categoryIcon 컬럼 추가, 기존 행은 categories 테이블에서 채움
private val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE transactions ADD COLUMN categoryIcon TEXT NOT NULL DEFAULT ''")
        db.execSQL("""
            UPDATE transactions
            SET categoryIcon = COALESCE(
                (SELECT icon FROM categories WHERE categories.id = transactions.categoryId),
                ''
            )
        """.trimIndent())
    }
}

// transactions에 categoryColor 컬럼 추가, 기존 행은 categories 테이블에서 채움
private val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE transactions ADD COLUMN categoryColor TEXT NOT NULL DEFAULT ''")
        db.execSQL("""
            UPDATE transactions
            SET categoryColor = COALESCE(
                (SELECT colorHex FROM categories WHERE categories.id = transactions.categoryId),
                ''
            )
        """.trimIndent())
    }
}

// 기본 카테고리 icon 필드를 emoji로 교체
private val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("UPDATE categories SET icon = '🍜' WHERE id = 1")
        db.execSQL("UPDATE categories SET icon = '🚌' WHERE id = 3")
        db.execSQL("UPDATE categories SET icon = '🏥' WHERE id = 4")
        db.execSQL("UPDATE categories SET icon = '📱' WHERE id = 5")
        db.execSQL("UPDATE categories SET icon = '🛍️' WHERE id = 6")
        db.execSQL("UPDATE categories SET icon = '📦' WHERE id = 8")
        db.execSQL("UPDATE categories SET icon = '💰' WHERE id = 9")
        db.execSQL("UPDATE categories SET icon = '💵' WHERE id = 11")
    }
}

@Database(
    entities = [Transaction::class, Category::class],
    version = 5,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun transactionDao(): TransactionDao
    abstract fun categoryDao(): CategoryDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "gagyebu_database"
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
                .addCallback(object : Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        INSTANCE?.let { database ->
                            CoroutineScope(Dispatchers.IO).launch {
                                database.categoryDao().insertAll(DefaultCategories.list)
                            }
                        }
                    }
                }).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
