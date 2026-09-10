const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const upload = require('../middleware/upload');

// Upload and process medical document with OCR
router.post('/upload', upload.single('file'), documentController.uploadAndProcessDocument);

// Get all documents for a patient (chronological timeline)
router.get('/patient/:patientId', documentController.getPatientDocuments);

// Delete document
router.delete('/:id', documentController.deleteDocument);

module.exports = router;

