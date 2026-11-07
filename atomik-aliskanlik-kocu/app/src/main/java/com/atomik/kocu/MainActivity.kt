package com.atomik.kocu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.atomik.kocu.data.Store
import com.atomik.kocu.ui.AppRoot
import com.atomik.kocu.ui.theme.AtomikTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(this)
        enableEdgeToEdge()
        setContent { AtomikTheme { AppRoot() } }
    }

    override fun onStop() {
        super.onStop()
        Store.saveNow()
    }
}
