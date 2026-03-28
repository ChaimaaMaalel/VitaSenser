"""
Smart Hospital - Quick Test Script
Verifies that all components are working correctly
"""

import sys
import warnings
warnings.filterwarnings('ignore')

def test_imports():
    """Test that all required modules can be imported"""
    print("\n" + "="*60)
    print("TEST 1: Importing Modules")
    print("="*60)
    
    try:
        import numpy
        print("✓ NumPy")
    except ImportError as e:
        print(f"✗ NumPy - {e}")
        return False
    
    try:
        import pandas
        print("✓ Pandas")
    except ImportError as e:
        print(f"✗ Pandas - {e}")
        return False
    
    try:
        import sklearn
        print("✓ Scikit-learn")
    except ImportError as e:
        print(f"✗ Scikit-learn - {e}")
        return False
    
    try:
        import tensorflow
        print("✓ TensorFlow")
    except ImportError as e:
        print(f"⚠ TensorFlow (LSTM will not work) - {e}")
    
    try:
        import config
        print("✓ Config")
    except ImportError as e:
        print(f"✗ Config - {e}")
        return False
    
    return True

def test_data_preprocessing():
    """Test data preprocessing module"""
    print("\n" + "="*60)
    print("TEST 2: Data Preprocessing")
    print("="*60)
    
    try:
        from data_preprocessing import create_synthetic_data, DataPreprocessor
        
        # Generate small dataset
        df = create_synthetic_data(n_patients=2, duration_hours=1)
        print(f"✓ Generated synthetic data: {len(df)} samples")
        
        # Test preprocessor
        preprocessor = DataPreprocessor()
        df_clean = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
        df_processed = preprocessor.preprocess_pipeline(df_clean[:100], for_training=True)
        print(f"✓ Preprocessing successful: {len(df_processed)} samples")
        
        return True
    except Exception as e:
        print(f"✗ Data preprocessing failed: {e}")
        return False

def test_feature_extraction():
    """Test feature extraction module"""
    print("\n" + "="*60)
    print("TEST 3: Feature Extraction")
    print("="*60)
    
    try:
        from data_preprocessing import create_synthetic_data
        from feature_extraction import FeatureExtractor
        
        # Generate data
        df = create_synthetic_data(n_patients=1, duration_hours=1)
        df_vitals = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
        
        # Extract features
        extractor = FeatureExtractor()
        X, feature_names, timestamps = extractor.create_feature_matrix(
            df_vitals[:200],
            window_size=60,
            stride=30,
            include_ecg=False
        )
        
        print(f"✓ Feature extraction successful")
        print(f"  - Feature matrix shape: {X.shape}")
        print(f"  - Number of features: {len(feature_names)}")
        
        return True
    except Exception as e:
        print(f"✗ Feature extraction failed: {e}")
        return False

def test_models():
    """Test that all model classes can be instantiated"""
    print("\n" + "="*60)
    print("TEST 4: Model Initialization")
    print("="*60)
    
    success = True
    
    try:
        from model_isolation_forest import AnomalyDetector
        model = AnomalyDetector()
        print("✓ Isolation Forest (Anomaly Detection)")
    except Exception as e:
        print(f"✗ Isolation Forest - {e}")
        success = False
    
    try:
        from model_random_forest import PatientStatusClassifier
        model = PatientStatusClassifier()
        print("✓ Random Forest (Patient Status)")
    except Exception as e:
        print(f"✗ Random Forest - {e}")
        success = False
    
    try:
        from model_logistic_regression import CardiacRiskPredictor
        model = CardiacRiskPredictor()
        print("✓ Logistic Regression (Cardiac Risk)")
    except Exception as e:
        print(f"✗ Logistic Regression - {e}")
        success = False
    
    try:
        from model_lstm import RespiratoryPredictor, HAS_TENSORFLOW
        if HAS_TENSORFLOW:
            model = RespiratoryPredictor()
            print("✓ LSTM (Respiratory Prediction)")
        else:
            print("⚠ LSTM (TensorFlow not installed)")
    except Exception as e:
        print(f"✗ LSTM - {e}")
        success = False
    
    return success

def test_training():
    """Test training pipeline (quick test with minimal data)"""
    print("\n" + "="*60)
    print("TEST 5: Training Pipeline (Quick Test)")
    print("="*60)
    
    try:
        from train import ModelTrainer
        
        # Create trainer with minimal data
        trainer = ModelTrainer(use_synthetic_data=True)
        
        # Generate minimal data
        df = trainer.load_or_generate_data(n_patients=3, duration_hours=1)
        print("✓ Data generation successful")
        
        # Extract features
        X, feature_names = trainer.prepare_features(include_ecg=False)
        print("✓ Feature preparation successful")
        
        print("✓ Training pipeline structure verified")
        print("  (Full training test skipped - run 'python train.py' to train)")
        
        return True
    except Exception as e:
        print(f"✗ Training pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_inference():
    """Test inference engine initialization"""
    print("\n" + "="*60)
    print("TEST 6: Inference Engine")
    print("="*60)
    
    try:
        from inference import SmartHospitalInference
        
        # Initialize without loading models (they may not exist yet)
        engine = SmartHospitalInference(load_models=False)
        print("✓ Inference engine initialized")
        
        # Test buffer operations
        engine.add_patient_data("TEST_001", {
            'HR': 75,
            'SpO2': 98,
            'Temperature': 37.0
        })
        
        buffer = engine.get_patient_buffer("TEST_001")
        print(f"✓ Patient buffer operations working ({len(buffer)} samples)")
        
        return True
    except Exception as e:
        print(f"✗ Inference engine failed: {e}")
        return False

def run_all_tests():
    """Run all tests and provide summary"""
    print("\n" + "="*60)
    print("🏥 SMART HOSPITAL - SYSTEM TEST")
    print("="*60)
    
    results = {
        'Imports': test_imports(),
        'Data Preprocessing': test_data_preprocessing(),
        'Feature Extraction': test_feature_extraction(),
        'Models': test_models(),
        'Training Pipeline': test_training(),
        'Inference Engine': test_inference()
    }
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{test_name:25s}: {status}")
    
    print(f"\n{passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ ALL TESTS PASSED - System ready!")
        print("\nNext steps:")
        print("  1. Train models: python train.py")
        print("  2. Test inference: python inference.py")
        return 0
    else:
        print("\n⚠ SOME TESTS FAILED - Check errors above")
        print("\nTroubleshooting:")
        print("  1. Ensure all dependencies installed: pip install -r requirements.txt")
        print("  2. Check Python version >= 3.8")
        print("  3. Review error messages above")
        return 1

if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
