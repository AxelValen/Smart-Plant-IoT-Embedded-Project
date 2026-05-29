// ================================================================
//  models/PlantType.js — Tipos de planta y condiciones ideales
//
//  Cada documento define un tipo de planta con los rangos óptimos
//  de humedad del suelo, temperatura ambiente y luz.
//  Esta colección se carga con seed.js y rara vez se modifica.
// ================================================================

const mongoose = require('mongoose');

// Sub-esquema reutilizable para un rango min/max
const rangeSchema = new mongoose.Schema({
  min: { type: Number, required: true },
  max: { type: Number, required: true }
}, { _id: false }); // _id: false porque es un sub-documento, no una colección

const plantTypeSchema = new mongoose.Schema({

  // Nombre identificador (debe coincidir con PLANT_TYPE en main.cpp)
  name: {
    type:     String,
    required: true,
    unique:   true,
    trim:     true,
    lowercase: true   // se guarda en minúsculas para evitar "Tomate" vs "tomate"
  },

  // Nombre legible para mostrar en el dashboard
  display_name: {
    type: String,
    required: true
  },

  // Condiciones ideales de cultivo
  ideal: {
    humidity:    rangeSchema,   // % de humedad del suelo
    temperature: rangeSchema,   // °C
    light:       rangeSchema    // lux
  },

  // Descripción opcional para mostrar en la web
  description: {
    type: String,
    default: ''
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('PlantType', plantTypeSchema);
