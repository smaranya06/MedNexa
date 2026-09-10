const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const connectDB = require('./config/db');
const patientRoutes = require('./routes/patientRoutes');
const caseHistoryRoutes = require('./routes/caseHistoryRoutes');
const documentRoutes = require('./routes/documentRoutes');
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const consultationRoutes = require('./routes/consultationRoutes');
const { ensureDoctorsSeeded } = require('./controllers/doctorController');

// Initialize Express
const app = express();

// Connect to MongoDB and seed default doctors
connectDB().then(() => {
  ensureDoctorsSeeded();
});

// Global Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: false, // Enable serving uploaded images to frontend
  })
);
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve static uploads directory
const uploadDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadDir));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    platform: 'MediKiosk / MedNexa Clinical Case-Taking Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/case-history', caseHistoryRoutes);
app.use('/api/documents', documentRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to MediKiosk (MedNexa) AI Clinical History API',
    documentation: {
      health: '/api/health',
      patients: '/api/patients',
      caseHistory: '/api/case-history',
      documents: '/api/documents',
    },
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`🚀 MediKiosk API Server running on port ${PORT}`);
  console.log(`🏥 OPD Clinical Case-Taking & Triage Engine active`);
  console.log(`📋 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`========================================================`);
});

