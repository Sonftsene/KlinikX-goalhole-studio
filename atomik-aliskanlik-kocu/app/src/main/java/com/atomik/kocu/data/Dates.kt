package com.atomik.kocu.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object Dates {
    val TR: Locale = Locale.forLanguageTag("tr-TR")
    private val longFmt = DateTimeFormatter.ofPattern("d MMMM EEEE", TR)
    private val shortFmt = DateTimeFormatter.ofPattern("d MMM", TR)
    private val fullFmt = DateTimeFormatter.ofPattern("d MMMM yyyy", TR)
    val dayLetters = listOf("Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz")
    val dayNames = listOf("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")

    fun today(): Long = LocalDate.now().toEpochDay()
    fun weekdayIndex(day: Long): Int = LocalDate.ofEpochDay(day).dayOfWeek.value - 1
    fun long(day: Long): String = LocalDate.ofEpochDay(day).format(longFmt)
    fun short(day: Long): String = LocalDate.ofEpochDay(day).format(shortFmt)
    fun full(day: Long): String = LocalDate.ofEpochDay(day).format(fullFmt)
    fun dayOf(millis: Long): Long =
        Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate().toEpochDay()
    fun minuteLabel(minute: Int): String = "%02d:%02d".format(minute / 60, minute % 60)
    fun isScheduled(habit: Habit, day: Long): Boolean =
        day >= habit.createdEpochDay && (habit.daysMask and (1 shl weekdayIndex(day))) != 0
    fun year(): Int = LocalDate.now().year
}
