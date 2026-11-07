package com.atomik.kocu

import com.atomik.kocu.content.Goal
import com.atomik.kocu.content.Insights
import com.atomik.kocu.content.Rarity
import com.atomik.kocu.content.Templates
import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.BodyInfo
import com.atomik.kocu.data.Habit
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.HabitLog
import com.atomik.kocu.data.LogStatus
import com.atomik.kocu.data.Profile
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Assessments
import com.atomik.kocu.domain.Body
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Coach
import com.atomik.kocu.domain.Plan
import com.atomik.kocu.domain.Stats
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainTest {
    private val today = 20_000L
    private fun habit(id: String = "h", created: Long = today - 30, target: Int = 1, kind: HabitKind = HabitKind.BUILD) =
        Habit(id = id, profileId = "p", title = "Su", createdEpochDay = created, target = target, kind = kind, tinyVersion = "1 yudum")

    private fun data(h: Habit, logs: List<HabitLog>) = AppData(
        profiles = listOf(Profile(id = "p", name = "Test", startEpochDay = today - 30)),
        activeProfileId = "p", habits = listOf(h), logs = logs,
    )

    @Test fun streakCountsBackFromYesterdayWhenTodayOpen() {
        val h = habit()
        val logs = (1..5).map { HabitLog("h", today - it) }
        val s = Stats(data(h, logs), today)
        assertEquals(5, s.streak(h))
    }

    @Test fun freezeAndSkipKeepStreakButDoNotCount() {
        val h = habit()
        val logs = listOf(HabitLog("h", today), HabitLog("h", today - 1, status = LogStatus.FREEZE), HabitLog("h", today - 2, status = LogStatus.SKIP), HabitLog("h", today - 3))
        assertEquals(2, Stats(data(h, logs), today).streak(h))
    }

    @Test fun partialAmountIsNotComplete() {
        val h = habit(target = 8)
        val s = Stats(data(h, listOf(HabitLog("h", today, amount = 3))), today)
        assertFalse(s.completed(h, today))
        assertTrue(Stats(data(h, listOf(HabitLog("h", today, amount = 8))), today).completed(h, today))
        assertTrue(Stats(data(h, listOf(HabitLog("h", today, amount = 1, status = LogStatus.TINY))), today).completed(h, today))
    }

    @Test fun bestStreakAndMissedTwice() {
        val h = habit()
        val logs = (10..20).map { HabitLog("h", today - it) } + HabitLog("h", today - 5)
        val s = Stats(data(h, logs), today)
        assertEquals(11, s.bestStreak(h))
        assertTrue(s.missedTwoDays(h))
        assertEquals(1, s.missedYesterday(listOf(h)).size)
    }

    @Test fun breakHabitSlipResetsCleanCounter() {
        val h = habit(kind = HabitKind.BREAK)
        val s = Stats(data(h, listOf(HabitLog("h", today - 4, status = LogStatus.SLIP))), today)
        assertEquals(4, s.daysSinceSlip(h))
    }

    @Test fun automaticityFollowsLallyCurve() {
        assertEquals(0f, Stats.automaticity(0), 0.001f)
        assertTrue(Stats.automaticity(66) > 0.94f)
        assertEquals(37.78, Stats.compound(365), 0.05)
    }

    @Test fun mifflinStJeor() {
        val b = BodyInfo(female = false, birthYear = java.time.LocalDate.now().year - 30, heightCm = 180, weightKg = 80.0, targetKg = 75.0, activity = 0)
        assertEquals(1780.0, Body.bmr(b), 0.5)
        assertEquals(2136, Body.tdee(b))
        assertEquals(1636, Body.targetCalories(b))
        assertEquals(10, Body.weeksToTarget(b))
    }

    @Test fun weightLossBlockedWhenUnderweight() {
        val b = BodyInfo(female = true, heightCm = 170, weightKg = 52.0, targetKg = 48.0)
        assertTrue(Body.lossUnsafe(b))
        assertTrue(Plan.generate(listOf(Goal.LOSE_WEIGHT), 3, excludeLoss = true).none { it.goal == Goal.LOSE_WEIGHT })
    }

    @Test fun assessmentBands() {
        assertEquals("Orta", Assessments.band("PHQ9", 12).label)
        assertEquals("Şiddetli", Assessments.band("GAD7", 15).label)
        assertEquals(3, Assessments.band("SCOFF", 2).severity)
        assertEquals(100, Assessments.srbaiPercent(28))
        assertEquals(0, Assessments.srbaiPercent(4))
    }

    @Test fun planRespectsEnergy() {
        assertEquals(1, Plan.generate(listOf(Goal.MOOD), 1).size)
        val three = Plan.generate(listOf(Goal.MOOD, Goal.SLEEP), 3)
        assertEquals(4, three.size)
        assertEquals(three.map { it.id }.distinct().size, three.size)
    }

    @Test fun contentIsComplete() {
        Goal.entries.forEach { g ->
            assertTrue("şablon yok: $g", Templates.forGoal(g).size >= 3)
            assertTrue("kimlik yok: $g", Templates.identities[g].orEmpty().isNotEmpty())
        }
        assertEquals(60, Insights.cards.size)
        assertEquals(60, Insights.cards.map { it.id }.distinct().size)
        assertTrue(Insights.cards.any { it.rarity == Rarity.LEGENDARY })
        assertTrue(Insights.directorTips.size >= 20)
        assertEquals(Templates.all.size, Templates.all.map { it.id }.distinct().size)
    }

    @Test fun chaptersUnlockInOrder() {
        assertEquals("ch1", Chapters.current(1, 1)?.id)
        assertEquals("ch2", Chapters.next(1, 1)?.id)
        assertEquals(null, Chapters.current(1, 0))
        assertTrue(Chapters.all.zipWithNext().all { (a, b) -> a.day <= b.day && a.votes <= b.votes })
    }

    @Test fun coachAlwaysHasANote() {
        val h = habit()
        val d = data(h, emptyList())
        val p = d.profiles.first()
        val notes = Coach.notes(d, p, Stats(d, today))
        assertTrue(notes.isNotEmpty())
    }

    @Test fun jsonRoundTrip() {
        val h = habit()
        val d = data(h, listOf(HabitLog("h", today, note = "ilk \"tırnak\"")))
        val text = Store.json.encodeToString(AppData.serializer(), d)
        assertEquals(d, Store.json.decodeFromString(AppData.serializer(), text))
    }
}
