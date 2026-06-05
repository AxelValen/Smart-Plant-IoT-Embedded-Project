// ================================================================
//  seed.js — Datos iniciales de tipos de planta
//
//  Corre este script UNA SOLA VEZ para poblar la colección
//  PlantType con las condiciones ideales de cada planta.
//
//  Uso: node seed.js
//
//  Puedes agregar más plantas o modificar los rangos según
//  investigación agronómica para tu región.
// ================================================================

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose  = require('mongoose');
const PlantType = require('./models/PlantType');

// ── Datos de plantas ─────────────────────────────────────────────
// humidity:    % de humedad del suelo (sensor capacitivo o resistivo)
// temperature: °C temperatura ambiente
// light:       lux (sensor BH1750 o LDR calibrado)
// Ajusta estos rangos según los sensores que uses y tu clima local.

const plants = [
  {
    name:         'tomate',
    display_name: 'Tomate',
    description:  'Planta de fruto, requiere riego moderado y buena iluminación.',
    ideal: {
      humidity:    { min: 60, max: 80 },
      temperature: { min: 18, max: 27 },
      light:       { min: 5000, max: 40000 }
    }
  },
  {
    name:         'lechuga',
    display_name: 'Lechuga',
    description:  'Planta de hoja, prefiere ambientes frescos y alta humedad.',
    ideal: {
      humidity:    { min: 70, max: 90 },
      temperature: { min: 15, max: 22 },
      light:       { min: 2000, max: 15000 }
    }
  },
  {
    name:         'chile',
    display_name: 'Chile',
    description:  'Requiere temperaturas cálidas y riego moderado.',
    ideal: {
      humidity:    { min: 55, max: 75 },
      temperature: { min: 20, max: 30 },
      light:       { min: 6000, max: 45000 }
    }
  },
  {
    name:         'albahaca',
    display_name: 'Albahaca',
    description:  'Hierba aromática, sensible al frío y al exceso de humedad.',
    ideal: {
      humidity:    { min: 50, max: 70 },
      temperature: { min: 18, max: 30 },
      light:       { min: 4000, max: 35000 }
    }
  },
  {
    name:         'fresa',
    display_name: 'Fresa',
    description:  'Requiere humedad constante y temperaturas moderadas.',
    ideal: {
      humidity:    { min: 65, max: 85 },
      temperature: { min: 15, max: 25 },
      light:       { min: 3000, max: 30000 }
    }
  }
];

// ── Ejecución ────────────────────────────────────────────────────
async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => console.error('❌ Error MongoDB:', err));

    // Elimina los tipos existentes para evitar duplicados al re-correr
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
