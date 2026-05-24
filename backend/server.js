// Mi IP: 172.20.10.3

/*
---- Comandos para activar el server: ----

npm init -y -> para inicializar NodeJS (una sola vez, al inicio)
npm install express -> para instalar el framework express (una sola vez, al inicio)
node server.js -> para correr el servidor (cada vez)

*Nota*: seleccionar Command Prompt en la terminal par poder usar npm

*/

const express   = require('express');
const mqtt      = require('mqtt');
const WebSocket = require('ws');
const http      = require('http');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server }); // WebSocket sobre el mismo puerto

app.use(express.static('public'));

// --- Conexión al broker MQTT ---
const mqttClient = mqtt.connect('mqtt://localhost:1883');

mqttClient.on('connect', () => {
  console.log('✅ Conectado al broker Mosquitto');
  mqttClient.subscribe('sensor/data', (err) => {
    if (!err) console.log('📡 Suscrito a sensor/data');
  });
});

// Cuando llega un mensaje MQTT, lo reenvía a todos los navegadores conectados
mqttClient.on('message', (topic, message) => {
  const payload = message.toString();
  console.log(`📨 MQTT [${topic}]:`, payload);

  // Broadcast a todos los clientes WebSocket conectados
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
});

mqttClient.on('error', (err) => console.error('❌ Error MQTT:', err));

server.listen(3000, '0.0.0.0', () => {
  console.log('🌐 Servidor en http://localhost:3000');
});