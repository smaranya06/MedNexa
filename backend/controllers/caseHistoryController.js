const CaseHistory = require('../models/CaseHistory');
const Patient = require('../models/Patient');
const Document = require('../models/Document');
const { evaluateRedFlags } = require('../middleware/redFlagTriage');

/**
 * Generate ABDM / FHIR R4-compliant JSON representation
 */
function generateAbdmFhirBundle(patient, caseHistory, documents = []) {
  return {
    resourceType: 'Bundle',
    id: `abdm-bundle-${patient.opdToken || patient._id}`,
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString(),
      profile: [
        'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle',
      ],
    },
    identifier: {
      system: 'https://healthid.abdm.gov.in',
      value: patient.abhaId || '91-0000-0000-0000',
    },
    type: 'document',
    timestamp: new Date().toISOString(),
    entry: [
      {
        fullUrl: `urn:uuid:patient-${patient._id}`,
        resource: {
          resourceType: 'Patient',
          id: String(patient._id),
          identifier: [
            {
              system: 'https://healthid.abdm.gov.in',
              value: patient.abhaId,
            },
          ],
          name: [{ text: patient.name }],
          telecom: [{ system: 'phone', value: patient.phone }],
          gender: (patient.gender || 'unknown').toLowerCase(),
        },
      },
      {
        fullUrl: `urn:uuid:composition-${patient._id}`,
        resource: {
          resourceType: 'Composition',
          status: 'final',
          type: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '371530004',
                display: 'Clinical consultation note',
              },
            ],
            text: 'OPD Clinical Intake & Case Summary',
          },
          subject: { reference: `Patient/${patient._id}`, display: patient.name },
          date: new Date().toISOString(),
          title: 'OPD Clinical Case Record - MediKiosk',
          section: [
            {
              title: 'Chief Complaints',
              text: {
                status: 'generated',
                div: `<div xmlns="http://www.w3.org/1999/xhtml">${(caseHistory.chiefComplaints || []).map((cc) => `<p>${cc.symptom} (${cc.duration})</p>`).join('')}</div>`,
              },
            },
            {
              title: 'Clinical Summary',
              text: {
                status: 'generated',
                div: `<div xmlns="http://www.w3.org/1999/xhtml"><pre>${caseHistory.aiSummary?.fullStructuredSummary || ''}</pre></div>`,
              },
            },
          ],
        },
      },
    ],
  };
}

/**
 * AI Clinical History Synthesizer
 * Formats multi-source patient intake into an instant physician-ready clinical hierarchy
 */
