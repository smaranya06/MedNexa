const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');

// Book a new consultation request
exports.bookConsultation = async (req, res) => {
  try {
    const {
      patientId,
      doctorId,
      chiefComplaint,
      symptoms,
      duration,
      severity,
      images,
      priority,
    } = req.body;

    if (!patientId || !doctorId || !chiefComplaint) {
      return res.status(400).json({
        success: false,
        message: 'Patient, Doctor, and Chief Complaint are required.',
      });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const sevNum = Number(severity) || 5;
    let computedPriority = priority || (sevNum >= 8 ? 'URGENT' : 'ROUTINE');

    const consultation = new Consultation({
      patientId: patient._id,
      patientName: patient.name,
      patientAge: patient.age,
      patientGender: patient.gender,
      patientPhone: patient.phone,
      patientAbhaId: patient.abhaId,
      doctorId: doctor._id,
      doctorName: doctor.name,
      doctorSpecialty: doctor.specialty,
      chiefComplaint,
      symptoms: Array.isArray(symptoms) ? symptoms : [symptoms].filter(Boolean),
      duration: duration || '3 days',
      severity: sevNum,
      priority: computedPriority,
      images: Array.isArray(images) ? images : [],
      status: 'PENDING',
    });

    await consultation.save();

    res.status(201).json({
      success: true,
      message: `Consultation booked with ${doctor.name}!`,
      data: consultation,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get consultations for a specific patient
exports.getPatientConsultations = async (req, res) => {
  try {
    const { patientId } = req.params;
    const consultations = await Consultation.find({ patientId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: consultations.length,
      data: consultations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get consultations for a doctor (or all if filter not applied)
exports.getDoctorConsultations = async (req, res) => {
  try {
    const { doctorId } = req.params;
    let query = {};
    if (doctorId && doctorId !== 'all') {
      query = { doctorId };
    }

    const consultations = await Consultation.find(query).sort({
      status: 1, // 'PENDING' appears first
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: consultations.length,
      data: consultations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Doctor provides clinical feedback & advice
exports.submitDoctorFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      problemAssessment,
      patientActionPlan,
      prescriptions,
      followUpDays,
    } = req.body;

    if (!problemAssessment || !patientActionPlan) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both the problem assessment and the patient action plan.',
      });
    }

    const consultation = await Consultation.findById(id);
    if (!consultation) {
      return res.status(404).json({ success: false, message: 'Consultation not found' });
    }

    consultation.status = 'ANSWERED';
    consultation.doctorFeedback = {
      problemAssessment,
      patientActionPlan,
      prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
      followUpDays: Number(followUpDays) || 7,
      answeredAt: new Date(),
    };

    consultation.notification = {
      isRead: false,
      message: `Dr. ${consultation.doctorName} has answered your consultation request with diagnosis & action plan.`,
      notifiedAt: new Date(),
    };

    await consultation.save();

    res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully and notification sent to patient.',
      data: consultation,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark consultation notification as read
exports.markConsultationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findById(id);
    if (!consultation) {
      return res.status(404).json({ success: false, message: 'Consultation not found' });
    }

    consultation.notification.isRead = true;
    await consultation.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: consultation,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
