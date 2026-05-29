// ================================================================
//  models/WateringEvent.js — Registro de eventos de riego
//
//  Cada documento registra un momento en que se activó la bomba,
//  ya sea por acción manual desde el dashboard o automáticamente
//  por el servidor al detectar condiciones fuera de rango.
// ================================================================

const mongoose = require('mongoose');

const wateringEventSchema = new mongoose.Schema({

  device_id: {
    type:     String,
    required: true,
    index:    true
  },

  plant_type: {
    type: String
  },

  // Quién o qué disparó el riego
  triggered_by: {
    type:     String,
    enum:     ['manual', 'automatic'],
    required: true
  },

  // Si triggered_by es 'automatic', guarda qué condición lo disparó
  // (ej: "humedad baja", "temperatura alta")
  trigger_reason: {
    type:    String,
    default: ''
  },

  // Duración del riego en segundos
  // El servidor la calcula cuando recibe el comando LED_OFF
  duration_sec: {
    type:    Number,
    default: null
  },

  // Lecturas del sensor en el momento en que se activó el riego
  // Útil para analizar después bajo qué condiciones se regó
  sensor_snapshot: {
    humidity:    Number,
    temperature: Number,
    light:       Number
  },

  timestamp: {
    type:    Date,
    default: Date.now,
    index:   true
  }

});

wateringEventSchema.index({ device_id: 1, timestamp: -1 });

module.exports = mongoose.model('WateringEvent', wateringEventSchema);
