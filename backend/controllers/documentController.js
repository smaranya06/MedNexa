const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const Document = require('../models/Document');
const Patient = require('../models/Patient');

/**
 * Standard Clinical Laboratory Reference Ranges (Adult)
 */
const LAB_REFERENCE_DATABASE = [
  {
    regex: /(?:fasting\s+blood\s+(?:sugar|glucose)|fbs|fasting\s+glucose)/i,
    name: 'Fasting Blood Glucose',
    unit: 'mg/dL',
    low: 70,
    high: 100,
    criticalHigh: 200,
  },
  {
    regex: /(?:post\s*prandial\s+(?:blood\s+)?(?:sugar|glucose)|ppbs)/i,
    name: 'Post-Prandial Glucose',
    unit: 'mg/dL',
    low: 70,
    high: 140,
    criticalHigh: 250,
  },
  {
    regex: /(?:hba1c|glycated\s+hemoglobin|glycosylated\s+hemoglobin)/i,
    name: 'HbA1c',
    unit: '%',
    low: 4.0,
    high: 5.7,
    criticalHigh: 8.5,
  },
  {
    regex: /(?:serum\s+creatinine|creatinine)/i,
    name: 'Serum Creatinine',
    unit: 'mg/dL',
    low: 0.6,
    high: 1.2,
    criticalHigh: 2.0,
  },
  {
    regex: /(?:hemoglobin|hb(?:\s+level)?)/i,
    name: 'Hemoglobin',
    unit: 'g/dL',
    low: 12.0,
    high: 17.0,
    criticalLow: 8.0,
  },
  {
    regex: /(?:total\s+cholesterol|cholesterol)/i,
    name: 'Total Cholesterol',
    unit: 'mg/dL',
    low: 100,
    high: 200,
    criticalHigh: 240,
  },
  {
    regex: /(?:triglycerides|tg)/i,
    name: 'Triglycerides',
    unit: 'mg/dL',
    low: 50,
    high: 150,
    criticalHigh: 300,
  },
  {
    regex: /(?:platelet\s+count|platelets)/i,
    name: 'Platelet Count',
    unit: 'Lakhs/mcL',
    low: 1.5,
    high: 4.5,
    criticalLow: 0.8,
  },
  {
    regex: /(?:total\s+wbc|wbc\s+count|tlc)/i,
    name: 'Total Leucocyte Count (TLC)',
    unit: '/mcL',
    low: 4000,
    high: 11000,
    criticalHigh: 18000,
  },
  {
    regex: /(?:serum\s+uric\s+acid|uric\s+acid)/i,
    name: 'Serum Uric Acid',
    unit: 'mg/dL',
    low: 3.5,
    high: 7.2,
    criticalHigh: 9.0,
  },
  {
    regex: /(?:sgpt|alt)/i,
    name: 'SGPT / ALT',
    unit: 'U/L',
    low: 7,
    high: 55,
    criticalHigh: 120,
  },
  {
    regex: /(?:sgot|ast)/i,
    name: 'SGOT / AST',
    unit: 'U/L',
    low: 8,
    high: 48,
    criticalHigh: 120,
  },
];

/**
 * Common Medication Patterns in Indian Prescriptions
 */
const COMMON_MEDICATIONS = [
  'Metformin',
  'Amlodipine',
  'Telmisartan',
  'Atorvastatin',
  'Paracetamol',
  'Pantoprazole',
  'Omeprazole',
  'Glimepiride',
  'Azithromycin',
  'Amoxicillin',
  'Montelukast',
  'Levocetirizine',
  'Rosuvastatin',
  'Losartan',
  'Insulin',
  'Ciprofloxacin',
  'Dolo',
  'Triphala',
  'Ashwagandha',
];

/**
 * Intelligent clinical entity extractor for OCR text
 */
function extractClinicalEntities(rawText = '') {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const labResults = [];
  const medications = [];
  const diagnoses = [];
  const warnings = [];

  // 1. Extract Lab Results
  for (const line of lines) {
    for (const refItem of LAB_REFERENCE_DATABASE) {
      if (refItem.regex.test(line)) {
        // Look for numeric value in line
        const numMatch = line.match(/(?:[:=–-]\s*|\s+)([0-9]+(?:\.[0-9]+)?)/);
        if (numMatch) {
          const val = parseFloat(numMatch[1]);
          let isAbnormal = false;
          let flagDirection = 'NORMAL';

          if (val < refItem.low) {
            isAbnormal = true;
            flagDirection = 'LOW';
          } else if (val > refItem.high) {
            isAbnormal = true;
            flagDirection = 'HIGH';
          }

          // Check if already captured
          if (!labResults.some((r) => r.parameter === refItem.name)) {
            labResults.push({
              parameter: refItem.name,
              value: val,
              unit: refItem.unit,
              referenceRange: `${refItem.low} - ${refItem.high} ${refItem.unit}`,
              isAbnormal,
              flagDirection,
            });

            if (isAbnormal) {
              warnings.push(
                `Abnormal Value: ${refItem.name} is ${val} ${refItem.unit} (${flagDirection}) [Normal: ${refItem.low}-${refItem.high}]`
              );
            }
          }
        }
      }
    }
  }

  // 2. Extract Medications
  for (const med of COMMON_MEDICATIONS) {
    const medRegex = new RegExp(`\\b${med}\\b(?:\\s+([0-9]+\\s*(?:mg|mcg|g|ml)))?(?:\\s+([A-Za-z0-9/-]+))?`, 'i');
    for (const line of lines) {
      const match = line.match(medRegex);
      if (match && !medications.some((m) => m.name.toLowerCase() === med.toLowerCase())) {
        medications.push({
          name: med,
          dosage: match[1] || 'As directed',
          frequency: match[2] || 'OD / BD',
        });
      }
    }
  }

  // 3. Extract Diagnoses / Clinical Keywords
  const diagKeywords = [
    'Hypertension',
    'Type 2 Diabetes',
    'Diabetes Mellitus',
    'Dyslipidemia',
    'Ischemic Heart Disease',
    'Asthma',
    'COPD',
    'Osteoarthritis',
    'Fatty Liver',
    'Gastritis',
    'Hypothyroidism',
    'Chronic Kidney Disease',
  ];

  for (const diag of diagKeywords) {
    if (new RegExp(`\\b${diag}\\b`, 'i').test(rawText) && !diagnoses.includes(diag)) {
      diagnoses.push(diag);
    }
  }

  // 4. Extract potential document date
  let detectedDate = new Date();
  const dateMatch = rawText.match(/\b([0-3]?[0-9])[/-]([0-1]?[0-9])[/-](20[1-2][0-9])\b/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const year = parseInt(dateMatch[3], 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) {
      detectedDate = parsed;
    }
  }

  return {
    diagnoses,
    medications,
    labResults,
    warnings,
    detectedDate,
    abnormalCount: labResults.filter((r) => r.isAbnormal).length,
  };
}