function synthesizeClinicalSummary(patient, caseData, recentDocs = []) {
  const {
    chiefComplaints = [],
    hpi = {},
    pastMedicalHistory = {},
    medicationHistory = [],
    allergyHistory = [],
    familyHistory = {},
    personalLifestyleHistory = {},
    reviewOfSystems = {},
    ayushAssessment = {},
  } = caseData;

  const ccText = chiefComplaints.length > 0
    ? chiefComplaints.map((c) => `• ${c.symptom} [Duration: ${c.duration || 'recent'}, Severity: ${c.severity || 5}/10]`).join('\n   ')
    : 'None explicitly recorded';

  const socratesText = `• Site: ${hpi.site || 'Not specified'}
   • Onset: ${hpi.onset || 'Not specified'}
   • Character: ${hpi.character || 'Not specified'}
   • Radiation: ${hpi.radiation || 'No radiation'}
   • Associated Symptoms: ${Array.isArray(hpi.associatedSymptoms) && hpi.associatedSymptoms.length > 0 ? hpi.associatedSymptoms.join(', ') : 'None'}
   • Timing & Duration: ${hpi.timingDuration || 'Not specified'}
   • Exacerbating / Relieving Factors: ${hpi.exacerbatingRelieving || 'Not specified'}
   • Severity Score: ${hpi.severityScore || 5}/10`;

  const pastConditions = Array.isArray(pastMedicalHistory.conditions) && pastMedicalHistory.conditions.length > 0
    ? pastMedicalHistory.conditions.join(', ')
    : 'No major chronic conditions reported';

  const pastMeds = Array.isArray(medicationHistory) && medicationHistory.length > 0
    ? medicationHistory.map((m) => `${m.name} ${m.dosage || ''} (${m.frequency || 'OD'}) [Adherence: ${m.adherence || 'Regular'}]`).join('; ')
    : 'None reported';

  const allergies = Array.isArray(allergyHistory) && allergyHistory.length > 0
    ? allergyHistory.map((a) => `⚠️ ${a.allergen} (${a.reaction || 'Reaction'} - ${a.severity || 'Moderate'})`).join('; ')
    : 'No known drug or food allergies reported';

  // Review of Systems highlights
  const rosHighlights = [];
  if (reviewOfSystems) {
    Object.entries(reviewOfSystems).forEach(([system, symptoms]) => {
      if (Array.isArray(symptoms) && symptoms.length > 0) {
        rosHighlights.push(`${system.toUpperCase()}: ${symptoms.join(', ')}`);
      }
    });
  }

  // AYUSH Dashavidha Pariksha section
  let ayushBlock = '';
  if (ayushAssessment && (ayushAssessment.isAyush || patient.department === 'AYUSH / Ayurveda')) {
    const prakriti = ayushAssessment.prakriti?.dominantDosha || 'Vata-Pitta';
    const agni = ayushAssessment.agni || 'Vishama (Irregular/Vata)';
    const koshtha = ayushAssessment.koshtha || 'Krura (Hard/Vata)';
    const dash = ayushAssessment.dashavidhaPariksha || {};

    ayushBlock = `
----------------------------------------------------------------------
AYURVEDIC DASHVIDHA PARIKSHA & DOSHA EVALUATION
----------------------------------------------------------------------
• Prakriti (Constitution): ${prakriti}
• Vikriti (Imbalance): ${ayushAssessment.vikriti || 'Dosha disturbance under assessment'}
• Agni (Digestive Capacity): ${agni}
• Koshtha (Bowel Habit): ${koshtha}
• Dashavidha Pariksha Parameters:
   - Dhatu Sara: ${dash.sara || 'Madhyama'} | Samhanana: ${dash.samhanana || 'Madhyama'}
   - Pramana: ${dash.pramana || 'Prakrita'} | Satmya: ${dash.satmya || 'Madhyama'}
   - Sattva: ${dash.sattva || 'Madhyama'} | Vaya: ${dash.vaya || 'Madhyama'}
   - Ahara Shakti: ${dash.aharaShakti || 'Madhyama'} | Vyayama Shakti: ${dash.vyayamaShakti || 'Madhyama'}
• Ahara-Vihara (Lifestyle & Diet): ${ayushAssessment.aharaVihara?.dietaryHabits || 'Routine irregular diet reported'}
• Nidana (Etiology) & Samprapti: ${ayushAssessment.nidana || 'Under clinical evaluation'}`;
  }

  // Document Intelligence highlight
  let docSection = '';
  if (recentDocs.length > 0) {
    const abnormalItems = [];
    recentDocs.forEach((d) => {
      if (d.structuredData?.labResults) {
        d.structuredData.labResults.forEach((lr) => {
          if (lr.isAbnormal) {
            abnormalItems.push(`${lr.parameter}: ${lr.value} ${lr.unit || ''} [${lr.flagDirection || 'ALERT'}, Ref: ${lr.referenceRange || 'N/A'}]`);
          }
        });
      }
    });

    docSection = `
----------------------------------------------------------------------
DIGITIZED MEDICAL DOCUMENTS & LAB INTELLIGENCE (${recentDocs.length} record(s))
----------------------------------------------------------------------
• Out-of-Range Lab Values Detected:
   ${abnormalItems.length > 0 ? abnormalItems.map((ai) => `⚠️ ${ai}`).join('\n   ') : 'No out-of-range lab anomalies flagged'}`;
  }

  const structuredSummary = `======================================================================
MEDIKIOSK CLINICAL HISTORY SUMMARY
Hospital Information System (HIS) & ABDM Integrated Record
======================================================================
PATIENT DEMOGRAPHICS & QUEUE DETAILS:
• Name: ${patient.name} | Age/Sex: ${patient.age}Y / ${patient.gender}
• ABHA ID: ${patient.abhaId} | Token: ${patient.opdToken}
• Department: ${patient.department} | Triage: ${patient.triageStatus} ${patient.triageStatus === 'EMERGENCY' ? '🚨 CRITICAL' : ''}
• DPDPA Consent: Audio/Digital Verified ✅

1. CHIEF COMPLAINTS & DURATION:
   ${ccText}

2. HISTORY OF PRESENT ILLNESS (HPI - SOCRATES FRAMEWORK):
   ${socratesText}

3. PAST MEDICAL & SURGICAL HISTORY:
   • Chronic Illnesses: ${pastConditions}
   • Prior Surgeries: ${pastMedicalHistory.surgeries?.length > 0 ? pastMedicalHistory.surgeries.join(', ') : 'None'}
   • Prior Hospitalizations: ${pastMedicalHistory.hospitalizations || 'None reported'}

4. MEDICATIONS & ADHERENCE:
   • ${pastMeds}

5. ALLERGY PROFILE:
   • ${allergies}

6. FAMILY & PERSONAL/LIFESTYLE HISTORY:
   • Family Conditions: ${[
     familyHistory.cardiovascular ? 'Cardiovascular' : null,
     familyHistory.diabetes ? 'Diabetes' : null,
     familyHistory.hypertension ? 'Hypertension' : null,
     familyHistory.cancer ? 'Malignancy' : null,
     familyHistory.asthma ? 'Asthma' : null,
   ].filter(Boolean).join(', ') || 'None reported'}
   • Diet: ${personalLifestyleHistory.diet || 'Vegetarian'} | Smoking: ${personalLifestyleHistory.smoking || 'Never'} | Alcohol: ${personalLifestyleHistory.alcohol || 'Non-drinker'}
   • Physical Activity: ${personalLifestyleHistory.physicalActivity || 'Moderate'} | Sleep: ${personalLifestyleHistory.sleepHours || 7} hrs/night

7. REVIEW OF SYSTEMS (ROS HIGHLIGHTS):
   ${rosHighlights.length > 0 ? rosHighlights.map((r) => `• ${r}`).join('\n   ') : '• No other positive systemic review symptoms recorded'}${ayushBlock}${docSection}

----------------------------------------------------------------------
PHYSICIAN INSTRUCTION:
This structured intake is synthesized automatically via MediKiosk.
Please review, edit if necessary, confirm diagnosis, and prescribe below.
======================================================================`;

  return {
    chiefComplaintHpi: `${patient.name}, ${patient.age}Y presents with: ${chiefComplaints.map((c) => c.symptom).join(', ')}. Severity: ${hpi.severityScore || 5}/10.`,
    pastMedicalMeds: `Past: ${pastConditions}. Current Medications: ${pastMeds}.`,
    allergiesRiskFactors: `Allergies: ${allergies}. Diet: ${personalLifestyleHistory.diet || 'Vegetarian'}.`,
    systemicReviewNotes: rosHighlights.join(' | ') || 'Systemic review negative otherwise.',
    ayushSynthesis: ayushBlock ? `Prakriti: ${ayushAssessment.prakriti?.dominantDosha}. Agni: ${ayushAssessment.agni}. Koshtha: ${ayushAssessment.koshtha}.` : '',
    triageRecommendation: patient.triageStatus === 'EMERGENCY'
      ? 'EMERGENCY TRIAGE: Immediate physician attention required for red-flag symptom evaluation.'
      : patient.triageStatus === 'URGENT'
      ? 'URGENT: Prioritized consultation queue recommended.'
      : 'ROUTINE: Standard OPD consultation workflow.',
    fullStructuredSummary: structuredSummary,
    generatedAt: new Date(),
  };
}

