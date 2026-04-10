package com.example.gagyebu.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "app_settings")

class AppSettings(private val context: Context) {
    private val DARK_MODE = booleanPreferencesKey("dark_mode")

    val isDarkMode: Flow<Boolean> = context.dataStore.data
        .map { it[DARK_MODE] ?: false }

    suspend fun setDarkMode(enabled: Boolean) {
        context.dataStore.edit { it[DARK_MODE] = enabled }
    }

    private val THEME_COLOR = stringPreferencesKey("theme_color")

    val themeColor: Flow<String> = context.dataStore.data
        .map { it[THEME_COLOR] ?: "#FF6B8A" }

    suspend fun setThemeColor(hex: String) {
        context.dataStore.edit { it[THEME_COLOR] = hex }
    }
}
