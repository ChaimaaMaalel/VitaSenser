"""
Smart Hospital - Data Preprocessing Module
Handles data cleaning, validation, normalization, and preparation
"""

import numpy as np
import pandas as pd
from scipy import signal
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.impute import SimpleImputer
import warnings
warnings.filterwarnings('ignore')

import config

class DataPreprocessor:
    """
    Comprehensive data preprocessing for medical sensor data
    """
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.imputer = SimpleImputer(strategy='mean')
        self.vital_ranges = config.VITAL_RANGES
        
    def validate_data(self, df):
        """
        Validate that data is within physiological ranges
        
        Args:
            df: DataFrame with columns ['HR', 'SpO2', 'Temperature', 'ECG']
            
        Returns:
            df_clean: DataFrame with invalid values marked as NaN
            validation_report: Dict with validation statistics
        """
        df_clean = df.copy()
        validation_report = {}
        
        for vital, ranges in self.vital_ranges.items():
            if vital in df.columns:
                # Count invalid values
                invalid_mask = (df[vital] < ranges['min']) | (df[vital] > ranges['max'])
                n_invalid = invalid_mask.sum()
                
                # Replace invalid with NaN
                df_clean.loc[invalid_mask, vital] = np.nan
                
                validation_report[vital] = {
                    'total': len(df),
                    'invalid': n_invalid,
                    'invalid_percentage': (n_invalid / len(df)) * 100
                }
                
                print(f"✓ {vital}: {n_invalid} invalid values ({validation_report[vital]['invalid_percentage']:.2f}%)")
        
        return df_clean, validation_report
    
    def handle_missing_values(self, df, method='interpolate'):
        """
        Handle missing values in time-series data
        
        Args:
            df: DataFrame with potential missing values
            method: 'interpolate', 'forward_fill', 'mean', or 'drop'
            
        Returns:
            df_filled: DataFrame with missing values handled
        """
        df_filled = df.copy()
        
        if method == 'interpolate':
            # Linear interpolation for small gaps
            df_filled = df_filled.interpolate(method='linear', limit=60)  # Max 60 sec gap
            
        elif method == 'forward_fill':
            # Forward fill (use last known value)
            df_filled = df_filled.fillna(method='ffill', limit=30)
            
        elif method == 'mean':
            # Fill with mean (use sklearn imputer)
            numeric_cols = df_filled.select_dtypes(include=[np.number]).columns
            df_filled[numeric_cols] = self.imputer.fit_transform(df_filled[numeric_cols])
            
        elif method == 'drop':
            # Drop rows with any missing values
            df_filled = df_filled.dropna()
        
        # Report remaining NaN values
        remaining_nan = df_filled.isna().sum()
        if remaining_nan.sum() > 0:
            print(f"⚠ Remaining NaN values:\n{remaining_nan[remaining_nan > 0]}")
        else:
            print("✓ No missing values remaining")
            
        return df_filled
    
    def detect_outliers(self, df, method='iqr', threshold=1.5):
        """
        Detect outliers using statistical methods
        
        Args:
            df: DataFrame
            method: 'iqr' (Interquartile Range) or 'zscore'
            threshold: 1.5 for IQR, 3.0 for Z-score
            
        Returns:
            outlier_mask: Boolean mask indicating outliers
            outlier_report: Dict with outlier statistics
        """
        outlier_mask = pd.DataFrame(False, index=df.index, columns=df.columns)
        outlier_report = {}
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_cols:
            if method == 'iqr':
                # Interquartile Range method
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                lower_bound = Q1 - threshold * IQR
                upper_bound = Q3 + threshold * IQR
                
                outliers = (df[col] < lower_bound) | (df[col] > upper_bound)
                
            elif method == 'zscore':
                # Z-score method
                z_scores = np.abs((df[col] - df[col].mean()) / df[col].std())
                outliers = z_scores > threshold
            
            outlier_mask[col] = outliers
            n_outliers = outliers.sum()
            
            outlier_report[col] = {
                'count': n_outliers,
                'percentage': (n_outliers / len(df)) * 100
            }
            
            if n_outliers > 0:
                print(f"⚠ {col}: {n_outliers} outliers detected ({outlier_report[col]['percentage']:.2f}%)")
        
        return outlier_mask, outlier_report
    
    def remove_noise_ecg(self, ecg_signal, sampling_rate=250):
        """
        Remove noise from ECG signal using filtering
        
        Args:
            ecg_signal: 1D array of ECG values
            sampling_rate: Sampling frequency in Hz
            
        Returns:
            filtered_signal: Noise-removed ECG signal
        """
        # 1. Remove baseline wander (high-pass filter at 0.5 Hz)
        sos_high = signal.butter(4, 0.5, btype='high', fs=sampling_rate, output='sos')
        signal_high = signal.sosfilt(sos_high, ecg_signal)
        
        # 2. Remove high-frequency noise (low-pass filter at 40 Hz)
        sos_low = signal.butter(4, 40, btype='low', fs=sampling_rate, output='sos')
        filtered_signal = signal.sosfilt(sos_low, signal_high)
        
        # 3. Notch filter to remove 50/60 Hz powerline interference
        b_notch, a_notch = signal.iirnotch(50, 30, sampling_rate)
        filtered_signal = signal.filtfilt(b_notch, a_notch, filtered_signal)
        
        print("✓ ECG signal filtered (baseline wander + noise removed)")
        return filtered_signal
    
    def normalize_data(self, df, method='standard'):
        """
        Normalize/standardize data for ML models
        
        Args:
            df: DataFrame with numeric features
            method: 'standard' (mean=0, std=1) or 'minmax' (0-1 range)
            
        Returns:
            df_normalized: Normalized DataFrame
            scaler: Fitted scaler object (save for future use)
        """
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        if method == 'standard':
            scaler = StandardScaler()
        elif method == 'minmax':
            scaler = MinMaxScaler()
        
        df_normalized = df.copy()
        df_normalized[numeric_cols] = scaler.fit_transform(df[numeric_cols])
        
        print(f"✓ Data normalized using {method} scaling")
        return df_normalized, scaler
    
    def resample_timeseries(self, df, target_freq='1S'):
        """
        Resample time-series data to uniform frequency
        
        Args:
            df: DataFrame with datetime index
            target_freq: Target frequency ('1S' = 1 second, '250ms' = 250 Hz)
            
        Returns:
            df_resampled: Resampled DataFrame
        """
        if not isinstance(df.index, pd.DatetimeIndex):
            print("⚠ Warning: DataFrame index is not datetime. Skipping resampling.")
            return df
        
        df_resampled = df.resample(target_freq).mean()
        df_resampled = df_resampled.interpolate(method='linear')
        
        print(f"✓ Time-series resampled to {target_freq}")
        return df_resampled
    
    def create_sliding_windows(self, data, window_size, stride=1, include_target=True, 
                               target_col='SpO2', prediction_horizon=30):
        """
        Create sliding windows for time-series models (LSTM)
        
        Args:
            data: DataFrame or array with time-series data
            window_size: Window size in samples (e.g., 600 for 10 minutes at 1Hz)
            stride: Step size between windows
            include_target: Whether to include target variable (for supervised learning)
            target_col: Column name for prediction target
            prediction_horizon: How many steps ahead to predict
            
        Returns:
            X: Array of shape (n_windows, window_size, n_features)
            y: Array of shape (n_windows,) if include_target=True
        """
        if isinstance(data, pd.DataFrame):
            data_array = data.values
            if include_target and target_col in data.columns:
                target_idx = data.columns.get_loc(target_col)
        else:
            data_array = data
            target_idx = 0  # Assume first column
        
        n_samples = len(data_array)
        n_windows = (n_samples - window_size - prediction_horizon) // stride + 1
        
        if n_windows <= 0:
            raise ValueError(f"Not enough data. Need at least {window_size + prediction_horizon} samples.")
        
        X = []
        y = []
        
        for i in range(0, n_windows * stride, stride):
            window = data_array[i:i+window_size]
            X.append(window)
            
            if include_target:
                # Target is the value at prediction_horizon steps ahead
                target_value = data_array[i + window_size + prediction_horizon - 1, target_idx]
                y.append(target_value)
        
        X = np.array(X)
        y = np.array(y) if include_target else None
        
        print(f"✓ Created {len(X)} sliding windows (size={window_size}, stride={stride})")
        
        return (X, y) if include_target else X
    
    def balance_classes(self, X, y, method='smote'):
        """
        Balance imbalanced classes using oversampling
        
        Args:
            X: Feature array
            y: Target labels
            method: 'smote' or 'random_oversample'
            
        Returns:
            X_balanced, y_balanced: Balanced dataset
        """
        from imblearn.over_sampling import SMOTE, RandomOverSampler
        
        unique, counts = np.unique(y, return_counts=True)
        print(f"Original class distribution: {dict(zip(unique, counts))}")
        
        if method == 'smote':
            sampler = SMOTE(**config.SMOTE_CONFIG)
        elif method == 'random_oversample':
            sampler = RandomOverSampler(random_state=42)
        
        X_balanced, y_balanced = sampler.fit_resample(X, y)
        
        unique, counts = np.unique(y_balanced, return_counts=True)
        print(f"✓ Balanced class distribution: {dict(zip(unique, counts))}")
        
        return X_balanced, y_balanced
    
    def preprocess_pipeline(self, df, for_training=True):
        """
        Complete preprocessing pipeline
        
        Args:
            df: Raw DataFrame
            for_training: If True, fit scaler; if False, use existing scaler
            
        Returns:
            df_processed: Fully preprocessed DataFrame
        """
        print("\n" + "="*60)
        print("STARTING DATA PREPROCESSING PIPELINE")
        print("="*60 + "\n")
        
        # Step 1: Validate data
        print("Step 1: Validating data ranges...")
        df_clean, val_report = self.validate_data(df)
        
        # Step 2: Handle missing values
        print("\nStep 2: Handling missing values...")
        df_filled = self.handle_missing_values(df_clean, method='interpolate')
        
        # Step 3: Detect and handle outliers
        print("\nStep 3: Detecting outliers...")
        outlier_mask, outlier_report = self.detect_outliers(df_filled, method='iqr')
        
        # Step 4: Filter ECG if present
        if 'ECG' in df_filled.columns:
            print("\nStep 4: Filtering ECG signal...")
            df_filled['ECG'] = self.remove_noise_ecg(
                df_filled['ECG'].values, 
                sampling_rate=config.SAMPLING_RATE_ECG
            )
        
        # Step 5: Normalize data
        print("\nStep 5: Normalizing data...")
        if for_training:
            df_normalized, self.scaler = self.normalize_data(df_filled, method='standard')
        else:
            # Use pre-fitted scaler for inference
            numeric_cols = df_filled.select_dtypes(include=[np.number]).columns
            df_normalized = df_filled.copy()
            df_normalized[numeric_cols] = self.scaler.transform(df_filled[numeric_cols])
        
        print("\n" + "="*60)
        print("✓ PREPROCESSING COMPLETE")
        print("="*60 + "\n")
        
        return df_normalized


