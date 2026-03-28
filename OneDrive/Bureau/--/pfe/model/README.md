# Smart Hospital - AI Models Documentation

## 📋 Overview

This AI model system provides intelligent patient monitoring through 4 complementary machine learning models:

1. **Isolation Forest** - Anomaly Detection
2. **Random Forest** - Patient Status Classification  
3. **Logistic Regression** - Cardiac Risk Prediction
4. **LSTM** - Respiratory Deterioration Prediction

## 🗂️ Project Structure

```
model/
├── config.py                      # Configuration parameters
├── requirements.txt               # Python dependencies
├── data_preprocessing.py          # Data cleaning & preparation
├── feature_extraction.py          # Feature engineering
├── model_isolation_forest.py      # Model 1: Anomaly Detection
├── model_random_forest.py         # Model 2: Status Classification
├── model_logistic_regression.py   # Model 3: Cardiac Risk
├── model_lstm.py                  # Model 4: Respiratory Prediction
├── train.py                       # Training script (all models)
├── inference.py                   # Real-time inference engine
├── data/                          # Data directory
├── trained_models/                # Saved models
├── logs/                          # Log files
└── README.md                      # This file
```

## ⚙️ Installation

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Verify Installation

```python
python -c "import numpy, pandas, sklearn, tensorflow; print('✓ All dependencies installed')"
```

## 🚀 Quick Start

### Step 1: Train All Models

Train all 4 models using synthetic data:

```bash
python train.py --patients 20 --hours 24
```

**Parameters:**
- `--patients`: Number of patients for training (default: 20)
- `--hours`: Hours of monitoring data per patient (default: 24)
- `--real-data`: Use real data instead of synthetic (requires PhysioNet data)

**Output:**
- Trained models saved to `trained_models/`
- Performance metrics printed to console
- Training logs saved to `logs/`

### Step 2: Run Real-Time Inference

Perform real-time predictions on patient data:

```bash
python inference.py
```

This will:
1. Load all trained models
2. Simulate real-time patient monitoring
3. Generate comprehensive patient analysis every minute
4. Display predictions from all 4 models

## 📊 Model Details

### Model 1: Isolation Forest (Anomaly Detection)

**Purpose:** Detect abnormal patterns in vital signs

**Input:** 15 engineered features from vital signs window  
**Output:** Anomaly score (0-1) and binary prediction

**Usage:**
```python
from model_isolation_forest import AnomalyDetector

detector = AnomalyDetector()
detector.load_model()

# Detect anomalies
result = detector.detect_anomalies_realtime(features)
print(f"Anomaly Score: {result['scores'][0]:.3f}")
```

**Performance Targets:**
- Precision > 80%
- Recall > 75%
- Low false positive rate

---

### Model 2: Random Forest (Patient Status Classification)

**Purpose:** Classify patient status into 3 categories

**Classes:**
- 🟢 **Stable** - All vitals normal
- 🟠 **Warning** - Some vitals abnormal
- 🔴 **Critical** - Immediate attention required

**Input:** 18 comprehensive features  
**Output:** Class prediction + confidence

**Usage:**
```python
from model_random_forest import PatientStatusClassifier

classifier = PatientStatusClassifier()
classifier.load_model()

# Classify patient
status = classifier.classify_patient(features)
print(f"Status: {status['status']}")
print(f"Confidence: {status['confidence']:.1%}")
```

**Performance Targets:**
- Accuracy > 85%
- F1-Score > 78%
- Balanced per-class performance

---

### Model 3: Logistic Regression (Cardiac Risk)

**Purpose:** Predict cardiac events (tachycardia/bradycardia)

**Input:** 10 cardiac-specific features (HR, HRV, ECG)  
**Output:** Risk probability (0-1) and risk level

**Risk Levels:**
- **Low** - Probability < 30%
- **Medium** - Probability 30-70%
- **High** - Probability > 70%

**Usage:**
```python
from model_logistic_regression import CardiacRiskPredictor

predictor = CardiacRiskPredictor()
predictor.load_model()

# Assess cardiac risk
assessment = predictor.assess_patient_risk(features)
print(f"Risk: {assessment['risk_level']}")
print(f"Probability: {assessment['risk_percentage']}")
```

**Performance Targets:**
- ROC-AUC > 85%
- High recall (minimize false negatives)
- Interpretable coefficients

---

### Model 4: LSTM (Respiratory Prediction)

**Purpose:** Predict future SpO2 values (30 minutes ahead)

**Input:** Time-series sequence (600 timesteps × 2 features)  
**Output:** Predicted SpO2 value

**Architecture:**
- 2 LSTM layers (64, 32 units)
- Dropout regularization (0.2)
- Dense output layer

**Usage:**
```python
from model_lstm import RespiratoryPredictor

predictor = RespiratoryPredictor()
predictor.load_model()

# Predict future SpO2
prediction = predictor.predict_single(sequence)
print(f"Predicted SpO2 in 30 min: {prediction:.1f}%")
```

**Performance Targets:**
- RMSE < 2.0%
- MAE < 1.5%
- R² > 0.80

## 🔧 Advanced Usage

### Training Individual Models

Train models separately:

