package com.atomik.kocu.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

/**
 * Çevrimdışı, cihaz içi veri deposu. Tüm veri tek bir JSON belgesinde tutulur,
 * bellekte StateFlow ile yayınlanır ve her değişiklikten sonra atomik olarak diske yazılır.
 */
object Store {
    val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    private val _data = MutableStateFlow(AppData())
    val data: StateFlow<AppData> = _data
    private var file: File? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val saveChannel = Channel<Unit>(Channel.CONFLATED)
    private val lock = Any()
    var onChanged: (() -> Unit)? = null

    fun newId(): String = UUID.randomUUID().toString().replace("-", "").take(14)

    fun init(context: Context) {
        synchronized(lock) {
            if (file != null) return
            val f = File(context.applicationContext.filesDir, "atomik.json")
            file = f
            if (f.exists()) {
                runCatching { _data.value = json.decodeFromString(AppData.serializer(), f.readText()) }
                    .onFailure {
                        val backup = File(f.parentFile, "atomik.json.bak")
                        if (backup.exists()) runCatching {
                            _data.value = json.decodeFromString(AppData.serializer(), backup.readText())
                        }
                    }
            }
            scope.launch {
                for (signal in saveChannel) {
                    saveNow()
                    onChanged?.invoke()
                }
            }
        }
    }

    fun saveNow() {
        val f = file ?: return
        synchronized(lock) {
            val text = json.encodeToString(AppData.serializer(), _data.value)
            val tmp = File(f.parentFile, "atomik.json.tmp")
            tmp.writeText(text)
            if (f.exists()) f.copyTo(File(f.parentFile, "atomik.json.bak"), overwrite = true)
            if (!tmp.renameTo(f)) {
                f.writeText(text); tmp.delete()
            }
        }
    }

    fun edit(block: (AppData) -> AppData) {
        _data.update(block)
        saveChannel.trySend(Unit)
    }

    // ---------- Seçiciler ----------
    fun activeProfile(d: AppData = data.value): Profile? =
        d.profiles.firstOrNull { it.id == d.activeProfileId } ?: d.profiles.firstOrNull()

    fun habitsOf(d: AppData, profileId: String, includeArchived: Boolean = false): List<Habit> =
        d.habits.filter { it.profileId == profileId && (includeArchived || !it.archived) }.sortedBy { it.order }

    // ---------- Profil ----------
    fun addProfile(profile: Profile, habits: List<Habit>) = edit { d ->
        d.copy(
            profiles = d.profiles + profile,
            activeProfileId = profile.id,
            habits = d.habits + habits,
        )
    }

    fun setActiveProfile(id: String) = edit { it.copy(activeProfileId = id) }

    fun updateProfile(id: String, f: (Profile) -> Profile) = edit { d ->
        d.copy(profiles = d.profiles.map { if (it.id == id) f(it) else it })
    }

    fun deleteProfile(id: String) = edit { d ->
        val habitIds = d.habits.filter { it.profileId == id }.map { it.id }.toSet()
        val rest = d.profiles.filterNot { it.id == id }
        d.copy(
            profiles = rest,
            activeProfileId = if (d.activeProfileId == id) rest.firstOrNull()?.id else d.activeProfileId,
            habits = d.habits.filterNot { it.profileId == id },
            logs = d.logs.filterNot { it.habitId in habitIds },
            moods = d.moods.filterNot { it.profileId == id },
            thoughts = d.thoughts.filterNot { it.profileId == id },
            assessments = d.assessments.filterNot { it.profileId == id },
            urges = d.urges.filterNot { it.profileId == id },
            weights = d.weights.filterNot { it.profileId == id },
            capsules = d.capsules.filterNot { it.profileId == id },
        )
    }

    // ---------- Alışkanlık ----------
    fun upsertHabit(habit: Habit) = edit { d ->
        if (d.habits.any { it.id == habit.id }) d.copy(habits = d.habits.map { if (it.id == habit.id) habit else it })
        else d.copy(habits = d.habits + habit.copy(order = (d.habits.maxOfOrNull { it.order } ?: 0) + 1))
    }

    fun deleteHabit(id: String) = edit { d ->
        d.copy(habits = d.habits.filterNot { it.id == id }, logs = d.logs.filterNot { it.habitId == id })
    }