def load_physionet_data(database='mitdb', record_number='100'):
    """
    Load data from PhysioNet databases
    
    Args:
        database: 'mitdb' or 'mimic'
        record_number: Record ID to load
        
    Returns:
        df: DataFrame with ECG and vital signs
    """
    import wfdb
    
    print(f"Loading PhysioNet {database} record {record_number}...")
    
    try:
        # Read record
        record = wfdb.rdrecord(f'{database}/{record_number}')
        
        # Extract signals
        df = pd.DataFrame(record.p_signal, columns=record.sig_name)
        df['timestamp'] = pd.date_range(start='2024-01-01', periods=len(df), freq='4ms')  # 250 Hz
        df.set_index('timestamp', inplace=True)
        
        print(f"✓ Loaded {len(df)} samples from {database}/{record_number}")
        return df
        
    except Exception as e:
        print(f"⚠ Error loading PhysioNet data: {e}")
        print("Note: You may need to download the database first using wfdb.dl_database()")
        return None


def create_synthetic_data(n_patients=10, duration_hours=24):
    """
    Generate synthetic patient data for testing
    
    Args:
        n_patients: Number of patients to simulate
        duration_hours: Duration of monitoring in hours
        
    Returns:
        df: DataFrame with synthetic vital signs
    """
    print(f"Generating synthetic data for {n_patients} patients, {duration_hours} hours each...")
    
    n_samples = duration_hours * 3600  # 1 sample per second
    timestamps = pd.date_range(start='2024-01-01', periods=n_samples, freq='1S')
    
    all_data = []
    
    for patient_id in range(n_patients):
        # Generate realistic vital signs with some variability
        hr_base = np.random.randint(60, 90)  # Base heart rate
        spo2_base = np.random.uniform(95, 99)  # Base SpO2
        temp_base = np.random.uniform(36.5, 37.2)  # Base temperature
        
        # Add realistic variations
        hr = hr_base + np.random.randn(n_samples) * 5 + 10 * np.sin(np.linspace(0, 4*np.pi, n_samples))
        spo2 = spo2_base + np.random.randn(n_samples) * 0.5
        temp = temp_base + np.random.randn(n_samples) * 0.1
        
        # Simulate some anomalies (5% of data)
        anomaly_indices = np.random.choice(n_samples, size=int(0.05*n_samples), replace=False)
        hr[anomaly_indices] += np.random.choice([-30, 40], size=len(anomaly_indices))
        spo2[anomaly_indices] -= np.random.uniform(5, 10, size=len(anomaly_indices))
        
        # Create DataFrame
        patient_df = pd.DataFrame({
            'patient_id': patient_id,
            'timestamp': timestamps,
            'HR': np.clip(hr, 40, 200),
            'SpO2': np.clip(spo2, 85, 100),
            'Temperature': np.clip(temp, 35, 42)
        })
        
        all_data.append(patient_df)
    
    df = pd.concat(all_data, ignore_index=True)
    print(f"✓ Generated {len(df)} samples for {n_patients} patients")
    
    return df


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    # Create synthetic data for testing
    df = create_synthetic_data(n_patients=5, duration_hours=2)
    
    # Initialize preprocessor
    preprocessor = DataPreprocessor()
    
    # Run preprocessing pipeline
    df_processed = preprocessor.preprocess_pipeline(df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']])
    
    print("\nProcessed data sample:")
    print(df_processed.head())
    
    # Create sliding windows for LSTM
    X, y = preprocessor.create_sliding_windows(
        df_processed[['SpO2', 'HR']].values,
        window_size=600,  # 10 minutes
        stride=60,  # 1 minute
        prediction_horizon=1800  # 30 minutes ahead
    )
    
    print(f"\nLSTM input shape: {X.shape}")
    print(f"LSTM target shape: {y.shape}")
