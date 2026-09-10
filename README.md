# MedNexa Backend API

MedNexa Backend is a RESTful clinical API service designed for outpatient departments (OPD), triage management, and teleconsultations. It handles patient case-taking, doctor scheduling, consultation lifecycle management, rule-based emergency triage, and medical document storage.

The service is structured in alignment with Ayushman Bharat Digital Mission (ABDM) standards and the Digital Personal Data Protection Act (DPDPA) 2023.

---

## Core Capabilities

### 1. Authentication and Identity
- Role-based authentication supporting both Patient and Doctor accounts.
- Patient onboarding with ABHA ID tracking and OPD token generation.
- Doctor verification with NMC registration number, qualifications, and hospital affiliation.

### 2. Doctor Directory and Scheduling
- Directory of medical specialists categorized by department (Cardiology, Pulmonology, Orthopedics, Neurology, Dermatology, General Medicine).
- Search and filtering by doctor name, specialty, and hospital affiliation.
- Automatic database seeding with verified clinical profiles upon first launch.

### 3. Consultation Lifecycle Management
- Direct consultation booking with chief complaints and symptoms.
- Multi-file attachment handling for prescriptions and diagnostic reports via Multer.
- Structured consultation progression: SUBMITTED -> UNDER_REVIEW -> ANSWERED -> COMPLETED.
- Structured physician response submission:
  - Clinical Assessment and Diagnosis (problem evaluation)
  - Care Instructions and Action Plan (patient guidance)
  - Itemized Prescriptions (medication, dosage, frequency, duration)
  - Follow-up recommendations
- In-app notification flag management for unread doctor replies.

### 4. Rule-Based Clinical Triage Engine
- Automated evaluation of vital signs (heart rate, SpO2, blood pressure, temperature).
- Detection of high-risk symptoms (chest pain, respiratory distress, severe trauma).
- Emergency red-flag assignment and prioritization for urgent medical review.

### 5. Medical Document Management
- File upload pipeline with timestamped storage and MIME type validation.
- Metadata indexing for clinical parameters, lab results, and FHIR R4 mapping.

---

## Technology Stack

- Runtime: Node.js (v18.0.0 or higher)
- Framework: Express.js (v4.19+)
- Database: MongoDB (v6.0+) with Mongoose ODM (v8.3+)
- File Handling: Multer
- Environment Management: Dotenv
- Cross-Origin Resource Sharing: CORS

---

## Project Structure

```
backend/
├── config/
│   └── db.js                 # MongoDB connection and event handling
├── controllers/
│   ├── authController.js     # Patient and doctor registration/login
│   ├── caseHistoryController.js # Clinical intake and triage submissions
│   ├── consultationController.js # Booking, review, feedback, notifications
│   ├── doctorController.js   # Specialist directory and profile retrieval
│   ├── documentController.js # Medical report uploads and extraction
│   └── patientController.js  # Patient record lookups
├── middleware/
│   ├── redFlagTriage.js      # Symptom and vitals emergency triage rules
│   └── upload.js             # Multer storage configuration for uploads
├── models/
│   ├── CaseHistory.js        # Kiosk intake records and triage classifications
│   ├── Consultation.js       # Consultation lifecycle, files, and doctor answers
│   ├── Doctor.js             # Specialist profiles, credentials, and OPD schedules
│   ├── Document.js           # Uploaded report metadata and parameters
│   └── Patient.js            # Patient profiles, ABHA IDs, and OPD tokens
├── routes/
│   ├── authRoutes.js         # /api/auth routes
│   ├── caseHistoryRoutes.js  # /api/cases routes
│   ├── consultationRoutes.js # /api/consultations routes
│   ├── doctorRoutes.js       # /api/doctors routes
│   ├── documentRoutes.js     # /api/documents routes
│   └── patientRoutes.js      # /api/patients routes
├── uploads/
│   └── .gitkeep              # Local directory for uploaded files
├── .env.example              # Environment variables template
├── .gitignore                # Backend-specific ignore rules
├── package.json              # Service configuration and dependencies
└── server.js                 # Application entry point and server bootstrap
```

