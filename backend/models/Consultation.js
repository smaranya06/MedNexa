const mongoose = require('mongoose');

const ConsultationSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
    },
    patientAge: {
      type: Number,
      default: 30,
    },
    patientGender: {
      type: String,
      default: 'Other',
    },
    patientPhone: {
      type: String,
      default: '',
    },
    patientAbhaId: {
      type: String,
      default: '',
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    doctorName: {
      type: String,
      required: true,
    },
    doctorSpecialty: {
      type: String,
      required: true,
    },
    chiefComplaint: {
      type: String,
      required: [true, 'Chief complaint is required'],
    },
    symptoms: {
      type: [String],
      default: [],
    },
    duration: {
      type: String,
      default: '3 days',
    },
    severity: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },
    priority: {
      type: String,
      enum: ['ROUTINE', 'URGENT', 'EMERGENCY'],
      default: 'ROUTINE',
    },
    images: [
      {
        url: { type: String, required: true },
        name: { type: String, default: 'Medical Document / Photo' },
        fileType: { type: String, default: 'image/jpeg' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'IN_REVIEW', 'ANSWERED', 'COMPLETED'],
      default: 'PENDING',
      index: true,
    },
    doctorFeedback: {
      problemAssessment: {
        type: String,
        default: '',
      },
      patientActionPlan: {
        type: String,
        default: '',
      },
      prescriptions: [
        {
          medicine: { type: String, required: true },
          dosage: { type: String, default: '1 tab' },
          frequency: { type: String, default: 'Twice daily' },
          duration: { type: String, default: '5 days' },
        },
      ],
      followUpDays: {
        type: Number,
        default: 7,
      },
      answeredAt: {
        type: Date,
      },
    },
    notification: {
      isRead: {
        type: Boolean,
        default: false,
      },
      message: {
        type: String,
        default: '',
      },
      notifiedAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Consultation', ConsultationSchema);
