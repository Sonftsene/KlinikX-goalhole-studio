package com.atomik.kocu.domain

import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Habit
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.HabitLog
import com.atomik.kocu.data.LogStatus
import com.atomik.kocu.data.Profile
import kotlin.math.exp
import kotlin.math.pow

/** Bir veri anlık görüntüsü üzerinde hızlı hesaplamalar (indeksli). */
class Stats(val d: AppData, val today: Long = Dates.today()) {
    private val index: Map<String, Map<Long, HabitLog>> =
        d.logs.groupBy { it.habitId }.mapValues { e -> e.value.associateBy { it.day } }

    fun log(habitId: String, day: Long): HabitLog? = index[habitId]?.get(day)

    fun completed(h: Habit, day: Long): Boolean {
        val l = log(h.id, day) ?: return false
        return when (l.status) {
            LogStatus.TINY -> true
            LogStatus.DONE -> h.kind == HabitKind.BREAK || l.amount >= h.target
            else -> false
        }
    }

    /** Seriyi bozmayan ama sayılmayan durumlar (dondurma, bilinçli atlama). */
    private fun neutral(h: Habit, day: Long): Boolean {
        val s = log(h.id, day)?.status
        return s == LogStatus.FREEZE || s == LogStatus.SKIP
    }

    fun streak(h: Habit): Int {
        var day = if (completed(h, today) || neutral(h, today)) today else today - 1
        var count = 0
        while (day >= h.createdEpochDay) {
            if (Dates.isScheduled(h, day)) {
                when {
                    completed(h, day) -> count++
                    neutral(h, day) -> Unit
                    else -> return count
                }
            }
            day--
        }
        return count
    }

    fun bestStreak(h: Habit): Int {
        var best = 0; var cur = 0
        var day = h.createdEpochDay
        while (day <= today) {
            if (Dates.isScheduled(h, day)) {
                when {
                    completed(h, day) -> { cur++; if (cur > best) best = cur }
                    neutral(h, day) -> Unit
                    day == today -> Unit
                    else -> cur = 0
                }
            }
            day++
        }
        return best
    }

    /** [from, to] aralığında tamamlanma oranı (0..1). Bugün henüz bitmediyse yalnızca tamamlandıysa sayılır. */
    fun rate(h: Habit, days: Int): Float {
        var done = 0; var total = 0
        val from = maxOf(h.createdEpochDay, today - days + 1)
        for (day in from..today) {
            if (!Dates.isScheduled(h, day) || neutral(h, day)) continue
            val c = completed(h, day)
            if (day == today && !c) continue
            total++; if (c) done++
        }
        return if (total == 0) 0f else done.toFloat() / total
    }

    fun reps(h: Habit): Int = index[h.id]?.values?.count { completed(h, it.day) } ?: 0

    fun habitsOf(profileId: String): List<Habit> =
        d.habits.filter { it.profileId == profileId && !it.archived }.sortedBy { it.order }

    fun votes(profileId: String): Int =
        d.habits.filter { it.profileId == profileId }.sumOf { reps(it) }

    fun dayProgress(habits: List<Habit>, day: Long = today): Pair<Int, Int> {
        val scheduled = habits.filter { Dates.isScheduled(it, day) }
        return scheduled.count { completed(it, day) || neutral(it, day) } to scheduled.size
    }

    fun dayRatio(habits: List<Habit>, day: Long): Float {
        val (a, b) = dayProgress(habits, day)
        return if (b == 0) -1f else a.toFloat() / b
    }

    fun daysSinceSlip(h: Habit): Long {
        val lastSlip = index[h.id]?.values?.filter { it.status == LogStatus.SLIP }?.maxOfOrNull { it.day }
        return today - (lastSlip ?: (h.createdEpochDay - 1))
    }

    fun missedYesterday(habits: List<Habit>): List<Habit> {
        val y = today - 1
        return habits.filter { it.createdEpochDay <= y && Dates.isScheduled(it, y) && !completed(it, y) && !neutral(it, y) }
    }

    fun missedTwoDays(h: Habit): Boolean {
        val days = (1..2).map { today - it }
        return days.all { day -> h.createdEpochDay <= day && Dates.isScheduled(h, day) && !completed(h, day) && !neutral(h, day) }
    }

    fun weekdayRates(habits: List<Habit>, lookback: Int = 56): List<Float> {
        val done = IntArray(7); val total = IntArray(7)
        for (day in (today - lookback + 1)..today) {
            val wd = Dates.weekdayIndex(day)
            habits.forEach { h ->
                if (Dates.isScheduled(h, day) && !neutral(h, day) && !(day == today && !completed(h, day))) {
                    total[wd]++
                    if (completed(h, day)) done[wd]++
                }
            }
        }
        return (0..6).map { if (total[it] == 0) 0f else done[it].toFloat() / total[it] }
    }

    fun activeDays(profileId: String): Int {
        val ids = d.habits.filter { it.profileId == profileId }.associateBy { it.id }
        return d.logs.filter { l -> ids[l.habitId]?.let { completed(it, l.day) } == true }.map { it.day }.distinct().size
    }

    fun perfectDays(profileId: String, lookback: Int = 365): Int {
        val hs = habitsOf(profileId)
        return ((today - lookback + 1)..today).count { day -> val (a, b) = dayProgress(hs, day); b > 0 && a == b }
    }

    fun bestCurrentStreak(profileId: String): Int = habitsOf(profileId).maxOfOrNull { streak(it) } ?: 0
    fun bestEverStreak(profileId: String): Int = d.habits.filter { it.profileId == profileId }.maxOfOrNull { bestStreak(it) } ?: 0

    fun dayIndex(p: Profile): Int = (today - p.startEpochDay + 1).toInt().coerceAtLeast(1)

    companion object {
        /**
         * Tahmini otomatiklik (0..1). Lally ve ark. (2010) asimptotik eğrisine dayanan basit model:
         * medyan ~66 tekrarda platonun ~%95'ine ulaşılır.
         */
        fun automaticity(reps: Int): Float = (1 - exp(-reps / 22.0)).toFloat()

        /** Her gün %1 daha iyi: 1.01^gün */
        fun compound(days: Int): Double = 1.01.pow(days)
    }
}
