package uz.komilov.privatechat;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onPause() {
        super.onPause();
        // The Supabase session lives in cookies. WebView persists them lazily, so a login
        // followed by the app being killed could otherwise be lost. Flush on every background.
        CookieManager.getInstance().flush();
    }
}
