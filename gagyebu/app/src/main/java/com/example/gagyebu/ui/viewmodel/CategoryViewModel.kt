package com.example.gagyebu.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.gagyebu.data.db.GagyebuRepository
import com.example.gagyebu.data.model.Category
import com.example.gagyebu.data.model.TransactionType
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CategoryViewModel(private val repository: GagyebuRepository) : ViewModel() {

    val allCategories: StateFlow<List<Category>> = repository.getAllCategories()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun addCategory(name: String, icon: String, type: TransactionType, colorHex: String) {
        viewModelScope.launch {
            repository.insertCategory(
                Category(
                    name = name,
                    icon = icon,
                    type = type,
                    isDefault = false,
                    colorHex = colorHex
                )
            )
        }
    }

    fun updateCategory(category: Category) {
        viewModelScope.launch {
            if (!category.isDefault) {
                repository.updateCategory(category)
            }
        }
    }

    fun deleteCategory(category: Category) {
        viewModelScope.launch {
            if (!category.isDefault) {
                val (fallbackId, fallbackName) = if (category.type == TransactionType.INCOME)
                    11L to "기타수입" else 8L to "기타"
                repository.reassignTransactionsCategory(category.id, fallbackId, fallbackName)
                repository.deleteCategory(category)
            }
        }
    }

    class Factory(private val repository: GagyebuRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return CategoryViewModel(repository) as T
        }
    }
}
