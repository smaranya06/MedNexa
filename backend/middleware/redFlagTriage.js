/**
 * Red-Flag Clinical Triage Rule Engine
 * Identifies life-threatening or time-critical emergency conditions
 * to immediately elevate triage status and notify OPD triage desk.
 */

const RED_FLAG_CRITERIA = [
  {
    category: 'CARDIAC_EMERGENCY',
    severity: 'EMERGENCY',
    reason: 'Possible Acute Coronary Syndrome (ACS) / Myocardial Infarction',
    keywords: [
      'chest pain',
      'chest tightness',
      'crushing chest',
      'pressure on chest',
      'radiating to left arm',
      'radiating to jaw',
      'sweating with chest pain',
      'left arm pain',
      'jaw pain',
      'angina',
    ],
    combinationCheck: (text, hpi) => {
      const hasChestPain = text.includes('chest') && (text.includes('pain') || text.includes('tightness') || text.includes('pressure') || text.includes('heaviness'));
      const hasRadiation = hpi?.radiation?.toLowerCase().includes('arm') || hpi?.radiation?.toLowerCase().includes('jaw') || text.includes('radiat');
      const hasDyspnea = text.includes('breath') || text.includes('dyspnea') || text.includes('sweat');
      return hasChestPain && (hasRadiation || hasDyspnea);
    },
  },
  {
    category: 'STROKE_FAST',
    severity: 'EMERGENCY',
    reason: 'Possible Acute Cerebrovascular Accident / Stroke (FAST Criteria)',
    keywords: [
      'facial droop',
      'face drooping',
      'arm weakness',
      'arm numbness',
      'slurred speech',
      'cannot speak',
      'loss of speech',
      'sudden weakness',
      'hemiparesis',
      'one side weak',
      'loss of consciousness',
      'fainting',
      'syncope',
    ],
    combinationCheck: (text) => {
      const hasSpeech = text.includes('slur') || text.includes('speech');
      const hasWeakness = text.includes('weak') || text.includes('numb') || text.includes('droop');
      return hasSpeech && hasWeakness;
    },
  },
  {
    category: 'RESPIRATORY_DISTRESS',
    severity: 'EMERGENCY',
    reason: 'Acute Respiratory Distress / Severe Hypoxia Threat',
    keywords: [
      'unable to breathe',
      'gasping for air',
      'stridor',
      'blue lips',
      'cyanosis',
      'choking',
      'severe breathlessness at rest',
      'wheezing unable to talk',
    ],
    combinationCheck: (text) => {
      return text.includes('gasping') || text.includes('blue lips') || text.includes('cannot breathe');
    },
  },
  {
    category: 'ACUTE_SURGICAL_ABDOMEN',
    severity: 'EMERGENCY',
    reason: 'Acute Abdomen / Suspected Perforation or Severe Hemorrhage',
    keywords: [
      'rigid abdomen',
      'board like abdomen',
      'vomiting blood',
      'hematemesis',
      'black tarry stool',
      'rectal bleeding severe',
      'blood in vomit',
      'sudden tearing pain',
    ],
  },
  {
    category: 'CNS_INFECTION_MENINGISMUS',
    severity: 'EMERGENCY',
    reason: 'Suspected Acute Meningitis / Severe CNS Infection',
    keywords: [
      'stiff neck with fever',
      'neck stiffness',
      'photophobia with fever',
      'high fever altered sensorium',
      'delirious fever',
    ],
    combinationCheck: (text) => {
      const hasFever = text.includes('fever') || text.includes('temperature');
      const hasNeck = text.includes('stiff neck') || text.includes('neck pain') || text.includes('confusion');
      return hasFever && hasNeck;
    },
  },
  {
    category: 'ANAPHYLAXIS',
    severity: 'EMERGENCY',
    reason: 'Severe Allergic Reaction / Anaphylaxis',
    keywords: [
      'swollen tongue',
      'throat closing',
      'swelling of lips and breathing problem',
      'anaphylaxis',
      'severe allergic reaction',
    ],
  },
  {
    category: 'SEVERE_PAIN_OR_HIGH_FEVER',
    severity: 'URGENT',
    reason: 'High Pain Crisis or Acute Infection requiring prioritized physician review',
    keywords: [
      'unbearable pain',
      'severe excruciating pain',
      'fever above 103',
      'persistent vomiting',
      'severe dehydration',
    ],
  },
];

