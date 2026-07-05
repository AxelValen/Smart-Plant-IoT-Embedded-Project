// ================================================================
//  models/GardenPlant.js — Plantas del jardín virtual de un usuario
//
//  Enlaza un usuario con un tipo de planta, y opcionalmente con
//  el dispositivo ESP32 físico que la está monitoreando.
// ================================================================

const mongoose = require('mongoose');

const gardenPlantSchema = new mongoose.Schema({

  // Dueño de esta instancia de planta
  user_id: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true
  },

  // Tipo de planta (referencia al catálogo PlantType)
  plant_type_id: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'PlantType',
    required: true
  },

  // Dispositivo ESP32 asignado (opcional: puede añadirse al jardín
  // sin tener todavía un módulo físico enlazado)
  device_id: {
    type:    String,
    trim:    true,
    default: null
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('GardenPlant', gardenPlantSchema);
