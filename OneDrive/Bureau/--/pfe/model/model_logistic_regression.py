"""
Smart Hospital - Model 3: Logistic Regression (Cardiac Risk Prediction)
Predicts cardiac risk (tachycardia/bradycardia) based on HR and ECG features
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, roc_curve
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import joblib
import matplotlib.pyplot as plt
import seaborn as sns

import config

class CardiacRiskPredictor:
    """
    Logistic Regression model for cardiac risk prediction
    """
    
    def __init__(self, **kwargs):
        """
        Initialize Logistic Regression model
        
        Args:
            **kwargs: Override default config parameters
        """
        model_config = {**config.LOGISTIC_REGRESSION_CONFIG, **kwargs}
        
        self.model = LogisticRegression(**model_config)
        self.is_trained = False
        self.feature_names = None
        self.risk_thresholds = config.CARDIAC_RISK_THRESHOLDS
        
    def train(self, X_train, y_train, feature_names=None):
        """
        Train the Logistic Regression model
        
        Args:
            X_train: Training features (cardiac-related features)
            y_train: Binary labels (0=no risk, 1=cardiac risk)
            feature_names: List of feature names
            
        Returns:
            self: Trained model
        """
        print("\n" + "="*60)
        print("TRAINING LOGISTIC REGRESSION - CARDIAC RISK PREDICTION")
        print("="*60)
        
        print(f"\nTraining data shape: {X_train.shape}")
        print(f"Number of samples: {X_train.shape[0]}")
        print(f"Number of features: {X_train.shape[1]}")
        
        # Check class distribution
        unique, counts = np.unique(y_train, return_counts=True)
        print(f"\nClass distribution:")
        for cls, count in zip(unique, counts):
            label = 'Cardiac Risk' if cls == 1 else 'No Risk'
            print(f"  {label}: {count} ({count/len(y_train)*100:.1f}%)")
        
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
        Predict cardiac risk (binary)
        
        Args:
            X: Input features
            
        Returns:
            predictions: Binary labels (0=no risk, 1=risk)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        return self.model.predict(X)
    
    def predict_proba(self, X):
        """
        Predict probability of cardiac risk
        
        Args:
            X: Input features
            
        Returns:
            probabilities: Risk probabilities (0-1)
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")
        
        # Return probability of positive class (risk)
        return self.model.predict_proba(X)[:, 1]
    
    def predict_risk_level(self, X):
        """
        Predict risk level (Low/Medium/High)
        
        Args:
            X: Input features
            
        Returns:
            risk_levels: Array of risk levels
        """
        probabilities = self.predict_proba(X)
        
        risk_levels = np.array(['Low'] * len(probabilities), dtype=object)
        risk_levels[probabilities >= self.risk_thresholds['medium']] = 'Medium'
        risk_levels[probabilities >= self.risk_thresholds['high']] = 'High'
        
        return risk_levels
    
    def assess_patient_risk(self, features):
        """
        Comprehensive risk assessment for a single patient
        
        Args:
            features: Feature vector for one patient
            
        Returns:
            assessment: Dictionary with risk details
        """
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        prediction = self.predict(features)[0]
        probability = self.predict_proba(features)[0]
        risk_level = self.predict_risk_level(features)[0]
        
        assessment = {
            'has_risk': bool(prediction),
            'risk_probability': float(probability),
            'risk_level': risk_level,
            'risk_percentage': f"{probability*100:.1f}%",
            'recommendation': self._get_recommendation(probability)
        }
        
        return assessment
    
    def _get_recommendation(self, probability):
        """Generate clinical recommendation based on risk"""
        if probability < self.risk_thresholds['low']:
            return "Continue normal monitoring"
        elif probability < self.risk_thresholds['medium']:
            return "Increase monitoring frequency, observe for changes"
        elif probability < self.risk_thresholds['high']:
            return "Alert medical staff, prepare for intervention"
        else:
            return "URGENT: Immediate medical attention required"
    
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
        print("EVALUATING CARDIAC RISK PREDICTOR")
        print("="*60)
        
        # Get predictions
        y_pred = self.predict(X_test)
        y_proba = self.predict_proba(X_test)
        
        # Calculate metrics
        metrics = {
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, zero_division=0),
            'recall': recall_score(y_test, y_pred, zero_division=0),
            'f1_score': f1_score(y_test, y_pred, zero_division=0),
            'specificity': self._calculate_specificity(y_test, y_pred)
        }
        
        # ROC-AUC
        try:
            metrics['roc_auc'] = roc_auc_score(y_test, y_proba)
        except:
            metrics['roc_auc'] = 0.0
        
        # Print results
        print(f"\nMetrics:")
        print(f"Accuracy:    {metrics['accuracy']:.4f}")
        print(f"Precision:   {metrics['precision']:.4f}")
        print(f"Recall:      {metrics['recall']:.4f}")
        print(f"Specificity: {metrics['specificity']:.4f}")
        print(f"F1-Score:    {metrics['f1_score']:.4f}")
        print(f"ROC-AUC:     {metrics['roc_auc']:.4f}")
        
        # Classification report
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred, target_names=['No Risk', 'Cardiac Risk']))
        
        # Confusion matrix
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(cm)
        print(f"True Negatives:  {cm[0,0]}")
        print(f"False Positives: {cm[0,1]}")
        print(f"False Negatives: {cm[1,0]}")
        print(f"True Positives:  {cm[1,1]}")
        
        return metrics
    
    def _calculate_specificity(self, y_true, y_pred):
        """Calculate specificity (True Negative Rate)"""
        cm = confusion_matrix(y_true, y_pred)
        tn = cm[0, 0]
        fp = cm[0, 1]
        return tn / (tn + fp) if (tn + fp) > 0 else 0.0
    
    def get_feature_coefficients(self):
        """
        Get model coefficients (feature importance)
        
        Returns:
            coef_df: DataFrame with feature coefficients
        """
        if not self.is_trained:
            raise ValueError("Model must be trained first")
        
        if self.feature_names is None:
            feature_names = [f"feature_{i}" for i in range(len(self.model.coef_[0]))]
        else:
            feature_names = self.feature_names
        
        coef_df = pd.DataFrame({
            'feature': feature_names,
            'coefficient': self.model.coef_[0],
            'abs_coefficient': np.abs(self.model.coef_[0])
        }).sort_values('abs_coefficient', ascending=False)
        
        print("\nFeature Coefficients (sorted by importance):")
        print(coef_df.to_string(index=False))
        
        return coef_df
    
    def plot_roc_curve(self, X_test, y_test, save_path=None):
        """Plot ROC curve"""
        y_proba = self.predict_proba(X_test)
        fpr, tpr, thresholds = roc_curve(y_test, y_proba)
        roc_auc = roc_auc_score(y_test, y_proba)
        
        plt.figure(figsize=(8, 6))
        plt.plot(fpr, tpr, color='blue', lw=2, label=f'ROC curve (AUC = {roc_auc:.3f})')
        plt.plot([0, 1], [0, 1], color='gray', lw=1, linestyle='--', label='Random classifier')
        plt.xlim([0.0, 1.0])
        plt.ylim([0.0, 1.05])
        plt.xlabel('False Positive Rate')
        plt.ylabel('True Positive Rate')
        plt.title('ROC Curve - Cardiac Risk Prediction')
        plt.legend(loc="lower right")
        plt.grid(alpha=0.3)
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def plot_risk_distribution(self, X_test, y_test, save_path=None):
        """Plot distribution of predicted risk probabilities"""
        y_proba = self.predict_proba(X_test)
        
        plt.figure(figsize=(10, 6))
        
        # Separate by true label
        no_risk_proba = y_proba[y_test == 0]
        risk_proba = y_proba[y_test == 1]
        
        plt.hist(no_risk_proba, bins=30, alpha=0.6, label='No Risk (True)', color='green', edgecolor='black')
        plt.hist(risk_proba, bins=30, alpha=0.6, label='Cardiac Risk (True)', color='red', edgecolor='black')
        
        # Add threshold lines
        plt.axvline(self.risk_thresholds['medium'], color='orange', linestyle='--', label='Medium Risk Threshold')
        plt.axvline(self.risk_thresholds['high'], color='red', linestyle='--', label='High Risk Threshold')
        
        plt.xlabel('Predicted Risk Probability')
        plt.ylabel('Frequency')
        plt.title('Distribution of Cardiac Risk Predictions')
        plt.legend()
        plt.grid(alpha=0.3)
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"✓ Plot saved to {save_path}")
        else:
            plt.show()
    
    def save_model(self, path=None):
        """Save trained model to disk"""
        if path is None:
            path = config.MODEL_PATHS['logistic_regression']
        
        joblib.dump({
            'model': self.model,
            'feature_names': self.feature_names,
            'risk_thresholds': self.risk_thresholds,
            'is_trained': self.is_trained
        }, path)
        
        print(f"✓ Model saved to {path}")
    
    def load_model(self, path=None):
        """Load trained model from disk"""
        if path is None:
            path = config.MODEL_PATHS['logistic_regression']
        
        saved_data = joblib.load(path)
        self.model = saved_data['model']
        self.feature_names = saved_data['feature_names']
        self.risk_thresholds = saved_data['risk_thresholds']
        self.is_trained = saved_data['is_trained']
        
        print(f"✓ Model loaded from {path}")
        return self


