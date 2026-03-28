"""
Smart Hospital - Model 2: Random Forest (Patient Status Classification)
Classifies patient status: Stable 🟢 / Warning 🟠 / Critical 🔴
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, accuracy_score
from sklearn.metrics import precision_score, recall_score, f1_score
import joblib
import matplotlib.pyplot as plt
import seaborn as sns

import config

class PatientStatusClassifier:
    """
    Random Forest classifier for patient status (multi-class classification)
    """
    
    def __init__(self, **kwargs):
        """
        Initialize Random Forest classifier
        
        Args:
            **kwargs: Override default config parameters
        """
        model_config = {**config.RANDOM_FOREST_CONFIG, **kwargs}
        
        self.model = RandomForestClassifier(**model_config)
        self.is_trained = False
        self.feature_names = None
        self.classes = config.PATIENT_STATUS
        
    def train(self, X_train, y_train, feature_names=None):
        """
        Train the Random Forest classifier
        
        Args:
            X_train: Training features (n_samples, n_features)
            y_train: Training labels (0=Stable, 1=Warning, 2=Critical)
            feature_names: List of feature names
            
        Returns:
            self: Trained model
        """
        print("\n" + "="*60)
        print("TRAINING RANDOM FOREST - PATIENT STATUS CLASSIFICATION")
        print("="*60)
        
        print(f"\nTraining data shape: {X_train.shape}")
        print(f"Number of samples: {X_train.shape[0]}")
        print(f"Number of features: {X_train.shape[1]}")
        
        # Check class distribution
        unique, counts = np.unique(y_train, return_counts=True)
        print(f"\nClass distribution:")
        for cls, count in zip(unique, counts):
            print(f"  {self.classes.get(cls, f'Class {cls}')}: {count} ({count/len(y_train)*100:.1f}%)")
        
        # Train model
        print("\nTraining model...")
        self.model.fit(X_train, y_train)
        
        self.is_trained = True
        self.feature_names = feature_names
        
        # Training accuracy
        train_pred = self.model.predict(X_train)
        train_acc = accuracy_score(y_train, train_pred)
        
        print(f"✓ Model trained successfully")
        print(f"Training accuracy: {train_acc:.4f}")
        
        return self
    
    def predict(self, X):
        """
        Predict patient status
        
        Args:
            X: Input features
            
        Returns:
            predictions: Class labels (0, 1, or 2)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        return self.model.predict(X)
    
    def predict_proba(self, X):
        """
        Predict class probabilities
        
        Args:
            X: Input features
            
        Returns:
            probabilities: Array of shape (n_samples, n_classes)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        return self.model.predict_proba(X)
    
    def predict_with_confidence(self, X, confidence_threshold=None):
        """
        Predict with confidence scores
        
        Args:
            X: Input features
            confidence_threshold: Minimum confidence for prediction
            
        Returns:
            results: Dictionary with predictions and confidence
        """
        if confidence_threshold is None:
            confidence_threshold = config.CLASSIFICATION_CONFIDENCE_THRESHOLD
        
        predictions = self.predict(X)
        probabilities = self.predict_proba(X)
        
        # Get confidence (max probability for each sample)
        confidence = np.max(probabilities, axis=1)
        
        # Flag low-confidence predictions
        low_confidence_mask = confidence < confidence_threshold
        
        results = {
            'predictions': predictions,
            'probabilities': probabilities,
            'confidence': confidence,
            'low_confidence_indices': np.where(low_confidence_mask)[0],
            'n_low_confidence': np.sum(low_confidence_mask)
        }
        
        if results['n_low_confidence'] > 0:
            print(f"⚠ Warning: {results['n_low_confidence']} predictions have confidence < {confidence_threshold}")
        
        return results
    
    def classify_patient(self, features):
        """
        Classify a single patient and return detailed status
        
        Args:
            features: Feature vector for one patient
            
        Returns:
            status: Dictionary with classification results
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        prediction = self.predict(features)[0]
        probabilities = self.predict_proba(features)[0]
        confidence = np.max(probabilities)
        
        status = {
            'class': int(prediction),
            'status': self.classes[prediction],
            'confidence': float(confidence),
            'probabilities': {
                'Stable': float(probabilities[0]),
                'Warning': float(probabilities[1]) if len(probabilities) > 1 else 0.0,
                'Critical': float(probabilities[2]) if len(probabilities) > 2 else 0.0
            },
            'alert_level': self._get_alert_level(prediction, confidence)
        }
        
        return status
    
    def _get_alert_level(self, prediction, confidence):
        """Determine alert level based on prediction and confidence"""
        if prediction == 2:  # Critical
            return 'HIGH' if confidence > 0.7 else 'MEDIUM'
        elif prediction == 1:  # Warning
            return 'MEDIUM' if confidence > 0.7 else 'LOW'
        else:  # Stable
            return 'NONE'
    
    def evaluate(self, X_test, y_test):
        """
        Evaluate model performance
        
        Args:
            X_test: Test features
            y_test: True labels
            
        Returns:
            metrics: Dictionary of evaluation metrics
        """
        print("\n" + "="*60)
        print("EVALUATING PATIENT STATUS CLASSIFIER")
        print("="*60)
        
        # Get predictions
        y_pred = self.predict(X_test)
        y_proba = self.predict_proba(X_test)
        
        # Calculate metrics
        metrics = {
            'accuracy': accuracy_score(y_test, y_pred),
            'precision_macro': precision_score(y_test, y_pred, average='macro', zero_division=0),
            'recall_macro': recall_score(y_test, y_pred, average='macro', zero_division=0),
            'f1_macro': f1_score(y_test, y_pred, average='macro', zero_division=0),
            'precision_weighted': precision_score(y_test, y_pred, average='weighted', zero_division=0),
            'recall_weighted': recall_score(y_test, y_pred, average='weighted', zero_division=0),
            'f1_weighted': f1_score(y_test, y_pred, average='weighted', zero_division=0)
        }
        
        # ROC-AUC (multi-class, one-vs-rest)
        try:
            metrics['roc_auc_ovr'] = roc_auc_score(y_test, y_proba, multi_class='ovr', average='macro')
        except:
            metrics['roc_auc_ovr'] = 0.0
        
        # Print results
        print(f"\nOverall Metrics:")
        print(f"Accuracy:           {metrics['accuracy']:.4f}")
        print(f"Precision (macro):  {metrics['precision_macro']:.4f}")
        print(f"Recall (macro):     {metrics['recall_macro']:.4f}")
        print(f"F1-Score (macro):   {metrics['f1_macro']:.4f}")
        print(f"ROC-AUC (OvR):      {metrics['roc_auc_ovr']:.4f}")
        
        # Classification report
        print("\nDetailed Classification Report:")
        # Get unique classes present in test data
        unique_classes = np.unique(np.concatenate([y_test, y_pred]))
        target_names_present = [self.classes[c] for c in unique_classes]
        print(classification_report(y_test, y_pred, labels=unique_classes, target_names=target_names_present, zero_division=0))
        
        # Confusion matrix
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(cm)
        
        return metrics
    
    def get_feature_importance(self, n_top=15):
        """
        Get feature importance from Random Forest
        
        Args:
            n_top: Number of top features to return
            
        Returns:
            importance_df: DataFrame with feature importance
        """
        if not self.is_trained:
            raise ValueError("Model must be trained first")
        
        if self.feature_names is None:
            feature_names = [f"feature_{i}" for i in range(len(self.model.feature_importances_))]
        else:
            feature_names = self.feature_names
        
        importance_df = pd.DataFrame({
            'feature': feature_names,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)
        
        print(f"\nTop {n_top} most important features:")
        print(importance_df.head(n_top).to_string(index=False))
        
        return importance_df
    
    def plot_feature_importance(self, n_top=15, save_path=None):
        """Plot top feature importances"""
        importance_df = self.get_feature_importance(n_top=n_top)
        
        plt.figure(figsize=(10, 6))
        plt.barh(range(n_top), importance_df['importance'].head(n_top)[::-1])
        plt.yticks(range(n_top), importance_df['feature'].head(n_top)[::-1])
        plt.xlabel('Importance')
        plt.title(f'Top {n_top} Feature Importances')
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def plot_confusion_matrix(self, X_test, y_test, save_path=None):
        """Plot confusion matrix"""
        y_pred = self.predict(X_test)
        cm = confusion_matrix(y_test, y_pred)
        
        plt.figure(figsize=(8, 6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                   xticklabels=list(self.classes.values()),
                   yticklabels=list(self.classes.values()))
        plt.ylabel('True Status')
        plt.xlabel('Predicted Status')
        plt.title('Confusion Matrix - Patient Status Classification')
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def save_model(self, path=None):
        """Save trained model to disk"""
        if path is None:
            path = config.MODEL_PATHS['random_forest']
        
        joblib.dump({
            'model': self.model,
            'feature_names': self.feature_names,
            'classes': self.classes,
            'is_trained': self.is_trained
        }, path)
        
        print(f"✓ Model saved to {path}")
    
    def load_model(self, path=None):
        """Load trained model from disk"""
        if path is None:
            path = config.MODEL_PATHS['random_forest']
        
        saved_data = joblib.load(path)
        self.model = saved_data['model']
        self.feature_names = saved_data['feature_names']
        self.classes = saved_data['classes']
        self.is_trained = saved_data['is_trained']
        
        print(f"✓ Model loaded from {path}")
        return self


# ============================================================================
# HELPER FUNCTION: CREATE LABELS FROM VITAL SIGNS
# ============================================================================
def create_patient_status_labels(df, thresholds=None):
    """
    Create patient status labels from vital signs
    
    Args:
        df: DataFrame with columns ['HR', 'SpO2', 'Temperature']
        thresholds: Custom thresholds (or use default from config)
        
    Returns:
        labels: Array of labels (0=Stable, 1=Warning, 2=Critical)
    """
    if thresholds is None:
        thresholds = config.ALERT_THRESHOLDS
    
    labels = np.zeros(len(df))
    
    for idx, (i, row) in enumerate(df.iterrows()):
        critical_conditions = 0
        warning_conditions = 0
        
        # Check HR
        if 'HR' in row:
            if row['HR'] < 50 or row['HR'] > 120:
                critical_conditions += 1
            elif row['HR'] < thresholds['HR_low'] or row['HR'] > thresholds['HR_high']:
                warning_conditions += 1
        
        # Check SpO2
        if 'SpO2' in row:
            if row['SpO2'] < thresholds['SpO2_critical']:
                critical_conditions += 1
            elif row['SpO2'] < 95:
                warning_conditions += 1
        
        # Check Temperature
        if 'Temperature' in row:
            if row['Temperature'] > 39 or row['Temperature'] < 36:
                critical_conditions += 1
            elif row['Temperature'] > thresholds['Temp_fever']:
                warning_conditions += 1
        
        # Assign label
        if critical_conditions >= 2:
            labels[idx] = 2  # Critical
        elif critical_conditions >= 1 or warning_conditions >= 2:
            labels[idx] = 1  # Warning
        else:
            labels[idx] = 0  # Stable
    
    return labels.astype(int)


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    from data_preprocessing import create_synthetic_data
    from feature_extraction import FeatureExtractor
    from sklearn.model_selection import train_test_split
    
    print("="*60)
    print("RANDOM FOREST - PATIENT STATUS CLASSIFICATION DEMO")
    print("="*60)
    
    # Generate synthetic data
    print("\nGenerating synthetic data...")
    df = create_synthetic_data(n_patients=10, duration_hours=2)
    df_vitals = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
    
    # Extract features
    print("\nExtracting features...")
    extractor = FeatureExtractor()
    X, feature_names, timestamps = extractor.create_feature_matrix(
        df_vitals, 
        window_size=60, 
        stride=30,
        include_ecg=False
    )
    
    # Create labels based on vital signs
    print("\nCreating patient status labels...")
    # Get corresponding vital signs for each window
    vitals_at_windows = df_vitals.iloc[[t for t in range(0, len(df_vitals), 30)][:len(X)]]
    y = create_patient_status_labels(vitals_at_windows)
    
    print(f"Label distribution:")
    unique, counts = np.unique(y, return_counts=True)
    for cls, count in zip(unique, counts):
        print(f"  {config.PATIENT_STATUS[cls]}: {count}")
    
    # Split train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Train model
    classifier = PatientStatusClassifier()
    classifier.train(X_train, y_train, feature_names=feature_names)
    
    # Evaluate
    metrics = classifier.evaluate(X_test, y_test)
    
    # Feature importance
    classifier.plot_feature_importance(n_top=10)
    
    # Confusion matrix
    classifier.plot_confusion_matrix(X_test, y_test)
    
    # Test single patient classification
    print("\n" + "="*60)
    print("SINGLE PATIENT CLASSIFICATION TEST")
    print("="*60)
    
    test_sample = X_test[0]
    status = classifier.classify_patient(test_sample)
    
    print(f"\nPatient Status: {status['status']}")
    print(f"Confidence: {status['confidence']:.2%}")
    print(f"Alert Level: {status['alert_level']}")
    print(f"\nProbabilities:")
    for cls, prob in status['probabilities'].items():
        print(f"  {cls}: {prob:.2%}")
    
    # Save model
    classifier.save_model()
    
    print("\n✓ Demo complete!")
