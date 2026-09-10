const Patient = require('../models/Patient');
const CaseHistory = require('../models/CaseHistory');
const Document = require('../models/Document');

/**
 * Register or verify patient via ABHA ID or demographic entry
 */
exports.registerOrVerifyPatient = async (req, res) => {
  try {
    const {
      abhaId,
      abhaAddress,
      name,
      age,
      gender,
      phone,
      address,
      emergencyContact,
      preferredLanguage,
      department,
      consent,
    } = req.body;

    if (!name || !age) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and age are required',
      });
    }

    let patient = null;

    // Check if patient already exists with this ABHA ID
    if (abhaId && abhaId.trim() !== '') {
      patient = await Patient.findOne({ abhaId: abhaId.trim() });
    }

    if (patient) {
      // Update with newly submitted department, language and consent
      patient.name = name || patient.name;
      patient.age = age || patient.age;
      patient.gender = gender || patient.gender;
      patient.phone = phone || patient.phone;
      patient.preferredLanguage = preferredLanguage || patient.preferredLanguage;
      patient.department = department || patient.department;
      if (consent) {
        patient.consent = {
          ...patient.consent,
          ...consent,
          consentTimestamp: new Date(),
        };
      }
      await patient.save();

      return res.status(200).json({
        success: true,
        message: 'Existing patient verified successfully via ABHA',
        data: patient,
        isExisting: true,
      });
    }

    // Create new patient record
    patient = new Patient({
      name,
      age: Number(age),
      gender: gender || 'Male',
      phone: phone || '',
      address: address || '',
      emergencyContact: emergencyContact || '',
      abhaId: abhaId && abhaId.trim() !== '' ? abhaId.trim() : undefined,
      abhaAddress: abhaAddress || undefined,
      preferredLanguage: preferredLanguage || 'en',
      department: department || 'General Medicine',
      consent: {
        consented: consent?.consented ?? true,
        audioConsentGiven: consent?.audioConsentGiven ?? false,
        consentTimestamp: new Date(),
        consentScope: consent?.consentScope || [
          'CLINICAL_INTAKE',
          'DOCUMENT_DIGITIZATION',
          'ABDM_FHIR_SHARING',
          'PHYSICIAN_ACCESS',
        ],
        dpdpaCompliant: true,
      },
      status: 'WAITING_INTAKE',
    });

    await patient.save();

    return res.status(201).json({
      success: true,
      message: 'Patient registered and ABHA health record created',
      data: patient,
      isExisting: false,
    });
  } catch (error) {
    console.error('Error in registerOrVerifyPatient:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register or verify patient',
      error: error.message,
    });
  }
};

/**
 * Get active OPD patient queue with Triage priority sorting (EMERGENCY -> URGENT -> ROUTINE)
 */
exports.getPatientQueue = async (req, res) => {
  try {
    const { department, triageStatus, status, search } = req.query;

    const filter = {};

    if (department && department !== 'All') {
      filter.department = department;
    }

    if (triageStatus && triageStatus !== 'All') {
      filter.triageStatus = triageStatus;
    }

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { opdToken: { $regex: search, $options: 'i' } },
        { abhaId: { $regex: search, $options: 'i' } },
      ];
    }

    // Custom triage priority order
    const triageOrder = { EMERGENCY: 1, URGENT: 2, ROUTINE: 3 };

    const patients = await Patient.find(filter).lean();

    // Sort by Triage priority first (EMERGENCY -> URGENT -> ROUTINE), then by creation time
    patients.sort((a, b) => {
      const pA = triageOrder[a.triageStatus] || 3;
      const pB = triageOrder[b.triageStatus] || 3;
      if (pA !== pB) return pA - pB;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Populate case history summary snippet for each patient
    const populated = await Promise.all(
      patients.map(async (p) => {
        const caseHistory = await CaseHistory.findOne({ patientId: p._id }).lean();
        const docCount = await Document.countDocuments({ patientId: p._id });
        return {
          ...p,
          hasCaseHistory: !!caseHistory,
          chiefComplaints: caseHistory?.chiefComplaints || [],
          aiSummaryPreview: caseHistory?.aiSummary?.fullStructuredSummary || '',
          docCount,
          reviewed: caseHistory?.physicianReview?.reviewed || false,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: populated.length,
      data: populated,
    });
  } catch (error) {
    console.error('Error in getPatientQueue:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve patient queue',
      error: error.message,
    });
  }
};

/**
 * Get single patient by ID with full case history & documents
 */
exports.getPatientById = async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    const caseHistory = await CaseHistory.findOne({ patientId: patient._id });
    const documents = await Document.find({ patientId: patient._id }).sort({
      documentDate: 1,
    });

    return res.status(200).json({
      success: true,
      data: {
        patient,
        caseHistory,
        documents,
      },
    });
  } catch (error) {
    console.error('Error in getPatientById:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve patient details',
      error: error.message,
    });
  }
};

