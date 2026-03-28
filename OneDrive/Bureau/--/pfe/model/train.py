"""
Smart Hospital - Training Script for All AI Models
Trains all 4 models: Isolation Forest, Random Forest, Logistic Regression, LSTM
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
import warnings
warnings.filterwarnings('ignore')

import config
from data_preprocessing import DataPreprocessor, create_synthetic_data
from feature_extraction import FeatureExtractor
from model_isolation_forest import AnomalyDetector
from model_random_forest import PatientStatusClassifier, create_patient_status_labels
from model_logistic_regression import CardiacRiskPredictor, create_cardiac_risk_labels
from model_lstm import RespiratoryPredictor

class ModelTrainer:
    """
    Orchestrates training of all AI models
    """
    
    def __init__(self, use_synthetic_data=True, use_real_data=False):
        """
        Initialize trainer
        
        Args:
            use_synthetic_data: If True, generate synthetic data for training
            use_real_data: If True, use real PhysioNet/Kaggle datasets
        """
        self.use_synthetic_data = use_synthetic_data
        self.use_real_data = use_real_data
        self.preprocessor = DataPreprocessor()
        self.extractor = FeatureExtractor()
        
        # Models
        self.anomaly_detector = None
        self.status_classifier = None
        self.cardiac_predictor = None
        self.respiratory_predictor = None
        
        # Data
        self.data = None
        self.features = None
        
    def load_or_generate_data(self, n_patients=20, duration_hours=24, n_records=10):
        """
        Load or generate training data
        
        Args:
            n_patients: Number of patients for synthetic data
            duration_hours: Hours of monitoring per patient
            n_records: Number of PhysioNet records to load (if use_real_data=True)
            
        Returns:
            df: DataFrame with patient vital signs
        """
        print("\n" + "="*80)
        print("LOADING/GENERATING TRAINING DATA")
        print("="*80)
        
        if self.use_real_data:
            # Load real PhysioNet data
            print(f"\n🏥 Loading REAL PhysioNet MIT-BIH data...")
            from load_real_datasets import quick_load_mitbih
            
            df = quick_load_mitbih(n_records=n_records)
            
            if df is None:
                print("\n⚠ Failed to load real data. Falling back to synthetic...")
                df = create_synthetic_data(n_patients=n_patients, duration_hours=duration_hours)
            else:
                print(f"✓ Loaded {len(df)} samples from real medical data")
                
        elif self.use_synthetic_data:
            print(f"\nGenerating synthetic data for {n_patients} patients...")
            df = create_synthetic_data(n_patients=n_patients, duration_hours=duration_hours)
            print(f"✓ Generated {len(df)} samples")
        else:
            print("\n⚠ No data source specified. Using synthetic data as fallback...")
            df = create_synthetic_data(n_patients=n_patients, duration_hours=duration_hours)
        
        self.data = df
        return df
    
    def prepare_features(self, include_ecg=False):
        """
        Extract features from raw data
        
        Args:
            include_ecg: Whether to extract ECG features
            
        Returns:
            X: Feature matrix
            feature_names: List of feature names
        """
        print("\n" + "="*80)
        print("FEATURE EXTRACTION")
        print("="*80)
        
        # Get vitals data (aggregate by patient if multiple)
        df_vitals = self.data.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
        
        # Extract features
        print("\nExtracting features from time-series data...")
        X, feature_names, timestamps = self.extractor.create_feature_matrix(
            df_vitals,
            window_size=config.WINDOW_SIZE_SECONDS,
            stride=30,  # 30 second overlap
            include_ecg=include_ecg
        )
        
        self.features = {
            'X': X,
            'feature_names': feature_names,
            'timestamps': timestamps,
            'vitals_at_windows': df_vitals.iloc[[t for t in range(0, len(df_vitals), 30)][:len(X)]]
        }
        
        return X, feature_names
    
    def train_anomaly_detector(self, X_train, feature_names):
        """
        Train Isolation Forest (Anomaly Detection)
        
        Args:
            X_train: Training features
            feature_names: Feature names
            
        Returns:
            model: Trained anomaly detector
        """
        print("\n" + "="*80)
        print("TRAINING MODEL 1: ISOLATION FOREST (ANOMALY DETECTION)")
        print("="*80)
        
        # Handle NaN values
        X_train_clean = np.nan_to_num(X_train, nan=0.0)
        
        self.anomaly_detector = AnomalyDetector()
        self.anomaly_detector.train(X_train_clean, feature_names=feature_names)
        self.anomaly_detector.save_model()
        
        return self.anomaly_detector
    
    def train_status_classifier(self, X_train, y_train, X_test, y_test, feature_names):
        """
        Train Random Forest (Patient Status Classification)
        
        Args:
            X_train, X_test: Training and test features
            y_train, y_test: Training and test labels
            feature_names: Feature names
            
        Returns:
            model: Trained classifier
        """
        print("\n" + "="*80)
        print("TRAINING MODEL 2: RANDOM FOREST (PATIENT STATUS CLASSIFICATION)")
        print("="*80)
        
        # Handle NaN values
        X_train_clean = np.nan_to_num(X_train, nan=0.0)
        X_test_clean = np.nan_to_num(X_test, nan=0.0)
        
        self.status_classifier = PatientStatusClassifier()
        self.status_classifier.train(X_train_clean, y_train, feature_names=feature_names)
        
        # Evaluate
        metrics = self.status_classifier.evaluate(X_test_clean, y_test)
        
        # Save model
        self.status_classifier.save_model()
        
        return self.status_classifier
    
    def train_cardiac_predictor(self, X_train, y_train, X_test, y_test, feature_names):
        """
        Train Logistic Regression (Cardiac Risk Prediction)
        
        Args:
            X_train, X_test: Training and test features
            y_train, y_test: Training and test labels
            feature_names: Feature names
            
        Returns:
            model: Trained predictor
        """
        print("\n" + "="*80)
        print("TRAINING MODEL 3: LOGISTIC REGRESSION (CARDIAC RISK PREDICTION)")
        print("="*80)
        
        # Handle NaN values
        X_train_clean = np.nan_to_num(X_train, nan=0.0)
        X_test_clean = np.nan_to_num(X_test, nan=0.0)
        
        self.cardiac_predictor = CardiacRiskPredictor()
        self.cardiac_predictor.train(X_train_clean, y_train, feature_names=feature_names)
        
        # Evaluate
        metrics = self.cardiac_predictor.evaluate(X_test_clean, y_test)
        
        # Save model
        self.cardiac_predictor.save_model()
        
        return self.cardiac_predictor
    
    def train_respiratory_predictor(self, df_vitals):
        """
        Train LSTM (Respiratory Prediction)
        
        Args:
            df_vitals: DataFrame with SpO2 and HR time series
            
        Returns:
            model: Trained LSTM predictor
        """
        print("\n" + "="*80)
        print("TRAINING MODEL 4: LSTM (RESPIRATORY PREDICTION)")
        print("="*80)
        
        # Create sliding windows for LSTM
        print("\nCreating time-series sequences...")
        X, y = self.preprocessor.create_sliding_windows(
            df_vitals[['SpO2', 'HR']].values,
            window_size=config.LSTM_CONFIG['sequence_length'],
            stride=60,
            prediction_horizon=config.PREDICTION_HORIZON_MINUTES * 60,
            include_target=True
        )
        
        # Split train/test
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, shuffle=False
        )
        
        # Further split for validation
        X_train, X_val, y_train, y_val = train_test_split(
            X_train, y_train, test_size=0.2, random_state=42, shuffle=False
        )
        
        # Initialize and train model
        self.respiratory_predictor = RespiratoryPredictor()
        self.respiratory_predictor.train(X_train, y_train, X_val, y_val)
        
        print("✓ Respiratory Predictor training complete!")
        
        return self.respiratory_predictor
    
    def train_all_models(self, n_patients=20, duration_hours=24, n_records=10):
        """
        Train all 4 AI models
        
        Args:
            n_patients: Number of patients for training (synthetic)
            duration_hours: Hours of data per patient (synthetic)
            n_records: Number of PhysioNet records (real data)
        """
        print("\n" + "="*80)
        print("🚀 SMART HOSPITAL - TRAINING ALL AI MODELS")
        print("="*80)
        
        if self.use_real_data:
            print("\n📊 Data Source: REAL PhysioNet Medical Data")
        else:
            print("\n📊 Data Source: Synthetic Simulated Data")
        
        # Step 1: Load/Generate Data
        df = self.load_or_generate_data(n_patients, duration_hours, n_records)
        
        # Step 2: Preprocess Data
        print("\nPreprocessing data...")
        df_vitals = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
        df_processed = self.preprocessor.preprocess_pipeline(df_vitals, for_training=True)
        
        # Step 3: Extract Features
        X, feature_names = self.prepare_features(include_ecg=False)
        
        # Get vitals at window timestamps for label creation
        vitals_at_windows = self.features['vitals_at_windows']
        
        # ====================================================================
        # MODEL 1: ISOLATION FOREST (Unsupervised - no labels needed)
        # ====================================================================
        
        X_train, X_test = train_test_split(X, test_size=0.2, random_state=42)
        model1 = self.train_anomaly_detector(X_train, feature_names)
        
        # ====================================================================
        # MODEL 2: RANDOM FOREST (Status Classification)
        # ====================================================================
        
        # Create labels
        print("\nCreating patient status labels...")
        y_status = create_patient_status_labels(vitals_at_windows)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_status, test_size=0.2, random_state=42, stratify=y_status
        )
        
        model2 = self.train_status_classifier(X_train, y_train, X_test, y_test, feature_names)
        
        # ====================================================================
        # MODEL 3: LOGISTIC REGRESSION (Cardiac Risk)
        # ====================================================================
        
        # Select cardiac-related features
        features_df = pd.DataFrame(X, columns=feature_names)
        X_cardiac, cardiac_features = self.extractor.select_features_for_model(
            features_df, 'logistic_regression'
        )
        
        # Create cardiac risk labels
        print("\nCreating cardiac risk labels...")
        y_cardiac = create_cardiac_risk_labels(vitals_at_windows)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X_cardiac, y_cardiac, test_size=0.2, random_state=42, stratify=y_cardiac
        )
        
        model3 = self.train_cardiac_predictor(X_train, y_train, X_test, y_test, cardiac_features)
        
        # ====================================================================
        # MODEL 4: LSTM (Respiratory Prediction)
        # ====================================================================
        
        model4 = self.train_respiratory_predictor(df_processed)
        
        # ====================================================================
        # TRAINING COMPLETE
        # ====================================================================
        
        print("\n" + "="*80)
        print("✅ ALL MODELS TRAINED SUCCESSFULLY!")
        print("="*80)
        
        print("\nTrained Models:")
        print("  1. ✓ Isolation Forest (Anomaly Detection)")
        print("  2. ✓ Random Forest (Patient Status Classification)")
        print("  3. ✓ Logistic Regression (Cardiac Risk Prediction)")
        print("  4. ✓ LSTM (Respiratory Prediction)")
        
        print("\nModels saved to:", config.MODELS_DIR)
        
        return {
            'anomaly_detector': model1,
            'status_classifier': model2,
            'cardiac_predictor': model3,
            'respiratory_predictor': model4
        }


# ============================================================================
# MAIN EXECUTION
# ============================================================================
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Train Smart Hospital AI Models')
    parser.add_argument('--patients', type=int, default=20, help='Number of patients for synthetic data')
    parser.add_argument('--hours', type=int, default=24, help='Hours of data per patient (synthetic)')
    parser.add_argument('--records', type=int, default=10, help='Number of PhysioNet records to load (real data)')
    parser.add_argument('--real-data', action='store_true', help='Use real PhysioNet data instead of synthetic')
    parser.add_argument('--download-data', action='store_true', help='Download PhysioNet datasets first')
    
    args = parser.parse_args()
    
    # Download data if requested
    if args.download_data:
        print("\n🔽 Downloading PhysioNet datasets...")
        from load_real_datasets import download_all_recommended_data
        download_all_recommended_data()
        print("\n✓ Download complete. Re-run with --real-data to train on real data.")
        import sys
        sys.exit(0)
    
    # Create trainer
    trainer = ModelTrainer(
        use_synthetic_data=not args.real_data,
        use_real_data=args.real_data
    )
    
    # Train all models
    models = trainer.train_all_models(
        n_patients=args.patients,
        duration_hours=args.hours,
        n_records=args.records
    )
    
    print("\n" + "="*80)
    print("🎉 TRAINING PIPELINE COMPLETE!")
    print("="*80)
    print("\nNext steps:")
    print("  1. Review model performance metrics")
    print("  2. Test models with inference.py")
    print("  3. Integrate with IoT backend")
    print("  4. Deploy to production")
