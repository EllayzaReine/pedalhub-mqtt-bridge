const mqtt = require('mqtt');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MQTT_TOPIC = 'pedalhub/bike/+/location'; // wildcard para sa multiple bikes
const PORT = process.env.PORT || 3000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ HTTP server para hindi mapatay ng Railway
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'MQTT bridge running', uptime: process.uptime() }));
});
server.listen(PORT, () => console.log(`HTTP alive on port ${PORT}`));

// MQTT setup
const client = mqtt.connect('mqtt://broker.hivemq.com:1883', {
  clientId: 'pedalhub-bridge-' + Math.random().toString(16).slice(2, 8),
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 5000,  // auto-reconnect every 5s
});

client.on('connect', () => {
  console.log('✅ Connected to HiveMQ');
  client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
    if (!err) console.log('📡 Subscribed to: ' + MQTT_TOPIC);
    else console.error('Subscribe error:', err);
  });
});

client.on('message', async (topic, message) => {
  try {
    const raw = message.toString().trim();
    console.log('📥 Raw message:', raw);
    const data = JSON.parse(raw);

    const lat = parseFloat(data.lat);
    const lon = parseFloat(data.lon);
    const spd = parseFloat(data.spd);
    const bikeId = parseInt(data.bike_id) || 1;

    if (isNaN(lat) || isNaN(lon)) {
      console.error('❌ Invalid coordinates');
      return;
    }

    const [locResult, bikeResult] = await Promise.all([
      supabase.from('bike_locations').insert({ bike_id: bikeId, latitude: lat, longitude: lon, speed: spd }),
      supabase.from('bikes').update({ latitude: lat, longitude: lon, last_location_update: new Date().toISOString() }).eq('id', bikeId)
    ]);

    if (locResult.error) console.error('❌ Location insert:', locResult.error.message);
    else console.log('✅ Location saved');

    if (bikeResult.error) console.error('❌ Bike update:', bikeResult.error.message);
    else console.log('✅ Bike updated');

  } catch (e) {
    console.error('❌ Parse error:', e.message, '| Raw:', message.toString());
  }
});

client.on('error', (err) => console.error('MQTT error:', err.message));
client.on('offline', () => console.warn('⚠️ MQTT offline, reconnecting...'));
client.on('reconnect', () => console.log('🔄 Reconnecting to MQTT...'));

console.log('🚀 MQTT Bridge starting...');
