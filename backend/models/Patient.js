const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
    },
    age: {
      type: Number,
      required: [true, 'Patient age is required'],
      min: [0, 'Age cannot be negative'],
      max: [130, 'Age is invalid'],
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    emergencyContact: {
      type: String,
      trim: true,
      default: '',
    },
    abhaId: {
      type: String,
      trim: true,
      index: true,
      default: function () {
        // Generate simulated 14-digit ABHA ID if not provided: 91-XXXX-XXXX-XXXX
        const rand4 = () => Math.floor(1000 + Math.random() * 9000);
        return `91-${rand4()}-${rand4()}-${rand4()}`;
      },
    },
    abhaAddress: {
      type: String,
      trim: true,
      default: function () {
        const cleanName = (this.name || 'patient').toLowerCase().replace(/[^a-z0-9]/g, '');
        const rand3 = Math.floor(100 + Math.random() * 900);
        return `${cleanName}${rand3}@abdm`;
      },
    },
    preferredLanguage: {
      type: String,
      enum: ['en', 'hi', 'bn', 'ta', 'te', 'mr'],
      default: 'en',
    },
    department: {
      type: String,
      enum: [
        'General Medicine',
        'AYUSH / Ayurveda',
        'Cardiology',
        'Pulmonology',
        'Orthopedics',
        'Pediatrics',
      ],
      default: 'General Medicine',
    },
    opdToken: {
      type: String,
      unique: true,
      index: true,
    },
    triageStatus: {
      type: String,
      enum: ['EMERGENCY', 'URGENT', 'ROUTINE'],
      default: 'ROUTINE',
      index: true,
    },
    redFlagAlert: {
      isRedFlag: { type: Boolean, default: false },
      flags: [{ type: String }],
      reason: { type: String, default: '' },
      detectedAt: { type: Date },
    },
    consent: {
      consented: { type: Boolean, default: false },
      audioConsentGiven: { type: Boolean, default: false },
      consentTimestamp: { type: Date, default: Date.now },
      consentScope: {
        type: [String],
        default: [
          'CLINICAL_INTAKE',
          'DOCUMENT_DIGITIZATION',
          'ABDM_FHIR_SHARING',
          'PHYSICIAN_ACCESS',
        ],
      },
      dpdpaCompliant: { type: Boolean, default: true },
    },
    status: {
      type: String,
      enum: [
        'WAITING_INTAKE',
        'INTAKE_COMPLETED',
        'UNDER_CONSULTATION',
        'COMPLETED',
      ],
      default: 'WAITING_INTAKE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-assign OPD Token before saving if not present
PatientSchema.pre('save', function () {
  if (!this.opdToken) {
    const deptPrefix = (this.department || 'GEN')
      .slice(0, 3)
      .toUpperCase();
    const tokenNum = Math.floor(100 + Math.random() * 900);
    this.opdToken = `OPD-${deptPrefix}-${tokenNum}`;
  }
});

module.exports = mongoose.model('Patient', PatientSchema);
