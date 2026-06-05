<<<<<<< Updated upstream
// Mi IP: 172.20.10.3

/*
---- Comandos para activar el server: ----

npm init -y
npm install express
node server.js

*Nota*: seleccionar Command Prompt en la terminal par poder usar express

*/

const express = require('express');
const app = express();
app.use(express.json());

let lastData = {};

// El ESP32 hace POST aquí
app.post('/data', (req, res) => {
  lastData = { ...req.body, timestamp: new Date().toISOString() };
  console.log('📡 Dato recibido:', lastData);
  res.json({ ok: true });
});

// El navegador consulta esto cada segundo
app.get('/data', (req, res) => res.json(lastData));

// Sirve el dashboard
app.use(express.static('public'));
=======
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const frontendPath = path.join(__dirname, '../frontend');

const mongoose = require('mongoose');
const Device        = require('./models/Device');
const SensorReading = require('./models/SensorReading');
const WateringEvent = require('./models/WateringEvent');
const PlantType     = require('./models/PlantType');

const express   = require('express');
const mqtt      = require('mqtt');
const WebSocket = require('ws');
const http      = require('http');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server }); // WebSocket sobre el mismo puerto

app.use(express.json());
app.use(express.static(frontendPath));
>>>>>>> Stashed changes

app.listen(3000, '0.0.0.0', () => {
  console.log('✅ Servidor corriendo en http://localhost:3000');
});