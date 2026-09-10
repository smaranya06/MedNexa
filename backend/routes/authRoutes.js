const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/patient/signup', authController.patientSignup);
router.post('/patient/login', authController.patientLogin);
router.post('/doctor/signup', authController.doctorSignup);
router.post('/doctor/login', authController.doctorLogin);

module.exports = router;
