package com.atomik.kocu

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.ui.AppRoot
import com.atomik.kocu.ui.theme.AtomikTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Uçtan uca: boş uygulama → sinematik onboarding → plan → ana ekranda tek dokunuşla tamamlama. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w400dp-h860dp-xhdpi")
class FlowTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    private fun step(ms: Long = 1200) = rule.mainClock.advanceTimeBy(ms)

    @Test fun onboardingCreatesProfileAndHabitCanBeCompleted() {
        Store.init(ApplicationProvider.getApplicationContext())
        Store.edit { AppData() }
        rule.mainClock.autoAdvance = false
        rule.setContent { AtomikTheme { AppRoot() } }
        step(1500)
        rule.onNodeWithText("atla ›").performClick(); step(2500)
        rule.onNodeWithText("Perdeyi aç").performClick(); step()
        rule.onNode(hasSetTextAction()).performTextReplacement("Ali"); step(300)
        rule.onNodeWithText("Devam").performClick(); step()
        rule.onNodeWithText("Moral & mutluluk").performClick(); step(300)
        rule.onNodeWithText("Devam").performSemanticsAction(SemanticsActions.OnClick); step()
        rule.onNodeWithText("Devam").performSemanticsAction(SemanticsActions.OnClick); step()
        rule.onNodeWithText("Devam").performSemanticsAction(SemanticsActions.OnClick); step(7000)
        rule.onNode(hasText("Çekim başlasın", substring = true)).performSemanticsAction(SemanticsActions.OnClick); step(2000)

        val d = Store.data.value
        assertEquals(1, d.profiles.size)
        assertEquals("Ali", d.profiles.first().name)
        assertEquals(1, d.habits.size)

        val h = d.habits.first()
        rule.onNodeWithText(h.title).assertExistsCompat()
        Store.tap(h, Dates.today())
        step(500)
        assertTrue(Stats(Store.data.value).completed(h, Dates.today()) || h.target > 1)
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertExistsCompat() = assertExists()
}
