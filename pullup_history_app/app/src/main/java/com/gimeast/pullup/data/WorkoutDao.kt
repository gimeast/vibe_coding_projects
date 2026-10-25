package com.gimeast.pullup.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutDao {

    @Transaction
    @Query("SELECT * FROM sessions ORDER BY startedAt DESC")
    fun observeSessions(): Flow<List<SessionWithSets>>

    @Insert
    suspend fun insertSession(session: SessionEntity): Long

    @Insert
    suspend fun insertSet(set: SetEntity): Long

    @Query("SELECT * FROM sessions WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1")
    suspend fun findOpenSession(): SessionEntity?

    @Query("SELECT * FROM sets WHERE sessionId = :sessionId ORDER BY setNumber ASC")
    suspend fun getSets(sessionId: Long): List<SetEntity>

    @Query("UPDATE sessions SET endedAt = :endedAt WHERE id = :sessionId")
    suspend fun closeSession(sessionId: Long, endedAt: Long)

    @Query("DELETE FROM sessions WHERE id = :sessionId")
    suspend fun deleteSession(sessionId: Long)

    @Query("DELETE FROM sets WHERE id = :setId")
    suspend fun deleteSet(setId: Long)

    @Query(
        "UPDATE sets SET reps = :reps, durationMs = :durationMs, restSec = :restSec " +
            "WHERE id = :setId",
    )
    suspend fun updateSet(setId: Long, reps: Int, durationMs: Long, restSec: Int)

    @Query("SELECT COUNT(*) FROM sets WHERE sessionId = :sessionId")
    suspend fun countSets(sessionId: Long): Int

    @Query("UPDATE sets SET setNumber = setNumber - 1 WHERE sessionId = :sessionId AND setNumber > :fromNumber")
    suspend fun shiftSetNumbers(sessionId: Long, fromNumber: Int)
}
