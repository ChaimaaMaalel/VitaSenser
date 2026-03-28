import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  User, Admin, Doctor, Nurse, UserRole,
  Hospital, Floor, Room, Bed, Patient,
  VitalSigns, Alert, Prediction, MedicalProtocol,
  Intervention, Report,
  Gender, PatientStatus, RoomType, BedStatus,
  AlertType, AlertSeverity, AlertStatus, ShiftType,
  PredictionType
} from '../models';

async function main() {
  console.log('🌱 Starting database seeding...');

  // Connect to MongoDB
  await connectDatabase();

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    Hospital.deleteMany({}),
    Floor.deleteMany({}),
    Room.deleteMany({}),
    Bed.deleteMany({}),
    Patient.deleteMany({}),
    VitalSigns.deleteMany({}),
    Alert.deleteMany({}),
    Prediction.deleteMany({}),
    MedicalProtocol.deleteMany({}),
    Intervention.deleteMany({}),
    Report.deleteMany({}),
  ]);

  console.log('✅ Cleared existing data');

  // Create Admin User
  const adminUser = await Admin.create({
    email: 'admin@hospital.com',
    password: 'password123',
    firstName: 'Admin',
    lastName: 'User',
    phone: '+1234567890',
    role: UserRole.ADMIN,
    isActive: true,
    permissions: ['ALL'],
  });

  console.log('✅ Created Admin user');

  // Create Doctor Users
  const doctor1 = await Doctor.create({
    email: 'doctor@hospital.com',
    password: 'password123',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567891',
    role: UserRole.DOCTOR,
    isActive: true,
    specialization: 'Cardiologist',
    licenseNumber: 'DOC123456',
    department: 'Cardiology',
    patients: [],
  });

  const doctor2 = await Doctor.create({
    email: 'doctor2@hospital.com',
    password: 'password123',
    firstName: 'Sarah',
    lastName: 'Smith',
    phone: '+1234567892',
    role: UserRole.DOCTOR,
    isActive: true,
    specialization: 'Pulmonologist',
    licenseNumber: 'DOC789012',
    department: 'Pulmonology',
    patients: [],
  });

  console.log('✅ Created Doctor users');

  // Create Nurse Users
  const nurse1 = await Nurse.create({
    email: 'nurse@hospital.com',
    password: 'password123',
    firstName: 'Emma',
    lastName: 'Johnson',
    phone: '+1234567893',
    role: UserRole.NURSE,
    isActive: true,
    certificationLevel: 'RN',
    department: 'ICU',
    shift: ShiftType.DAY,
    patients: [],
  });

  const nurse2 = await Nurse.create({
    email: 'nurse2@hospital.com',
    password: 'password123',
    firstName: 'Michael',
    lastName: 'Brown',
    phone: '+1234567894',
    role: UserRole.NURSE,
    isActive: true,
    certificationLevel: 'LPN',
    department: 'General Ward',
    shift: ShiftType.NIGHT,
    patients: [],
  });

  console.log('✅ Created Nurse users');

  // Create Hospital
  const hospital = await Hospital.create({
    name: 'Smart Hospital Center',
    address: '123 Medical Boulevard',
    city: 'Healthcare City',
    state: 'HC',
    zipCode: '12345',
    country: 'Country',
    phoneNumber: '+1234567800',
    email: 'contact@smarthospital.com',
    capacity: 200,
    createdBy: adminUser._id,
    floors: [],
  });

  console.log('✅ Created Hospital');

  // Create Floors
  const floor1 = await Floor.create({
    floorNumber: 1,
    name: 'Ground Floor - Emergency',
    hospital: hospital._id,
    createdBy: adminUser._id,
    rooms: [],
    assignedNurses: [],
  });

  const floor2 = await Floor.create({
    floorNumber: 2,
    name: 'Second Floor - ICU',
    hospital: hospital._id,
    createdBy: adminUser._id,
    rooms: [],
    assignedNurses: [nurse1._id],
  });

  const floor3 = await Floor.create({
    floorNumber: 3,
    name: 'Third Floor - General Ward',
    hospital: hospital._id,
    createdBy: adminUser._id,
    rooms: [],
    assignedNurses: [nurse2._id],
  });

  // Update hospital with floors
  hospital.floors = [floor1._id, floor2._id, floor3._id] as any;
  await hospital.save();

  console.log('✅ Created Floors');

  // Create Rooms for Floor 2 (ICU)
  const rooms: any[] = [];
  for (let i = 1; i <= 5; i++) {
    const room = await Room.create({
      roomNumber: `2${i.toString().padStart(2, '0')}`,
      name: `ICU Room ${i}`,
      type: RoomType.ICU,
      floor: floor2._id,
      capacity: 2,
      createdBy: adminUser._id,
      beds: [],
    });
    rooms.push(room);
    (floor2.rooms as any).push(room._id);
  }

  // Create Rooms for Floor 3 (General Ward)
  for (let i = 1; i <= 5; i++) {
    const room = await Room.create({
      roomNumber: `3${i.toString().padStart(2, '0')}`,
      name: `Ward Room ${i}`,
      type: RoomType.GENERAL,
      floor: floor3._id,
      capacity: 4,
      createdBy: adminUser._id,
      beds: [],
    });
    rooms.push(room);
    (floor3.rooms as any).push(room._id);
  }

  await floor2.save();
  await floor3.save();

  console.log('✅ Created Rooms');

  // Create Beds
  const beds: any[] = [];
  for (const room of rooms) {
    const bedCount = room.type === RoomType.ICU ? 2 : 4;
    for (let i = 1; i <= bedCount; i++) {
      const bed = await Bed.create({
        bedNumber: `${room.roomNumber}-${i}`,
        room: room._id,
        status: BedStatus.AVAILABLE,
        createdBy: adminUser._id,
      });
      beds.push(bed);
      room.beds.push(bed._id);
    }
    await room.save();
  }

  console.log('✅ Created Beds');

  // Create Patients
  const availableBeds = beds.slice(0, 3);

  // Patient 1 - Critical ICU patient
  const patient1 = await Patient.create({
    firstName: 'Robert',
    lastName: 'Williams',
    dateOfBirth: new Date('1965-05-15'),
    gender: Gender.MALE,
    bloodType: 'A+',
    address: '456 Patient St',
    city: 'Healthcare City',
    state: 'HC',
    zipCode: '12345',
    phoneNumber: '+1234567895',
    emergencyContact: 'Jane Williams',
    emergencyContactPhone: '+1234567896',
    assignedDoctor: doctor1._id,
    assignedNurses: [nurse1._id],
    bed: availableBeds[0]._id,
    admissionDate: new Date('2024-01-15'),
    diagnosis: 'Acute Myocardial Infarction',
    medicalHistory: 'Hypertension, Diabetes',
    allergies: ['Penicillin'],
    currentMedications: 'Aspirin, Metformin',
    status: PatientStatus.CRITICAL,
  });

  // Update bed
  availableBeds[0].patient = patient1._id;
  availableBeds[0].status = BedStatus.OCCUPIED;
  await availableBeds[0].save();

  // Update doctor
  (doctor1.patients as any).push(patient1._id);
  await doctor1.save();

  // Create critical vital signs for patient 1
  const vitals1 = await VitalSigns.create({
    patient: patient1._id,
    heartRate: 120,
    systolicBP: 160,
    diastolicBP: 95,
    temperature: 38.5,
    respiratoryRate: 24,
    spO2: 88,
    recordedBy: nurse1._id,
  });

  // Create critical alert for patient 1
  await Alert.create({
    patient: patient1._id,
    type: AlertType.CRITICAL_VITAL_SIGN,
    severity: AlertSeverity.CRITICAL,
    message: 'Critical: Heart rate 120 bpm, SpO2 88%',
    description: 'Patient showing signs of cardiac distress with low oxygen saturation',
    status: AlertStatus.PENDING,
    triggeredBy: nurse1._id,
    vitalSigns: vitals1._id,
  });

  // Patient 2 - Stable patient
  const patient2 = await Patient.create({
    firstName: 'Maria',
    lastName: 'Garcia',
    dateOfBirth: new Date('1980-08-22'),
    gender: Gender.FEMALE,
    bloodType: 'O+',
    address: '789 Health Ave',
    city: 'Healthcare City',
    state: 'HC',
    zipCode: '12345',
    phoneNumber: '+1234567897',
    emergencyContact: 'Carlos Garcia',
    emergencyContactPhone: '+1234567898',
    assignedDoctor: doctor2._id,
    assignedNurses: [nurse2._id],
    bed: availableBeds[1]._id,
    admissionDate: new Date('2024-01-18'),
    diagnosis: 'Pneumonia',
    medicalHistory: 'Asthma',
    allergies: [],
    currentMedications: 'Antibiotics, Albuterol',
    status: PatientStatus.STABLE,
  });

  availableBeds[1].patient = patient2._id;
  availableBeds[1].status = BedStatus.OCCUPIED;
  await availableBeds[1].save();

  (doctor2.patients as any).push(patient2._id);
  await doctor2.save();

  // Normal vital signs for patient 2
  await VitalSigns.create({
    patient: patient2._id,
    heartRate: 75,
    systolicBP: 120,
    diastolicBP: 80,
    temperature: 37.0,
    respiratoryRate: 16,
    spO2: 97,
    recordedBy: nurse2._id,
  });

  console.log('✅ Created Patients with vital signs and alerts');

  // Create Medical Protocols
  await MedicalProtocol.create({
    name: 'Cardiac Emergency Protocol',
    description: 'Standard protocol for cardiac emergencies',
    category: 'EMERGENCY',
    steps: [
      'Assess patient vitals',
      'Administer oxygen',
      'Start IV line',
      'Notify cardiologist',
      'Prepare for emergency transfer',
    ],
    requiredEquipment: ['ECG machine', 'Oxygen tank', 'IV kit', 'Defibrillator'],
    estimatedDuration: 30,
    createdBy: doctor1._id,
    conditions: [
      { parameter: 'heartRate', operator: '>', value: 120 },
      { parameter: 'spO2', operator: '<', value: 90 },
    ],
    actions: [
      { type: 'ALERT', description: 'Notify emergency team', priority: 10 },
      { type: 'MEDICATION', description: 'Administer emergency medication', priority: 9 },
    ],
    isActive: true,
  });

  console.log('✅ Created Medical Protocols');

  // Create AI Predictions for Patient 1
  await Prediction.create({
    patient: patient1._id,
    modelType: 'LSTM',
    type: PredictionType.SPO2_FORECAST,
    predictedValue: 85.5,
    confidence: 0.87,
    timeHorizon: 30,
    inputData: {
      current_spo2: 88,
      heart_rate: 120,
      temperature: 38.5,
    },
    metadata: {
      model_version: '1.0',
      features_used: ['spo2_history', 'heart_rate', 'temperature'],
    },
  });

  console.log('✅ Created AI Predictions');

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log('  - Users: 5 (1 Admin, 2 Doctors, 2 Nurses)');
  console.log('  - Hospital: 1');
  console.log('  - Floors: 3');
  console.log('  - Rooms: 10');
  console.log(`  - Beds: ${beds.length}`);
  console.log('  - Patients: 2');
  console.log('  - Vital Signs: 2 records');
  console.log('  - Alerts: 1');
  console.log('  - Medical Protocols: 1');
  console.log('  - AI Predictions: 1');
  console.log('\n🔐 Login Credentials:');
  console.log('  Admin:  admin@hospital.com / password123');
  console.log('  Doctor: doctor@hospital.com / password123');
  console.log('  Nurse:  nurse@hospital.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
