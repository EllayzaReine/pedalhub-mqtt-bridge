const mqtt = require('mqtt');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MQTT_TOPIC = 'pedalhub/bike/1/location';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// MQTT subscriber
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker!');
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) console.log('Subscribed to: ' + MQTT_TOPIC);
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('MQTT Received:', data);
    await saveToSupabase(data.bike_id, data.lat, data.lon, data.spd);
  } catch (e) {
    console.error('MQTT parse error:', e.message);
  }
});

// HTTP server para sa SIM800L
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/location') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('HTTP Received:', data);
        await saveToSupabase(data.bike_id, data.lat, data.lon, data.spd);
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.error('HTTP parse error:', e.message);
        res.writeHead(500);
        res.end('error');
      }
    });
  } else {
    res.writeHead(200);
    res.end('PedalHub GPS Bridge Running!');
  }
});

async function saveToSupabase(bikeId, lat, lon, spd) {
  const { error: locError } = await supabase
    .from('bike_locations')
    .insert({
      bike_id: bikeId,
      latitude: lat,
      longitude: lon,
      speed: spd
    });

  if (locError) {
    console.error('Error saving location:', locError.message);
  } else {
    console.log('Location saved!');
  }

  const { error: bikeError } = await supabase
    .from('bikes')
    .update({
      latitude: lat,
      longitude: lon,
      last_location_update: new Date().toISOString()
    })
    .eq('id', bikeId);

  if (bikeError) {
    console.error('Error updating bike:', bikeError.message);
  } else {
    console.log('Bike updated!');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('HTTP + MQTT Bridge running on port ' + PORT);
});
