package it.gabriiiele.lucestanza;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LucePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
