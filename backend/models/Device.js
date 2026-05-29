// ================================================================
//  models/Device.js — Dispositivos ESP32 registrados
//
//  Cada documento representa un módulo ESP32 conocido por el
//  sistema. Se crea/actualiza cada vez que un ESP32 se conecta.
// ================================================================

const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({

  // ID único basado en la MAC del chip (ej: "AABBCCDDEEFF")
  device_id: {
    type:     String,
    required: true,
    unique:   true,
    trim:     true
  },

  // Tipo de planta asignado a este módulo (debe existir en PlantType)
  plant_type: {
    type: String,
    trim: true
  },

  // Estado de conexión actual
  status: {
    type:    String,
    enum:    ['online', 'offline'],
    default: 'offline'
  },

  // Última vez que se recibió señal de este dispositivo
  last_seen: {
    type: Date
  }

}, {
  // Agrega createdAt y updatedAt automáticamente
  timestamps: true
});

module.exports = mongoose.model('Device', deviceSchema);
