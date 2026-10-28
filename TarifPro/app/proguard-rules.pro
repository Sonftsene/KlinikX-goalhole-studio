# Tarif Pro – R8 kuralları
-dontobfuscate
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable

# Uygulama kodu (Room entity'leri, Firestore haritaları, servisler)
-keep class com.tarifpro.app.** { *; }

# Credential Manager, Play Services sağlayıcısını yansıma ile yükler
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }

# OkHttp isteğe bağlı bağımlılıkları
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
