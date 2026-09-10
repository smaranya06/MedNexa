const mongoose = require('mongoose');

const CaseHistorySchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    chiefComplaints: [
      {
        symptom: { type: String, required: true },
        duration: { type: String, default: '1 day' },
        severity: { type: Number, min: 1, max: 10, default: 5 },
      },
    ],
    hpi: {
      site: { type: String, default: '' },
      onset: { type: String, default: '' },
      character: { type: String, default: '' },
      radiation: { type: String, default: '' },
      associatedSymptoms: [{ type: String }],
      timingDuration: { type: String, default: '' },
      exacerbatingRelieving: { type: String, default: '' },
      severityScore: { type: Number, min: 1, max: 10, default: 5 },
    },
    pastMedicalHistory: {
      conditions: [{ type: String }],
      surgeries: [{ type: String }],
      hospitalizations: { type: String, default: 'None' },
      notes: { type: String, default: '' },
    },
    medicationHistory: [
      {
        name: { type: String, required: true },
        dosage: { type: String, default: '' },
        frequency: { type: String, default: '' },
        adherence: { type: String, default: 'Regular' },
      },
    ],
    allergyHistory: [
      {
        allergen: { type: String, required: true },
        reaction: { type: String, default: '' },
        severity: { type: String, enum: ['Mild', 'Moderate', 'Severe'], default: 'Moderate' },
      },
    ],
    familyHistory: {
      cardiovascular: { type: Boolean, default: false },
      diabetes: { type: Boolean, default: false },
      hypertension: { type: Boolean, default: false },
      cancer: { type: Boolean, default: false },
      asthma: { type: Boolean, default: false },
      notes: { type: String, default: '' },
    },
    personalLifestyleHistory: {
      diet: { type: String, enum: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Eggetarian'], default: 'Vegetarian' },
      smoking: { type: String, enum: ['Never', 'Former', 'Current'], default: 'Never' },
      alcohol: { type: String, enum: ['Non-drinker', 'Occasional', 'Regular'], default: 'Non-drinker' },
      physicalActivity: { type: String, enum: ['Sedentary', 'Moderate', 'Active'], default: 'Moderate' },
      sleepHours: { type: Number, default: 7 },
      stressLevel: { type: String, enum: ['Low', 'Moderate', 'High'], default: 'Moderate' },
      waterIntake: { type: String, default: '2-3 Litres' },
    },
    reviewOfSystems: {
      cardiovascular: [{ type: String }],
      respiratory: [{ type: String }],
      gastrointestinal: [{ type: String }],
      neurological: [{ type: String }],
      musculoskeletal: [{ type: String }],
      genitourinary: [{ type: String }],
      dermatological: [{ type: String }],
    },
    ayushAssessment: {
      isAyush: { type: Boolean, default: false },
      prakriti: {
        dominantDosha: {
          type: String,
          enum: ['Vata', 'Pitta', 'Kapha', 'Vata-Pitta', 'Pitta-Kapha', 'Vata-Kapha', 'Tridoshaja', 'Undetermined'],
          default: 'Undetermined',
        },
        vataScore: { type: Number, default: 0 },
        pittaScore: { type: Number, default: 0 },
        kaphaScore: { type: Number, default: 0 },
        traits: [{ type: String }],
      },
      vikriti: { type: String, default: '' },
      agni: {
        type: String,
        enum: ['Sama (Balanced)', 'Vishama (Irregular/Vata)', 'Tikshna (Intense/Pitta)', 'Manda (Sluggish/Kapha)', 'Unspecified'],
        default: 'Unspecified',
      },
      koshtha: {
        type: String,
        enum: ['Krura (Hard/Vata)', 'Madhyama (Moderate/Kapha)', 'Mridu (Soft/Pitta)', 'Unspecified'],
        default: 'Unspecified',
      },
      dashavidhaPariksha: {
        sara: { type: String, default: 'Madhyama' },
        samhanana: { type: String, default: 'Madhyama' },
        pramana: { type: String, default: 'Prakrita' },
        satmya: { type: String, default: 'Madhyama' },
        sattva: { type: String, default: 'Madhyama' },
        aharaShakti: { type: String, default: 'Madhyama' },
        vyayamaShakti: { type: String, default: 'Madhyama' },
        vaya: { type: String, default: 'Madhyama' },
      },
      aharaVihara: {
        dietaryHabits: { type: String, default: '' },
        dailyRoutine: { type: String, default: '' },
        sleepQuality: { type: String, default: '' },
        seasonalAdjustment: { type: String, default: '' },
      },
      nidana: { type: String, default: '' },
      samprapti: { type: String, default: '' },
    },
    aiSummary: {
      chiefComplaintHpi: { type: String, default: '' },
      pastMedicalMeds: { type: String, default: '' },
      allergiesRiskFactors: { type: String, default: '' },
      systemicReviewNotes: { type: String, default: '' },
      ayushSynthesis: { type: String, default: '' },
      triageRecommendation: { type: String, default: '' },
      fullStructuredSummary: { type: String, default: '' },
      generatedAt: { type: Date, default: Date.now },
    },
    physicianReview: {
      reviewed: { type: Boolean, default: false },
      doctorName: { type: String, default: 'Dr. Consultation Physician' },
      doctorNotes: { type: String, default: '' },
      clinicalDiagnosis: { type: String, default: '' },
      prescription: [
        {
          medicine: { type: String, required: true },
          dosage: { type: String, default: '' },
          frequency: { type: String, default: 'Once daily' },
          duration: { type: String, default: '5 days' },
          instructions: { type: String, default: 'After meals' },
        },
      ],
      doctorSignature: { type: String, default: '' },
      finalizedAt: { type: Date },
    },
    fhirBundle: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CaseHistory', CaseHistorySchema);

