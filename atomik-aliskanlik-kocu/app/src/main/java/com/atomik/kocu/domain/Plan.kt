package com.atomik.kocu.domain

import com.atomik.kocu.content.Goal
import com.atomik.kocu.content.HabitTemplate
import com.atomik.kocu.content.Templates
import com.atomik.kocu.data.Habit

/** Üşengeç dostu otomatik senaryo: hedeflerden ve enerji seviyesinden hazır bir plan çıkarır. */
object Plan {
    fun generate(goals: List<Goal>, energy: Int, excludeLoss: Boolean = false): List<HabitTemplate> {
        val chosen = goals.filterNot { excludeLoss && it == Goal.LOSE_WEIGHT }.ifEmpty { listOf(Goal.MOOD) }
        val pools = chosen.map { Templates.forGoal(it).toMutableList() }
        val out = mutableListOf<HabitTemplate>()
        val count = energy.coerceIn(1, 3) + if (chosen.size > 1 && energy >= 2) 1 else 0
        var round = 0
        while (out.size < count && pools.any { it.isNotEmpty() }) {
            val pool = pools[round % pools.size]
            if (pool.isNotEmpty()) {
                val t = pool.removeAt(0)
                if (out.none { it.id == t.id }) out += t
            }
            round++
        }
        return out
    }

    fun toHabit(t: HabitTemplate, profileId: String, today: Long, colorIndex: Int, id: String, order: Int = 0) = Habit(
        id = id,
        profileId = profileId,
        title = t.title,
        emoji = t.emoji,
        kind = t.kind,
        identity = t.identity,
        cue = t.cue,
        anchor = t.anchor,
        attractor = t.attractor,
        tinyVersion = t.tinyVersion,
        environment = t.environment,
        reward = t.reward,
        target = t.target,
        unit = t.unit,
        reminderMinute = t.defaultMinute,
        colorIndex = colorIndex,
        createdEpochDay = today,
        templateId = t.id,
        order = order,
    )

    /** Uygulama içi "eğer-o zaman" cümlesi */
    fun sentence(anchor: String, action: String, identity: String): String {
        val a = anchor.trim().trimEnd(',', '.')
        val act = action.trim().trimEnd('.')
        val base = when {
            a.isNotBlank() && act.isNotBlank() -> "$a, $act."
            act.isNotBlank() -> "$act."
            else -> ""
        }
        return if (identity.isNotBlank() && base.isNotBlank()) "$base Çünkü: ${identity.trim().trimEnd('.')}." else base
    }
}
