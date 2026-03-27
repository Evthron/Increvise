package com.increvise.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Add custom plugins to the initialPlugins list BEFORE super.onCreate()
        initialPlugins.add(FileWriterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
