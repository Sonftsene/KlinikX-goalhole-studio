package com.atomik.kocu

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.core.app.ApplicationProvider
import com.atomik.kocu.content.Goal
import com.atomik.kocu.content.Insights
import com.atomik.kocu.content.Templates
import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.BodyInfo
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.HabitLog
import com.atomik.kocu.data.LogStatus
import com.atomik.kocu.data.MoodEntry
import com.atomik.kocu.data.Profile
import com.atomik.kocu.data.Store
import com.atomik.kocu.data.TimeCapsule
import com.atomik.kocu.data.UrgeLog
import com.atomik.kocu.data.WeightEntry
import com.atomik.kocu.domain.Plan
import com.atomik.kocu.ui.AppRoot
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.Navigator
import com.atomik.kocu.ui.screens.*
import com.atomik.kocu.ui.theme.AtomikTheme
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.random.Random

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w400dp-h860dp-xhdpi")
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Before fun seed() {
        Store.init(ApplicationProvider.getApplicationContext())
        val today = Dates.today()
        val pid = "p1"
        val templates = Plan.generate(listOf(Goal.MOOD, Goal.LOSE_WEIGHT, Goal.SLEEP), 3) + Templates.forGoal(Goal.DIGITAL).first { it.kind == HabitKind.BREAK }
        val habits = templates.mapIndexed { i, t -> Plan.toHabit(t, pid, today - 16, i, "h$i", i) }
        val rnd = Random(4)
        val logs = habits.flatMap { h -> (1..16).mapNotNull { back -> if (rnd.nextFloat() < 0.78f) HabitLog(h.id, today - back, h.target) else null } } +
            HabitLog(habits[0].id, today, habits[0].target) + HabitLog(habits[1].id, today, 1, LogStatus.TINY)
        Store.edit {
            AppData(
                profiles = listOf(Profile(
                    id = pid, name = "Deniz", avatar = "🦊", identities = listOf("Ben bedenine saygı duyan biriyim", "Ben sakin kalabilen biriyim"),
                    goals = listOf("MOOD", "LOSE_WEIGHT", "SLEEP"), energy = 3, startEpochDay = today - 16,
                    body = BodyInfo(female = true, birthYear = 1994, heightCm = 168, weightKg = 74.0, targetKg = 66.0, activity = 1),
                    seenChapters = listOf("ch1", "ch2", "ch3", "ch4", "ch5"), freezeTokens = 2,
                    revealedCards = Insights.cards.take(9).map { it.id }, achievements = listOf("first_vote", "streak3", "streak7", "votes50"),
                )),
                activeProfileId = pid, habits = habits, logs = logs,
                moods = (0..14).map { MoodEntry("m$it", pid, today - it - 1, mood = (2 + rnd.nextInt(4)).coerceAtMost(5), tags = listOf("Huzurlu")) },
                urges = (0..4).map { UrgeLog("u$it", pid, habits.last().id, intensityBefore = 8, intensityAfter = 3, trigger = "Gece") },
                weights = (0..6).map { WeightEntry(pid, today - 16 + it * 2, 76.0 - it * 0.3) },
                capsules = listOf(TimeCapsule("c1", pid, today - 10, today + 56, "Merhaba gelecekteki ben, umarım hâlâ yürüyorsundur.")),
            )
        }
    }

    private fun shot(name: String, advance: Long = 2500, scroll: Int = 0, content: @Composable () -> Unit) {
        rule.mainClock.autoAdvance = false
        rule.setContent { AtomikTheme { CompositionLocalProvider(LocalNav provides Navigator({}, {})) { content() } } }
        rule.mainClock.advanceTimeBy(advance)
        save(name)
        repeat(scroll) { i ->
            rule.onRoot().performTouchInput { swipeUp(startY = bottom * 0.85f, endY = top + bottom * 0.1f) }
            rule.mainClock.advanceTimeBy(1500)
            save("${name}_${i + 2}")
        }
    }

    private fun save(name: String) {
        val view = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        rule.runOnUiThread { view.draw(android.graphics.Canvas(bmp)) }
        val dir = File("build/shots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun s00_app() { rule.mainClock.autoAdvance = false; rule.setContent { AtomikTheme { AppRoot() } }; rule.mainClock.advanceTimeBy(3000); save("00_app") }
    @Test fun s01_home() = shot("01_home", scroll = 3) { HomeTab() }
    @Test fun s02_journey() = shot("02_journey", scroll = 1) { JourneyTab() }
    @Test fun s03_lab() = shot("03_lab", scroll = 2) { LabTab() }
    @Test fun s04_mind() = shot("04_mind", scroll = 1) { MindTab() }
    @Test fun s05_profile() = shot("05_profile", scroll = 1) { ProfileTab() }
    @Test fun s06_editor() = shot("06_editor", scroll = 2) { HabitEditor(null) }
    @Test fun s07_detail() = shot("07_detail", scroll = 1) { HabitDetail("h0") }
    @Test fun s08_chapter() = shot("08_chapter", advance = 14000) { ChapterReveal("ch6") }
    @Test fun s09_card() = shot("09_card", advance = 4000) { CardView(Insights.cards[0].id) }
    @Test fun s10_trailer() = shot("10_trailer", advance = 3000) { TrailerScreen() }
    @Test fun s11_prolog() = shot("11_prolog", advance = 3000) { Onboarding(firstRun = true, onFinish = {}) }
    @Test fun s12_body() = shot("12_body") { BodyScreen() }
    @Test fun s13_breath() = shot("13_breath") { BreathScreen() }
    @Test fun s14_urge() = shot("14_urge") { UrgeScreen(null) }
    @Test fun s15_phq() = shot("15_phq") { AssessmentScreen("PHQ9", null) }
    @Test fun s16_archive() = shot("16_archive") { ArchiveScreen() }
    @Test fun s17_capsule() = shot("17_capsule") { CapsuleScreen() }
    @Test fun s18_chain() = shot("18_chain") { ChainScreen() }
    @Test fun s19_crisis() = shot("19_crisis") { CrisisScreen() }
    @Test fun s20_onb_name() = shot("20_onb_name", advance = 2000) { Onboarding(firstRun = false, onFinish = {}) }
}
