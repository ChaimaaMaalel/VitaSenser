"""
Smart Hospital - Feature Extraction Module
Extracts meaningful features from raw medical sensor data
"""

import numpy as np
import pandas as pd
from scipy import signal, stats
from scipy.fft import fft, fftfreq
import warnings
warnings.filterwarnings('ignore')

import config

class FeatureExtractor:
    """
    Extract comprehensive features from vital signs and ECG signals
    """
    
    def __init__(self, sampling_rate_ecg=250, sampling_rate_vitals=1):
        self.fs_ecg = sampling_rate_ecg
        self.fs_vitals = sampling_rate_vitals
        
    # ========================================================================
    # TIME-DOMAIN FEATURES
    # ========================================================================
    
    def extract_time_domain_features(self, signal_data, prefix=''):
        """
        Extract statistical time-domain features
        
        Args:
            signal_data: 1D array of signal values
            prefix: Prefix for feature names (e.g., 'HR_', 'SpO2_')
            
        Returns:
            features: Dictionary of time-domain features
        """
        features = {}
        
        # Basic statistics
        features[f'{prefix}mean'] = np.mean(signal_data)
        features[f'{prefix}std'] = np.std(signal_data)
        features[f'{prefix}min'] = np.min(signal_data)
        features[f'{prefix}max'] = np.max(signal_data)
        features[f'{prefix}range'] = features[f'{prefix}max'] - features[f'{prefix}min']
        features[f'{prefix}median'] = np.median(signal_data)
        
        # Advanced statistics
        features[f'{prefix}variance'] = np.var(signal_data)
        features[f'{prefix}skewness'] = stats.skew(signal_data)
        features[f'{prefix}kurtosis'] = stats.kurtosis(signal_data)
        
        # Percentiles
        features[f'{prefix}q25'] = np.percentile(signal_data, 25)
        features[f'{prefix}q75'] = np.percentile(signal_data, 75)
        features[f'{prefix}iqr'] = features[f'{prefix}q75'] - features[f'{prefix}q25']
        
        # Trend analysis (linear fit)
        x = np.arange(len(signal_data))
        if len(signal_data) > 1:
            coeffs = np.polyfit(x, signal_data, 1)
            features[f'{prefix}trend'] = coeffs[0]  # Slope
        else:
            features[f'{prefix}trend'] = 0
        
        # Coefficient of variation
        if features[f'{prefix}mean'] != 0:
            features[f'{prefix}cv'] = features[f'{prefix}std'] / abs(features[f'{prefix}mean'])
        else:
            features[f'{prefix}cv'] = 0
        
        return features
    
    # ========================================================================
    # HEART RATE VARIABILITY (HRV) FEATURES
    # ========================================================================
    
    def extract_hrv_features(self, ecg_signal, sampling_rate=None):
        """
        Extract Heart Rate Variability features from ECG
        
        Args:
            ecg_signal: ECG waveform (1D array)
            sampling_rate: Sampling frequency (default: self.fs_ecg)
            
        Returns:
            hrv_features: Dictionary of HRV features
        """
        if sampling_rate is None:
            sampling_rate = self.fs_ecg
        
        hrv_features = {}
        
        try:
            # Detect R-peaks (QRS complexes)
            peaks, _ = signal.find_peaks(ecg_signal, 
                                        distance=int(0.6 * sampling_rate),  # Min 0.6s between beats
                                        height=np.mean(ecg_signal) + 0.5*np.std(ecg_signal))
            
            if len(peaks) < 2:
                # Not enough peaks detected
                return self._default_hrv_features()
            
            # Calculate RR intervals (in milliseconds)
            rr_intervals = np.diff(peaks) / sampling_rate * 1000  # Convert to ms
            
            # Time-domain HRV metrics
            
            # SDNN: Standard deviation of RR intervals
            hrv_features['SDNN'] = np.std(rr_intervals)
            
            # RMSSD: Root mean square of successive differences
            successive_diffs = np.diff(rr_intervals)
            hrv_features['RMSSD'] = np.sqrt(np.mean(successive_diffs**2))
            
            # pNN50: Percentage of successive RR intervals that differ by more than 50 ms
            nn50 = np.sum(np.abs(successive_diffs) > 50)
            hrv_features['pNN50'] = (nn50 / len(successive_diffs)) * 100 if len(successive_diffs) > 0 else 0
            
            # Mean RR interval
            hrv_features['mean_RR'] = np.mean(rr_intervals)
            
            # Mean heart rate
            hrv_features['mean_HR'] = 60000 / hrv_features['mean_RR']  # Convert RR to HR
            
            # SDSD: Standard deviation of successive differences
            hrv_features['SDSD'] = np.std(successive_diffs) if len(successive_diffs) > 0 else 0
            
            # Triangular index (simplified)
            hrv_features['triangular_index'] = len(rr_intervals) / np.max(np.histogram(rr_intervals, bins=50)[0]) if len(rr_intervals) > 0 else 0
            
        except Exception as e:
            print(f"⚠ Warning: HRV extraction failed: {e}")
            return self._default_hrv_features()
        
        return hrv_features
    
    def _default_hrv_features(self):
        """Return default HRV features when extraction fails"""
        return {
            'SDNN': 0,
            'RMSSD': 0,
            'pNN50': 0,
            'mean_RR': 0,
            'mean_HR': 0,
            'SDSD': 0,
            'triangular_index': 0
        }
    
    # ========================================================================
    # FREQUENCY-DOMAIN FEATURES
    # ========================================================================
    
    def extract_frequency_features(self, signal_data, sampling_rate=None, signal_type='ECG'):
        """
        Extract frequency-domain features using FFT
        
        Args:
            signal_data: 1D signal array
            sampling_rate: Sampling frequency
            signal_type: 'ECG' or 'HR' (for different frequency bands)
            
        Returns:
            freq_features: Dictionary of frequency features
        """
        if sampling_rate is None:
            sampling_rate = self.fs_ecg if signal_type == 'ECG' else self.fs_vitals
        
        freq_features = {}
        
        # Compute FFT
        N = len(signal_data)
        if N < 2:
            return self._default_frequency_features()
        
        fft_values = np.abs(fft(signal_data))
        freqs = fftfreq(N, 1/sampling_rate)[:N//2]  # Positive frequencies only
        fft_magnitude = fft_values[:N//2]
        
        # Dominant frequency
        if len(fft_magnitude) > 0:
            idx_dominant = np.argmax(fft_magnitude)
            freq_features['dominant_freq'] = freqs[idx_dominant]
            freq_features['dominant_power'] = fft_magnitude[idx_dominant]
        else:
            freq_features['dominant_freq'] = 0
            freq_features['dominant_power'] = 0
        
        # Power in different frequency bands (for ECG)
        if signal_type == 'ECG':
            # ECG typical bands: 0.5-40 Hz
            low_freq = (freqs >= 0.5) & (freqs <= 5)
            mid_freq = (freqs > 5) & (freqs <= 15)
            high_freq = (freqs > 15) & (freqs <= 40)
            
            freq_features['power_low'] = np.sum(fft_magnitude[low_freq])
            freq_features['power_mid'] = np.sum(fft_magnitude[mid_freq])
            freq_features['power_high'] = np.sum(fft_magnitude[high_freq])
            
            # Power ratios
            total_power = freq_features['power_low'] + freq_features['power_mid'] + freq_features['power_high']
            if total_power > 0:
                freq_features['power_ratio_lf_hf'] = freq_features['power_low'] / (freq_features['power_high'] + 1e-6)
            else:
                freq_features['power_ratio_lf_hf'] = 0
        
        # Spectral entropy (measure of signal complexity)
        psd = fft_magnitude**2
        psd_norm = psd / (np.sum(psd) + 1e-10)
        psd_norm = psd_norm[psd_norm > 0]  # Remove zeros for log
        freq_features['spectral_entropy'] = -np.sum(psd_norm * np.log2(psd_norm + 1e-10))
        
        # Spectral centroid (weighted mean of frequencies)
        if np.sum(fft_magnitude) > 0:
            freq_features['spectral_centroid'] = np.sum(freqs * fft_magnitude) / np.sum(fft_magnitude)
        else:
            freq_features['spectral_centroid'] = 0
        
        return freq_features
    
    def _default_frequency_features(self):
        """Return default frequency features when extraction fails"""
        return {
            'dominant_freq': 0,
            'dominant_power': 0,
            'power_low': 0,
            'power_mid': 0,
            'power_high': 0,
            'power_ratio_lf_hf': 0,
            'spectral_entropy': 0,
            'spectral_centroid': 0
        }
    
    # ========================================================================
    # ECG MORPHOLOGICAL FEATURES
    # ========================================================================
    
    def extract_ecg_morphology(self, ecg_signal, sampling_rate=None):
        """
        Extract ECG waveform morphology features (P, Q, R, S, T waves)
        
        Args:
            ecg_signal: ECG waveform
            sampling_rate: Sampling frequency
            
        Returns:
            morphology_features: Dictionary of morphological features
        """
        if sampling_rate is None:
            sampling_rate = self.fs_ecg
        
        morph_features = {}
        
        try:
            # Detect R-peaks
            peaks, properties = signal.find_peaks(ecg_signal, 
                                                 distance=int(0.6 * sampling_rate),
                                                 prominence=0.5)
            
            if len(peaks) < 2:
                return self._default_morphology_features()
            
            # R-wave amplitude (mean of all R-peaks)
            morph_features['R_amplitude_mean'] = np.mean(ecg_signal[peaks])
            morph_features['R_amplitude_std'] = np.std(ecg_signal[peaks])
            
            # QRS width estimation (simplified: width at half prominence)
            if 'widths' in properties:
                morph_features['QRS_width_mean'] = np.mean(properties['widths']) / sampling_rate * 1000  # Convert to ms
            else:
                # Estimate QRS width as typical duration (80-120 ms)
                morph_features['QRS_width_mean'] = 100  # ms
            
            # RR intervals variability
            rr_intervals = np.diff(peaks) / sampling_rate * 1000  # ms
            morph_features['RR_interval_mean'] = np.mean(rr_intervals)
            morph_features['RR_interval_std'] = np.std(rr_intervals)
            
            # Heart rate from RR intervals
            morph_features['HR_from_ECG'] = 60000 / morph_features['RR_interval_mean'] if morph_features['RR_interval_mean'] > 0 else 0
            
        except Exception as e:
            print(f"⚠ Warning: ECG morphology extraction failed: {e}")
            return self._default_morphology_features()
        
        return morph_features
    
    def _default_morphology_features(self):
        """Return default morphology features when extraction fails"""
        return {
            'R_amplitude_mean': 0,
            'R_amplitude_std': 0,
            'QRS_width_mean': 0,
            'RR_interval_mean': 0,
            'RR_interval_std': 0,
            'HR_from_ECG': 0
        }
    
    # ========================================================================
    # COMPREHENSIVE FEATURE EXTRACTION
    # ========================================================================
    
    def extract_all_features(self, data_window, include_ecg=False):
        """
        Extract all features from a data window
        
        Args:
            data_window: DataFrame or dict with columns ['HR', 'SpO2', 'Temperature', 'ECG']
            include_ecg: Whether to extract ECG-specific features
            
        Returns:
            feature_vector: Dictionary of all extracted features
        """
        features = {}
        
        # Convert to dict if DataFrame
        if isinstance(data_window, pd.DataFrame):
            data_dict = {col: data_window[col].values for col in data_window.columns}
        else:
            data_dict = data_window
        
        # Extract time-domain features for each vital sign
        for vital in ['HR', 'SpO2', 'Temperature']:
            if vital in data_dict and len(data_dict[vital]) > 0:
                time_features = self.extract_time_domain_features(data_dict[vital], prefix=f'{vital}_')
                features.update(time_features)
        
        # Extract ECG-specific features
        if include_ecg and 'ECG' in data_dict and len(data_dict['ECG']) > 0:
            # HRV features
            hrv_features = self.extract_hrv_features(data_dict['ECG'])
            features.update(hrv_features)
            
            # Frequency features
            freq_features = self.extract_frequency_features(data_dict['ECG'], signal_type='ECG')
            features.update(freq_features)
            
            # Morphology features
            morph_features = self.extract_ecg_morphology(data_dict['ECG'])
            features.update(morph_features)
        
        return features
    
    def create_feature_matrix(self, df, window_size=60, stride=30, include_ecg=False):
        """
        Create feature matrix from time-series data using sliding windows
        
        Args:
            df: DataFrame with time-series vital signs
            window_size: Window size in samples (e.g., 60 seconds)
            stride: Step between windows
            include_ecg: Whether to include ECG features
            
        Returns:
            X: Feature matrix (n_windows, n_features)
            feature_names: List of feature names
            timestamps: Timestamp for each window
        """
        print(f"Creating feature matrix with window_size={window_size}, stride={stride}...")
        
        n_samples = len(df)
        n_windows = (n_samples - window_size) // stride + 1
        
        all_features = []
        timestamps = []
        
        for i in range(0, n_windows * stride, stride):
            window = df.iloc[i:i+window_size]
            
            # Extract features from this window
            features = self.extract_all_features(window, include_ecg=include_ecg)
            all_features.append(features)
            
            # Store timestamp (midpoint of window)
            if hasattr(df.index, 'to_pydatetime'):
                timestamps.append(df.index[i + window_size // 2])
            else:
                timestamps.append(i + window_size // 2)
        
        # Convert to DataFrame
        X = pd.DataFrame(all_features)
        feature_names = list(X.columns)
        
        print(f"✓ Created feature matrix: {X.shape[0]} windows × {X.shape[1]} features")
        
        return X.values, feature_names, timestamps
    
    # ========================================================================
    # FEATURE SELECTION
    # ========================================================================
    
    def select_features_for_model(self, features_df, model_type='isolation_forest'):
        """
        Select appropriate features for each model type
        
        Args:
            features_df: DataFrame with all extracted features
            model_type: 'isolation_forest', 'random_forest', 'logistic_regression', or 'lstm'
            
        Returns:
            selected_features: Array with selected features
            selected_feature_names: List of selected feature names
        """
        if model_type == 'isolation_forest':
            # Anomaly detection: use diverse features
            selected_cols = [col for col in features_df.columns 
                           if any(x in col for x in ['mean', 'std', 'SDNN', 'RMSSD', 'dominant_freq', 'power_', 'R_amplitude'])]
            
        elif model_type == 'random_forest':
            # Classification: use all available features
            selected_cols = features_df.columns.tolist()
            
        elif model_type == 'logistic_regression':
            # Cardiac risk: focus on heart-related features
            selected_cols = [col for col in features_df.columns 
                           if any(x in col for x in ['HR_', 'SDNN', 'RMSSD', 'pNN50', 'RR_interval', 'QRS'])]
            
        elif model_type == 'lstm':
            # LSTM uses raw time series, not engineered features
            print("⚠ LSTM uses raw time-series data, not engineered features")
            return None, None
        
        else:
            # Default: use all features
            selected_cols = features_df.columns.tolist()
        
        selected_features = features_df[selected_cols].values
        print(f"✓ Selected {len(selected_cols)} features for {model_type}")
        
        return selected_features, selected_cols


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    from data_preprocessing import create_synthetic_data
    
    # Generate synthetic data
    print("Generating synthetic data...\n")
    df = create_synthetic_data(n_patients=2, duration_hours=1)
    df_patient = df[df['patient_id'] == 0].set_index('timestamp')[['HR', 'SpO2', 'Temperature']]
    
    # Initialize feature extractor
    extractor = FeatureExtractor()
    
    # Extract features from a single window
    print("\nExtracting features from single window:")
    print("="*60)
    window = df_patient.iloc[:60]  # 60 seconds
    features = extractor.extract_all_features(window, include_ecg=False)
    
    for feature_name, value in list(features.items())[:10]:  # Show first 10
        print(f"{feature_name:30s}: {value:.4f}")
    print(f"... and {len(features) - 10} more features")
    
    # Create feature matrix for entire dataset
    print("\n\nCreating feature matrix for entire dataset:")
    print("="*60)
    X, feature_names, timestamps = extractor.create_feature_matrix(
        df_patient, 
        window_size=60,  # 1 minute windows
        stride=30,       # 30 second overlap
        include_ecg=False
    )
    
    print(f"\nFeature matrix shape: {X.shape}")
    print(f"Number of features: {len(feature_names)}")
    print(f"Number of windows: {len(timestamps)}")
    
    # Select features for specific models
    print("\n\nFeature selection for different models:")
    print("="*60)
    
    features_df = pd.DataFrame(X, columns=feature_names)
    
    for model_type in ['isolation_forest', 'random_forest', 'logistic_regression']:
        X_selected, selected_names = extractor.select_features_for_model(features_df, model_type)
        if X_selected is not None:
            print(f"{model_type:25s}: {X_selected.shape[1]} features selected")