/**
 * Analyze clinical case intake data for red flags
 * @param {Object} caseData
 * @returns {Object} { isRedFlag, triageStatus, flags, reason, actionRequired }
 */
function evaluateRedFlags(caseData = {}) {
  const { chiefComplaints = [], hpi = {}, reviewOfSystems = {}, severityScore } = caseData;

  // Aggregate all clinical narrative text for evaluation
  const narrativeParts = [];

  if (Array.isArray(chiefComplaints)) {
    chiefComplaints.forEach((cc) => {
      if (cc.symptom) narrativeParts.push(cc.symptom.toLowerCase());
    });
  }

  if (hpi) {
    if (hpi.site) narrativeParts.push(hpi.site.toLowerCase());
    if (hpi.character) narrativeParts.push(hpi.character.toLowerCase());
    if (hpi.radiation) narrativeParts.push(hpi.radiation.toLowerCase());
    if (hpi.onset) narrativeParts.push(hpi.onset.toLowerCase());
    if (Array.isArray(hpi.associatedSymptoms)) {
      narrativeParts.push(...hpi.associatedSymptoms.map((s) => String(s).toLowerCase()));
    }
  }

  if (reviewOfSystems && typeof reviewOfSystems === 'object') {
    Object.values(reviewOfSystems).forEach((sys) => {
      if (Array.isArray(sys)) {
        narrativeParts.push(...sys.map((s) => String(s).toLowerCase()));
      }
    });
  }

  const combinedNarrative = narrativeParts.join(' ');
  const triggeredEmergencyFlags = [];
  const triggeredUrgentFlags = [];
  let emergencyReason = '';

  for (const criterion of RED_FLAG_CRITERIA) {
    let matched = false;

    // Check keyword hits
    if (criterion.keywords) {
      for (const kw of criterion.keywords) {
        if (combinedNarrative.includes(kw.toLowerCase())) {
          matched = true;
          break;
        }
      }
    }

    // Check custom combinations
    if (!matched && criterion.combinationCheck) {
      if (criterion.combinationCheck(combinedNarrative, hpi)) {
        matched = true;
      }
    }

    if (matched) {
      if (criterion.severity === 'EMERGENCY') {
        triggeredEmergencyFlags.push(criterion.category);
        if (!emergencyReason) emergencyReason = criterion.reason;
      } else if (criterion.severity === 'URGENT') {
        triggeredUrgentFlags.push(criterion.category);
      }
    }
  }

  // Check numeric severity score (>= 8/10 escalates to at least URGENT)
  const maxSeverity = Math.max(
    Number(severityScore || 0),
    Number(hpi?.severityScore || 0),
    ...(chiefComplaints.map((cc) => Number(cc.severity || 0)))
  );

  if (maxSeverity >= 9 && triggeredEmergencyFlags.length === 0) {
    triggeredUrgentFlags.push('CRITICAL_PAIN_SCORE');
  } else if (maxSeverity >= 7 && triggeredUrgentFlags.length === 0 && triggeredEmergencyFlags.length === 0) {
    triggeredUrgentFlags.push('HIGH_SEVERITY_SCORE');
  }

  if (triggeredEmergencyFlags.length > 0) {
    return {
      isRedFlag: true,
      triageStatus: 'EMERGENCY',
      flags: triggeredEmergencyFlags,
      reason: emergencyReason || 'Critical red-flag symptom detected requiring immediate triage',
      actionRequired: 'REROUTE TO IMMEDIATE EMERGENCY RESUSCITATION / ATTENDING PHYSICIAN DESK',
    };
  }

  if (triggeredUrgentFlags.length > 0) {
    return {
      isRedFlag: false,
      triageStatus: 'URGENT',
      flags: triggeredUrgentFlags,
      reason: 'Urgent symptoms detected. Prioritized for next available consultation slot.',
      actionRequired: 'Expedited OPD queue placement',
    };
  }

  return {
    isRedFlag: false,
    triageStatus: 'ROUTINE',
    flags: [],
    reason: 'Standard outpatient presentation',
    actionRequired: 'Routine OPD consultation queue',
  };
}

module.exports = {
  evaluateRedFlags,
  RED_FLAG_CRITERIA,
};

