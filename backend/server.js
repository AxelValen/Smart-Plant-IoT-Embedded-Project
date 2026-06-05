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
const wateringStart = new Map();

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
      const cmd = data.command;
      
      console.log(`🕹️  Comando [${cmd}] para dispositivo [${deviceID}]`);
      
      // Publica en MQTT para que el ESP32 lo reciba
      mqttClient.publish(`control/led/${deviceID}`, cmd);
  
      if (cmd === 'LED_ON') {
        // Registra el inicio del riego
        wateringStart.set(deviceID, Date.now());
        const device = devices.get(deviceID);
        const last   = device?.lastReading;
  
        try {
          await WateringEvent.create({
            device_id:    deviceID,
            plant_type:   device?.plant_type,
            triggered_by: 'manual',
            sensor_snapshot: last ? {
              humidity:    last.humidity,
              temperature: last.temperature,
              light:       last.light
            } : undefined
          });
          console.log('💾 Evento de riego manual guardado en DB');
        } catch (err) {
          console.error('❌ Error al guardar WateringEvent:', err.message);
        }
  
        broadcastToClients({ type: 'watering_started', device_id: deviceID, reason: 'manual' });
  
      } else if (cmd === 'LED_OFF') {
        // Calcula la duración y actualiza el último evento de riego
        const startTime = wateringStart.get(deviceID);
        if (startTime) {
          const duration = Math.round((Date.now() - startTime) / 1000);
          wateringStart.delete(deviceID);
  
          try {
            // Actualiza el evento más reciente con la duración
            await WateringEvent.findOneAndUpdate(
              { device_id: deviceID },
              { duration_sec: duration },
              { sort: { timestamp: -1 } }
            );
            console.log(`⏱️  Duración de riego: ${duration}s guardada`);
          } catch (err) {
            console.error('❌ Error al guardar duración de riego:', err.message);
          }
        }
  
        broadcastToClients({ type: 'watering_stopped', device_id: deviceID, reason: 'manual' });
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
    await handleDeviceRegister(payload);
    return;
  }

  // ── 3b. Datos de sensor ──────────────────────────────────────
  if (topic.startsWith('sensor/data/')) {
    const deviceID = topic.split('/')[2];
    await handleSensorData(deviceID, payload);
    return;
  }
});

async function handleDeviceRegister(payload) {
  const { device_id, plant_type, status } = payload;

  try {
    // Actualiza o crea el documento en MongoDB (upsert)
    await Device.findOneAndUpdate(
      { device_id },
      { plant_type, status, last_seen: new Date() },
      { upsert: true, new: true }
    );

    // Carga las condiciones ideales de esa planta desde MongoDB
    const plantType = await PlantType.findOne({ name: plant_type });

    // Guarda en el mapa en memoria para acceso rápido
    devices.set(device_id, {
      plant_type,
      ideal:   plantType?.ideal ?? null,
      status,
      lastReading: null
    });

    console.log(`📋 Dispositivo registrado: ${device_id} → ${plant_type}`);

    // Notifica al dashboard
    broadcastToClients({
      type:    'device_update',
      devices: getDevicesSnapshot()
    });

  } catch (err) {
    console.error('❌ Error al registrar dispositivo:', err.message);
  }
}

