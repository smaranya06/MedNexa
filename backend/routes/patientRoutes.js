const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

// Patient Registration & ABHA Verification
router.post('/register', patientController.registerOrVerifyPatient);

// Active OPD Queue (sorted by Triage priority: EMERGENCY -> URGENT -> ROUTINE)
router.get('/queue', patientController.getPatientQueue);

// Seed realistic demo OPD records
router.post('/seed', patientController.seedDemoData);

// Single Patient details with full case history
router.get('/:id', patientController.getPatientById);

// Update patient triage status (manual doctor override)
router.patch('/:id/triage', patientController.updateTriageStatus);

// Update patient status (WAITING_INTAKE, INTAKE_COMPLETED, UNDER_CONSULTATION, COMPLETED)
router.patch('/:id/status', patientController.updatePatientStatus);

module.exports = router;

