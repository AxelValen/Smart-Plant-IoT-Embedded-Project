// ================================================================
//  seed.js — Datos iniciales de tipos de planta
//
//  Correr este script una sola vez para poblar la colección
//  PlantType con las condiciones ideales de cada planta.
//
//  Uso: node seed.js
//
//  Rangos basados en revisión bibliográfica 
//
//  humidity:    % VWC — humedad volumétrica del suelo
//               medida con sensor capacitivo enterrado
//  temperature: °C temperatura del suelo
//  nitrogeno / fosforo / potasio: mg/kg en suelo o sustrato
// ================================================================

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose  = require('mongoose');
const PlantType = require('./models/PlantType');


const plants = [

  // ======== FOLLAJE ========
  {
    name:         'monstera',
    display_name: 'Monstera',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 18, max: 27 },
      nitrogeno:   { min: 75, max: 150 },
      fosforo:     { min: 20, max: 30  },
      potasio:     { min: 75, max: 150 }
    }
  },
  {
    name:         'pothos',
    display_name: 'Pothos',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 15, max: 29 },
      nitrogeno:   { min: 50, max: 100 },
      fosforo:     { min: 15, max: 25  },
      potasio:     { min: 50, max: 100 }
    }
  },
  {
    name:         'begonia_rex',
    display_name: 'Begonia rex',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 18, max: 24 },
      nitrogeno:   { min: 75, max: 125 },
      fosforo:     { min: 20, max: 30  },
      potasio:     { min: 75, max: 125 }
    }
  },
  {
    name:         'helecho',
    display_name: 'Helecho',
    ideal: {
      humidity:    { min: 60, max: 80 },
      temperature: { min: 16, max: 24 },
      nitrogeno:   { min: 50, max: 100 },
      fosforo:     { min: 15, max: 25  },
      potasio:     { min: 50, max: 100 }
    }
  },
  {
    name:         'sansevieria',
    display_name: 'Sansevieria',
    ideal: {
      humidity:    { min: 30, max: 50 },
      temperature: { min: 18, max: 32 },
      nitrogeno:   { min: 50, max: 100 },
      fosforo:     { min: 15, max: 20  },
      potasio:     { min: 50, max: 100 }
    }
  },

  // ======== FLORALES ========
  {
    name:         'orquidea',
    display_name: 'Orquídea',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 18, max: 29 },
      nitrogeno:   { min: 25, max: 100 },
      fosforo:     { min: 25, max: 87  },
      potasio:     { min: 50, max: 168 }
    }
  },
  {
    name:         'rosa',
    display_name: 'Rosa',
    ideal: {
      humidity:    { min: 60, max: 70 },
      temperature: { min: 15, max: 26 },
      nitrogeno:   { min: 100, max: 150 },
      fosforo:     { min: 30,  max: 75  },
      potasio:     { min: 150, max: 200 }
    }
  },
  {
    name:         'tulipan',
    display_name: 'Tulipán',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 5,  max: 18 },
      nitrogeno:   { min: 50, max: 100 },
      fosforo:     { min: 30, max: 60  },
      potasio:     { min: 100, max: 150 }
    }
  },
  {
    name:         'geranio',
    display_name: 'Geranio',
    ideal: {
      humidity:    { min: 40, max: 60 },
      temperature: { min: 15, max: 25 },
      nitrogeno:   { min: 75, max: 125 },
      fosforo:     { min: 25, max: 75  },
      potasio:     { min: 75, max: 125 }
    }
  },
  {
    name:         'hortensia',
    display_name: 'Hortensia',
    ideal: {
      humidity:    { min: 60, max: 80 },
      temperature: { min: 15, max: 21 },
      nitrogeno:   { min: 75, max: 100 },
      fosforo:     { min: 25, max: 50  },
      potasio:     { min: 75, max: 150 }
    }
  },

  // ======== DESÉRTICAS ========
  {
    name:         'cactus',
    display_name: 'Cactus',
    ideal: {
      humidity:    { min: 10, max: 30 },
      temperature: { min: 21, max: 35 },
      nitrogeno:   { min: 5,  max: 25 },
      fosforo:     { min: 5,  max: 15 },
      potasio:     { min: 15, max: 40 }
    }
  },
  {
    name:         'cactus_barril',
    display_name: 'Cactus barril',
    ideal: {
      humidity:    { min: 10, max: 25 },
      temperature: { min: 21, max: 38 },
      nitrogeno:   { min: 5,  max: 20 },
      fosforo:     { min: 5,  max: 10 },
      potasio:     { min: 10, max: 30 }
    }
  },
  {
    name:         'aloe_vera',
    display_name: 'Aloe vera',
    ideal: {
      humidity:    { min: 20, max: 40 },
      temperature: { min: 13, max: 27 },
      nitrogeno:   { min: 5,  max: 25 },
      fosforo:     { min: 5,  max: 15 },
      potasio:     { min: 15, max: 40 }
    }
  },
  {
    name:         'euphorbia_milii',
    display_name: 'Euphorbia milii',
    ideal: {
      humidity:    { min: 30, max: 50 },
      temperature: { min: 18, max: 24 },
      nitrogeno:   { min: 10, max: 25 },
      fosforo:     { min: 10, max: 20 },
      potasio:     { min: 10, max: 25 }
    }
  },
  {
    name:         'planta_jade',
    display_name: 'Planta jade',
    ideal: {
      humidity:    { min: 30, max: 50 },
      temperature: { min: 18, max: 24 },
      nitrogeno:   { min: 5,  max: 25 },
      fosforo:     { min: 5,  max: 15 },
      potasio:     { min: 15, max: 40 }
    }
  },

  // ======== VEGETALES ========
  {
    name:         'tomate',
    display_name: 'Tomate',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 18, max: 27 },
      nitrogeno:   { min: 20, max: 40  },
      fosforo:     { min: 30, max: 65  },
      potasio:     { min: 150, max: 250 }
    }
  },
  {
    name:         'batata',
    display_name: 'Batata',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 24, max: 30 },
      nitrogeno:   { min: 20, max: 35  },
      fosforo:     { min: 30, max: 65  },
      potasio:     { min: 150, max: 200 }
    }
  },
  {
    name:         'cebolla',
    display_name: 'Cebolla',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 13, max: 24 },
      nitrogeno:   { min: 15, max: 30  },
      fosforo:     { min: 30, max: 65  },
      potasio:     { min: 150, max: 200 }
    }
  },
  {
    name:         'zanahoria',
    display_name: 'Zanahoria',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 15, max: 21 },
      nitrogeno:   { min: 15, max: 25  },
      fosforo:     { min: 30, max: 65  },
      potasio:     { min: 150, max: 200 }
    }
  },
  {
    name:         'lechuga',
    display_name: 'Lechuga',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 15, max: 22 },
      nitrogeno:   { min: 20, max: 35  },
      fosforo:     { min: 30, max: 65  },
      potasio:     { min: 150, max: 200 }
    }
  },

  // ======== FRUTALES ========
  {
    name:         'durazno',
    display_name: 'Durazno',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 15, max: 28 },
      nitrogeno:   { min: 20, max: 40 },
      fosforo:     { min: 10, max: 30 },
      potasio:     { min: 100, max: 200 }
    }
  },
  {
    name:         'arandano',
    display_name: 'Arándano',
    ideal: {
      humidity:    { min: 60, max: 70 },
      temperature: { min: 15, max: 24 },
      nitrogeno:   { min: 20, max: 40 },
      fosforo:     { min: 10, max: 25 },
      potasio:     { min: 80, max: 150 }
    }
  },
  {
    name:         'limon',
    display_name: 'Limón',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 20, max: 30 },
      nitrogeno:   { min: 20, max: 40 },
      fosforo:     { min: 10, max: 20 },
      potasio:     { min: 80, max: 160 }
    }
  },
  {
    name:         'fresa',
    display_name: 'Fresa',
    ideal: {
      humidity:    { min: 60, max: 80 },
      temperature: { min: 15, max: 22 },
      nitrogeno:   { min: 30, max: 80 },
      fosforo:     { min: 40, max: 93 },
      potasio:     { min: 150, max: 254 }
    }
  },
  {
    name:         'mandarina',
    display_name: 'Mandarina',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 20, max: 30 },
      nitrogeno:   { min: 20, max: 40 },
      fosforo:     { min: 10, max: 20 },
      potasio:     { min: 80, max: 160 }
    }
  }

];

// ======== Ejecución ========
async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => console.error('❌ Error MongoDB:', err));

    await PlantType.deleteMany({});
    console.log('🗑️  Colección PlantType limpiada');

    const inserted = await PlantType.insertMany(plants);
    console.log(`🌱 ${inserted.length} tipos de planta insertados:`);
    inserted.forEach(p => console.log(`   - ${p.display_name} (${p.name})`));

  } catch (err) {
    console.error('❌ Error en seed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

seed();