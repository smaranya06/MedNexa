const Doctor = require('../models/Doctor');

const DEFAULT_DOCTORS = [
  {
    name: 'Dr. Rajesh Verma',
    email: 'rajesh.verma@mednexa.com',
    specialty: 'Cardiology',
    qualification: 'MBBS, MD (Medicine), DM (Cardiology)',
    experienceYears: 16,
    rating: 4.9,
    reviewCount: 310,
    consultationFee: 700,
    hospitalAffiliation: 'National Heart Institute, New Delhi',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200&auto=format&fit=crop&q=80',
    bio: 'Senior Interventional Cardiologist specializing in ischemic heart diseases, hypertension management, and preventive cardiovascular care.',
  },
  {
    name: 'Dr. Priya Sharma',
    email: 'priya.sharma@mednexa.com',
    specialty: 'General Medicine',
    qualification: 'MBBS, MD (Internal Medicine)',
    experienceYears: 12,
    rating: 4.8,
    reviewCount: 245,
    consultationFee: 500,
    hospitalAffiliation: 'Apex Multi-Specialty Clinic, Mumbai',
    availableDays: ['Mon', 'Wed', 'Fri', 'Sat'],
    avatarUrl: 'https://images.unsplash.com/photo-1594824813575-d14f04c35e8d?w=200&auto=format&fit=crop&q=80',
    bio: 'Internal medicine consultant with expertise in chronic disease management, diabetes, fever investigations, and holistic clinical care.',
  },
  {
    name: 'Vaidya Ramanathan Iyer',
    email: 'ramanathan.ayush@mednexa.com',
    specialty: 'AYUSH / Ayurveda',
    qualification: 'BAMS, MD (Ayurveda Panchakarma)',
    experienceYears: 18,
    rating: 4.9,
    reviewCount: 420,
    consultationFee: 450,
    hospitalAffiliation: 'AyurSanjeevani Holistic Wellness Centre, Kerala',
    availableDays: ['Tue', 'Thu', 'Sat', 'Sun'],
    avatarUrl: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=200&auto=format&fit=crop&q=80',
    bio: 'Ayurvedic physician and Panchakarma expert focusing on Prakriti-based diagnosis, Agni correction, lifestyle harmony, and herbal formulations.',
  },
  {
    name: 'Dr. Ananya Sen',
    email: 'ananya.sen@mednexa.com',
    specialty: 'Pulmonology',
    qualification: 'MBBS, MD, DNB (Respiratory Medicine)',
    experienceYears: 14,
    rating: 4.8,
    reviewCount: 185,
    consultationFee: 650,
    hospitalAffiliation: 'Apollo Chest & Allergy Institute, Kolkata',
    availableDays: ['Mon', 'Tue', 'Thu', 'Fri'],
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&auto=format&fit=crop&q=80',
    bio: 'Consultant pulmonologist with deep expertise in asthma, COPD, chronic cough, and post-viral respiratory rehabilitation.',
  },
  {
    name: 'Dr. Arjun Mehta',
    email: 'arjun.mehta@mednexa.com',
    specialty: 'Orthopedics',
    qualification: 'MBBS, MS (Orthopedics), MCh',
    experienceYears: 15,
    rating: 4.7,
    reviewCount: 195,
    consultationFee: 600,
    hospitalAffiliation: 'Fortis Bone & Joint Hospital, Bengaluru',
    availableDays: ['Wed', 'Thu', 'Fri', 'Sat'],
    avatarUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&auto=format&fit=crop&q=80',
    bio: 'Specialist in joint preservation, arthritis management, spinal health, and sports injury rehabilitation.',
  },
  {
    name: 'Dr. Sunita Rao',
    email: 'sunita.rao@mednexa.com',
    specialty: 'Pediatrics',
    qualification: 'MBBS, MD (Pediatrics), DCH',
    experienceYears: 11,
    rating: 4.9,
    reviewCount: 280,
    consultationFee: 500,
    hospitalAffiliation: 'Rainbow Childrens Hospital, Hyderabad',
    availableDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
    avatarUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=200&auto=format&fit=crop&q=80',
    bio: 'Child health specialist focusing on infant nutrition, immunization, developmental milestones, and acute childhood illnesses.',
  },
];

// Fetch all doctors with optional filters
exports.getDoctors = async (req, res) => {
  try {
    const { specialty, search } = req.query;
    const filter = { isActive: true };

    if (specialty && specialty !== 'All') {
      filter.specialty = specialty;
    }

    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { specialty: new RegExp(search, 'i') },
        { qualification: new RegExp(search, 'i') },
        { hospitalAffiliation: new RegExp(search, 'i') },
      ];
    }

    let doctors = await Doctor.find(filter).sort({ rating: -1, experienceYears: -1 });

    if (doctors.length === 0 && (!specialty || specialty === 'All') && !search) {
      // Auto-seed if empty
      doctors = await Doctor.insertMany(DEFAULT_DOCTORS);
    }

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Seed doctors
exports.seedDoctors = async (req, res) => {
  try {
    const clear = req.query.clear === 'true';
    if (clear) {
      await Doctor.deleteMany({});
    }

    const count = await Doctor.countDocuments();
    if (count === 0) {
      await Doctor.insertMany(DEFAULT_DOCTORS);
    }

    const doctors = await Doctor.find({});
    res.status(200).json({
      success: true,
      message: `Seeded ${doctors.length} verified doctors.`,
      data: doctors,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Internal auto-seed helper
exports.ensureDoctorsSeeded = async () => {
  try {
    const count = await Doctor.countDocuments();
    if (count === 0) {
      await Doctor.insertMany(DEFAULT_DOCTORS);
      console.log(`[Doctor Seed]: Initialized 6 verified medical specialists.`);
    }
  } catch (err) {
    console.warn(`[Doctor Seed Warning]: ${err.message}`);
  }
};
