const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    docType: {
      type: String,
      enum: ['Prescription', 'Lab Report', 'Discharge Summary', 'Imaging Report', 'Other'],
      default: 'Prescription',
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      default: '',
    },
    mimeType: {
      type: String,
      default: 'image/jpeg',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    documentDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ocrRawText: {
      type: String,
      default: '',
    },
    ocrStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    structuredData: {
      diagnoses: [{ type: String }],
      medications: [
        {
          name: { type: String },
          dosage: { type: String },
          frequency: { type: String },
        },
      ],
      labResults: [
        {
          parameter: { type: String },
          value: { type: mongoose.Schema.Types.Mixed },
          unit: { type: String },
          referenceRange: { type: String },
          isAbnormal: { type: Boolean, default: false },
          flagDirection: { type: String, enum: ['HIGH', 'LOW', 'NORMAL', 'ALERT'], default: 'NORMAL' },
        },
      ],
    },
    abnormalCount: {
      type: Number,
      default: 0,
    },
    warnings: [{ type: String }],
    chronologicalIndex: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Document', DocumentSchema);

