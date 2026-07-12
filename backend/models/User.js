// ================================================================
//  models/User.js — Usuarios del sistema
//
//  Cada documento representa una cuenta de usuario. La contraseña
//  se guarda siempre hasheada (bcryptjs), nunca en texto plano.
// ================================================================

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({

  name: {
    type:      String,
    required:  true,
    trim:      true
  },

  email: {
    type:      String,
    required:  true,
    unique:    true,
    trim:      true,
    lowercase: true
  },

  password: {
    type:     String,
    required: true
  }

}, {
  timestamps: true
});

// ── Hashea la contraseña antes de guardar (solo si cambió) ──────
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Compara una contraseña en texto plano contra el hash ────────
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
