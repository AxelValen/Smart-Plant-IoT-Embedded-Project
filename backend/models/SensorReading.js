// ================================================================
//  models/SensorReading.js — Mediciones de sensores
//
//  Cada documento es una lectura puntual de todos los sensores
//  de un módulo ESP32. Se crea cada vez que llega un mensaje
//  al topic MQTT "sensor/data/<device_id>".
// ================================================================

const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema({

  // Referencia al dispositivo que envió la lectura
  device_id: {
    type:     String,
    required: true,
    index:    true   // índice para acelerar consultas por dispositivo
  },

  // Tipo de planta en el momento de la lectura (desnormalizado
  // para no tener que hacer join cada vez que se consulta)
  plant_type: {
    type: String
  },

  // ── Lecturas de sensores ──────────────────────────────────────
  // Por ahora 'valor' mantiene compatibilidad con el código actual
  // (el random de prueba). Cuando integres sensores reales,
  // los campos humidity, temperature y light tendrán datos.

  valor: {
    type: Number   // campo de compatibilidad con la versión actual
  },

  humidity: {
    type: Number   // % humedad del suelo  (0-100)
  },

  temperature: {
    type: Number   // °C temperatura ambiente
  },

  light: {
    type: Number   // lux iluminación
  },

  // Mensaje de texto que puede enviar el ESP32 (ej: "OK", "Error sensor")
  mensaje: {
    type: String,
    default: ''
  },

  // ── Estado de salud calculado en el momento de la lectura ─────
  health_status: {
    type:    String,
    enum:    ['saludable', 'en_riesgo', 'desconocido'],
    default: 'desconocido'
  },

  // Lista de problemas detectados (ej: ["humedad baja", "temperatura alta"])
  issues: {
    type:    [String],
    default: []
  },

  // Timestamp de la medición (lo asigna el servidor al recibirla)
  timestamp: {
    type:    Date,
    default: Date.now,
    index:   true   // índice para acelerar consultas por rango de fechas
  }

});

// Índice compuesto: consultas frecuentes son por dispositivo + fecha
sensorReadingSchema.index({ device_id: 1, timestamp: -1 });

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
