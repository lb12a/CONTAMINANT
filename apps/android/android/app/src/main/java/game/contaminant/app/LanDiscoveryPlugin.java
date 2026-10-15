package game.contaminant.app;

import android.content.Context;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hears Contaminant servers on the same Wi-Fi: a hosting desktop app broadcasts a small JSON beacon on
 * UDP 8788 every two seconds (see packages/server/src/lan.ts). The web client asks for the servers heard in
 * the last few seconds, so going online needs no address.
 */
@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPlugin extends Plugin {
    private static final int PORT = 8788;
    private final Map<String, JSObject> heard = new ConcurrentHashMap<>();
    private Thread thread;
    private DatagramSocket socket;
    private WifiManager.MulticastLock lock;

    @Override
    public void load() {
        start();
    }

    private synchronized void start() {
        if (thread != null) return;
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                // many phones drop broadcast packets unless an app holds this lock
                lock = wm.createMulticastLock("contaminant-lan");
                lock.setReferenceCounted(false);
                lock.acquire();
            }
        } catch (Exception ignored) {
            // discovery still works on phones that deliver broadcasts anyway
        }
        thread = new Thread(this::listen, "contaminant-lan");
        thread.setDaemon(true);
        thread.start();
    }

    private void listen() {
        try {
            socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
            socket.bind(new InetSocketAddress(PORT));
            byte[] buf = new byte[2048];
            while (!Thread.currentThread().isInterrupted()) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                socket.receive(p);
                String msg = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                try {
                    JSONObject b = new JSONObject(msg);
                    if (!"contaminant".equals(b.optString("game"))) continue;
                    String host = p.getAddress().getHostAddress();
                    String url = "http://" + host + ":" + b.optInt("port", 8787);
                    JSObject s = new JSObject();
                    s.put("url", url);
                    s.put("name", b.optString("name", host));
                    s.put("players", b.optInt("players", 0));
                    s.put("seen", System.currentTimeMillis());
                    heard.put(url, s);
                } catch (JSONException ignored) {
                    // not one of ours
                }
            }
        } catch (Exception ignored) {
            // socket closed or port unavailable: discovery simply finds nothing
        }
    }

    @PluginMethod
    public void servers(PluginCall call) {
        long now = System.currentTimeMillis();
        JSArray list = new JSArray();
        for (JSObject s : heard.values()) {
            if (now - s.optLong("seen", 0) < 7000) list.put(s);
        }
        JSObject ret = new JSObject();
        ret.put("servers", list);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (thread != null) thread.interrupt();
        if (socket != null) socket.close();
        if (lock != null && lock.isHeld()) lock.release();
    }
}
