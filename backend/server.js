const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const frontendPath = path.join(__dirname, '../frontend');

const mongoose = require('mongoose');
const GardenPlant   = require('./models/GardenPlant');
const Device        = require('./models/Device');
const SensorReading = require('./models/SensorReading');
const WateringEvent = require('./models/WateringEvent');
const PlantType     = require('./models/PlantType');
const User          = require('./models/User');

const express    = require('express');
const mqtt       = require('mqtt');
const WebSocket  = require('ws');
const http       = require('http');
const jwt        = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server }); // WebSocket sobre el mismo puerto

app.use(express.json());
app.get('/', (req, res) => {
  res.redirect('/login.html');
});
app.use(express.static(frontendPath));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error MongoDB:', err));

// ================================================================
//  RUTAS DE AUTENTICACIÓN
// ================================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }

    const user = await User.create({ email, password });

    const token = jwt.sign(
      { user_id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: user._id, email: user.email } });

  } catch (err) {
    console.error('❌ Error en registro:', err.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { user_id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, email: user.email } });

  } catch (err) {
    console.error('❌ Error en login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Ruta protegida de ejemplo — datos del usuario autenticado
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user_id).select('-password');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user });
  } catch (err) {
    console.error('❌ Error al obtener usuario:', err.message);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// ================================================================
//  CRUD DEL JARDÍN
// ================================================================

app.get('/api/garden', authMiddleware, async (req, res) => {
  try {
    const garden = await GardenPlant.find({ user_id: req.user_id })
      .populate('plant_type_id')
      .sort({ createdAt: 1 });

    res.json({ garden: garden.map(serializarGardenPlant) });
  } catch (err) {
    console.error('❌ Error al obtener jardín:', err.message);
    res.status(500).json({ error: 'Error al obtener el jardín' });
  }
});

app.post('/api/garden', authMiddleware, async (req, res) => {
  try {
    const {
      plant_type_id,
      plant_type_name,
      plant_type_key,
      plant_type,
      display_name,
      model_src
    } = req.body;

    let plantType = await resolverPlantType(
      plant_type_id || plant_type_key || plant_type_name || display_name
    );

    if (!plantType) {
      const catalogKey = normalizeCatalogKey(plant_type_key || plant_type_name || display_name || 'planta');
      const catalogName = String(plant_type_name || display_name || plant_type || plant_type_key || 'Planta').trim();

      plantType = await PlantType.findOneAndUpdate(
        { name: catalogKey },
        {
          $setOnInsert: {
            name: catalogKey,
            display_name: catalogName,
            description: `Autogenerado desde el catálogo web: ${catalogName}`,
            ideal: inferIdealForCatalog(catalogName)
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const gardenPlant = await GardenPlant.create({
      user_id: req.user_id,
      plant_type_id: plantType._id,
      model_src: model_src || null,
      device_id: null
    });

    const populated = await GardenPlant.findById(gardenPlant._id).populate('plant_type_id');
    res.status(201).json({ garden_plant: serializarGardenPlant(populated) });
  } catch (err) {
    console.error('❌ Error al crear planta del jardín:', err.message);
    res.status(500).json({ error: 'Error al crear la planta del jardín' });
  }
});

app.delete('/api/garden/:gardenPlantId', authMiddleware, async (req, res) => {
  try {
    const gardenPlant = await GardenPlant.findOneAndDelete({
      _id: req.params.gardenPlantId,
      user_id: req.user_id
    }).populate('plant_type_id');

    if (!gardenPlant) {
      return res.status(404).json({ error: 'La planta no existe' });
    }

    if (gardenPlant.device_id) {
      await Device.findOneAndUpdate(
        { device_id: gardenPlant.device_id },
        { $set: { user_id: null, plant_type: null, status: 'pending', last_seen: new Date() } }
      );

      devices.set(gardenPlant.device_id, {
        user_id: null,
        plant_type: null,
        ideal: null,
        status: 'pending',
        lastReading: null,
        last_seen: Date.now(),
        garden_plant_id: null
      });

      broadcastToClients({ type: 'device_update', devices: getDevicesSnapshot() });
    }

    res.json({ garden_plant: serializarGardenPlant(gardenPlant) });
  } catch (err) {
    console.error('❌ Error al eliminar planta del jardín:', err.message);
    res.status(500).json({ error: 'Error al eliminar la planta' });
  }
});

app.get('/api/monitor/:instance_id', authMiddleware, async (req, res) => {
  try {
    const windowInfo = obtenerVentanaDeHistorial(req.query.window);
    const gardenPlant = await GardenPlant.findOne({
      _id: req.params.instance_id,
      user_id: req.user_id
    }).populate('plant_type_id');

    if (!gardenPlant) {
      return res.status(404).json({ error: 'La planta no existe' });
    }

    const plantType = gardenPlant.plant_type_id;
    const deviceID = gardenPlant.device_id;
    const liveDevice = deviceID ? devices.get(deviceID) : null;

    if (!deviceID) {
      return res.json({
        garden_plant: serializarGardenPlant(gardenPlant),
        device_id: null,
        device_status: 'unassigned',
        window: windowInfo.window,
        telemetry: crearTelemetriaVacia(),
        health: { status: 'desconocido', issues: [], needsWatering: false },
        recommendations: plantType?.ideal || null,
        watering_events: [] 
      });
    }

    const readings = await SensorReading.find({
      user_id: req.user_id,
      device_id: deviceID,
      timestamp: { $gte: windowInfo.from }
    }).sort({ timestamp: 1 }).lean();

    // Buscar eventos de riego en la ventana de tiempo seleccionada
    const wateringEvents = await WateringEvent.find({
      device_id: deviceID,
      timestamp: { $gte: windowInfo.from }
    }).sort({ timestamp: -1 }).lean(); 

    // Validación segura para evitar que crashee si readings está vacío
    const latestReading = readings && readings.length > 0 ? readings[readings.length - 1] : {};
    const telemetry = readings && readings.length > 0
      ? construirTelemetria(readings)
      : crearTelemetriaVacia();
      
    const health = evaluateHealth(plantType?.ideal || null, latestReading);

    res.json({
      garden_plant: serializarGardenPlant(gardenPlant),
      device_id: deviceID,
      device_status: liveDevice?.status || 'offline',
      window: windowInfo.window,
      telemetry,
      health,
      recommendations: plantType?.ideal || null,
      watering_events: wateringEvents || []
    });
  } catch (err) {
    console.error('❌ Error al obtener monitor:', err.message);
    res.status(500).json({ error: 'Error al obtener el monitor' });
  }
});

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
  mqttClient.subscribe('device/status/#');
});

wss.on('connection', (ws) => {
  console.log('🖥️  Navegador conectado');

  PlantType.find({}).then(plants => {
    ws.send(JSON.stringify({ type: 'init_data', plants: plants }));
    ws.send(JSON.stringify({ type: 'device_update', devices: getDevicesSnapshot() }));
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const cmd = data.command;
      const deviceID = data.device_id;
      const userID = obtenerUserIdDesdeToken(data.token);
      
      // --- NUEVA LÓGICA DE ASIGNACIÓN ---
      if (cmd === 'ASSIGN_PLANT') {
        const selectedGardenPlantId = data.garden_plant_id;

        if (!deviceID) {
          ws.send(JSON.stringify({ type: 'error', message: 'No se recibió el ID del dispositivo' }));
          return;
        }

        if (!userID) {
          ws.send(JSON.stringify({ type: 'error', message: 'Token inválido o expirado' }));
          return;
        }

        const selectedPlant = await GardenPlant.findOne({
          _id: selectedGardenPlantId,
          user_id: userID
        }).populate('plant_type_id');

        if (!selectedPlant) {
          ws.send(JSON.stringify({ type: 'error', message: 'La planta seleccionada no existe' }));
          return;
        }

        const plantInfo = selectedPlant.plant_type_id;

        await GardenPlant.updateMany(
          { user_id: userID, device_id: deviceID, _id: { $ne: selectedPlant._id } },
          { $set: { device_id: null } }
        );

        await GardenPlant.findByIdAndUpdate(selectedPlant._id, {
          device_id: deviceID
        });

        await Device.findOneAndUpdate(
          { device_id: deviceID },
          {
            user_id: userID,
            plant_type: plantInfo?.name || null,
            status: 'online',
            last_seen: new Date()
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        devices.set(deviceID, {
          user_id: userID,
          plant_type: plantInfo?.name || null,
          ideal: plantInfo ? plantInfo.ideal : null,
          status: 'online',
          lastReading: null,
          garden_plant_id: selectedPlant._id.toString(),
          last_seen: Date.now()
        });

        console.log(`✅ Dispositivo ${deviceID} asignado a: ${plantInfo?.display_name || plantInfo?.name || 'planta'}`);
        
        // Notifica a todos los clientes que la lista de dispositivos cambió
        broadcastToClients({ type: 'device_update', devices: getDevicesSnapshot() });
        return; // Termina la ejecución para no caer en la lógica de los LEDs
      }
  
      if (cmd === 'LED_ON') {
        mqttClient.publish(`control/led/${deviceID}`, 'LED_ON');
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
        mqttClient.publish(`control/led/${deviceID}`, 'LED_OFF');
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
  const messageStr = message.toString();

  // 1. PROCESAR TEXTO PLANO PRIMERO (LWT y Estado)
  if (topic.startsWith('device/status/')) {
    const deviceID = topic.split('/')[2];
    const statusPayload = messageStr; // "online" u "offline"
    
    // Obtenemos el dispositivo del caché si existe
    const device = devices.get(deviceID) || {}; 
    
    // Actualizamos el caché en memoria
    device.status = statusPayload;
    if (!devices.has(deviceID)) {
        devices.set(deviceID, device);
    }
    
    if (statusPayload === 'offline') {
      console.log(`🔌 Módulo ${deviceID} desconectado (LWT / Timeout Broker)`);
      
      if (wateringStart.has(deviceID)) {
          mqttClient.publish(`control/led/${deviceID}`, 'LED_OFF');
          wateringStart.delete(deviceID);
          broadcastToClients({ type: 'watering_stopped', device_id: deviceID, reason: 'timeout' });
          console.log(`❌ Riego de emergencia detenido para ${deviceID} por desconexión`);
      }
    } else {
      console.log(`✅ Módulo ${deviceID} conectado (Online)`);
    }
    
    broadcastToClients({ type: 'device_update', devices: getDevicesSnapshot() });
    
    Device.findOneAndUpdate({ device_id: deviceID }, { status: statusPayload })
      .then(() => console.log(`💾 Estado de ${deviceID} actualizado a ${statusPayload} en DB`))
      .catch(err => console.error('Error actualizando DB:', err.message));
      
    return; // Salir de la función aquí, NO intentar parsear como JSON
  }


  // 2. PROCESAR JSON (Telemetría y Registro)
  let payload;
  try {
    payload = JSON.parse(messageStr);
  } catch {
    console.warn(`⚠️ Mensaje MQTT no es JSON válido en [${topic}]:`, messageStr);
    return;
  }

  console.log(`📨 MQTT [${topic}]:`, payload);

  if (topic === 'device/register') {
    await handleDeviceRegister(payload);
    return;
  }

  if (topic.startsWith('sensor/data/')) {
    const deviceID = topic.split('/')[2];
    await handleSensorData(deviceID, payload);
    return;
  }
});

async function handleDeviceRegister(payload) {
  const { device_id, plant_type, status } = payload;

  try {
    const assignedGardenPlant = await GardenPlant.findOne({ device_id }).populate('plant_type_id');
    const assignedPlantType = assignedGardenPlant?.plant_type_id || null;
    const resolvedStatus = assignedGardenPlant ? 'online' : (status || 'pending');

    // Actualiza o crea el documento en MongoDB (upsert)
    await Device.findOneAndUpdate(
      { device_id },
      {
        user_id: assignedGardenPlant?.user_id || null,
        plant_type: assignedPlantType?.name || plant_type || null,
        status: resolvedStatus,
        last_seen: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const plantType = assignedPlantType || await PlantType.findOne({ name: plant_type });

    // Guarda en el mapa en memoria para acceso rápido
    devices.set(device_id, {
      user_id: assignedGardenPlant?.user_id || null,
      plant_type: plantType?.name || plant_type || null,
      ideal:   plantType?.ideal ?? null,
      status: resolvedStatus,
      lastReading: null,
      last_seen: Date.now(),
      garden_plant_id: assignedGardenPlant?._id ? assignedGardenPlant._id.toString() : null
    });

    console.log(`📋 Dispositivo detectado: ${device_id} → ${plantType?.name || plant_type || 'pending'}`);

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

    if (device) {
      device.lastReading = payload;
      device.last_seen = Date.now();
    }

    if (!device?.user_id) {
      broadcastToClients({
        type:       'sensor_data',
        device_id:  deviceID,
        plant_type: device?.plant_type,
        ...payload,
        health:     { status: 'desconocido', issues: [], needsWatering: false },
        timestamp:  new Date().toISOString()
      });
      return;
    }

    // Evalúa la salud de la planta comparando con condiciones ideales
    const healthResult = evaluateHealth(device?.ideal, payload);

    // ── Guarda la lectura en MongoDB ─────────────────────────────
    await SensorReading.create({
      user_id:         device.user_id,
      device_id:       deviceID,
      plant_type:      device?.plant_type,
      humidity:        payload.humidity,
      temperature:     payload.temperature,
      nitrogeno:       payload.nitrogeno,
      fosforo:         payload.fosforo,
      potasio:         payload.potasio,
      health_status:   healthResult.status,
      issues:          healthResult.issues
    });

    // ── Actualiza el estado en memoria ───────────────────────────
    if (device) {
      device.lastReading = payload;
      device.health      = healthResult;
      device.last_seen   = Date.now();
      
      // Si estaba offline y volvió a enviar datos, lo regresamos a online
      if (device.status === 'offline') {
         device.status = 'online';
         broadcastToClients({ type: 'device_update', devices: getDevicesSnapshot() });
      }
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

  if (reading.nitrogeno !== undefined) {
    if (reading.nitrogeno < ideal.nitrogeno.min)
      issues.push(`nitrógeno insuficiente (${reading.nitrogeno} ppm < ${ideal.nitrogeno.min} ppm)`);
    if (reading.nitrogeno > ideal.nitrogeno.max)
      issues.push(`nitrógeno excesiva (${reading.nitrogeno} ppm > ${ideal.nitrogeno.max} ppm)`);
  }

  if (reading.fosforo !== undefined) {
    if (reading.fosforo < ideal.fosforo.min)
      issues.push(`fósforo insuficiente (${reading.fosforo} ppm < ${ideal.fosforo.min} ppm)`);
    if (reading.fosforo > ideal.fosforo.max)
      issues.push(`fósforo excesiva (${reading.fosforo} ppm > ${ideal.fosforo.max} ppm)`);
  }

  if (reading.potasio !== undefined) {
    if (reading.potasio < ideal.potasio.min)
      issues.push(`potasio insuficiente (${reading.potasio} ppm < ${ideal.potasio.min} ppm)`);
    if (reading.potasio > ideal.potasio.max)
      issues.push(`potasio excesiva (${reading.potasio} ppm > ${ideal.potasio.max} ppm)`);
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
  devices.forEach((info, id) => {
    snapshot[id] = { device_id: id, ...info };
  });
  return snapshot;
}

function serializarGardenPlant(gardenPlant) {
  if (!gardenPlant) return null;
  return typeof gardenPlant.toObject === 'function' ? gardenPlant.toObject() : gardenPlant;
}

function normalizeCatalogKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function resolverPlantType(reference) {
  if (!reference) return null;

  if (mongoose.Types.ObjectId.isValid(reference)) {
    const byId = await PlantType.findById(reference);
    if (byId) return byId;
  }

  const normalizedReference = normalizeCatalogKey(reference);
  const plantTypes = await PlantType.find({});

  return plantTypes.find((plantType) => {
    const nameKey = normalizeCatalogKey(plantType.name);
    const displayKey = normalizeCatalogKey(plantType.display_name);
    return nameKey === normalizedReference || displayKey === normalizedReference;
  }) || null;
}

function inferIdealForCatalog(catalogLabel) {
  const normalized = normalizeCatalogKey(catalogLabel);

  const defaults = {
    humidity: { min: 30, max: 80 },
    temperature: { min: 18, max: 30 },
    nitrogeno: { min: 35, max: 120 },
    fosforo: { min: 35, max: 120 },
    potasio: { min: 35, max: 120 }
  };

  const catalogPresets = {
    cactus: {
      humidity: { min: 10, max: 35 },
      temperature: { min: 18, max: 35 },
      nitrogeno: { min: 20, max: 90 },
      fosforo: { min: 20, max: 90 },
      potasio: { min: 20, max: 90 }
    },
    suculenta: {
      humidity: { min: 15, max: 45 },
      temperature: { min: 18, max: 32 },
      nitrogeno: { min: 20, max: 90 },
      fosforo: { min: 20, max: 90 },
      potasio: { min: 20, max: 90 }
    },
    semi_suculenta: {
      humidity: { min: 20, max: 50 },
      temperature: { min: 18, max: 32 },
      nitrogeno: { min: 20, max: 90 },
      fosforo: { min: 20, max: 90 },
      potasio: { min: 20, max: 90 }
    },
    ornamental_de_follaje: {
      humidity: { min: 45, max: 75 },
      temperature: { min: 18, max: 28 },
      nitrogeno: { min: 35, max: 110 },
      fosforo: { min: 35, max: 110 },
      potasio: { min: 35, max: 110 }
    },
    ornamental_floral: {
      humidity: { min: 45, max: 75 },
      temperature: { min: 16, max: 28 },
      nitrogeno: { min: 35, max: 110 },
      fosforo: { min: 35, max: 110 },
      potasio: { min: 35, max: 110 }
    },
    hortaliza_de_fruto: {
      humidity: { min: 55, max: 80 },
      temperature: { min: 18, max: 28 },
      nitrogeno: { min: 45, max: 120 },
      fosforo: { min: 45, max: 120 },
      potasio: { min: 45, max: 120 }
    },
    hortaliza_de_hoja: {
      humidity: { min: 65, max: 90 },
      temperature: { min: 15, max: 24 },
      nitrogeno: { min: 45, max: 120 },
      fosforo: { min: 45, max: 120 },
      potasio: { min: 45, max: 120 }
    },
    bulbo: {
      humidity: { min: 45, max: 70 },
      temperature: { min: 12, max: 24 },
      nitrogeno: { min: 35, max: 100 },
      fosforo: { min: 35, max: 100 },
      potasio: { min: 35, max: 100 }
    },
    raiz_comestible: {
      humidity: { min: 55, max: 80 },
      temperature: { min: 14, max: 24 },
      nitrogeno: { min: 35, max: 110 },
      fosforo: { min: 35, max: 110 },
      potasio: { min: 35, max: 110 }
    },
    frutal_arboreo: {
      humidity: { min: 50, max: 80 },
      temperature: { min: 18, max: 30 },
      nitrogeno: { min: 40, max: 120 },
      fosforo: { min: 40, max: 120 },
      potasio: { min: 40, max: 120 }
    },
    frutal_herbaceo: {
      humidity: { min: 60, max: 85 },
      temperature: { min: 15, max: 28 },
      nitrogeno: { min: 40, max: 120 },
      fosforo: { min: 40, max: 120 },
      potasio: { min: 40, max: 120 }
    },
    frutal_trepador: {
      humidity: { min: 55, max: 80 },
      temperature: { min: 18, max: 30 },
      nitrogeno: { min: 40, max: 120 },
      fosforo: { min: 40, max: 120 },
      potasio: { min: 40, max: 120 }
    }
  };

  return catalogPresets[normalized] || defaults;
}

function obtenerVentanaDeHistorial(windowParam) {
  const windowKey = ['1h', '24h', '1w', '1m'].includes(String(windowParam)) ? String(windowParam) : '1h';
  const ranges = {
    '1h': { hours: 1 },
    '24h': { hours: 24 },
    '1w': { days: 7 },
    '1m': { days: 30 }
  };

  const config = ranges[windowKey];
  const to = new Date();
  const from = new Date(to);

  if (config.hours) from.setHours(from.getHours() - config.hours);
  if (config.days) from.setDate(from.getDate() - config.days);

  return { window: windowKey, from, to };
}

function crearTelemetriaVacia() {
  return {
    timestamps: [],
    humidity: [],
    temperature: [],
    nitrogeno: [],
    fosforo: [],
    potasio: [],
    latest: {
      humidity: 0,
      temperature: 0,
      nitrogeno: 0,
      fosforo: 0,
      potasio: 0
    }
  };
}

function construirTelemetria(readings) {
  // Se devuelve la resolución completa de lecturas disponibles en el rango,
  // sin submuestreo: el frontend decide cómo graficarlas.
  const latest = readings[readings.length - 1] || {};
  return {
    timestamps: readings.map(r => r.timestamp),
    humidity: readings.map(r => r.humidity ?? 0),
    temperature: readings.map(r => r.temperature ?? 0),
    nitrogeno: readings.map(r => r.nitrogeno ?? 0),
    fosforo: readings.map(r => r.fosforo ?? 0),
    potasio: readings.map(r => r.potasio ?? 0),
    latest: {
      humidity: latest.humidity ?? 0,
      temperature: latest.temperature ?? 0,
      nitrogeno: latest.nitrogeno ?? 0,
      fosforo: latest.fosforo ?? 0,
      potasio: latest.potasio ?? 0
    }
  };
}

function obtenerUserIdDesdeToken(token) {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.user_id || null;
  } catch (err) {
    return null;
  }
}

function broadcastToClients(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify(data));
  });
}

mqttClient.on('error', (err) => console.error('❌ Error MQTT:', err));

// ── Detección de módulos desconectados ────────────────
setInterval(() => {
  const now = Date.now();
  let changed = false;
  
  devices.forEach((device, deviceID) => {
    // Si han pasado más de 5 segundos sin telemetría, se declara offline
    if (device.status !== 'offline' && device.last_seen && (now - device.last_seen > 5000)) {
      device.status = 'offline';
      changed = true;
      console.log(`🔌 Módulo ${deviceID} desconectado (Timeout)`);
      
      // Detiene el riego en la base de datos si se desconectó regando
      if (wateringStart.has(deviceID)) {
          mqttClient.publish(`control/led/${deviceID}`, 'LED_OFF');
          wateringStart.delete(deviceID);
          broadcastToClients({ type: 'watering_stopped', device_id: deviceID, reason: 'timeout' });
      }
      
      Device.findOneAndUpdate({ device_id: deviceID }, { status: 'offline' })
        .catch(err => console.error('Error al actualizar BD:', err.message));
    }
  });
  
  if (changed) {
    broadcastToClients({ type: 'device_update', devices: getDevicesSnapshot() });
  }
}, 5000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor en http://localhost:${PORT}`);
});