// ── Procesar una lectura de sensor ──────────────────────────────
async function handleSensorData(deviceID, payload) {
  try {
    const device = devices.get(deviceID);

    // Evalúa la salud de la planta comparando con condiciones ideales
    const healthResult = evaluateHealth(device?.ideal, payload);

    // ── Guarda la lectura en MongoDB ─────────────────────────────
    await SensorReading.create({
      device_id:     deviceID,
      plant_type:    device?.plant_type,
      valor:         payload.valor,
      humidity:      payload.humidity,
      temperature:   payload.temperature,
      light:         payload.light,
      mensaje:       payload.mensaje,
      health_status: healthResult.status,
      issues:        healthResult.issues
    });

    // ── Actualiza el estado en memoria ───────────────────────────
    if (device) {
      device.lastReading = payload;
      device.health      = healthResult;
    }

    // ── Riego automático si la humedad está baja ─────────────────
    const isWatering = wateringStart.has(deviceID);

    // ── Lógica de control con memoria de estado ──────────────────
    if (healthResult.needsWatering && device) {
      // Solo enciende si NO estaba regando previamente
      if (!isWatering) {
        triggerAutoWatering(deviceID, device, payload, healthResult);
      }
    } else {
      // Solo apaga si el riego SÍ estaba activo
      if (isWatering) {
        stopWatering(deviceID, device, payload, healthResult);
      }
    }

    // ── Envía al dashboard via WebSocket ─────────────────────────
    broadcastToClients({
      type:       'sensor_data',
      device_id:  deviceID,
      plant_type: device?.plant_type,
      ...payload,
      health:     healthResult,
      timestamp:  new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ Error al procesar sensor data:', err.message);
  }
}

// ── Evaluar salud de la planta ───────────────────────────────────
function evaluateHealth(ideal, reading) {
  // Sin condiciones ideales cargadas, no se puede evaluar
  if (!ideal) {
    return { status: 'desconocido', issues: [], needsWatering: false };
  }

  const issues = [];

  if (reading.humidity !== undefined) {
    if (reading.humidity < ideal.humidity.min)
      issues.push(`humedad baja (${reading.humidity}% < ${ideal.humidity.min}%)`);
    if (reading.humidity > ideal.humidity.max)
      issues.push(`humedad alta (${reading.humidity}% > ${ideal.humidity.max}%)`);
  }

  if (reading.temperature !== undefined) {
    if (reading.temperature < ideal.temperature.min)
      issues.push(`temperatura baja (${reading.temperature}°C < ${ideal.temperature.min}°C)`);
    if (reading.temperature > ideal.temperature.max)
      issues.push(`temperatura alta (${reading.temperature}°C > ${ideal.temperature.max}°C)`);
  }

  if (reading.light !== undefined) {
    if (reading.light < ideal.light.min)
      issues.push(`luz insuficiente (${reading.light} lux < ${ideal.light.min} lux)`);
    if (reading.light > ideal.light.max)
      issues.push(`luz excesiva (${reading.light} lux > ${ideal.light.max} lux)`);
  }

  const needsWatering = reading.humidity !== undefined &&
                        reading.humidity < ideal.humidity.min;

  return {
    status:       issues.length === 0 ? 'saludable' : 'en_riesgo',
    issues,
    needsWatering
  };
}

// ── Disparar riego automático ────────────────────────────────────
async function triggerAutoWatering(deviceID, device, reading, healthResult) {
  console.log(`💧 Riego automático activado para ${deviceID}`);

  mqttClient.publish(`control/led/${deviceID}`, 'LED_ON');
  wateringStart.set(deviceID, Date.now());

  try {
    await WateringEvent.create({
      device_id:      deviceID,
      plant_type:     device.plant_type,
      triggered_by:   'automatic',
      trigger_reason: healthResult.issues[0] ?? 'humedad baja',
      sensor_snapshot: {
        humidity:    reading.humidity,
        temperature: reading.temperature,
        light:       reading.light
      }
    });
  } catch (err) {
    console.error('❌ Error al guardar WateringEvent automático:', err.message);
  }

  broadcastToClients({
    type:      'watering_started',
    device_id: deviceID,
    reason:    'automatic'
  });
}

async function stopWatering(deviceID, device, reading, healthResult) {
  console.log(`❌ Riego automático desactivado para ${deviceID}`);

  mqttClient.publish(`control/led/${deviceID}`, 'LED_OFF');

  const startTime = wateringStart.get(deviceID);

  if (startTime) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    wateringStart.delete(deviceID);

    try {
      // Actualiza el evento más reciente con la duración
      await WateringEvent.findOneAndUpdate(
        { device_id: deviceID },
        { duration_sec: duration },
        { sort: { timestamp: -1 } }
      );
      console.log(`⏱️  Duración de riego: ${duration}s guardada`);
    } catch (err) {
      console.error('❌ Error al guardar duración de riego:', err.message);
    }
  }

  broadcastToClients({
    type:      'watering_stopped',
    device_id: deviceID,
    reason:    'automatic'
  });
}

function getDevicesSnapshot() {
  const snapshot = {};
  devices.forEach((info, id) => { snapshot[id] = info; });
  return snapshot;
}

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