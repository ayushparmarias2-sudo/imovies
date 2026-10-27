const mongoose = require('mongoose');
const json = require('../utils/json');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['CUSTOMER', 'ADMIN'], default: 'CUSTOMER' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
json(userSchema, (ret) => { delete ret.passwordHash; });

module.exports = mongoose.model('User', userSchema);
