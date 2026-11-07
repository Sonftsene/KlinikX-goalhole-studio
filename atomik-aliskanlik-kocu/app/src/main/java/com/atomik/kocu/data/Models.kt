package com.atomik.kocu.data

import kotlinx.serialization.Serializable

@Serializable
data class AppData(
    val version: Int = 1,
    val profiles: List<Profile> = emptyList(),
    val activeProfileId: String? = null,
    val habits: List<Habit> = emptyList(),
    val logs: List<HabitLog> = emptyList(),
    val moods: List<MoodEntry> = emptyList(),
    val thoughts: List<ThoughtRecord> = emptyList(),
    val assessments: List<AssessmentResult> = emptyList(),
    val urges: List<UrgeLog> = emptyList(),
    val weights: List<WeightEntry> = emptyList(),
    val capsules: List<TimeCapsule> = emptyList(),
    val settings: Settings = Settings(),
)

@Serializable
data class Settings(
    val pin: String? = null,
    val remindersEnabled: Boolean = true,
    val eveningCheckInMinute: Int = 21 * 60,
    val haptics: Boolean = true,
    val filmGrain: Boolean = true,
)

@Serializable
data class Profile(
    val id: String,
    val name: String,
    val avatar: String = "🎬",
    val identities: List<String> = emptyList(),
    val goals: List<String> = emptyList(),
    val energy: Int = 1,
    val startEpochDay: Long,
    val body: BodyInfo? = null,
    val seenChapters: List<String> = emptyList(),
    val achievements: List<String> = emptyList(),
    val freezeTokens: Int = 1,
    val revealedCards: List<String> = emptyList(),
    val lastRevealDay: Long? = null,
    val lastTrailerDay: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
)

@Serializable
data class BodyInfo(
    val female: Boolean = false,
    val birthYear: Int = 1995,
    val heightCm: Int = 170,
    val weightKg: Double = 70.0,
    val targetKg: Double = 70.0,
    /** 0 hareketsiz .. 4 çok aktif */
    val activity: Int = 1,
)

@Serializable
enum class HabitKind { BUILD, BREAK }

@Serializable
data class Habit(
    val id: String,
    val profileId: String,
    val title: String,
    val emoji: String = "⚛️",
    val kind: HabitKind = HabitKind.BUILD,
    /** "Ben ... biriyim" kimlik oyu */
    val identity: String = "",
    /** 1. Yasa: Görünür yap (BREAK için: Görünmez yap) */
    val cue: String = "",
    /** Alışkanlık zinciri: "... yaptıktan sonra" */
    val anchor: String = "",
    /** 2. Yasa: Cazip yap (BREAK: İtici yap) */
    val attractor: String = "",
    /** 3. Yasa: Kolay yap -> 2 dakikalık versiyon (BREAK: Zorlaştır) */
    val tinyVersion: String = "",
    /** 3. Yasa: ortam tasarımı / sürtünme */
    val environment: String = "",
    /** 4. Yasa: Tatmin edici yap (BREAK: Tatmin etmeyen yap) */
    val reward: String = "",
    val target: Int = 1,
    val unit: String = "",
    val reminderMinute: Int? = null,
    /** Pazartesi=bit0 ... Pazar=bit6 */
    val daysMask: Int = 0b1111111,
    val colorIndex: Int = 0,
    val createdEpochDay: Long,
    val archived: Boolean = false,
    val templateId: String? = null,
    val order: Int = 0,
)

@Serializable
enum class LogStatus { DONE, TINY, SKIP, FREEZE, SLIP }

@Serializable
data class HabitLog(
    val habitId: String,
    val day: Long,
    val amount: Int = 1,
    val status: LogStatus = LogStatus.DONE,
    val note: String = "",
    val time: Long = System.currentTimeMillis(),
)

@Serializable
data class MoodEntry(
    val id: String,
    val profileId: String,
    val day: Long,
    val time: Long = System.currentTimeMillis(),
    /** 1..5 */
    val mood: Int,
    /** 1..5 */
    val energy: Int = 3,
    val tags: List<String> = emptyList(),
    val gratitude: List<String> = emptyList(),
    val note: String = "",
)

@Serializable
data class ThoughtRecord(
    val id: String,
    val profileId: String,
    val time: Long = System.currentTimeMillis(),
    val situation: String = "",
    val thought: String = "",
    val emotion: String = "",
    val intensityBefore: Int = 50,
    val distortions: List<String> = emptyList(),
    val evidenceFor: String = "",
    val evidenceAgainst: String = "",
    val balanced: String = "",
    val intensityAfter: Int = 50,
)

@Serializable
data class AssessmentResult(
    val id: String,
    val profileId: String,
    val type: String,
    val time: Long = System.currentTimeMillis(),
    val score: Int,
    val answers: List<Int>,
    val habitId: String? = null,
)

@Serializable
data class UrgeLog(
    val id: String,
    val profileId: String,
    val habitId: String? = null,
    val time: Long = System.currentTimeMillis(),
    val intensityBefore: Int,
    val intensityAfter: Int,
    val trigger: String = "",
    val resisted: Boolean = true,
)

@Serializable
data class WeightEntry(
    val profileId: String,
    val day: Long,
    val kg: Double,
)

@Serializable
data class TimeCapsule(
    val id: String,
    val profileId: String,
    val createdDay: Long,
    val openDay: Long,
    val message: String,
    val opened: Boolean = false,
)
