package com.example.gagyebu.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.gagyebu.data.db.GagyebuRepository
import com.example.gagyebu.data.model.Category
import com.example.gagyebu.data.model.Transaction
import com.example.gagyebu.data.model.TransactionType
import com.example.gagyebu.util.FormatUtil
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.io.File
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

enum class FormField { AMOUNT, CATEGORY }

class AddTransactionViewModel(private val repository: GagyebuRepository) : ViewModel() {

    private val _type = MutableStateFlow(TransactionType.EXPENSE)
    val type: StateFlow<TransactionType> = _type.asStateFlow()

    private val _amount = MutableStateFlow("")
    val amount: StateFlow<String> = _amount.asStateFlow()

    private val _selectedCategory = MutableStateFlow<Category?>(null)
    val selectedCategory: StateFlow<Category?> = _selectedCategory.asStateFlow()

    private val _memo = MutableStateFlow("")
    val memo: StateFlow<String> = _memo.asStateFlow()

    private val _photoUri = MutableStateFlow("")
    val photoUri: StateFlow<String> = _photoUri.asStateFlow()

    private val _continuousMode = MutableStateFlow(false)
    val continuousMode: StateFlow<Boolean> = _continuousMode.asStateFlow()

    private val _savedCount = MutableStateFlow(0)
    val savedCount: StateFlow<Int> = _savedCount.asStateFlow()

    private val _date = MutableStateFlow(LocalDate.now())
    val date: StateFlow<LocalDate> = _date.asStateFlow()

    private val _saveSuccess = MutableSharedFlow<Unit>()
    val saveSuccess = _saveSuccess.asSharedFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _fieldError = MutableStateFlow<FormField?>(null)
    val fieldError: StateFlow<FormField?> = _fieldError.asStateFlow()

    // 에러 발생 시 해당 필드로 스크롤 트리거 (같은 에러 반복 클릭도 감지)
    private val _scrollToField = MutableSharedFlow<FormField>(extraBufferCapacity = 1)
    val scrollToField = _scrollToField.asSharedFlow()

    private var editingId: Long = -1L
    private var originalPhotoUri: String = ""

    val categories: StateFlow<List<Category>> = _type
        .flatMapLatest { t -> repository.getCategoriesByType(t) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun init(transactionId: Long, typeStr: String) {
        if (transactionId != -1L) {
            viewModelScope.launch {
                val t = repository.getTransactionById(transactionId) ?: return@launch
                editingId = t.id
                _type.value = t.type
                _amount.value = t.amount.toString()
                _selectedCategory.value = repository.getCategoryById(t.categoryId)
                _memo.value = t.memo
                _photoUri.value = t.photoUri
                originalPhotoUri = t.photoUri
                _date.value = FormatUtil.parseDate(t.date) ?: LocalDate.now()
            }
        } else {
            editingId = -1L
            originalPhotoUri = ""
            _type.value = if (typeStr == "INCOME") TransactionType.INCOME else TransactionType.EXPENSE
            _amount.value = ""
            _selectedCategory.value = null
            _memo.value = ""
            _photoUri.value = ""
            _date.value = LocalDate.now()
        }
    }

    fun setType(t: TransactionType) { _type.value = t; _selectedCategory.value = null }
    fun setAmount(v: String) { _amount.value = v.filter { it.isDigit() } }
    fun setCategory(c: Category) { _selectedCategory.value = c }
    fun setMemo(v: String) { _memo.value = v }
    fun setPhotoUri(v: String) { _photoUri.value = v }
    fun setDate(d: LocalDate) { _date.value = d }
    fun clearError() { _errorMessage.value = null; _fieldError.value = null }

    fun setContinuousMode(enabled: Boolean) {
        _continuousMode.value = enabled
        if (!enabled) _savedCount.value = 0
    }

    fun save() {
        val amountLong = _amount.value.toLongOrNull()
        if (amountLong == null || amountLong <= 0) {
            _errorMessage.value = "금액을 올바르게 입력해주세요"
            _fieldError.value = FormField.AMOUNT
            _scrollToField.tryEmit(FormField.AMOUNT)
            return
        }
        val category = _selectedCategory.value
        if (category == null) {
            _errorMessage.value = "카테고리를 선택해주세요"
            _fieldError.value = FormField.CATEGORY
            _scrollToField.tryEmit(FormField.CATEGORY)
            return
        }
        viewModelScope.launch {
            if (originalPhotoUri.isNotEmpty() && !originalPhotoUri.startsWith("content://") && originalPhotoUri != _photoUri.value) {
                File(originalPhotoUri).delete()
            }
            val transaction = Transaction(
                id = if (editingId != -1L) editingId else 0,
                type = _type.value,
                amount = amountLong,
                categoryId = category.id,
                categoryName = category.name,
                categoryIcon = category.icon,
                categoryColor = category.colorHex,
                memo = _memo.value,
                photoUri = _photoUri.value,
                date = FormatUtil.formatDate(_date.value),
                time = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"))
            )
            repository.insertTransaction(transaction)
            if (_continuousMode.value) {
                _amount.value = ""
                _selectedCategory.value = null
                _memo.value = ""
                _photoUri.value = ""
                originalPhotoUri = ""
                _savedCount.value++
            } else {
                _saveSuccess.emit(Unit)
            }
        }
    }

    class Factory(private val repository: GagyebuRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return AddTransactionViewModel(repository) as T
        }
    }
}