```python
from train import ModelTrainer
from data_preprocessing import create_synthetic_data

# Create trainer
trainer = ModelTrainer(use_synthetic_data=True)

# Load data
df = trainer.load_or_generate_data(n_patients=20, duration_hours=24)

# Train specific model
trainer.train_anomaly_detector(X_train, feature_names)
```

### Custom Feature Extraction

```python
from feature_extraction import FeatureExtractor

extractor = FeatureExtractor()

# Extract features from time window
features = extractor.extract_all_features(data_window, include_ecg=True)

# Create feature matrix
X, feature_names, timestamps = extractor.create_feature_matrix(
    df, 
    window_size=60,
    stride=30,
    include_ecg=False
)
```

### Real-Time Patient Monitoring

```python
from inference import SmartHospitalInference

# Initialize engine
engine = SmartHospitalInference(load_models=True)

# Add patient data stream
for data_point in patient_stream:
    engine.add_patient_data(patient_id, {
        'HR': data_point['hr'],
        'SpO2': data_point['spo2'],
        'Temperature': data_point['temp'],
        'timestamp': data_point['time']
    })
    
    # Perform analysis every minute
    if ready_for_analysis:
        analysis = engine.comprehensive_patient_analysis(patient_id)
        engine.print_analysis_report(analysis)
```

## 📈 Data Sources

### Recommended Datasets

1. **PhysioNet MIT-BIH Arrhythmia Database**
   - URL: https://physionet.org/content/mitdb/1.0.0/
   - ECG recordings with annotations
   
2. **PhysioNet MIMIC-III**
   - URL: https://physionet.org/content/mimiciii/1.4/
   - ICU patient data (requires credentials)

3. **Kaggle ECG Heartbeat Categorization**
   - Various cardiac condition datasets

### Using PhysioNet Data

```python
from data_preprocessing import load_physionet_data

# Load specific record
df = load_physionet_data(database='mitdb', record_number='100')
```

### Generating Synthetic Data

```python
from data_preprocessing import create_synthetic_data

# Generate test data
df = create_synthetic_data(
    n_patients=10,
    duration_hours=24
)
```

## ⚡ Performance Optimization

### GPU Acceleration (LSTM)

Enable GPU for faster LSTM training:

```bash
pip install tensorflow-gpu
```

```python
# Verify GPU availability
import tensorflow as tf
print("GPUs:", tf.config.list_physical_devices('GPU'))
```

### Batch Inference

Process multiple patients efficiently:

```python
# Batch predictions
predictions = model.predict(X_batch)
```

### Model Caching

Models are automatically cached after first load for faster subsequent use.

## 🔍 Model Evaluation

### View Training Metrics

All models print detailed metrics during training:

```
Accuracy:  0.8732
Precision: 0.8456
Recall:    0.8124
F1-Score:  0.8287
ROC-AUC:   0.9012
```

### Confusion Matrix

```python
classifier.plot_confusion_matrix(X_test, y_test, save_path='confusion_matrix.png')
```

### Feature Importance

```python
importance = model.get_feature_importance(X_train, n_top=15)
```

## 🐛 Troubleshooting

### Issue: TensorFlow not found

```bash
pip install tensorflow>=2.8.0
```

### Issue: Not enough data in buffer

Ensure buffer has minimum required samples:
- Anomaly/Status/Cardiac: 60 samples (1 minute)
- LSTM: 600 samples (10 minutes)

### Issue: Model files not found

Train models first:
```bash
python train.py
```

### Issue: Memory error during training

Reduce batch size or number of patients:
```bash
python train.py --patients 10 --hours 12
```

## 📝 Configuration

Edit [config.py](config.py) to customize:

- Model hyperparameters
- Alert thresholds
- Feature extraction settings
- File paths
- Sampling rates

Example:
```python
# Adjust anomaly detection sensitivity
ANOMALY_SCORE_THRESHOLD = 0.6  # Higher = less sensitive

# Adjust prediction horizon
PREDICTION_HORIZON_MINUTES = 45  # Predict 45 min ahead
```

## 🔐 Data Privacy & Security

- ✓ All synthetic data is GDPR-compliant
- ✓ No real patient data included
- ✓ Models trained on public datasets (PhysioNet)
- ⚠ Do NOT use in production without medical certification
- ⚠ This is an academic prototype

## 📚 References

1. PhysioNet - https://physionet.org/
2. Heart Rate Variability (HRV) Analysis
3. LSTM for Time-Series Prediction
4. Isolation Forest for Anomaly Detection

## 👥 Contributing

This is an academic project. For improvements:
1. Test models with real medical data
2. Add more features (Blood Pressure, Respiratory Rate)
3. Implement ensemble methods
4. Add explainability (SHAP, LIME)

## 📄 License

Academic use only. Not for clinical deployment without certification.

## 🎓 Citation

```
Smart Hospital - Intelligent Patient Monitoring System
PFE Project 2026
```

---

## ✅ Next Steps

1. ✓ Train all models: `python train.py`
2. ✓ Test inference: `python inference.py`
3. ⭐ Integrate with IoT backend
4. ⭐ Create web dashboard
5. ⭐ Deploy to production (with certification)

**Made with ❤️ for Smart Healthcare**
