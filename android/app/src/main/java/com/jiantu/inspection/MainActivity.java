package com.jiantu.inspection;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InspectionNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
