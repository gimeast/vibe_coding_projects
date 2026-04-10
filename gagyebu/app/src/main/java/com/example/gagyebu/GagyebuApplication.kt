package com.example.gagyebu

import android.app.Application
import com.example.gagyebu.data.db.AppDatabase
import com.example.gagyebu.data.db.GagyebuRepository
import com.example.gagyebu.util.AppSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File

class GagyebuApplication : Application() {
    val database by lazy { AppDatabase.getDatabase(this) }
    val repository by lazy {
        GagyebuRepository(database.transactionDao(), database.categoryDao())
    }
    val settings by lazy { AppSettings(this) }

    override fun onCreate() {
        super.onCreate()
        cleanupOrphanedPhotos()
    }

    private fun cleanupOrphanedPhotos() {
        CoroutineScope(Dispatchers.IO).launch {
            val photoDir = File(filesDir, "photos")
            if (!photoDir.exists()) return@launch

            val referencedUris = repository.getAllPhotoUris().toSet()
            photoDir.listFiles()?.forEach { file ->
                if (file.absolutePath !in referencedUris) {
                    file.delete()
                }
            }
        }
    }
}