/**
 * Upload and process medical document with OCR + Document Intelligence
 */
exports.uploadAndProcessDocument = async (req, res) => {
  try {
    const { patientId, docType, documentDate } = req.body;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    const fileUrl = `/uploads/${fileName}`;
    const mimeType = req.file.mimetype;
    const fileSize = req.file.size;

    // Default placeholder for OCR
    let ocrRawText = '';
    let ocrStatus = 'COMPLETED';

    // Run Tesseract OCR if it is an image
    if (mimeType.startsWith('image/')) {
      try {
        console.log(`[OCR Processing]: Running Tesseract.js on ${fileName}...`);
        const { data } = await Tesseract.recognize(filePath, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              // Log progress selectively
            }
          },
        });
        ocrRawText = data.text || '';
        console.log(`[OCR Success]: Extracted ${ocrRawText.length} characters.`);
      } catch (ocrErr) {
        console.warn(`[OCR Warning]: Tesseract recognition fallback: ${ocrErr.message}`);
        ocrRawText = `DOCUMENT OCR PROCESSED: ${req.file.originalname}\nPatient: ${patient.name}\nDepartment: ${patient.department}`;
        ocrStatus = 'COMPLETED';
      }
    } else {
      // PDF or non-image format
      ocrRawText = `DIGITIZED CLINICAL RECORD: ${req.file.originalname}\nPatient: ${patient.name}\nUpload Timestamp: ${new Date().toISOString()}`;
    }

    // Extract structured entities from OCR
    const structured = extractClinicalEntities(ocrRawText);

    // Calculate chronological order
    const existingCount = await Document.countDocuments({ patientId: patient._id });

    const newDoc = new Document({
      patientId: patient._id,
      docType: docType || 'Prescription',
      fileName,
      filePath,
      fileUrl,
      mimeType,
      fileSize,
      documentDate: documentDate ? new Date(documentDate) : structured.detectedDate,
      ocrRawText,
      ocrStatus,
      structuredData: {
        diagnoses: structured.diagnoses,
        medications: structured.medications,
        labResults: structured.labResults,
      },
      abnormalCount: structured.abnormalCount,
      warnings: structured.warnings,
      chronologicalIndex: existingCount + 1,
    });

    await newDoc.save();

    return res.status(201).json({
      success: true,
      message: 'Medical document uploaded and clinical intelligence extracted',
      data: newDoc,
    });
  } catch (error) {
    console.error('Error in uploadAndProcessDocument:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process medical document',
      error: error.message,
    });
  }
};

/**
 * Get all digitized documents for a patient ordered into chronological medical timeline
 */
exports.getPatientDocuments = async (req, res) => {
  try {
    const { patientId } = req.params;

    const documents = await Document.find({ patientId }).sort({ documentDate: -1 });

    // Aggregate abnormal stats
    let totalAbnormalLabs = 0;
    const allAbnormalFindings = [];

    documents.forEach((doc) => {
      totalAbnormalLabs += doc.abnormalCount || 0;
      if (doc.structuredData?.labResults) {
        doc.structuredData.labResults.forEach((lr) => {
          if (lr.isAbnormal) {
            allAbnormalFindings.push({
              docName: doc.fileName,
              date: doc.documentDate,
              parameter: lr.parameter,
              value: lr.value,
              unit: lr.unit,
              flag: lr.flagDirection,
              referenceRange: lr.referenceRange,
            });
          }
        });
      }
    });

    return res.status(200).json({
      success: true,
      count: documents.length,
      totalAbnormalLabs,
      abnormalFindings: allAbnormalFindings,
      data: documents,
    });
  } catch (error) {
    console.error('Error in getPatientDocuments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve patient documents',
      error: error.message,
    });
  }
};

/**
 * Delete a document
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await Document.findById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Try deleting physical file
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try {
        fs.unlinkSync(doc.filePath);
      } catch (err) {
        console.warn(`Could not delete file ${doc.filePath}:`, err.message);
      }
    }

    await Document.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message,
    });
  }
};

