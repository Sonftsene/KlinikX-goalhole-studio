package com.tarifpro.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.tarifpro.app.data.cloud.FirebaseCloud
import com.tarifpro.app.export.FoodIllustrations
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import kotlin.math.max

/**
 * Tarif görsellerini yönetir:
 *  - Kamera / galeri görsellerini döndürme düzeltmesi ve sıkıştırma ile uygulama alanına kopyalar
 *  - Bulut fotoğraflarını (fsimg:) önbelleğe indirir
 *  - Dışa aktarma için her tür görsel referansını Bitmap'e çevirir
 */
class ImageStore(private val context: Context, private val cloudProvider: () -> FirebaseCloud?) {
    private val imagesDir = File(context.filesDir, "images").apply { mkdirs() }
    private val cloudCache = File(context.cacheDir, "cloudimg").apply { mkdirs() }

    fun newCameraTarget(): Uri {
        val file = File(imagesDir, "camera_${System.currentTimeMillis()}.jpg")
        return FileProvider.getUriForFile(context, context.packageName + ".files", file)
    }

    /** Kamera çıktısı veya galeriden seçilen görseli kalıcı yerel dosyaya dönüştürür. */
    suspend fun importImage(uri: Uri, maxSize: Int = 1600): String? = withContext(Dispatchers.IO) {
        try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0) return@withContext null
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSize) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            var bmp = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
                ?: return@withContext null
            val rotation = try {
                context.contentResolver.openInputStream(uri)?.use {
                    when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                        else -> 0f
                    }
                } ?: 0f
            } catch (e: Exception) {
                0f
            }
            bmp = scaleDown(bmp, maxSize)
            if (rotation != 0f) {
                val m = Matrix().apply { postRotate(rotation) }
                bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
            }
            val out = File(imagesDir, "img_${UUID.randomUUID()}.jpg")
            out.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 86, it) }
            Uri.fromFile(out).toString()
        } catch (e: Exception) {
            null
        }
    }

    private fun scaleDown(bmp: Bitmap, maxSize: Int): Bitmap {
        val longest = max(bmp.width, bmp.height)
        if (longest <= maxSize) return bmp
        val f = maxSize.toFloat() / longest
        return Bitmap.createScaledBitmap(bmp, (bmp.width * f).toInt(), (bmp.height * f).toInt(), true)
    }

    fun isLocal(model: String?): Boolean = model != null && model.startsWith("file:")

    fun cachedCloudFile(id: String): File = File(cloudCache, "$id.jpg")

    /** Yerel fotoğrafı buluta yükler ve "fsimg:<id>" döner. */
    suspend fun uploadIfLocal(model: String?, ownerId: String): String? = withContext(Dispatchers.IO) {
        if (model == null || !isLocal(model)) return@withContext model
        val cloud = cloudProvider() ?: return@withContext model
        val path = Uri.parse(model).path ?: return@withContext model
        val file = File(path)
        if (!file.exists()) return@withContext model
        var bmp = BitmapFactory.decodeFile(file.absolutePath) ?: return@withContext model
        bmp = scaleDown(bmp, 1000)
        var quality = 74
        var bytes: ByteArray
        do {
            val bos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos)
            bytes = bos.toByteArray()
            quality -= 10
        } while (bytes.size > 600_000 && quality > 30)
        val ref = cloud.uploadImage(bytes, ownerId)
        // Kendi cihazımızda tekrar indirmeye gerek kalmasın
        cachedCloudFile(ref.removePrefix("fsimg:")).writeBytes(bytes)
        ref
    }

    /** "fsimg:<id>" referansını yerel dosyaya çözer (önbellek veya buluttan indirme). */
    suspend fun resolveCloud(model: String): File? = withContext(Dispatchers.IO) {
        val id = model.removePrefix("fsimg:")
        val f = cachedCloudFile(id)
        if (f.exists() && f.length() > 0) return@withContext f
        val cloud = cloudProvider() ?: return@withContext null
        try {
            val bytes = cloud.downloadImage(id) ?: return@withContext null
            f.writeBytes(bytes)
            f
        } catch (e: Exception) {
            null
        }
    }

    /** Her tür görsel referansını Bitmap'e çevirir (PNG/A4 dışa aktarım için). */
    suspend fun loadBitmap(model: String?, width: Int, height: Int): Bitmap? {
        if (model.isNullOrBlank()) return null
        if (model.startsWith("illu:")) {
            return withContext(Dispatchers.Default) { FoodIllustrations.bitmap(model.removePrefix("illu:"), width, height) }
        }
        val data: Any = when {
            model.startsWith("fsimg:") -> resolveCloud(model) ?: return null
            else -> model
        }
        return try {
            val req = ImageRequest.Builder(context).data(data).allowHardware(false).size(width, height).build()
            val result = context.imageLoader.execute(req)
            ((result as? SuccessResult)?.drawable as? BitmapDrawable)?.bitmap
        } catch (e: Exception) {
            null
        }
    }
}