    fun setArchived(id: String, archived: Boolean) = edit { d ->
        d.copy(habits = d.habits.map { if (it.id == id) it.copy(archived = archived) else it })
    }

    fun log(habitId: String, day: Long, status: LogStatus, amount: Int = 1, note: String = "") = edit { d ->
        val others = d.logs.filterNot { it.habitId == habitId && it.day == day }
        d.copy(logs = others + HabitLog(habitId, day, amount, status, note))
    }

    fun clearLog(habitId: String, day: Long) = edit { d ->
        d.copy(logs = d.logs.filterNot { it.habitId == habitId && it.day == day })
    }

    /** Tek dokunuş: tamamla / sayacı artır / geri al. */
    fun tap(habit: Habit, day: Long) = edit { d ->
        val existing = d.logs.firstOrNull { it.habitId == habit.id && it.day == day }
        val others = d.logs.filterNot { it.habitId == habit.id && it.day == day }
        val next: HabitLog? = when {
            existing == null -> HabitLog(habit.id, day, if (habit.target > 1) 1 else habit.target, LogStatus.DONE)
            existing.status == LogStatus.DONE && existing.amount < habit.target -> existing.copy(amount = existing.amount + 1, time = System.currentTimeMillis())
            else -> null
        }
        d.copy(logs = if (next != null) others + next else others)
    }

    fun useFreeze(profileId: String, habitIds: List<String>, day: Long) = edit { d ->
        val p = d.profiles.firstOrNull { it.id == profileId } ?: return@edit d
        if (p.freezeTokens <= 0) return@edit d
        val others = d.logs.filterNot { it.day == day && it.habitId in habitIds }
        d.copy(
            logs = others + habitIds.map { HabitLog(it, day, 0, LogStatus.FREEZE) },
            profiles = d.profiles.map { if (it.id == profileId) it.copy(freezeTokens = it.freezeTokens - 1) else it },
        )
    }

    // ---------- Zihin & beden ----------
    fun addMood(entry: MoodEntry) = edit { d ->
        d.copy(moods = d.moods.filterNot { it.profileId == entry.profileId && it.day == entry.day } + entry)
    }
    fun addThought(t: ThoughtRecord) = edit { it.copy(thoughts = it.thoughts + t) }
    fun deleteThought(id: String) = edit { d -> d.copy(thoughts = d.thoughts.filterNot { it.id == id }) }
    fun addAssessment(a: AssessmentResult) = edit { it.copy(assessments = it.assessments + a) }
    fun addUrge(u: UrgeLog) = edit { it.copy(urges = it.urges + u) }
    fun addWeight(w: WeightEntry) = edit { d ->
        d.copy(
            weights = d.weights.filterNot { it.profileId == w.profileId && it.day == w.day } + w,
            profiles = d.profiles.map { p ->
                if (p.id == w.profileId && p.body != null) p.copy(body = p.body.copy(weightKg = w.kg)) else p
            },
        )
    }
    fun addCapsule(c: TimeCapsule) = edit { it.copy(capsules = it.capsules + c) }
    fun openCapsule(id: String) = edit { d -> d.copy(capsules = d.capsules.map { if (it.id == id) it.copy(opened = true) else it }) }
    fun updateSettings(f: (Settings) -> Settings) = edit { it.copy(settings = f(it.settings)) }

    // ---------- Yedekleme ----------
    fun exportJson(): String = Json { prettyPrint = true; encodeDefaults = true }
        .encodeToString(AppData.serializer(), data.value)

    fun importJson(text: String): Boolean = runCatching {
        val parsed = json.decodeFromString(AppData.serializer(), text)
        edit { parsed }
    }.isSuccess

    fun exportCsv(): String {
        val d = data.value
        val habits = d.habits.associateBy { it.id }
        val profiles = d.profiles.associateBy { it.id }
        val sb = StringBuilder("profil,tarih,aliskanlik,durum,miktar,not\n")
        d.logs.sortedBy { it.day }.forEach { l ->
            val h = habits[l.habitId] ?: return@forEach
            val p = profiles[h.profileId]?.name ?: ""
            fun q(s: String) = "\"" + s.replace("\"", "\"\"") + "\""
            sb.append(q(p)).append(',').append(Dates.full(l.day)).append(',').append(q(h.title)).append(',')
                .append(l.status.name).append(',').append(l.amount).append(',').append(q(l.note)).append('\n')
        }
        return sb.toString()
    }
}