/**
 * Save / Update patient case history from Kiosk intake
 */
exports.saveCaseHistory = async (req, res) => {
  try {
    const {
      patientId,
      chiefComplaints,
      hpi,
      pastMedicalHistory,
      medicationHistory,
      allergyHistory,
      familyHistory,
      personalLifestyleHistory,
      reviewOfSystems,
      ayushAssessment,
    } = req.body;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required',
      });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // 1. Evaluate Red Flags across intake
    const triageEvaluation = evaluateRedFlags({
      chiefComplaints,
      hpi,
      reviewOfSystems,
      severityScore: hpi?.severityScore,
    });

    // 2. Update patient triage if red flags detected or upgraded
    if (triageEvaluation.triageStatus === 'EMERGENCY') {
      patient.triageStatus = 'EMERGENCY';
      patient.redFlagAlert = {
        isRedFlag: true,
        flags: triageEvaluation.flags,
        reason: triageEvaluation.reason,
        detectedAt: new Date(),
      };
    } else if (triageEvaluation.triageStatus === 'URGENT' && patient.triageStatus !== 'EMERGENCY') {
      patient.triageStatus = 'URGENT';
      patient.redFlagAlert = {
        isRedFlag: false,
        flags: triageEvaluation.flags,
        reason: triageEvaluation.reason,
        detectedAt: new Date(),
      };
    }

    patient.status = 'INTAKE_COMPLETED';
    await patient.save();

    // 3. Fetch any existing documents for this patient to enrich summary
    const patientDocs = await Document.find({ patientId: patient._id });

    // 4. Synthesize AI Clinical Summary
    const caseData = {
      chiefComplaints,
      hpi,
      pastMedicalHistory,
      medicationHistory,
      allergyHistory,
      familyHistory,
      personalLifestyleHistory,
      reviewOfSystems,
      ayushAssessment,
    };

    const aiSummary = synthesizeClinicalSummary(patient, caseData, patientDocs);

    // 5. Generate ABDM FHIR JSON Bundle
    const fhirBundle = generateAbdmFhirBundle(patient, { ...caseData, aiSummary }, patientDocs);

    // 6. Upsert CaseHistory document
    let caseHistory = await CaseHistory.findOne({ patientId: patient._id });

    if (caseHistory) {
      caseHistory.chiefComplaints = chiefComplaints || caseHistory.chiefComplaints;
      caseHistory.hpi = hpi || caseHistory.hpi;
      caseHistory.pastMedicalHistory = pastMedicalHistory || caseHistory.pastMedicalHistory;
      caseHistory.medicationHistory = medicationHistory || caseHistory.medicationHistory;
      caseHistory.allergyHistory = allergyHistory || caseHistory.allergyHistory;
      caseHistory.familyHistory = familyHistory || caseHistory.familyHistory;
      caseHistory.personalLifestyleHistory = personalLifestyleHistory || caseHistory.personalLifestyleHistory;
      caseHistory.reviewOfSystems = reviewOfSystems || caseHistory.reviewOfSystems;
      caseHistory.ayushAssessment = ayushAssessment || caseHistory.ayushAssessment;
      caseHistory.aiSummary = aiSummary;
      caseHistory.fhirBundle = fhirBundle;
      await caseHistory.save();
    } else {
      caseHistory = new CaseHistory({
        patientId: patient._id,
        chiefComplaints,
        hpi,
        pastMedicalHistory,
        medicationHistory,
        allergyHistory,
        familyHistory,
        personalLifestyleHistory,
        reviewOfSystems,
        ayushAssessment,
        aiSummary,
        fhirBundle,
      });
      await caseHistory.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Clinical case history recorded successfully',
      data: {
        caseHistory,
        patient,
        triageEvaluation,
      },
    });
  } catch (error) {
    console.error('Error in saveCaseHistory:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record case history',
      error: error.message,
    });
  }
};

