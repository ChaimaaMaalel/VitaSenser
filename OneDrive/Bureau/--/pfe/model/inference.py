"""
Smart Hospital - Real-Time Inference Engine
Performs real-time predictions using all 4 trained models
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

import config
from data_preprocessing import DataPreprocessor
from feature_extraction import FeatureExtractor
from model_isolation_forest import AnomalyDetector
from model_random_forest import PatientStatusClassifier
from model_logistic_regression import CardiacRiskPredictor
from model_lstm import RespiratoryPredictor

class SmartHospitalInference:
    """
    Real-time inference engine for Smart Hospital AI system
    """
    
    def __init__(self, load_models=True):
        """
        Initialize inference engine
        
        Args:
            load_models: If True, load pre-trained models from disk
        """
        self.preprocessor = DataPreprocessor()
        self.extractor = FeatureExtractor()
        
        # Models
        self.anomaly_detector = AnomalyDetector()
        self.status_classifier = PatientStatusClassifier()
        self.cardiac_predictor = CardiacRiskPredictor()
        self.respiratory_predictor = RespiratoryPredictor()
        
        if load_models:
            self.load_all_models()
        
        # Patient data buffer (for time-series analysis)
        self.patient_buffers = {}
        
    def load_all_models(self):
        """Load all pre-trained models from disk"""
        print("\n" + "="*60)
        print("LOADING PRE-TRAINED MODELS")
        print("="*60 + "\n")
        
        try:
            self.anomaly_detector.load_model()
            self.status_classifier.load_model()
            self.cardiac_predictor.load_model()
            self.respiratory_predictor.load_model()
            print("\n✓ All models loaded successfully!")
        except Exception as e:
            print(f"\n⚠ Warning: Could not load all models: {e}")
            print("Please train models first using train.py")
    
    def add_patient_data(self, patient_id, data):
        """
        Add new patient data to buffer
        
        Args:
            patient_id: Unique patient identifier
            data: Dictionary with {'HR': value, 'SpO2': value, 'Temperature': value, 'timestamp': datetime}
        """
        if patient_id not in self.patient_buffers:
            self.patient_buffers[patient_id] = []
        
        # Add timestamp if not provided
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now()
        
        self.patient_buffers[patient_id].append(data)
        
        # Keep only last N samples (buffer size)
        max_buffer = config.INFERENCE_CONFIG['buffer_size']
        if len(self.patient_buffers[patient_id]) > max_buffer:
            self.patient_buffers[patient_id] = self.patient_buffers[patient_id][-max_buffer:]
    
    def get_patient_buffer(self, patient_id, as_dataframe=True):
        """
        Get patient data buffer
        
        Args:
            patient_id: Patient ID
            as_dataframe: Return as DataFrame
            
        Returns:
            buffer: Patient data buffer
        """
        if patient_id not in self.patient_buffers:
            return pd.DataFrame() if as_dataframe else []
        
        buffer = self.patient_buffers[patient_id]
        
        if as_dataframe:
            df = pd.DataFrame(buffer)
            if 'timestamp' in df.columns:
                df = df.set_index('timestamp')
            return df
        
        return buffer
    
    def extract_features_from_buffer(self, patient_id):
        """
        Extract features from patient buffer
        
        Args:
            patient_id: Patient ID
            
        Returns:
            features: Extracted feature vector
        """
        df = self.get_patient_buffer(patient_id, as_dataframe=True)
        
        if len(df) < config.WINDOW_SIZE_SECONDS:
            raise ValueError(f"Not enough data in buffer. Need {config.WINDOW_SIZE_SECONDS} samples, have {len(df)}")
        
        # Take last window
        window = df[['HR', 'SpO2', 'Temperature']].iloc[-config.WINDOW_SIZE_SECONDS:]
        
        # Extract features
        features = self.extractor.extract_all_features(window, include_ecg=False)
        
        # Convert to array
        feature_vector = np.array(list(features.values())).reshape(1, -1)
        
        return feature_vector, features
    
    def predict_anomaly(self, patient_id):
        """
        Detect anomalies for a patient
        
        Args:
            patient_id: Patient ID
            
        Returns:
            result: Anomaly detection result
        """
        feature_vector, _ = self.extract_features_from_buffer(patient_id)
        
        prediction = self.anomaly_detector.predict(feature_vector)[0]
        score = self.anomaly_detector.get_anomaly_scores(feature_vector)[0]
        
        result = {
            'is_anomaly': bool(prediction),
            'anomaly_score': float(score),
            'alert_level': 'HIGH' if prediction else 'NONE'
        }
        
        return result
    
    def predict_patient_status(self, patient_id):
        """
        Classify patient status
        
        Args:
            patient_id: Patient ID
            
        Returns:
            status: Patient status classification
        """
        feature_vector, _ = self.extract_features_from_buffer(patient_id)
        
        status = self.status_classifier.classify_patient(feature_vector[0])
        
        return status
    
    def predict_cardiac_risk(self, patient_id):
        """
        Predict cardiac risk
        
        Args:
            patient_id: Patient ID
            
        Returns:
            assessment: Cardiac risk assessment
        """
        feature_vector, features = self.extract_features_from_buffer(patient_id)
        
        # Select cardiac-specific features
        features_df = pd.DataFrame([features])
        X_cardiac, _ = self.extractor.select_features_for_model(features_df, 'logistic_regression')
        
        assessment = self.cardiac_predictor.assess_patient_risk(X_cardiac[0])
        
        return assessment
    
    def predict_respiratory_future(self, patient_id):
        """
        Predict future SpO2 value
        
        Args:
            patient_id: Patient ID
            
        Returns:
            prediction: Respiratory prediction
        """
        df = self.get_patient_buffer(patient_id, as_dataframe=True)
        
        sequence_length = config.LSTM_CONFIG['sequence_length']
        
        if len(df) < sequence_length:
            raise ValueError(f"Not enough data for LSTM. Need {sequence_length} samples, have {len(df)}")
        
        # Take last sequence
        sequence = df[['SpO2', 'HR']].iloc[-sequence_length:].values
        sequence = sequence.reshape(1, sequence_length, 2)
        
        # Predict
        predicted_spo2 = self.respiratory_predictor.predict_single(sequence)
        
        # Calculate time of prediction
        last_timestamp = df.index[-1] if hasattr(df.index, 'to_pydatetime') else datetime.now()
        prediction_time = last_timestamp + timedelta(minutes=config.PREDICTION_HORIZON_MINUTES)
        
        result = {
            'predicted_spo2': float(predicted_spo2),
            'current_spo2': float(df['SpO2'].iloc[-1]),
            'change': float(predicted_spo2 - df['SpO2'].iloc[-1]),
            'prediction_time': prediction_time,
            'horizon_minutes': config.PREDICTION_HORIZON_MINUTES,
            'alert': predicted_spo2 < config.ALERT_THRESHOLDS['SpO2_critical']
        }
        
        return result
    
    def comprehensive_patient_analysis(self, patient_id):
        """
        Perform comprehensive analysis using all 4 models
        
        Args:
            patient_id: Patient ID
            
        Returns:
            analysis: Complete patient analysis
        """
        print(f"\n{'='*60}")
        print(f"COMPREHENSIVE PATIENT ANALYSIS - Patient ID: {patient_id}")
        print(f"{'='*60}\n")
        
        analysis = {
            'patient_id': patient_id,
            'timestamp': datetime.now(),
            'models': {}
        }
        
        try:
            # Get current vitals
            current_vitals = self.get_patient_buffer(patient_id, as_dataframe=True).iloc[-1]
            analysis['current_vitals'] = {
                'HR': float(current_vitals['HR']),
                'SpO2': float(current_vitals['SpO2']),
                'Temperature': float(current_vitals['Temperature'])
            }
            
            # Model 1: Anomaly Detection
            print("Model 1: Anomaly Detection...")
            analysis['models']['anomaly'] = self.predict_anomaly(patient_id)
            
            # Model 2: Patient Status Classification
            print("Model 2: Patient Status Classification...")
            analysis['models']['status'] = self.predict_patient_status(patient_id)
            
            # Model 3: Cardiac Risk Prediction
            print("Model 3: Cardiac Risk Prediction...")
            analysis['models']['cardiac_risk'] = self.predict_cardiac_risk(patient_id)
            
            # Model 4: Respiratory Prediction
            print("Model 4: Respiratory Prediction...")
            analysis['models']['respiratory'] = self.predict_respiratory_future(patient_id)
            
            # Overall alert level
            analysis['overall_alert'] = self._determine_overall_alert(analysis['models'])
            
            print("\n✓ Analysis complete!")
            
        except Exception as e:
            print(f"\n⚠ Error during analysis: {e}")
            analysis['error'] = str(e)
        
        return analysis
    
    def _determine_overall_alert(self, models):
        """Determine overall alert level from all models"""
        alert_scores = {
            'NONE': 0,
            'LOW': 1,
            'MEDIUM': 2,
            'HIGH': 3
        }
        
        max_alert = 'NONE'
        max_score = 0
        
        # Check anomaly detection
        if models['anomaly']['is_anomaly']:
            alert = 'HIGH'
            if alert_scores[alert] > max_score:
                max_alert = alert
                max_score = alert_scores[alert]
        
        # Check patient status
        status_alert = models['status']['alert_level']
        if alert_scores[status_alert] > max_score:
            max_alert = status_alert
            max_score = alert_scores[status_alert]
        
        # Check cardiac risk
        cardiac_level = models['cardiac_risk']['risk_level']
        cardiac_alert = {'Low': 'NONE', 'Medium': 'MEDIUM', 'High': 'HIGH'}[cardiac_level]
        if alert_scores[cardiac_alert] > max_score:
            max_alert = cardiac_alert
            max_score = alert_scores[cardiac_alert]
        
        # Check respiratory prediction
        if models['respiratory']['alert']:
            alert = 'HIGH'
            if alert_scores[alert] > max_score:
                max_alert = alert
                max_score = alert_scores[alert]
        
        return max_alert
    
    def print_analysis_report(self, analysis):
        """Print formatted analysis report"""
        print(f"\n{'='*60}")
        print(f"📊 PATIENT ANALYSIS REPORT")
        print(f"{'='*60}")
        
        print(f"\nPatient ID: {analysis['patient_id']}")
        print(f"Timestamp: {analysis['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"\n📈 Current Vitals:")
        vitals = analysis['current_vitals']
        print(f"  Heart Rate:    {vitals['HR']:.0f} bpm")
        print(f"  SpO2:          {vitals['SpO2']:.1f}%")
        print(f"  Temperature:   {vitals['Temperature']:.1f}°C")
        
        print(f"\n🔍 Model Predictions:")
        
        models = analysis['models']
        
        # Anomaly Detection
        print(f"\n  1. Anomaly Detection:")
        print(f"     Status: {'⚠ ANOMALY DETECTED' if models['anomaly']['is_anomaly'] else '✓ Normal'}")
        print(f"     Score: {models['anomaly']['anomaly_score']:.3f}")
        
        # Patient Status
        print(f"\n  2. Patient Status Classification:")
        print(f"     Status: {models['status']['status']}")
        print(f"     Confidence: {models['status']['confidence']:.1%}")
        print(f"     Alert Level: {models['status']['alert_level']}")
        
        # Cardiac Risk
        print(f"\n  3. Cardiac Risk Prediction:")
        print(f"     Risk Level: {models['cardiac_risk']['risk_level']}")
        print(f"     Probability: {models['cardiac_risk']['risk_percentage']}")
        print(f"     Recommendation: {models['cardiac_risk']['recommendation']}")
        
        # Respiratory Prediction
        print(f"\n  4. Respiratory Prediction:")
        print(f"     Current SpO2: {models['respiratory']['current_spo2']:.1f}%")
        print(f"     Predicted SpO2 (in {models['respiratory']['horizon_minutes']} min): {models['respiratory']['predicted_spo2']:.1f}%")
        print(f"     Change: {models['respiratory']['change']:+.1f}%")
        print(f"     Alert: {'⚠ YES' if models['respiratory']['alert'] else '✓ No'}")
        
        # Overall Alert
        print(f"\n🚨 OVERALL ALERT LEVEL: {analysis['overall_alert']}")
        
        print(f"\n{'='*60}\n")


# ============================================================================
# EXAMPLE USAGE - SIMULATE REAL-TIME MONITORING
# ============================================================================
if __name__ == "__main__":
    import time
    from data_preprocessing import create_synthetic_data
    
    print("="*60)
    print("🏥 SMART HOSPITAL - REAL-TIME INFERENCE DEMO")
    print("="*60)
    
    # Initialize inference engine
    print("\nInitializing inference engine...")
    engine = SmartHospitalInference(load_models=True)
    
    # Generate synthetic patient data
    print("\nGenerating synthetic patient data...")
    df = create_synthetic_data(n_patients=1, duration_hours=1)
    patient_data = df[df['patient_id'] == 0]
    
    patient_id = "PATIENT_001"
    
    # Simulate real-time data streaming
    print(f"\n{'='*60}")
    print(f"SIMULATING REAL-TIME MONITORING FOR {patient_id}")
    print(f"{'='*60}\n")
    
    # Feed data to buffer
    print("Feeding initial data to buffer...")
    for idx, row in patient_data.iterrows():
        engine.add_patient_data(patient_id, {
            'HR': row['HR'],
            'SpO2': row['SpO2'],
            'Temperature': row['Temperature'],
            'timestamp': row['timestamp']
        })
        
        # Perform analysis every 60 samples (1 minute)
        if (idx + 1) % 60 == 0 and idx > config.WINDOW_SIZE_SECONDS:
            print(f"\n[{row['timestamp']}] Performing analysis...")
            
            # Comprehensive analysis
            analysis = engine.comprehensive_patient_analysis(patient_id)
            
            # Print report
            engine.print_analysis_report(analysis)
            
            # Simulate real-time delay
            time.sleep(0.5)
    
    print("\n✓ Real-time inference demo complete!")
