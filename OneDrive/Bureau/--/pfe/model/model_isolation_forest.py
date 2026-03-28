"""
Smart Hospital - Model 1: Isolation Forest (Anomaly Detection)
Detects abnormal patterns in real-time vital signs
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import joblib
import matplotlib.pyplot as plt
import seaborn as sns

import config

class AnomalyDetector:
    """
    Isolation Forest model for detecting anomalies in patient vital signs
    """
    
    def __init__(self, **kwargs):
        """
        Initialize Isolation Forest model
        
        Args:
            **kwargs: Override default config parameters
        """
        # Merge default config with any overrides
        model_config = {**config.ISOLATION_FOREST_CONFIG, **kwargs}
        
        self.model = IsolationForest(**model_config)
        self.threshold = config.ANOMALY_SCORE_THRESHOLD
        self.is_trained = False
        self.feature_names = None
        
    def train(self, X_train, feature_names=None):
        """
        Train the Isolation Forest model
        
        Args:
            X_train: Training data (n_samples, n_features)
            feature_names: List of feature names for interpretation
            
        Returns:
            self: Trained model
        """
        print("\n" + "="*60)
        print("TRAINING ISOLATION FOREST - ANOMALY DETECTION")
        print("="*60)
        
        print(f"\nTraining data shape: {X_train.shape}")
        print(f"Number of samples: {X_train.shape[0]}")
        print(f"Number of features: {X_train.shape[1]}")
        
        # Train model
        print("\nTraining model...")
        self.model.fit(X_train)
        
        self.is_trained = True
        self.feature_names = feature_names
        
        # Calculate anomaly scores on training data
        anomaly_scores = self.get_anomaly_scores(X_train)
        n_anomalies = np.sum(anomaly_scores > self.threshold)
        
        print(f"✓ Model trained successfully")
        print(f"Detected anomalies in training: {n_anomalies} / {len(X_train)} ({n_anomalies/len(X_train)*100:.2f}%)")
        
        return self
    
    def predict(self, X):
        """
        Predict anomalies (binary: normal=0, anomaly=1)
        
        Args:
            X: Input data (n_samples, n_features)
            
        Returns:
            predictions: Array of 0 (normal) or 1 (anomaly)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        # Isolation Forest returns -1 for anomalies, 1 for normal
        predictions = self.model.predict(X)
        
        # Convert to 0/1 (0=normal, 1=anomaly)
        predictions = np.where(predictions == -1, 1, 0)
        
        return predictions
    
    def get_anomaly_scores(self, X):
        """
        Get continuous anomaly scores (0-1 scale)
        
        Args:
            X: Input data
            
        Returns:
            scores: Anomaly scores (higher = more anomalous)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before scoring")
        
        # Get decision function scores (negative for anomalies)
        raw_scores = self.model.decision_function(X)
        
        # Normalize to 0-1 range (0=normal, 1=anomaly)
        # Lower decision function value = more anomalous
        scores = 1 / (1 + np.exp(raw_scores))  # Sigmoid transformation
        
        return scores
    
    def detect_anomalies_realtime(self, X, return_scores=True):
        """
        Detect anomalies and return detailed results
        
        Args:
            X: Input data
            return_scores: Whether to return anomaly scores
            
        Returns:
            results: Dictionary with predictions and optional scores
        """
        predictions = self.predict(X)
        
        results = {
            'predictions': predictions,
            'n_anomalies': np.sum(predictions),
            'anomaly_percentage': (np.sum(predictions) / len(predictions)) * 100
        }
        
        if return_scores:
            scores = self.get_anomaly_scores(X)
            results['scores'] = scores
            results['max_score'] = np.max(scores)
            results['mean_score'] = np.mean(scores)
        
        return results
    
    def evaluate(self, X_test, y_test):
        """
        Evaluate model performance (requires labeled test data)
        
        Args:
            X_test: Test features
            y_test: True labels (0=normal, 1=anomaly)
            
        Returns:
            metrics: Dictionary of evaluation metrics
        """
        print("\n" + "="*60)
        print("EVALUATING ANOMALY DETECTION MODEL")
        print("="*60)
        
        # Get predictions
        y_pred = self.predict(X_test)
        scores = self.get_anomaly_scores(X_test)
        
        # Calculate metrics
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        
        metrics = {
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, zero_division=0),
            'recall': recall_score(y_test, y_pred, zero_division=0),
            'f1_score': f1_score(y_test, y_pred, zero_division=0)
        }
        
        # ROC-AUC using anomaly scores
        try:
            metrics['roc_auc'] = roc_auc_score(y_test, scores)
        except:
            metrics['roc_auc'] = 0.0
        
        # Print results
        print(f"\nAccuracy:  {metrics['accuracy']:.4f}")
        print(f"Precision: {metrics['precision']:.4f}")
        print(f"Recall:    {metrics['recall']:.4f}")
        print(f"F1-Score:  {metrics['f1_score']:.4f}")
        print(f"ROC-AUC:   {metrics['roc_auc']:.4f}")
        
        # Confusion matrix
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(cm)
        
        return metrics
    
    def get_feature_importance(self, X, n_top=10):
        """
        Calculate feature importance for anomaly detection
        
        Args:
            X: Input data
            n_top: Number of top features to return
            
        Returns:
            importance_df: DataFrame with feature importance
        """
        if self.feature_names is None:
            print("⚠ Warning: Feature names not provided")
            self.feature_names = [f"feature_{i}" for i in range(X.shape[1])]
        
        # Calculate anomaly score variance when each feature is permuted
        base_scores = self.get_anomaly_scores(X)
        importances = []
        
        print(f"\nCalculating feature importance...")
        
        for i in range(X.shape[1]):
            X_permuted = X.copy()
            np.random.shuffle(X_permuted[:, i])  # Permute feature i
            permuted_scores = self.get_anomaly_scores(X_permuted)
            
            # Importance = change in anomaly scores
            importance = np.mean(np.abs(permuted_scores - base_scores))
            importances.append(importance)
        
        # Create DataFrame
        importance_df = pd.DataFrame({
            'feature': self.feature_names,
            'importance': importances
        }).sort_values('importance', ascending=False)
        
        # Print top features
        print(f"\nTop {n_top} most important features:")
        print(importance_df.head(n_top).to_string(index=False))
        
        return importance_df
    
    def plot_anomaly_distribution(self, X, y_true=None, save_path=None):
        """
        Plot distribution of anomaly scores
        
        Args:
            X: Input data
            y_true: True labels (optional)
            save_path: Path to save plot
        """
        scores = self.get_anomaly_scores(X)
        predictions = self.predict(X)
        
        plt.figure(figsize=(12, 5))
        
        # Plot 1: Score distribution
        plt.subplot(1, 2, 1)
        plt.hist(scores, bins=50, alpha=0.7, edgecolor='black')
        plt.axvline(self.threshold, color='red', linestyle='--', label=f'Threshold={self.threshold}')
        plt.xlabel('Anomaly Score')
        plt.ylabel('Frequency')
        plt.title('Distribution of Anomaly Scores')
        plt.legend()
        
        # Plot 2: Predictions over time
        plt.subplot(1, 2, 2)
        plt.plot(scores, alpha=0.6, label='Anomaly Score')
        plt.axhline(self.threshold, color='red', linestyle='--', label='Threshold')
        plt.scatter(np.where(predictions == 1)[0], scores[predictions == 1], 
                   color='red', s=50, label='Detected Anomalies', zorder=3)
        plt.xlabel('Sample Index')
        plt.ylabel('Anomaly Score')
        plt.title('Anomaly Detection Over Time')
        plt.legend()
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def save_model(self, path=None):
        """Save trained model to disk"""
        if path is None:
            path = config.MODEL_PATHS['isolation_forest']
        
        joblib.dump({
            'model': self.model,
            'threshold': self.threshold,
            'feature_names': self.feature_names,
            'is_trained': self.is_trained
        }, path)
        
        print(f"✓ Model saved to {path}")
    
    def load_model(self, path=None):
        """Load trained model from disk"""
        if path is None:
            path = config.MODEL_PATHS['isolation_forest']
        
        saved_data = joblib.load(path)
        self.model = saved_data['model']
        self.threshold = saved_data['threshold']
        self.feature_names = saved_data['feature_names']
        self.is_trained = saved_data['is_trained']
        
        print(f"✓ Model loaded from {path}")
        return self


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    from data_preprocessing import create_synthetic_data
    from feature_extraction import FeatureExtractor
    
    print("="*60)
    print("ISOLATION FOREST - ANOMALY DETECTION DEMO")
    print("="*60)
    
    # Generate synthetic data
    print("\nGenerating synthetic data...")
    df = create_synthetic_data(n_patients=5, duration_hours=2)
    df_patient = df[df['patient_id'] == 0].set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
    
    # Extract features
    print("\nExtracting features...")
    extractor = FeatureExtractor()
    X, feature_names, timestamps = extractor.create_feature_matrix(
        df_patient, 
        window_size=60, 
        stride=30,
        include_ecg=False
    )
    
    # Create labels (synthetic: mark some as anomalies)
    y = np.zeros(len(X))
    anomaly_indices = np.random.choice(len(X), size=int(0.1*len(X)), replace=False)
    y[anomaly_indices] = 1
    
    # Split train/test
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    
    # Train model
    detector = AnomalyDetector()
    detector.train(X_train, feature_names=feature_names)
    
    # Evaluate
    metrics = detector.evaluate(X_test, y_test)
    
    # Get feature importance
    importance = detector.get_feature_importance(X_train, n_top=10)
    
    # Plot results
    detector.plot_anomaly_distribution(X_test, y_test)
    
    # Save model
    detector.save_model()
    
    print("\n✓ Demo complete!")
