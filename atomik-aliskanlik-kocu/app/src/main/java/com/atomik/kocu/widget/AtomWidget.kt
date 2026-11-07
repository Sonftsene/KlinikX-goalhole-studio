package com.atomik.kocu.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.atomik.kocu.MainActivity
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Stats

private val habitKey = ActionParameters.Key<String>("habitId")

class AtomWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Store.init(context)
        provideContent { WidgetBody() }
    }

    @Composable
    private fun WidgetBody() {
        val d by Store.data.collectAsState()
        val p = Store.activeProfile(d)
        val gold = ColorProvider(Color(0xFFE8B76A))
        val white = ColorProvider(Color(0xFFF3EFE6))
        val dim = ColorProvider(Color(0xFF8E89A0))
        Column(
            modifier = GlanceModifier.fillMaxSize().background(Color(0xFF0B0A14)).cornerRadius(24.dp).padding(14.dp)
                .clickable(actionStartActivity<MainActivity>()),
        ) {
            if (p == null) {
                Text("ATOMİK", style = TextStyle(color = gold, fontSize = 14.sp, fontWeight = FontWeight.Bold))
                Text("Perdeyi açmak için dokun.", style = TextStyle(color = white, fontSize = 13.sp))
                return@Column
            }
            val s = Stats(d)
            val habits = s.habitsOf(p.id).filter { Dates.isScheduled(it, s.today) }
            val (done, total) = s.dayProgress(habits)
            val dayIdx = s.dayIndex(p)
            val chapter = Chapters.current(dayIdx, s.votes(p.id))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.fillMaxWidth()) {
                Text("GÜN $dayIdx · ${chapter?.title?.uppercase(Dates.TR) ?: "PROLOG"}", style = TextStyle(color = gold, fontSize = 11.sp, fontWeight = FontWeight.Bold), modifier = GlanceModifier.defaultWeight())
                Text("$done/$total", style = TextStyle(color = white, fontSize = 16.sp, fontWeight = FontWeight.Bold))
            }
            Spacer(GlanceModifier.height(6.dp))
            if (habits.isEmpty()) Text("Bugün sahne yok. Dinlen 🌙", style = TextStyle(color = dim, fontSize = 13.sp))
            habits.take(4).forEach { h ->
                val c = s.completed(h, s.today)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp)
                        .clickable(actionRunCallback<ToggleHabitAction>(actionParametersOf(habitKey to h.id))),
                ) {
                    Text(if (c) "◉" else "○", style = TextStyle(color = if (c) gold else dim, fontSize = 16.sp))
                    Spacer(GlanceModifier.width(8.dp))
                    Text(
                        "${h.emoji} ${h.title}" + if (h.kind == HabitKind.BREAK) " (temiz)" else "",
                        style = TextStyle(color = if (c) dim else white, fontSize = 13.sp),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

class ToggleHabitAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        Store.init(context)
        val id = parameters[habitKey] ?: return
        val h = Store.data.value.habits.firstOrNull { it.id == id } ?: return
        Store.tap(h, Dates.today())
        Store.saveNow()
        AtomWidget().updateAll(context)
    }
}

class AtomWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AtomWidget()
}
