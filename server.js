const mqtt = require('mqtt');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MQTT_TOPIC = 'pedalhub/bike/1/location';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const client = mqtt.connect('mqtt://broker.hivemq.com:1883');

client.on('connect', () => {
  console.log('Connected to MQTT broker!');
  client.subscribe(MQTT_TOPIC, (err) => {
    if (!err) console.log('Subscribed to: ' + MQTT_TOPIC);
  });
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('Received:', data);

    const lat = data.lat;
    const lon = data.lon;
    const spd = data.spd;
    const bikeId = 1;

    // Save to bike_locations table
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

    // Update bikes table
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

  } catch (e) {
    console.error('Parse error:', e.message);
  }
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
});

console.log('MQTT Bridge starting...');
