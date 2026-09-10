const express = require('express');
const router = express.Router();
const caseHistoryController = require('../controllers/caseHistoryController');

// Submit / update clinical case history intake
router.post('/submit', caseHistoryController.saveCaseHistory);

// Dynamic adaptive follow-up questionnaire
router.get('/adaptive-questions', caseHistoryController.getAdaptiveQuestions);

// Get case history by patient ID
router.get('/patient/:patientId', caseHistoryController.getCaseHistoryByPatient);

// Doctor consultation finalization (prescriptions, diagnosis, sign-off)
router.post('/finalize/:patientId', caseHistoryController.doctorFinalizeConsultation);

module.exports = router;

