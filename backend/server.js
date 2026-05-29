// Mi IP: 172.20.10.3

/*
---- Comandos para activar el server: ----

npm init -y          -> para inicializar NodeJS (una sola vez, al inicio)
npm install express  -> para instalar el framework express (una sola vez, al inicio)
node server.js       -> para correr el servidor (cada vez)

*Nota*: seleccionar Command Prompt en la terminal par poder usar npm

-- Para iniciar el broker MQTT (CMD en admin): --

cd "C:\Program Files\mosquitto"
mosquitto -c mosquitto.conf -v

*/

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const SensorReading = require('./models/SensorReading');
const WateringEvent = require('./models/WateringEvent');

const express   = require('express');
const mqtt      = require('mqtt');
const WebSocket = require('ws');
const http      = require('http');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server }); // WebSocket sobre el mismo puerto

app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error MongoDB:', err));

// --- Conexión al broker MQTT ---
const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: "Backend_Server"
});

const devices = new Map();

mqttClient.on('connect', () => {
  console.log('✅ Servidor conectado a EMQX Broker');
  mqttClient.subscribe('sensor/data/#');      // '#' = todos los subtopics
  mqttClient.subscribe('device/register');
  mqttClient.subscribe('control/led/#');
});

wss.on('connection', (ws) => {
  console.log('🖥️  Navegador conectado');

  ws.on('message', async (message) => {
    try {
      // Parseamos el JSON que ahora envía index.html
      const data = JSON.parse(message.toString());
      const deviceID = data.device_id;
      const command = data.command;
      
      if (deviceID && command) {
        // Ruteamos el comando exclusivamente a ese ESP32
        const topic = `control/led/${deviceID}`;
        console.log(`🕹️  Enviando comando '${command}' a '${topic}'`);
        
        mqttClient.publish(topic, command);

        if (command === 'LED_ON') {
          await WateringEvent.create({
            device_id:    deviceID,
            plant_type:   devices.get(deviceID)?.plant_type,
            triggered_by: 'manual'
          });
        }
      }
    } catch (error) {
      console.error('❌ Error procesando el comando del navegador: ', error.message);
    }
  });

  ws.on('close', () => console.log('🖥️  Navegador desconectado'));
});

// Cuando llega un mensaje MQTT, lo reenvía a todos los navegadores conectados
mqttClient.on('message', async (topic, message) => {
  let payload;
  try {
    payload = JSON.parse(message.toString());
  } catch {
    console.warn('⚠️  Mensaje MQTT no es JSON válido:', message.toString());
    return;
  }

  console.log(`📨 MQTT [${topic}]:`, payload);

  if (topic === 'device/register') {
    // Registra o actualiza el dispositivo
    devices.set(payload.device_id, {
      plant_type: payload.plant_type,
      status: payload.status,
      lastSeen: new Date()
    });
    
    console.log('📋 Dispositivo registrado:', payload.device_id);
    broadcastToClients({ type: 'device_update', devices: Object.fromEntries(devices) });

  } else if (topic.startsWith('sensor/data/')) {
    const deviceID = topic.split('/')[2];   // extrae el ID del topic

    await SensorReading.create({
      device_id:  deviceID,
      plant_type: devices.get(deviceID)?.plant_type,
      valor:      payload.valor,
      mensaje:    payload.mensaje
    });

    broadcastToClients({ type: 'sensor_data', device_id: deviceID, ...payload });
  }
});

function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify(data));
  });
}

mqttClient.on('error', (err) => console.error('❌ Error MQTT:', err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor en http://localhost:${PORT}`);
});