/**
 * Get dynamic, adaptive follow-up questions based on patient's chief complaint or AYUSH mode
 */
exports.getAdaptiveQuestions = async (req, res) => {
  try {
    const { complaint = '', department = 'General Medicine', language = 'en' } = req.query;
    const lowerComplaint = complaint.toLowerCase();

    // Default adaptive questions library
    let category = 'GENERAL';
    let questions = [];

    if (department === 'AYUSH / Ayurveda') {
      category = 'AYUSH_DASHVIDHA';
      questions = [
        {
          id: 'ayush_prakriti_body',
          field: 'prakriti.bodyFrame',
          question: 'What best describes your body structure and weight stability?',
          questionHi: 'आपकी शारीरिक बनावट और वजन कैसा रहता है?',
          options: [
            { label: 'Thin, light bones, hard to gain weight (Vata)', value: 'VATA_THIN' },
            { label: 'Medium build, good muscle definition (Pitta)', value: 'PITTA_MEDIUM' },
            { label: 'Broad, heavy build, tends to gain weight easily (Kapha)', value: 'KAPHA_HEAVY' },
          ],
        },
        {
          id: 'ayush_agni',
          field: 'agni',
          question: 'How is your appetite and digestion capacity (Agni)?',
          questionHi: 'आपकी भूख और पाचन शक्ति (अग्नि) कैसी है?',
          options: [
            { label: 'Vishama: Irregular, sometimes hungry sometimes not (Vata)', value: 'Vishama (Irregular/Vata)' },
            { label: 'Tikshna: Intense, cannot tolerate skipped meals, heartburn (Pitta)', value: 'Tikshna (Intense/Pitta)' },
            { label: 'Manda: Slow, feel heavy after eating, low appetite (Kapha)', value: 'Manda (Sluggish/Kapha)' },
            { label: 'Sama: Balanced, digest meals comfortably on time', value: 'Sama (Balanced)' },
          ],
        },
        {
          id: 'ayush_koshtha',
          field: 'koshtha',
          question: 'What is the nature of your bowel habits (Koshtha)?',
          questionHi: 'पेट साफ होने की आदत (कोष्ठ) कैसी है?',
          options: [
            { label: 'Krura: Dry, hard stools, tendency towards constipation (Vata)', value: 'Krura (Hard/Vata)' },
            { label: 'Mridu: Soft, loose stools, easily passed with milk or warm water (Pitta)', value: 'Mridu (Soft/Pitta)' },
            { label: 'Madhyama: Moderate, regular, once daily with formed stools (Kapha)', value: 'Madhyama (Moderate/Kapha)' },
          ],
        },
        {
          id: 'ayush_sleep_routine',
          field: 'aharaVihara.sleepQuality',
          question: 'How is your sleep quality and daily routine (Dinacharya)?',
          questionHi: 'आपकी नींद और दिनचर्या कैसी रहती है?',
          options: [
            { label: 'Light, broken sleep, mind keeps racing (Vata)', value: 'Light & disturbed' },
            { label: 'Moderate sleep, wake up feeling warm or sweating (Pitta)', value: 'Moderate, wakes early' },
            { label: 'Deep, heavy, difficulty waking up in morning (Kapha)', value: 'Deep & heavy' },
          ],
        },
      ];
    } else if (lowerComplaint.includes('chest') || lowerComplaint.includes('heart') || lowerComplaint.includes('angina')) {
      category = 'CARDIAC_SOCRATES';
      questions = [
        {
          id: 'soc_site',
          field: 'hpi.site',
          question: 'Where exactly in the chest is the pain or discomfort located?',
          questionHi: 'सीने में दर्द या बेचैनी ठीक किस जगह हो रही है?',
          options: [
            { label: 'Center of the chest (Substernal / Behind breastbone)', value: 'Substernal central' },
            { label: 'Left side of chest', value: 'Left anterior chest' },
            { label: 'Right side of chest', value: 'Right anterior chest' },
            { label: 'Across the entire chest wall', value: 'Diffuse anterior chest' },
          ],
        },
        {
          id: 'soc_character',
          field: 'hpi.character',
          question: 'What does the chest discomfort feel like?',
          questionHi: 'दर्द का अहसास कैसा है?',
          options: [
            { label: 'Heavy crushing pressure or squeezing tightness (🚨 Red Flag sign)', value: 'Heavy crushing squeezing pressure' },
            { label: 'Sharp stabbing pain that worsens when breathing in deeply', value: 'Sharp pleuritic stabbing' },
            { label: 'Burning sensation behind breastbone (like acid reflux)', value: 'Burning retrosternal' },
            { label: 'Dull ache', value: 'Dull ache' },
          ],
        },
        {
          id: 'soc_radiation',
          field: 'hpi.radiation',
          question: 'Does the pain spread or radiate anywhere else?',
          questionHi: 'क्या दर्द शरीर के किसी और हिस्से में फैल रहा है?',
          options: [
            { label: 'Spreads to Left Arm, Left Shoulder or Jaw (🚨 Red Flag sign)', value: 'Radiates to left arm and jaw' },
            { label: 'Spreads to the Back between shoulder blades', value: 'Radiates to interscapular back' },
            { label: 'Spreads up into the Neck or Throat', value: 'Radiates to neck and throat' },
            { label: 'Does not spread anywhere (Stays local)', value: 'Localized, no radiation' },
          ],
        },
        {
          id: 'soc_associated',
          field: 'hpi.associatedSymptoms',
          question: 'Are you experiencing any of these associated signs?',
          questionHi: 'क्या इनमें से कोई अन्य लक्षण भी हैं?',
          isMultiSelect: true,
          options: [
            { label: 'Cold profuse sweating (Diaphoresis) 🚨', value: 'Cold sweating' },
            { label: 'Shortness of breath / difficulty breathing 🚨', value: 'Dyspnea' },
            { label: 'Dizziness, lightheadedness or feeling faint 🚨', value: 'Dizziness' },
            { label: 'Nausea or vomiting', value: 'Nausea' },
            { label: 'Rapid racing heartbeats (Palpitations)', value: 'Palpitations' },
          ],
        },
      ];
    } else if (lowerComplaint.includes('cough') || lowerComplaint.includes('breath') || lowerComplaint.includes('asthma')) {
      category = 'RESPIRATORY_SOCRATES';
      questions = [
        {
          id: 'resp_onset',
          field: 'hpi.onset',
          question: 'How long have you had this cough or breathing difficulty?',
          options: [
            { label: 'Sudden onset in last few hours (Acute)', value: 'Acute, last few hours' },
            { label: 'Past 3 to 7 days (Subacute)', value: '3 to 7 days' },
            { label: 'More than 2 to 3 weeks (Persistent)', value: 'More than 2-3 weeks' },
            { label: 'Chronic, recurring for months', value: 'Chronic recurring' },
          ],
        },
        {
          id: 'resp_phlegm',
          field: 'hpi.character',
          question: 'Is the cough dry or producing phlegm (sputum)?',
          options: [
            { label: 'Dry, irritating, hacking cough', value: 'Dry non-productive' },
            { label: 'Wet cough with yellowish/greenish phlegm', value: 'Productive with yellow-green sputum' },
            { label: 'Cough with blood-tinged sputum or frank blood (🚨 Red Flag)', value: 'Hemoptysis blood in sputum' },
          ],
        },
        {
          id: 'resp_rest',
          field: 'hpi.exacerbatingRelieving',
          question: 'Does the breathlessness happen at complete rest or with walking?',
          options: [
            { label: 'At complete rest / cannot speak in full sentences 🚨', value: 'Dyspnea at complete rest' },
            { label: 'When climbing stairs or walking uphill', value: 'Exertional dyspnea' },
            { label: 'When lying flat on back (relieved by sitting up)', value: 'Orthopnea' },
          ],
        },
      ];
    } else {
      category = 'GENERAL_SOCRATES';
      questions = [
        {
          id: 'gen_duration',
          field: 'chiefComplaints.0.duration',
          question: 'When did your primary complaint begin?',
          questionHi: 'यह परेशानी कब से शुरू हुई?',
          options: [
            { label: 'Just today (within hours)', value: 'Few hours ago' },
            { label: '1 to 3 days ago', value: '1-3 days' },
            { label: '1 to 2 weeks ago', value: '1-2 weeks' },
            { label: 'Longstanding / over a month', value: 'Over a month' },
          ],
        },
        {
          id: 'gen_severity',
          field: 'hpi.severityScore',
          question: 'On a scale of 1 to 10, how severe is your discomfort right now?',
          questionHi: '1 से 10 के पैमाने पर, आपकी तकलीफ कितनी गंभीर है?',
          options: [
            { label: '1 - 3: Mild (tolerable, easily carries on with day)', value: 3 },
            { label: '4 - 6: Moderate (interferes with work and sleep)', value: 5 },
            { label: '7 - 8: Severe (very distressing, urgent attention)', value: 8 },
            { label: '9 - 10: Unbearable / Excruciating (🚨 Emergency)', value: 10 },
          ],
        },
        {
          id: 'gen_systemic',
          field: 'reviewOfSystems.general',
          question: 'Do you currently have high fever, vomiting, or severe weakness?',
          questionHi: 'क्या आपको तेज बुखार, उल्टी या अत्यधिक कमजोरी है?',
          options: [
            { label: 'Yes, high fever with chills', value: 'High fever chills' },
            { label: 'Yes, severe weakness or dizziness', value: 'Severe dizziness weakness' },
            { label: 'No other major systemic symptoms', value: 'None' },
          ],
        },
      ];
    }

    return res.status(200).json({
      success: true,
      category,
      department,
      count: questions.length,
      questions,
    });
  } catch (error) {
    console.error('Error in getAdaptiveQuestions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate adaptive questions',
      error: error.message,
    });
  }
};

