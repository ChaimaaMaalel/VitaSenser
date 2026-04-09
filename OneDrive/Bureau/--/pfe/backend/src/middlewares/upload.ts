import fs from 'fs';
import path from 'path';
import multer from 'multer';

const uploadsRoot = path.join(process.cwd(), 'uploads');
const profilePicturesDir = path.join(uploadsRoot, 'profile-pictures');
const patientDossierDir = path.join(uploadsRoot, 'patient-dossier');

if (!fs.existsSync(profilePicturesDir)) {
  fs.mkdirSync(profilePicturesDir, { recursive: true });
}

if (!fs.existsSync(patientDossierDir)) {
  fs.mkdirSync(patientDossierDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, profilePicturesDir);
  },
  filename: (_req, file, cb) => {
    const fileExtension = path.extname(file.originalname) || '.jpg';
    const safeExtension = fileExtension.toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `profile-${uniqueSuffix}${safeExtension}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('Only image files are allowed'));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const profilePictureUpload = upload.single('profilePicture');

const dossierStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, patientDossierDir);
  },
  filename: (_req, file, cb) => {
    const fileExtension = path.extname(file.originalname) || '.bin';
    const safeExtension = fileExtension.toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `dossier-${uniqueSuffix}${safeExtension}`);
  },
});

const dossierFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const acceptedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/dicom',
    'application/dicom+json',
    'application/octet-stream',
    'text/plain',
  ];

  if (file.mimetype.startsWith('image/') || acceptedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(new Error('Unsupported dossier file type'));
};

const dossierUpload = multer({
  storage: dossierStorage,
  fileFilter: dossierFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

export const patientDossierUpload = dossierUpload.single('file');
