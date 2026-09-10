const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');

router.get('/', doctorController.getDoctors);
router.post('/seed', doctorController.seedDoctors);

module.exports = router;