---

## Environment Variables

Create a `.env` file in the root of the `backend/` directory based on `.env.example`:

| Variable | Description | Default Value |
|---|---|---|
| PORT | Port on which the API server listens | 5000 |
| MONGO_URI | MongoDB connection string | mongodb://127.0.0.1:27017/mednexa |
| CLIENT_URL | Allowed origin URL for CORS | http://localhost:5173 |
| NODE_ENV | Application environment | development |

---

## Getting Started

### 1. Prerequisites
- Node.js v18.0.0 or higher
- npm v9.0.0 or higher
- MongoDB running locally on port 27017, or a remote MongoDB Atlas URI

### 2. Installation
Navigate to the backend directory and install dependencies:
```bash
cd backend
npm install
```

### 3. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```

### 4. Running the Server

Development mode (with auto-restart via nodemon):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Upon startup, the server connects to MongoDB, creates required collections, and automatically seeds default verified specialists if the database is empty.

---

## API Reference

### Health Check
- `GET /api/health`
  - Returns server operational status and timestamp.

### Authentication (`/api/auth`)
- `POST /api/auth/patient/login`
  - Body: `{ identifier, password? }` (matches name or phone number)
- `POST /api/auth/patient/signup`
  - Body: `{ name, age, gender, phone, password? }`
- `POST /api/auth/doctor/login`
  - Body: `{ email, password? }`
- `POST /api/auth/doctor/signup`
  - Body: `{ name, email, specialty, qualification, hospitalAffiliation, password? }`

### Doctors (`/api/doctors`)
- `GET /api/doctors`
  - Query parameters: `search` (text match), `specialty` (department filter)
  - Returns list of verified doctors.
- `GET /api/doctors/:id`
  - Returns full doctor profile with consultation fees and schedule.

### Consultations (`/api/consultations`)
- `POST /api/consultations/book`
  - Content-Type: `multipart/form-data`
  - Form fields: `patientId`, `patientName`, `patientAge`, `patientGender`, `doctorId`, `doctorName`, `doctorSpecialty`, `chiefComplaint`, `symptoms`, `vitals`
  - Files: `attachments` (up to 5 images or documents)
- `GET /api/consultations/patient/:patientId`
  - Returns all consultation records for a given patient.
- `GET /api/consultations/doctor/:doctorId`
  - Query parameters: `status` (SUBMITTED, UNDER_REVIEW, ANSWERED, COMPLETED)
  - Returns consultation requests assigned to the doctor.
- `POST /api/consultations/:id/feedback`
  - Body: `{ assessment, instructions, prescriptions: [...], followUpDays }`
  - Submits clinical feedback and marks consultation as ANSWERED.
- `PATCH /api/consultations/:id/read`
  - Marks the patient notification flag as read.

### Case Intake and Triage (`/api/cases`)
- `POST /api/cases`
  - Body: `{ patient, chiefComplaint, vitals, symptoms, dpdpaConsent }`
  - Runs triage analysis, assigns an OPD token, and saves intake record.
- `GET /api/cases`
  - Returns intake cases sorted by urgency and submission time.

### Medical Documents (`/api/documents`)
- `POST /api/documents/upload`
  - Content-Type: `multipart/form-data`
  - Uploads patient prescription or lab report and parses key values.

---

## Data Privacy and Security

- **Compliance**: Adheres to the Digital Personal Data Protection Act (DPDPA) 2023. Explicit consent is captured with each clinical intake.
- **File Storage**: Uploaded medical files are stored locally in `backend/uploads/`. This folder is excluded from version control via `.gitignore` to prevent patient health data leakage.
- **Sensitive Configuration**: All database connection strings and environment keys are loaded strictly through environment variables.

---

## License

This project is licensed under the MIT License.
