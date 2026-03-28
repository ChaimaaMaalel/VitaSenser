"""
Smart Hospital - Model 4: LSTM (Respiratory Prediction)
Predicts future SpO2 values (respiratory deterioration) using time-series analysis
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

# TensorFlow/Keras imports
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
    HAS_TENSORFLOW = True
except ImportError:
    print("⚠ Warning: TensorFlow not installed. LSTM model will not be available.")
    HAS_TENSORFLOW = False

from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import joblib

import config

class RespiratoryPredictor:
    """
    LSTMneural network for predicting future SpO2 values
    """
    
    def __init__(self, **kwargs):
        """
        Initialize LSTM model
        
        Args:
            **kwargs: Override default config parameters
        """
        if not HAS_TENSORFLOW:
            raise ImportError("TensorFlow is required for LSTM model. Install with: pip install tensorflow")
        
        self.config = {**config.LSTM_CONFIG, **kwargs}
        self.model = None
        self.is_trained = False
        self.history = None
        self.scaler_X = None
        self.scaler_y = None
        
    def build_model(self):
        """
        Build LSTM neural network architecture
        
        Returns:
            model: Compiled Keras model
        """
        print("\n" + "="*60)
        print("BUILDING LSTM MODEL - RESPIRATORY PREDICTION")
        print("="*60)
        
        model = Sequential(name='RespiratoryPredictor_LSTM')
        
        # Input shape: (sequence_length, n_features)
        input_shape = (self.config['sequence_length'], self.config['n_features'])
        
        # First LSTM layer
        model.add(LSTM(
            units=self.config['lstm_units'][0],
            return_sequences=True,  # Return sequences for stacked LSTM
            input_shape=input_shape,
            name='lstm_1'
        ))
        model.add(Dropout(self.config['dropout'], name='dropout_1'))
        
        # Second LSTM layer
        model.add(LSTM(
            units=self.config['lstm_units'][1],
            return_sequences=False,  # Last LSTM layer
            name='lstm_2'
        ))
        model.add(Dropout(self.config['dropout'], name='dropout_2'))
        
        # Dense layers
        model.add(Dense(self.config['dense_units'], activation='relu', name='dense_1'))
        model.add(Dropout(self.config['dropout'], name='dropout_3'))
        
        # Output layer (single value: predicted SpO2)
        model.add(Dense(1, activation='linear', name='output'))
        
        # Compile model
        optimizer = keras.optimizers.Adam(learning_rate=self.config['learning_rate'])
        model.compile(
            optimizer=optimizer,
            loss='mse',  # Mean Squared Error
            metrics=['mae', 'mse']  # Mean Absolute Error, MSE
        )
        
        # Print model summary
        print("\nModel Architecture:")
        print("="*60)
        model.summary()
        
        self.model = model
        return model
    
    def train(self, X_train, y_train, X_val=None, y_val=None):
        """
        Train the LSTM model
        
        Args:
            X_train: Training sequences (n_samples, sequence_length, n_features)
            y_train: Target values (n_samples,)
            X_val: Validation sequences (optional)
            y_val: Validation targets (optional)
            
        Returns:
            history: Training history
        """
        print("\n" + "="*60)
        print("TRAINING LSTM MODEL")
        print("="*60)
        
        print(f"\nTraining data shape: {X_train.shape}")
        print(f"Target data shape: {y_train.shape}")
        
        # Build model if not already built
        if self.model is None:
            self.build_model()
        
        # Reshape y if needed
        if len(y_train.shape) == 1:
            y_train = y_train.reshape(-1, 1)
        if y_val is not None and len(y_val.shape) == 1:
            y_val = y_val.reshape(-1, 1)
        
        # Prepare validation data
        if X_val is not None and y_val is not None:
            validation_data = (X_val, y_val)
            print(f"Validation data shape: {X_val.shape}")
        else:
            validation_data = None
            print("No validation data provided, using validation_split from config")
        
        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss' if validation_data else 'loss',
                patience=self.config['early_stopping_patience'],
                restore_best_weights=True,
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss' if validation_data else 'loss',
                factor=0.5,
                patience=5,
                min_lr=1e-6,
                verbose=1
            )
        ]
        
        # Train model
        print("\nStarting training...")
        history = self.model.fit(
            X_train, y_train,
            batch_size=self.config['batch_size'],
            epochs=self.config['epochs'],
            validation_data=validation_data,
            validation_split=self.config['validation_split'] if validation_data is None else 0.0,
            callbacks=callbacks,
            verbose=1
        )
        
        self.history = history
        self.is_trained = True
        
        print("\n✓ Training complete!")
        
        return history
    
    def predict(self, X):
        """
        Predict future SpO2 values
        
        Args:
            X: Input sequences (n_samples, sequence_length, n_features)
            
        Returns:
            predictions: Predicted SpO2 values
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        predictions = self.model.predict(X, verbose=0)
        return predictions.flatten()
    
    def predict_single(self, sequence):
        """
        Predict for a single sequence
        
        Args:
            sequence: Single sequence (sequence_length, n_features)
            
        Returns:
            prediction: Single predicted value
        """
        if sequence.ndim == 2:
            sequence = sequence.reshape(1, sequence.shape[0], sequence.shape[1])
        
        prediction = self.predict(sequence)[0]
        return prediction
    
    def evaluate(self, X_test, y_test):
        """
        Evaluate model performance
        
        Args:
            X_test: Test sequences
            y_test: True target values
            
        Returns:
            metrics: Dictionary of evaluation metrics
        """
        print("\n" + "="*60)
        print("EVALUATING LSTM MODEL")
        print("="*60)
        
        # Get predictions
        y_pred = self.predict(X_test)
        
        # Reshape if needed
        if len(y_test.shape) > 1:
            y_test = y_test.flatten()
        
        # Calculate metrics
        metrics = {
            'mse': mean_squared_error(y_test, y_pred),
            'rmse': np.sqrt(mean_squared_error(y_test, y_pred)),
            'mae': mean_absolute_error(y_test, y_pred),
            'r2': r2_score(y_test, y_pred)
        }
        
        # Calculate percentage error
        mape = np.mean(np.abs((y_test - y_pred) / (y_test + 1e-10))) * 100
        metrics['mape'] = mape
        
        # Print results
        print(f"\nRegression Metrics:")
        print(f"MSE:  {metrics['mse']:.4f}")
        print(f"RMSE: {metrics['rmse']:.4f}")
        print(f"MAE:  {metrics['mae']:.4f}")
        print(f"R²:   {metrics['r2']:.4f}")
        print(f"MAPE: {metrics['mape']:.2f}%")
        
        return metrics
    
    def plot_training_history(self, save_path=None):
        """Plot training history (loss curves)"""
        if self.history is None:
            print("⚠ No training history available")
            return
        
        history = self.history.history
        
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        # Plot loss
        axes[0].plot(history['loss'], label='Training Loss')
        if 'val_loss' in history:
            axes[0].plot(history['val_loss'], label='Validation Loss')
        axes[0].set_xlabel('Epoch')
        axes[0].set_ylabel('Loss (MSE)')
        axes[0].set_title('Model Loss Over Epochs')
        axes[0].legend()
        axes[0].grid(alpha=0.3)
        
        # Plot MAE
        axes[1].plot(history['mae'], label='Training MAE')
        if 'val_mae' in history:
            axes[1].plot(history['val_mae'], label='Validation MAE')
        axes[1].set_xlabel('Epoch')
        axes[1].set_ylabel('Mean Absolute Error')
        axes[1].set_title('Model MAE Over Epochs')
        axes[1].legend()
        axes[1].grid(alpha=0.3)
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def plot_predictions(self, X_test, y_test, n_samples=100, save_path=None):
        """Plot predicted vs actual values"""
        y_pred = self.predict(X_test)
        
        if len(y_test.shape) > 1:
            y_test = y_test.flatten()
        
        # Plot subset of samples
        n_samples = min(n_samples, len(y_test))
        indices = range(n_samples)
        
        plt.figure(figsize=(14, 6))
        
        plt.plot(indices, y_test[:n_samples], 'o-', label='Actual SpO2', alpha=0.7, markersize=4)
        plt.plot(indices, y_pred[:n_samples], 's-', label='Predicted SpO2', alpha=0.7, markersize=4)
        
        plt.xlabel('Sample Index')
        plt.ylabel('SpO2 (%)')
        plt.title(f'LSTM Predictions vs Actual (Prediction Horizon: {config.PREDICTION_HORIZON_MINUTES} min)')
        plt.legend()
        plt.grid(alpha=0.3)
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def plot_residuals(self, X_test, y_test, save_path=None):
        """Plot prediction residuals"""
        y_pred = self.predict(X_test)
        
        if len(y_test.shape) > 1:
            y_test = y_test.flatten()
        
        residuals = y_test - y_pred
        
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        # Residuals distribution
        axes[0].hist(residuals, bins=50, edgecolor='black', alpha=0.7)
        axes[0].axvline(0, color='red', linestyle='--', linewidth=2)
        axes[0].set_xlabel('Residuals (Actual - Predicted)')
        axes[0].set_ylabel('Frequency')
        axes[0].set_title('Distribution of Prediction Residuals')
        axes[0].grid(alpha=0.3)
        
        # Residuals vs predicted
        axes[1].scatter(y_pred, residuals, alpha=0.5)
        axes[1].axhline(0, color='red', linestyle='--', linewidth=2)
        axes[1].set_xlabel('Predicted SpO2')
        axes[1].set_ylabel('Residuals')
        axes[1].set_title('Residuals vs Predicted Values')
        axes[1].grid(alpha=0.3)
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def save_model(self, path=None):
        """Save trained model to disk"""
        if path is None:
            path = config.MODEL_PATHS['lstm']
        
        # Save Keras model
        self.model.save(path)
        
        # Save additional metadata
        metadata_path = path.replace('.h5', '_metadata.pkl')
        joblib.dump({
            'config': self.config,
            'is_trained': self.is_trained,
            'scaler_X': self.scaler_X,
            'scaler_y': self.scaler_y
        }, metadata_path)
        
        print(f"✓ Model saved to {path}")
        print(f"✓ Metadata saved to {metadata_path}")
    
    def load_model(self, path=None):
        """Load trained model from disk"""
        if path is None:
            path = config.MODEL_PATHS['lstm']
        
        # Load Keras model
        self.model = keras.models.load_model(path)
        
        # Load metadata
        metadata_path = path.replace('.h5', '_metadata.pkl')
        metadata = joblib.load(metadata_path)
        self.config = metadata['config']
        self.is_trained = metadata['is_trained']
        self.scaler_X = metadata.get('scaler_X')
        self.scaler_y = metadata.get('scaler_y')
        
        print(f"✓ Model loaded from {path}")
        return self


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    if not HAS_TENSORFLOW:
        print("⚠ TensorFlow not installed. Cannot run LSTM demo.")
        print("Install with: pip install tensorflow")
    else:
        from data_preprocessing import create_synthetic_data, DataPreprocessor
        
        print("="*60)
        print("LSTM - RESPIRATORY PREDICTION DEMO")
        print("="*60)
        
        # Generate synthetic data
        print("\nGenerating synthetic data...")
        df = create_synthetic_data(n_patients=5, duration_hours=3)
        df_patient = df[df['patient_id'] == 0].set_index('timestamp')[['SpO2', 'HR']]
        
        # Preprocess data
        print("\nPreprocessing data...")
        preprocessor = DataPreprocessor()
        
        # Create sliding windows
        print("\nCreating time-series sequences...")
        X, y = preprocessor.create_sliding_windows(
            df_patient.values,
            window_size=config.LSTM_CONFIG['sequence_length'],  # 10 minutes
            stride=60,  # 1 minute
            prediction_horizon=config.PREDICTION_HORIZON_MINUTES * 60,  # 30 minutes in seconds
            target_col='SpO2',
            include_target=True
        )
        
        print(f"\nSequence shape: {X.shape}")
        print(f"Target shape: {y.shape}")
        
        # Split train/test
        from sklearn.model_selection import train_test_split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, shuffle=False)
        
        # Further split train into train/validation
        X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42, shuffle=False)
        
        print(f"\nTrain set: {X_train.shape[0]} sequences")
        print(f"Validation set: {X_val.shape[0]} sequences")
        print(f"Test set: {X_test.shape[0]} sequences")
        
        # Create and train model
        predictor = RespiratoryPredictor(epochs=20)  # Reduced epochs for demo
        predictor.train(X_train, y_train, X_val, y_val)
        
        # Evaluate
        metrics = predictor.evaluate(X_test, y_test)
        
        # Plot results
        predictor.plot_training_history()
        predictor.plot_predictions(X_test, y_test, n_samples=50)
        predictor.plot_residuals(X_test, y_test)
        
        # Test single prediction
        print("\n" + "="*60)
        print("SINGLE SEQUENCE PREDICTION TEST")
        print("="*60)
        
        test_sequence = X_test[0]
        prediction = predictor.predict_single(test_sequence)
        actual = y_test[0]
        
        print(f"\nPredicted SpO2 (in {config.PREDICTION_HORIZON_MINUTES} min): {prediction:.2f}%")
        print(f"Actual SpO2: {actual:.2f}%")
        print(f"Error: {abs(prediction - actual):.2f}%")
        
        # Save model
        predictor.save_model()
        
        print("\n✓ Demo complete!")
