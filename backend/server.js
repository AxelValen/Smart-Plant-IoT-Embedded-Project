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

const express   = require('express');
const mqtt      = require('mqtt');
const WebSocket = require('ws');
const http      = require('http');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server }); // WebSocket sobre el mismo puerto

app.use(express.static('public'));

const brokerUrl = 'mqtts://rf11c1dd.ala.eu-central-1.emqxsl.com:**MQTT_PORT**';

// 2. Pasamos las credenciales de EMQX
const mqttOptions = {
  username: 'axelvalen_mqtt_broker',
  password: 'embedded_project'
};

// --- Conexión al broker MQTT ---
const mqttClient = mqtt.connect(brokerUrl, mqttOptions);

wss.on('connection', (ws) => {
  console.log('🖥️  Navegador conectado');

  // Recibe comandos del navegador y los publica en MQTT
  ws.on('message', (message) => {
    const cmd = message.toString();
    console.log('🕹️  Comando recibido del navegador:', cmd);
    mqttClient.publish('control/led', cmd);
  });

  ws.on('close', () => console.log('🖥️  Navegador desconectado'));
});

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