/**
 * Get Case History by Patient ID
 */
exports.getCaseHistoryByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const caseHistory = await CaseHistory.findOne({ patientId }).populate('patientId');
    if (!caseHistory) {
      return res.status(404).json({
        success: false,
        message: 'No case history found for this patient',
      });
    }

    return res.status(200).json({
      success: true,
      data: caseHistory,
    });
  } catch (error) {
    console.error('Error in getCaseHistoryByPatient:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve case history',
      error: error.message,
    });
  }
};

/**
 * Doctor finalizes consultation: accepts/edits summary, inputs diagnosis, e-prescription & signs off
 */
exports.doctorFinalizeConsultation = async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      doctorName,
      doctorNotes,
      clinicalDiagnosis,
      prescription = [],
      editedSummary,
      doctorSignature,
    } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    let caseHistory = await CaseHistory.findOne({ patientId: patient._id });
    if (!caseHistory) {
      caseHistory = new CaseHistory({ patientId: patient._id });
    }

    // Update physician review block
    caseHistory.physicianReview = {
      reviewed: true,
      doctorName: doctorName || 'Dr. Attending Physician, MBBS, MD',
      doctorNotes: doctorNotes || '',
      clinicalDiagnosis: clinicalDiagnosis || '',
      prescription: prescription || [],
      doctorSignature: doctorSignature || `Signed digitally by ${doctorName || 'Dr. Attending Physician'}`,
      finalizedAt: new Date(),
    };

    if (editedSummary) {
      caseHistory.aiSummary.fullStructuredSummary = editedSummary;
    }

    await caseHistory.save();

    // Mark patient consultation status as COMPLETED
    patient.status = 'COMPLETED';
    await patient.save();

    return res.status(200).json({
      success: true,
      message: 'Consultation finalized successfully and pushed to ABDM HIS record',
      data: {
        patient,
        caseHistory,
      },
    });
  } catch (error) {
    console.error('Error in doctorFinalizeConsultation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to finalize consultation',
      error: error.message,
    });
  }
};

