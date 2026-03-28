"""
Smart Hospital AI Models - Configuration File
Contains all hyperparameters, thresholds, and model settings
"""

import os
from pathlib import Path

# ============================================================================
# PROJECT PATHS
# ============================================================================
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'data'
MODELS_DIR = BASE_DIR / 'trained_models'
LOGS_DIR = BASE_DIR / 'logs'

# Create directories if they don't exist
for directory in [DATA_DIR, MODELS_DIR, LOGS_DIR]:
    directory.mkdir(exist_ok=True)

# ============================================================================
# DATA CONFIGURATION
# ============================================================================
# Sampling rates
SAMPLING_RATE_ECG = 250  # Hz (standard for ECG)
SAMPLING_RATE_VITALS = 1  # Hz (1 measurement per second)

# Physiological ranges (for validation)
VITAL_RANGES = {
    'HR': {'min': 40, 'max': 200, 'unit': 'bpm'},
    'SpO2': {'min': 80, 'max': 100, 'unit': '%'},
    'Temperature': {'min': 35.0, 'max': 42.0, 'unit': '°C'},
    'ECG_amplitude': {'min': -2.0, 'max': 2.0, 'unit': 'mV'}
}

# Alert thresholds (default - can be personalized per patient)
ALERT_THRESHOLDS = {
    'HR_low': 60,        # bradycardia
    'HR_high': 100,      # tachycardia
    'SpO2_critical': 92,  # hypoxia
    'Temp_fever': 38.0,   # fever
    'Temp_hypothermia': 36.0
}

# ============================================================================
# FEATURE EXTRACTION CONFIGURATION
# ============================================================================
# Window sizes for feature extraction
WINDOW_SIZE_SECONDS = 60  # 1 minute window for basic features
WINDOW_SIZE_HRV = 300     # 5 minutes for HRV analysis
WINDOW_SIZE_LSTM = 600    # 10 minutes for LSTM sequences

# Feature engineering parameters
FEATURE_CONFIG = {
    'time_domain': True,
    'hrv_features': True,
    'frequency_features': True,
    'ecg_morphology': True,
    'statistical_features': True
}

# Number of features per model
N_FEATURES = {
    'isolation_forest': 15,
    'random_forest': 18,
    'logistic_regression': 10,
    'lstm': 2  # SpO2 and HR only (time series)
}

# ============================================================================
# MODEL 1: ISOLATION FOREST (Anomaly Detection)
# ============================================================================
ISOLATION_FOREST_CONFIG = {
    'n_estimators': 100,
    'contamination': 0.03,  # 3% expected anomalies (realistic for hospital)
    'max_samples': 256,
    'random_state': 42,
    'n_jobs': -1  # Use all CPU cores
}

# Anomaly threshold
ANOMALY_SCORE_THRESHOLD = 0.5  # Score > 0.5 = anomaly

# ============================================================================
# MODEL 2: RANDOM FOREST (Patient Status Classification)
# ============================================================================
RANDOM_FOREST_CONFIG = {
    'n_estimators': 200,
    'max_depth': 15,
    'min_samples_split': 5,
    'min_samples_leaf': 2,
    'max_features': 'sqrt',
    'class_weight': 'balanced',  # Handle imbalanced classes
    'random_state': 42,
    'n_jobs': -1
}

# Patient status classes
PATIENT_STATUS = {
    0: 'Stable',     # 🟢
    1: 'Warning',    # 🟠
    2: 'Critical'    # 🔴
}

# Confidence thresholds for classification
CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.7

# ============================================================================
# MODEL 3: LOGISTIC REGRESSION (Cardiac Risk Prediction)
# ============================================================================
LOGISTIC_REGRESSION_CONFIG = {
    'penalty': 'l2',
    'C': 1.0,  # Inverse of regularization strength
    'solver': 'lbfgs',
    'max_iter': 1000,
    'class_weight': 'balanced',
    'random_state': 42
}

# Risk probability thresholds
CARDIAC_RISK_THRESHOLDS = {
    'low': 0.3,      # < 30% probability
    'medium': 0.7,   # 30-70% probability
    'high': 0.7      # > 70% probability
}

# ============================================================================
# MODEL 4: LSTM (Respiratory Prediction)
# ============================================================================
LSTM_CONFIG = {
    'sequence_length': 600,  # 10 minutes at 1 Hz
    'n_features': 2,         # SpO2 + HR
    'lstm_units': [64, 32],  # Two LSTM layers
    'dropout': 0.2,
    'dense_units': 16,
    'learning_rate': 0.001,
    'batch_size': 32,
    'epochs': 50,
    'validation_split': 0.2,
    'early_stopping_patience': 10
}

# Prediction horizon
PREDICTION_HORIZON_MINUTES = 30  # Predict SpO2 30 minutes ahead

# ============================================================================
# TRAINING CONFIGURATION
# ============================================================================
TRAIN_CONFIG = {
    'test_size': 0.2,      # 80/20 train/test split
    'validation_split': 0.2,  # 20% of training for validation
    'random_state': 42,
    'cross_validation_folds': 5,
    'shuffle': True
}

# SMOTE configuration (for handling imbalanced data)
SMOTE_CONFIG = {
    'sampling_strategy': 'auto',
    'random_state': 42,
    'k_neighbors': 5
}

# ============================================================================
# EVALUATION METRICS
# ============================================================================
# Target metrics for model performance
TARGET_METRICS = {
    'accuracy': 0.85,   # > 85%
    'precision': 0.80,  # > 80%
    'recall': 0.75,     # > 75%
    'f1_score': 0.78,   # > 78%
    'roc_auc': 0.85     # > 85%
}

# ============================================================================
# REAL-TIME INFERENCE CONFIGURATION
# ============================================================================
INFERENCE_CONFIG = {
    'buffer_size': 600,  # Keep last 10 minutes of data
    'update_frequency': 1,  # Update predictions every 1 second
    'alert_cooldown': 60,  # Minimum 60 sec between same alerts
    'confidence_threshold': 0.7
}

# ============================================================================
# DATA SOURCES (PhysioNet, Kaggle, etc.)
# ============================================================================
DATA_SOURCES = {
    'physionet_mitbih': 'https://physionet.org/content/mitdb/1.0.0/',
    'physionet_mimic': 'https://physionet.org/content/mimiciii/1.4/',
    'kaggle_ecg': 'kaggle datasets download -d shayanfazeli/heartbeat',
    'local_synthetic': str(DATA_DIR / 'synthetic_data.csv')
}

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
LOGGING_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    'filename': str(LOGS_DIR / 'smart_hospital.log')
}

# ============================================================================
# MODEL SAVE PATHS
# ============================================================================
MODEL_PATHS = {
    'isolation_forest': str(MODELS_DIR / 'isolation_forest.pkl'),
    'random_forest': str(MODELS_DIR / 'random_forest.pkl'),
    'logistic_regression': str(MODELS_DIR / 'logistic_regression.pkl'),
    'lstm': str(MODELS_DIR / 'lstm_model.h5'),
    'scaler': str(MODELS_DIR / 'scaler.pkl'),
    'feature_names': str(MODELS_DIR / 'feature_names.pkl')
}

# ============================================================================
# PRODUCTION SETTINGS
# ============================================================================
PRODUCTION = {
    'enable_alerts': True,
    'enable_logging': True,
    'enable_monitoring': True,
    'save_predictions': True,
    'max_patients': 50  # Maximum simultaneous patients
}

print("✓ Configuration loaded successfully")
