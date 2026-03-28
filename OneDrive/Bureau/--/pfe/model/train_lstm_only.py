"""
Train just the LSTM model (Model 4)
"""

import numpy as np
from data_preprocessing import create_synthetic_data, DataPreprocessor
from model_lstm import RespiratoryPredictor
import config
from sklearn.model_selection import train_test_split

print("="*80)
print("TRAINING LSTM MODEL ONLY")
print("="*80)

# Generate data
print("\nGenerating synthetic data...")
df = create_synthetic_data(n_patients=20, duration_hours=24)
df_vitals = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]

# Preprocess
print("Preprocessing...")
preprocessor = DataPreprocessor()
df_processed = preprocessor.preprocess_pipeline(df_vitals, for_training=True)

# Create sequences
print("\nCreating LSTM sequences...")
X, y = preprocessor.create_sliding_windows(
    df_processed[['SpO2', 'HR']].values,
    window_size=config.LSTM_CONFIG['sequence_length'],
    stride=60,
    prediction_horizon=config.PREDICTION_HORIZON_MINUTES * 60,
    include_target=True
)

print(f"✓ Created {len(X)} sequences")

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, shuffle=False
)

X_train, X_val, y_train, y_val = train_test_split(
    X_train, y_train, test_size=0.2, random_state=42, shuffle=False
)

print(f"\nTrain: {len(X_train)} samples")
print(f"Val: {len(X_val)} samples")
print(f"Test: {len(X_test)} samples")

# Train LSTM
print("\n" + "="*80)
print("TRAINING LSTM...")
print("="*80)

predictor = RespiratoryPredictor()
predictor.train(X_train, y_train, X_val, y_val)

# Evaluate
print("\n" + "="*80)
print("EVALUATING...")
print("="*80)
metrics = predictor.evaluate(X_test, y_test)

# Save
print("\nSaving model...")
predictor.save_model()

print("\n" + "="*80)
print("✅ LSTM MODEL TRAINING COMPLETE!")
print("="*80)
print(f"\nModel saved to: {config.MODELS_DIR / 'lstm_model.h5'}")
print(f"\nTest Metrics:")
for key, value in metrics.items():
    print(f"  {key}: {value:.4f}")
