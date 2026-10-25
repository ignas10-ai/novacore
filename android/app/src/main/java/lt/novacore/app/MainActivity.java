package lt.novacore.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The Screen Wake Lock API (src/ui/wakelock.ts) does not exist in Android WebView, and a 3-minute game
        // without touching the phone would hit the screen timeout. ponytail: screen stays on on every screen while
        // the app is in front; toggle it from JS through a small plugin if that ever matters.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
