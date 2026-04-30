const mqtt = require('mqtt');
const https = require('https');
const http = require('http');

const SUPABASE_HOST = 'lnbdudfuqemarczocjcm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MQTT_TOPIC = 'pedalhub/bike/12/location';

// ── startup check ──────────────────────────────
if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_KEY env var is missing!');
  process.exit(1);
}
console.log('✅ SUPABASE_KEY loaded, length=' + SUPABASE_KEY.length);

// ─────────────────────────────────────────────
function httpsPost(path, method, body) {
  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: SUPABASE_HOST,
      port: 443,
      path,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`[${method} ${path}] status=${res.statusCode} body=${data || '(empty)'}`);
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
    });
    req.on('error', (e) => {
      console.error(`[${method} ${path}] ERROR:`, e.message);
      resolve(false);
    });
    req.write(bodyStr);
    req.end();
  });
}

// ─────────────────────────────────────────────
async function saveToSupabase(bikeId, lat, lon, spd, sentAt, hasFix, fixSearchSec) {
  const now = Date.now();
  const delaySec = sentAt ? ((now - sentAt) / 1000).toFixed(2) : null;
  return httpsPost('/rest/v1/bike_locations', 'POST', {
    bike_id: bikeId,
    latitude: lat,
    longitude: lon,
    speed: spd,
    sent_at: sentAt ? new Date(sentAt).toISOString() : null,
    delay_seconds: delaySec ? parseFloat(delaySec) : null,
    has_fix: hasFix,
    fix_search_sec: fixSearchSec
  });
}

async function updateBike(bikeId, lat, lon) {
  return httpsPost('/rest/v1/bikes?id=eq.' + bikeId, 'PATCH', {
    latitude: lat,
    longitude: lon,
    last_location_update: new Date().toISOString()
  });
}

// ─────────────────────────────────────────────
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883', {
  clientId: 'railway-bridge-' + Math.random().toString(16).slice(2, 8),
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 5000
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to Mosquitto broker');
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) console.log('📡 Subscribed to: ' + MQTT_TOPIC);
    else console.error('❌ Subscribe error:', err);
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const raw = message.toString();
    console.log('\n📥 RAW message:', raw);
    const data = JSON.parse(raw);
    console.log('✅ Parsed — bike_id:', data.bike_id, 'lat:', data.lat, 'lon:', data.lon);

    if (!data.has_fix || data.lat === 0 || data.lon === 0) {
    console.log('⚠️ No GPS fix — skipping save');
    return;
    }
    await saveToSupabase(data.bike_id, data.lat, data.lon, data.spd);
    
    await updateBike(data.bike_id, data.lat, data.lon);
  } catch (e) {
    console.error('❌ Parse error:', e.message);
  }
});

mqttClient.on('error', (err) => console.error('❌ MQTT error:', err.message));
mqttClient.on('offline', () => console.warn('⚠️ MQTT offline'));
mqttClient.on('reconnect', () => console.log('🔄 MQTT reconnecting...'));

// ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('PedalHub GPS Bridge Running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 HTTP + MQTT Bridge running on port ' + PORT);
});
