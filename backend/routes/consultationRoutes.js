const express = require('express');
const router = express.Router();
const consultationController = require('../controllers/consultationController');
const upload = require('../middleware/upload');

// Image upload for consultations
router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.status(200).json({
    success: true,
    data: {
      url: fileUrl,
      name: req.file.originalname,
      fileType: req.file.mimetype,
    },
  });
});

// Book a consultation
router.post('/', consultationController.bookConsultation);

// Get patient's consultations
router.get('/patient/:patientId', consultationController.getPatientConsultations);

// Get doctor's consultations
router.get('/doctor/:doctorId', consultationController.getDoctorConsultations);

// Doctor submits feedback
router.post('/:id/feedback', consultationController.submitDoctorFeedback);

// Mark notification as read
router.patch('/:id/mark-read', consultationController.markConsultationRead);

module.exports = router;