/**
 * Update patient triage status (manual doctor override)
 */
exports.updateTriageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { triageStatus, reason } = req.body;

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    patient.triageStatus = triageStatus;
    if (triageStatus === 'EMERGENCY') {
      patient.redFlagAlert = {
        isRedFlag: true,
        flags: ['MANUAL_TRIAGE_ESCALATION'],
        reason: reason || 'Physician/Triage Nurse Manual Escalation',
        detectedAt: new Date(),
      };
    }
    await patient.save();

    return res.status(200).json({
      success: true,
      message: `Triage priority updated to ${triageStatus}`,
      data: patient,
    });
  } catch (error) {
    console.error('Error in updateTriageStatus:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update triage status',
      error: error.message,
    });
  }
};

/**
 * Update patient workflow status
 */
exports.updatePatientStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const patient = await Patient.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message,
    });
  }
};

/**
 * Seed realistic OPD demo patients for immediate testing
 */
exports.seedDemoData = async (req, res) => {
  try {
    // Clear previous demo records if requested
    if (req.query.clear === 'true') {
      await Patient.deleteMany({});
      await CaseHistory.deleteMany({});
      await Document.deleteMany({});
    }

    const demoPatients = [
      {
        name: 'Rajesh Sharma',
        age: 58,
        gender: 'Male',
        phone: '+91 98112 34567',
        address: 'Sector 14, Rohini, New Delhi',
        emergencyContact: '+91 98112 34568 (Son)',
        abhaId: '91-8841-2940-1042',
        abhaAddress: 'rajesh.sharma58@abdm',
        preferredLanguage: 'hi',
        department: 'Cardiology',
        opdToken: 'OPD-CRD-101',
        triageStatus: 'EMERGENCY',
        redFlagAlert: {
          isRedFlag: true,
          flags: ['CARDIAC_EMERGENCY', 'HIGH_SEVERITY_SCORE'],
          reason: 'Severe retrosternal chest pain radiating to left arm and jaw with cold sweating',
          detectedAt: new Date(),
        },
        consent: {
          consented: true,
          audioConsentGiven: true,
          consentTimestamp: new Date(),
          dpdpaCompliant: true,
        },
        status: 'INTAKE_COMPLETED',
      },
      {
        name: 'Ananya Patel',
        age: 34,
        gender: 'Female',
        phone: '+91 94231 78901',
        address: 'Navrangpura, Ahmedabad, Gujarat',
        emergencyContact: '+91 94231 78902 (Husband)',
        abhaId: '91-3142-9901-4458',
        abhaAddress: 'ananya.ayur@abdm',
        preferredLanguage: 'en',
        department: 'AYUSH / Ayurveda',
        opdToken: 'OPD-AYU-205',
        triageStatus: 'ROUTINE',
        redFlagAlert: { isRedFlag: false, flags: [], reason: '' },
        consent: {
          consented: true,
          audioConsentGiven: true,
          consentTimestamp: new Date(),
          dpdpaCompliant: true,
        },
        status: 'INTAKE_COMPLETED',
      },
      {
        name: 'Vikram Rao',
        age: 62,
        gender: 'Male',
        phone: '+91 98450 12345',
        address: 'Jayanagar, Bengaluru, Karnataka',
        emergencyContact: '+91 98450 12346',
        abhaId: '91-7712-4091-6623',
        abhaAddress: 'vikram.rao62@abdm',
        preferredLanguage: 'en',
        department: 'General Medicine',
        opdToken: 'OPD-GEN-308',
        triageStatus: 'URGENT',
        redFlagAlert: {
          isRedFlag: false,
          flags: ['CRITICAL_PAIN_SCORE', 'HIGH_SEVERITY_SCORE'],
          reason: 'Uncontrolled blood sugar (FBS 268 mg/dL) with progressive bilateral lower limb numbness',
          detectedAt: new Date(),
        },
        consent: {
          consented: true,
          audioConsentGiven: false,
          consentTimestamp: new Date(),
          dpdpaCompliant: true,
        },
        status: 'INTAKE_COMPLETED',
      },
      {
        name: 'Sunita Devi',
        age: 45,
        gender: 'Female',
        phone: '+91 91234 56789',
        address: 'Kalyani, Nadia, West Bengal',
        emergencyContact: '+91 91234 56780',
        abhaId: '91-5509-1284-8831',
        abhaAddress: 'sunita.devi45@abdm',
        preferredLanguage: 'bn',
        department: 'Pulmonology',
        opdToken: 'OPD-PUL-412',
        triageStatus: 'ROUTINE',
        redFlagAlert: { isRedFlag: false, flags: [], reason: '' },
        consent: {
          consented: true,
          audioConsentGiven: true,
          consentTimestamp: new Date(),
          dpdpaCompliant: true,
        },
        status: 'WAITING_INTAKE',
      },
    ];

    const createdPatients = await Patient.create(demoPatients);

    // Create CaseHistories for the first 3 patients
    // 1. Rajesh Sharma (Emergency)
    await CaseHistory.create({
      patientId: createdPatients[0]._id,
      chiefComplaints: [
        { symptom: 'Severe retrosternal chest tightness and crushing pain', duration: '2 hours', severity: 9 },
        { symptom: 'Cold profuse sweating and shortness of breath', duration: '1 hour', severity: 8 },
      ],
      hpi: {
        site: 'Substernal / central chest',
        onset: 'Sudden onset while walking upstairs, progressive',
        character: 'Heavy crushing pressure like elephant sitting on chest',
        radiation: 'Radiating to left shoulder, inner left arm and jaw',
        associatedSymptoms: ['Diaphoresis', 'Nausea', 'Dyspnea'],
        timingDuration: 'Constant for 2 hours, worsening',
        exacerbatingRelieving: 'Aggravated by any movement; no relief with rest',
        severityScore: 9,
      },
      pastMedicalHistory: {
        conditions: ['Hypertension (8 years)', 'Dyslipidemia (4 years)'],
        surgeries: ['None'],
        hospitalizations: 'None prior',
        notes: 'Irregular compliance with antihypertensives',
      },
      medicationHistory: [
        { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily in morning', adherence: 'Irregular' },
        { name: 'Atorvastatin', dosage: '10mg', frequency: 'Once at night', adherence: 'Regular' },
      ],
      allergyHistory: [
        { allergen: 'Penicillin', reaction: 'Urticarial rash and itching', severity: 'Moderate' },
      ],
      familyHistory: {
        cardiovascular: true,
        diabetes: true,
        hypertension: true,
        notes: 'Father had myocardial infarction at age 52',
      },
      personalLifestyleHistory: {
        diet: 'Vegetarian',
        smoking: 'Former',
        alcohol: 'Non-drinker',
        physicalActivity: 'Sedentary',
        sleepHours: 6,
        stressLevel: 'High',
      },
      reviewOfSystems: {
        cardiovascular: ['Chest pain', 'Palpitations', 'Cold sweats'],
        respiratory: ['Dyspnea on exertion'],
        gastrointestinal: ['Nausea'],
        neurological: [],
        musculoskeletal: [],
        genitourinary: [],
        dermatological: [],
      },
      aiSummary: {
        chiefComplaintHpi: '58yo male presenting with acute 2-hour sudden-onset substernal crushing chest pain (severity 9/10) radiating to left arm and jaw, accompanied by diaphoresis and dyspnea.',
        pastMedicalMeds: 'History of Hypertension and Dyslipidemia on Amlodipine 5mg OD and Atorvastatin 10mg. Reports irregular adherence.',
        allergiesRiskFactors: 'Known allergy to Penicillin (rash). High cardiovascular risk: strong paternal MI history, former smoker, sedentary lifestyle.',
        systemicReviewNotes: 'Positive for nausea, diaphoresis, dyspnea. Negative for syncope, hemoptysis, fever.',
        triageRecommendation: 'EMERGENCY RED FLAG: High suspicion of Acute STEMI / ACS. Immediate ECG, cardiac monitors, IV access, oxygenation, and Cardiology alert required.',
        fullStructuredSummary: `PATIENT CASE SUMMARY [EMERGENCY TRIAGE]
------------------------------------------------------
Patient: Rajesh Sharma | Age/Sex: 58M | ABHA: 91-8841-2940-1042
Token: OPD-CRD-101 | Department: Cardiology | Triage: EMERGENCY 🚨

1. CHIEF COMPLAINTS:
   - Severe substernal crushing chest pain x 2 hours (Severity: 9/10)
   - Cold sweating (diaphoresis) and dyspnea x 1 hour

2. HISTORY OF PRESENT ILLNESS (SOCRATES):
   - Site: Retrosternal / Precordial
   - Onset: Sudden onset 2 hours ago while climbing stairs
   - Character: Heavy crushing, constricting pressure
   - Radiation: Radiates along left arm to medial digits and left angle of jaw
   - Associated: Cold clammy perspiration, nausea, dyspnea
   - Timing: Continuous, escalating in severity
   - Exacerbating/Relieving: Unrelieved by rest, worsening
   - Severity: 9/10

3. PAST MEDICAL & SURGICAL:
   - Hypertension (8 yrs, poor compliance)
   - Dyslipidemia (4 yrs)

4. MEDICATIONS & ALLERGIES:
   - Current: Amlodipine 5mg OD, Atorvastatin 10mg HS
   - ALLERGIES: PENICILLIN (Moderate rash) ⚠️

5. FAMILY & SOCIAL HISTORY:
   - Strong family history of CAD (Father died of MI at 52)
   - Former smoker (15 pack-years, stopped 3 yrs ago)

6. REVIEW OF SYSTEMS:
   - CVS: Chest pain, cold diaphoresis (+). Resp: Dyspnea (+). GI: Nausea (+).

7. URGENT TRIAGE ACTION:
   - Stat 12-lead ECG, Troponin I, Aspirin 300mg + Clopidogrel 300mg loading as per protocol. Immediate doctor consultation.`,
      },
      physicianReview: {
        reviewed: false,
        doctorName: 'Dr. Consultation Physician',
        doctorNotes: '',
        clinicalDiagnosis: '',
        prescription: [],
      },
    });

    // 2. Ananya Patel (AYUSH Ayurveda OPD)
    await CaseHistory.create({
      patientId: createdPatients[1]._id,
      chiefComplaints: [
        { symptom: 'Chronic indigestion (Ajeerna), bloating, and irregular bowel movements', duration: '6 months', severity: 6 },
        { symptom: 'Mild generalized joint stiffness and morning fatigue', duration: '3 months', severity: 5 },
      ],
      hpi: {
        site: 'Epigastric and periumbilical abdomen',
        onset: 'Insidious onset, worse after irregular meals and travel',
        character: 'Dull cramping, distension and heaviness after eating',
        radiation: 'No radiation',
        associatedSymptoms: ['Bloating', 'Sluggish digestion', 'Belching', 'Dry skin'],
        timingDuration: 'Post-prandial heaviness lasting 3-4 hours',
        exacerbatingRelieving: 'Worse with dry/cold foods, late dinners; relieved by warm water',
        severityScore: 6,
      },
      pastMedicalHistory: {
        conditions: ['Irritable Bowel Syndrome (mild)', 'Cervical Spondylosis (mild)'],
        surgeries: ['None'],
        hospitalizations: 'None',
        notes: 'Frequent irregular meal times due to corporate work',
      },
      medicationHistory: [
        { name: 'Triphala Churna', dosage: '3g', frequency: 'At bedtime with warm water', adherence: 'Intermittent' },
      ],
      allergyHistory: [],
      familyHistory: {
        diabetes: true,
        hypertension: false,
        notes: 'Mother has Type 2 Diabetes',
      },
      personalLifestyleHistory: {
        diet: 'Vegetarian',
        smoking: 'Never',
        alcohol: 'Non-drinker',
        physicalActivity: 'Sedentary',
        sleepHours: 5.5,
        stressLevel: 'High',
      },
      reviewOfSystems: {
        cardiovascular: [],
        respiratory: [],
        gastrointestinal: ['Abdominal bloating', 'Constipation / Irregular stool', 'Belching'],
        neurological: ['Mild tension headaches when stressed'],
        musculoskeletal: ['Morning joint stiffness'],
        genitourinary: [],
        dermatological: ['Dryness of skin'],
      },
      ayushAssessment: {
        isAyush: true,
        prakriti: {
          dominantDosha: 'Vata-Pitta',
          vataScore: 8,
          pittaScore: 6,
          kaphaScore: 2,
          traits: ['Light frame', 'Dry skin', 'Variable appetite', 'Quick mind', 'Sensitivity to cold'],
        },
        vikriti: 'Vata-Pradhana Pittanubandhi Jatharagni Mandya with Ama accumulation',
        agni: 'Vishama (Irregular/Vata)',
        koshtha: 'Krura (Hard/Vata)',
        dashavidhaPariksha: {
          sara: 'Madhyama (Twak/Asthi Madhyama)',
          samhanana: 'Madhyama',
          pramana: 'Prakrita (Normal anthropometry)',
          satmya: 'Katu-Tikta Satmya',
          sattva: 'Madhyama Sattva (Stress prone)',
          aharaShakti: 'Avara to Madhyama (Impaired digestion & intake capacity)',
          vyayamaShakti: 'Avara (Fatigues quickly)',
          vaya: 'Madhyama Vaya (Youth/Adulthood - 34 yrs)',
        },
        aharaVihara: {
          dietaryHabits: 'Irregular meal timings, skipping breakfast, excess dry snacks (Ruksha Ahara)',
          dailyRoutine: 'Late night sleep (1 AM), inadequate hydration, high screen time',
          sleepQuality: 'Disturbed, unrefreshing sleep with vivid dreams',
          seasonalAdjustment: 'Aggravation noted during Varsha/Sharad Ritu transition',
        },
        nidana: 'Vishamashana, Adhyashana, Ratrijagarana, Vega Vidharana (Suppression of urges)',
        samprapti: 'Apana Vata Pratilomata leading to Agnimandya, Ama formation, and Kosthabaddhata',
      },
      aiSummary: {
        chiefComplaintHpi: '34yo female presenting with 6-month history of Ajeerna (chronic dyspepsia), post-prandial distension, and Krura Koshtha (constipation) coupled with morning fatigue.',
        pastMedicalMeds: 'Known history of functional bowel irregularities. Takes intermittent Triphala Churna.',
        allergiesRiskFactors: 'No known allergies. Risk factors include Vishamashana (erratic meal schedule) and Ratrijagarana (sleep deprivation).',
        ayushSynthesis: 'Prakriti: Vata-Pitta. Vikriti: Vata-Pitta with Agnimandya and Sama condition. Dashavidha parameters indicate Madhyama Dhatu Sara, Vishama Agni, Krura Koshtha, and Avara Ahara-Vyayama Shakti.',
        triageRecommendation: 'ROUTINE AYUSH OPD: Indicated for Deepana-Pachana therapy followed by Vatanulomana and Dinacharya lifestyle corrections.',
        fullStructuredSummary: `AYURVEDIC CLINICAL CASE SUMMARY [DASHVIDHA PARIKSHA]
------------------------------------------------------
Patient: Ananya Patel | Age/Sex: 34F | ABHA: 91-3142-9901-4458
Token: OPD-AYU-205 | Department: AYUSH / Ayurveda | Triage: ROUTINE 🌿

1. PRADHANA VEDANA (CHIEF COMPLAINTS):
   - Ajeerna (Indigestion), Adhmana (Abdominal bloating) x 6 months (Severity: 6/10)
   - Sandhi Graha (Joint stiffness) and Klama (Fatigue) x 3 months

2. HPI (SAMPRAPTI VIVARANA):
   - Epigastric fullness 30 mins after food; relieved by Ushnodaka (warm water)
   - Agni: Vishama Agni (erratic appetite)
   - Koshtha: Krura Koshtha (irregular, dry, hard stools once in 2-3 days)

3. AYURVEDIC DASHVIDHA PARIKSHA:
   - Prakriti: Vata-Pitta Dvandvaja
   - Vikriti: Vata Prakopa with Pitta Anubandha (Ama Dosha)
   - Sara: Madhyama | Samhanana: Madhyama | Pramana: Normal
   - Satmya: Madhyama | Sattva: Madhyama (anxiety-prone)
   - Ahara Shakti: Abhyavaharana (Madhyama), Jarana Shakti (Avara)
   - Vyayama Shakti: Avara | Vaya: Madhyama (34 yrs)

4. AHARA-VIHARA (ETIOLOGICAL NIDANA):
   - Irregular meals (Vishamashana), excess dry bakery items (Ruksha Ahara)
   - Night awakenings (Ratrijagarana, sleep 5.5 hrs), sedentary desk work

5. SUGGESTED CHIKITSA PRINCIPLE:
   - Deepana-Pachana (Hingwashtak / Chitrakadi)
   - Vatanulomana & Koshtha Shuddhi (Haritaki / Castor oil micro-dosing)
   - Ahara-Vihara counseling (Warm cooked meals, fixed schedule, Abhyanga)`,
      },
      physicianReview: {
        reviewed: false,
        doctorName: 'Vaidya / AYUSH Specialist',
        doctorNotes: '',
        clinicalDiagnosis: '',
        prescription: [],
      },
    });

    // 3. Vikram Rao (Urgent Diabetes with Diabetic Neuropathy)
    await CaseHistory.create({
      patientId: createdPatients[2]._id,
      chiefComplaints: [
        { symptom: 'Burning tingling sensation and numbness in both feet (glove-and-stocking pattern)', duration: '4 months', severity: 7 },
        { symptom: 'Extreme thirst (polydipsia) and nocturnal frequent urination', duration: '3 weeks', severity: 6 },
      ],
      hpi: {
        site: 'Bilateral feet up to mid-calf',
        onset: 'Gradual progressive onset over 4 months, worsening nocturnal burning',
        character: 'Pins and needles, burning dysesthesia, feeling of walking on cotton',
        radiation: 'Ascending from toes to ankles',
        associatedSymptoms: ['Polyuria (4-5 times at night)', 'Polydipsia', 'Generalized weakness'],
        timingDuration: 'Constant, more troublesome during sleep',
        exacerbatingRelieving: 'Worse when covered in blanket at night; partial relief on cool floor',
        severityScore: 7,
      },
      pastMedicalHistory: {
        conditions: ['Type 2 Diabetes Mellitus (12 years)', 'Dyslipidemia (6 years)', 'Obesity Grade 1'],
        surgeries: ['None'],
        hospitalizations: 'None',
        notes: 'Last HbA1c 8 months ago was 9.4%',
      },
      medicationHistory: [
        { name: 'Metformin', dosage: '1000mg', frequency: 'Twice daily', adherence: 'Regular' },
        { name: 'Glimepiride', dosage: '2mg', frequency: 'Once daily before breakfast', adherence: 'Regular' },
      ],
      allergyHistory: [
        { allergen: 'Sulfa Drugs', reaction: 'Skin eruptions', severity: 'Moderate' },
      ],
      familyHistory: {
        diabetes: true,
        hypertension: true,
        notes: 'Both parents had Type 2 Diabetes and nephropathy',
      },
      personalLifestyleHistory: {
        diet: 'Vegetarian',
        smoking: 'Never',
        alcohol: 'Occasional',
        physicalActivity: 'Sedentary',
        sleepHours: 5,
        stressLevel: 'Moderate',
      },
      reviewOfSystems: {
        cardiovascular: [],
        respiratory: [],
        gastrointestinal: [],
        neurological: ['Bilateral feet numbness and burning dysesthesia'],
        musculoskeletal: ['Leg muscle cramps at night'],
        genitourinary: ['Nocturia x 4-5 times/night', 'Occasional urgency'],
        dermatological: ['Dry cracked heels'],
      },
      aiSummary: {
        chiefComplaintHpi: '62yo male with 12-yr T2D presenting with subacute ascending bilateral foot burning, numbness and paresthesias along with recent osmotic symptoms (polyuria, polydipsia).',
        pastMedicalMeds: 'T2D on dual oral hypoglycemics (Metformin + Glimepiride). Known allergy to Sulfa drugs. Longstanding glycemic dysregulation.',
        allergiesRiskFactors: 'Sulfa allergy. High risk of Diabetic Microvascular Complications (Peripheral Neuropathy, suspect Nephropathy).',
        systemicReviewNotes: 'Positive for nocturia, dysesthesia, and lower extremity cramping. Negative for claudication or non-healing ulcers.',
        triageRecommendation: 'URGENT OPD: Fasting Blood Sugar, HbA1c, Serum Creatinine, Urine Microalbumin, monofilament sensory testing, and medication titration needed.',
        fullStructuredSummary: `PATIENT CASE SUMMARY [URGENT CLINICAL REVIEW]
------------------------------------------------------
Patient: Vikram Rao | Age/Sex: 62M | ABHA: 91-7712-4091-6623
Token: OPD-GEN-308 | Department: General Medicine | Triage: URGENT ⚠️

1. CHIEF COMPLAINTS:
   - Symmetrical burning paresthesias & numbness in bilateral feet x 4 months (Severity: 7/10)
   - Osmotic symptoms (Polydipsia, Nocturia x 5) x 3 weeks

2. HPI (SOCRATES):
   - Site: Bilateral lower extremities, distal stocking distribution
   - Onset: Insidious, slowly progressive over 4 months
   - Character: Burning dysesthesia, electric sensation, reduced thermal sensation
   - Associated: Nocturia, profound dry mouth, leg cramps
   - Timing: Continuous with nocturnal exacerbation
   - Severity: 7/10

3. PAST MEDICAL & MEDICATIONS:
   - Type 2 Diabetes Mellitus x 12 yrs (Poor control, historical HbA1c > 9%)
   - Current meds: Metformin 1g BD, Glimepiride 2mg OD
   - ALLERGY: SULFA DRUGS (Skin eruption) ⚠️

4. CLINICAL IMPRESSION:
   - Uncontrolled T2DM with Diabetic Sensorimotor Polyneuropathy.
   - Rule out early diabetic nephropathy and peripheral arterial disease.`,
      },
      physicianReview: {
        reviewed: false,
        doctorName: 'Dr. Consultation Physician',
        doctorNotes: '',
        clinicalDiagnosis: '',
        prescription: [],
      },
    });

    // Create sample digitized documents for Vikram Rao (showing abnormal lab reports)
    await Document.create({
      patientId: createdPatients[2]._id,
      docType: 'Lab Report',
      fileName: 'Biochemistry_Report_Recent.jpg',
      filePath: 'uploads/sample_lab_report.jpg',
      fileUrl: '/uploads/sample_lab_report.jpg',
      mimeType: 'image/jpeg',
      fileSize: 245100,
      documentDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      ocrStatus: 'COMPLETED',
      ocrRawText: `METROPOLIS HEALTH LABS - PATIENT BIOCHEMISTRY PROFILE
Patient Name: Vikram Rao | Age/Gender: 62 Y / Male
FASTING BLOOD GLUCOSE: 268 mg/dL [Ref: 70 - 99] HIGH
POST-PRANDIAL BLOOD GLUCOSE: 342 mg/dL [Ref: < 140] HIGH
HbA1c (GLYCOSYLATED HEMOGLOBIN): 9.8 % [Ref: < 5.7] HIGH
SERUM CREATININE: 1.5 mg/dL [Ref: 0.7 - 1.2] HIGH
SERUM URIC ACID: 7.2 mg/dL [Ref: 3.4 - 7.0] HIGH
TOTAL CHOLESTEROL: 215 mg/dL [Ref: < 200] HIGH
HEMOGLOBIN: 12.8 g/dL [Ref: 13.0 - 17.0] LOW`,
      structuredData: {
        diagnoses: ['Uncontrolled Hyperglycemia', 'Elevated Serum Creatinine'],
        medications: [],
        labResults: [
          { parameter: 'Fasting Blood Glucose', value: 268, unit: 'mg/dL', referenceRange: '70 - 99', isAbnormal: true, flagDirection: 'HIGH' },
          { parameter: 'Post-Prandial Glucose', value: 342, unit: 'mg/dL', referenceRange: '< 140', isAbnormal: true, flagDirection: 'HIGH' },
          { parameter: 'HbA1c', value: 9.8, unit: '%', referenceRange: '< 5.7', isAbnormal: true, flagDirection: 'HIGH' },
          { parameter: 'Serum Creatinine', value: 1.5, unit: 'mg/dL', referenceRange: '0.7 - 1.2', isAbnormal: true, flagDirection: 'HIGH' },
          { parameter: 'Serum Uric Acid', value: 7.2, unit: 'mg/dL', referenceRange: '3.4 - 7.0', isAbnormal: true, flagDirection: 'HIGH' },
          { parameter: 'Hemoglobin', value: 12.8, unit: 'g/dL', referenceRange: '13.0 - 17.0', isAbnormal: true, flagDirection: 'LOW' },
        ],
      },
      abnormalCount: 6,
      warnings: [
        'CRITICAL: Fasting Glucose 268 mg/dL significantly above target',
        'ALERT: Serum Creatinine 1.5 mg/dL indicates potential renal impairment',
      ],
      chronologicalIndex: 1,
    });

    return res.status(200).json({
      success: true,
      message: 'Successfully seeded realistic OPD patients and clinical records',
      count: createdPatients.length,
      patients: createdPatients,
    });
  } catch (error) {
    console.error('Error seeding demo data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed demo data',
      error: error.message,
    });
  }
};

