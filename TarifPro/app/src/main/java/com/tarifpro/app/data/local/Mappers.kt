package com.tarifpro.app.data.local

import com.tarifpro.app.domain.Ingredient
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Step
import com.tarifpro.app.domain.Visibility
import org.json.JSONArray
import org.json.JSONObject

object RecipeJson {
    fun ingredientsToJson(list: List<Ingredient>): String {
        val arr = JSONArray()
        list.forEach { i ->
            arr.put(
                JSONObject().apply {
                    put("group", i.group)
                    i.amount?.let { put("amount", it) }
                    i.amountMax?.let { put("amountMax", it) }
                    put("unit", i.unit)
                    put("name", i.name)
                    put("note", i.note)
                    i.grams?.let { put("grams", it) }
                },
            )
        }
        return arr.toString()
    }

    fun ingredientsFromJson(json: String?): List<Ingredient> {
        if (json.isNullOrBlank()) return emptyList()
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).map { idx ->
                val o = arr.getJSONObject(idx)
                Ingredient(
                    group = o.optString("group"),
                    amount = if (o.has("amount") && !o.isNull("amount")) o.getDouble("amount") else null,
                    amountMax = if (o.has("amountMax") && !o.isNull("amountMax")) o.getDouble("amountMax") else null,
                    unit = o.optString("unit"),
                    name = o.optString("name"),
                    note = o.optString("note"),
                    grams = if (o.has("grams") && !o.isNull("grams")) o.getDouble("grams") else null,
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun stepsToJson(list: List<Step>): String {
        val arr = JSONArray()
        list.forEach { s ->
            arr.put(
                JSONObject().apply {
                    put("title", s.title)
                    put("text", s.text)
                    s.minutes?.let { put("minutes", it) }
                    s.image?.let { put("image", it) }
                },
            )
        }
        return arr.toString()
    }

    fun stepsFromJson(json: String?): List<Step> {
        if (json.isNullOrBlank()) return emptyList()
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).map { idx ->
                val o = arr.getJSONObject(idx)
                Step(
                    title = o.optString("title"),
                    text = o.optString("text"),
                    minutes = if (o.has("minutes") && !o.isNull("minutes")) o.getInt("minutes") else null,
                    image = if (o.has("image") && !o.isNull("image")) o.getString("image") else null,
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun stringsToJson(list: List<String>): String = JSONArray().apply { list.forEach { put(it) } }.toString()

    fun stringsFromJson(json: String?): List<String> {
        if (json.isNullOrBlank()) return emptyList()
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
        } catch (e: Exception) {
            emptyList()
        }
    }
}

fun RecipeEntity.toDomain(): Recipe = Recipe(
    id = id,
    authorId = authorId,
    authorName = authorName,
    authorPhoto = authorPhoto,
    title = title,
    description = description,
    tagline = tagline,
    category = category,
    cuisine = cuisine,
    difficulty = difficulty,
    servings = servings,
    prepMinutes = prepMinutes,
    cookMinutes = cookMinutes,
    restMinutes = restMinutes,
    templateId = templateId,
    visibility = Visibility.parse(visibility),
    image = image,
    ingredients = RecipeJson.ingredientsFromJson(ingredientsJson),
    steps = RecipeJson.stepsFromJson(stepsJson),
    tips = RecipeJson.stringsFromJson(tipsJson),
    tags = RecipeJson.stringsFromJson(tagsJson),
    ratingAvg = ratingAvg,
    ratingCount = ratingCount,
    createdAt = createdAt,
    updatedAt = updatedAt,
    hidden = hidden,
    featured = featured,
    sourceUrl = sourceUrl,
)

fun Recipe.toEntity(dirty: Boolean, deleted: Boolean = false): RecipeEntity = RecipeEntity(
    id = id,
    authorId = authorId,
    authorName = authorName,
    authorPhoto = authorPhoto,
    title = title,
    description = description,
    tagline = tagline,
    category = category,
    cuisine = cuisine,
    difficulty = difficulty,
    servings = servings,
    prepMinutes = prepMinutes,
    cookMinutes = cookMinutes,
    restMinutes = restMinutes,
    templateId = templateId,
    visibility = visibility.name,
    image = image,
    ingredientsJson = RecipeJson.ingredientsToJson(ingredients),
    stepsJson = RecipeJson.stepsToJson(steps),
    tipsJson = RecipeJson.stringsToJson(tips),
    tagsJson = RecipeJson.stringsToJson(tags),
    kcalPerServing = NutritionCalculator.kcalPerServing(this),
    ratingAvg = ratingAvg,
    ratingCount = ratingCount,
    createdAt = createdAt,
    updatedAt = updatedAt,
    hidden = hidden,
    featured = featured,
    sourceUrl = sourceUrl,
    dirty = dirty,
    deleted = deleted,
)
