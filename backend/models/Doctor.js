const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Doctor email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      default: 'doctor123',
    },
    specialty: {
      type: String,
      required: true,
      enum: [
        'General Medicine',
        'Cardiology',
        'AYUSH / Ayurveda',
        'Pulmonology',
        'Orthopedics',
        'Pediatrics',
      ],
      default: 'General Medicine',
    },
    qualification: {
      type: String,
      default: 'MBBS, MD',
    },
    experienceYears: {
      type: Number,
      default: 10,
    },
    rating: {
      type: Number,
      default: 4.8,
    },
    reviewCount: {
      type: Number,
      default: 120,
    },
    consultationFee: {
      type: Number,
      default: 500,
    },
    hospitalAffiliation: {
      type: String,
      default: 'Apex Multi-Specialty Hospital, New Delhi',
    },
    availableDays: {
      type: [String],
      default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: 'Dedicated specialist providing comprehensive patient diagnosis, preventative guidance, and evidence-based clinical care.',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Doctor', DoctorSchema);
