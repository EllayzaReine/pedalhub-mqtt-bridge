const mqtt = require('mqtt');
const https = require('https');
const http = require('http');

const SUPABASE_HOST = 'lnbdudfuqemarczocjcm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MQTT_TOPIC = 'pedalhub/bike/12/location';

async function saveToSupabase(bikeId, lat, lon, spd) {
  const body = JSON.stringify({
    bike_id: bikeId,
    latitude: lat,
    longitude: lon,
    speed: spd
  });

  return new Promise((resolve) => {
    const options = {
      hostname: SUPABASE_HOST,
      port: 443,
      path: '/rest/v1/bike_locations',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      console.log('Location saved! Status:', res.statusCode);
      resolve(true);
    });

    req.on('error', (e) => {
      console.error('Save error:', e.message);
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

async function updateBike(bikeId, lat, lon) {
  const body = JSON.stringify({
    latitude: lat,
    longitude: lon,
    last_location_update: new Date().toISOString()
  });

  return new Promise((resolve) => {
    const options = {
      hostname: SUPABASE_HOST,
      port: 443,
      path: '/rest/v1/bikes?id=eq.' + bikeId,
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      console.log('Bike updated! Status:', res.statusCode);
      resolve(true);
    });

    req.on('error', (e) => {
      console.error('Update error:', e.message);
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

// MQTT subscriber
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker!');
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) console.log('Subscribed to: ' + MQTT_TOPIC);
    else console.error('Subscribe error:', err);
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('MQTT Received:', data);
    await saveToSupabase(data.bike_id, data.lat, data.lon, data.spd);
    await updateBike(data.bike_id, data.lat, data.lon);
  } catch (e) {
    console.error('MQTT parse error:', e.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('MQTT error:', err.message);
});

// HTTP server para sa SIM800L direct post
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/location') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('HTTP Received:', data);
        await saveToSupabase(data.bike_id, data.lat, data.lon, data.spd);
        await updateBike(data.bike_id, data.lat, data.lon);
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.error('HTTP error:', e.message);
        res.writeHead(500);
        res.end('error');
      }
    });
  } else {
    res.writeHead(200);
    res.end('PedalHub GPS Bridge Running!');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('HTTP + MQTT Bridge running on port ' + PORT);
});
