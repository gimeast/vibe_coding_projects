package com.gimeast.pullup.data

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation

/** 운동 한 번(= 세션). 세트 여러 개를 묶는 단위. */
@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** 세션 시작 시각 (epoch millis) */
    val startedAt: Long,
    /** 세션 종료 시각. null 이면 아직 진행 중. */
    val endedAt: Long? = null,
)

/** 세트 한 개의 기록. */
@Entity(
    tableName = "sets",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("sessionId")],
)
data class SetEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: Long,
    /** 세션 내 몇 번째 세트인지 (1부터) */
    val setNumber: Int,
    /** 스톱워치로 잰 세트 수행 시간 */
    val durationMs: Long,
    /** 수동으로 입력한 횟수 */
    val reps: Int,
    /** 이 세트 후 휴식 시간(초). 0 이면 휴식 없이 진행. */
    val restSec: Int,
    val recordedAt: Long,
)

data class SessionWithSets(
    @Embedded val session: SessionEntity,
    @Relation(parentColumn = "id", entityColumn = "sessionId")
    val sets: List<SetEntity>,
) {
    val totalReps: Int get() = sets.sumOf { it.reps }
    val totalDurationMs: Long get() = sets.sumOf { it.durationMs }
    val bestSetReps: Int get() = sets.maxOfOrNull { it.reps } ?: 0
    /** 세션 시작부터 마지막 세트까지 걸린 전체 시간(휴식 포함) */
    val elapsedMs: Long
        get() = (session.endedAt ?: sets.maxOfOrNull { it.recordedAt } ?: session.startedAt) - session.startedAt
    val orderedSets: List<SetEntity> get() = sets.sortedBy { it.setNumber }
}