# ============================================================================
# HELPER FUNCTION: CREATE CARDIAC RISK LABELS
# ============================================================================
def create_cardiac_risk_labels(df, hr_low=60, hr_high=100):
    """
    Create cardiac risk labels from heart rate data
    
    Args:
        df: DataFrame with 'HR' column
        hr_low: Lower threshold for bradycardia
        hr_high: Upper threshold for tachycardia
        
    Returns:
        labels: Binary labels (0=no risk, 1=cardiac risk)
    """
    labels = np.zeros(len(df))
    
    if 'HR' in df.columns:
        # Mark as risk if HR is outside normal range
        labels[(df['HR'] < hr_low) | (df['HR'] > hr_high)] = 1
    
    return labels.astype(int)


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    from data_preprocessing import create_synthetic_data
    from feature_extraction import FeatureExtractor
    from sklearn.model_selection import train_test_split
    
    print("="*60)
    print("LOGISTIC REGRESSION - CARDIAC RISK PREDICTION DEMO")
    print("="*60)
    
    # Generate synthetic data
    print("\nGenerating synthetic data...")
    df = create_synthetic_data(n_patients=10, duration_hours=2)
    df_vitals = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
    
    # Extract features
    print("\nExtracting features...")
    extractor = FeatureExtractor()
    X_full, feature_names, timestamps = extractor.create_feature_matrix(
        df_vitals, 
        window_size=60, 
        stride=30,
        include_ecg=False
    )
    
    # Select cardiac-related features only
    features_df = pd.DataFrame(X_full, columns=feature_names)
    X, selected_features = extractor.select_features_for_model(features_df, 'logistic_regression')
    
    # Create cardiac risk labels
    print("\nCreating cardiac risk labels...")
    vitals_at_windows = df_vitals.iloc[[t for t in range(0, len(df_vitals), 30)][:len(X)]]
    y = create_cardiac_risk_labels(vitals_at_windows, hr_low=60, hr_high=100)
    
    print(f"Label distribution:")
    unique, counts = np.unique(y, return_counts=True)
    for cls, count in zip(unique, counts):
        label = 'Cardiac Risk' if cls == 1 else 'No Risk'
        print(f"  {label}: {count} ({count/len(y)*100:.1f}%)")
    
    # Split train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Train model
    predictor = CardiacRiskPredictor()
    predictor.train(X_train, y_train, feature_names=selected_features)
    
    # Evaluate
    metrics = predictor.evaluate(X_test, y_test)
    
    # Feature coefficients
    coef_df = predictor.get_feature_coefficients()
    
    # ROC curve
    predictor.plot_roc_curve(X_test, y_test)
    
    # Risk distribution
    predictor.plot_risk_distribution(X_test, y_test)
    
    # Test single patient assessment
    print("\n" + "="*60)
    print("SINGLE PATIENT RISK ASSESSMENT")
    print("="*60)
    
    test_sample = X_test[0]
    assessment = predictor.assess_patient_risk(test_sample)
    
    print(f"\nCardiac Risk Assessment:")
    print(f"Has Risk: {assessment['has_risk']}")
    print(f"Risk Probability: {assessment['risk_percentage']}")
    print(f"Risk Level: {assessment['risk_level']}")
    print(f"Recommendation: {assessment['recommendation']}")
    
    # Save model
    predictor.save_model()
    
    print("\n✓ Demo complete!")
