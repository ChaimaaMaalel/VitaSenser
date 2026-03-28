"""
Smart Hospital - Real Dataset Loader
Downloads and processes real medical datasets from PhysioNet and other sources
"""

import os
import numpy as np
import pandas as pd
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

import config

class RealDatasetLoader:
    """
    Load and process real medical datasets for training
    """
    
    def __init__(self):
        self.data_dir = config.DATA_DIR
        self.datasets = {}
        
    # ========================================================================
    # PHYSIONET MIT-BIH ARRHYTHMIA DATABASE
    # ========================================================================
    
    def download_mitbih_dataset(self, records=None):
        """
        Download PhysioNet MIT-BIH Arrhythmia Database
        
        Args:
            records: List of record numbers to download (e.g., ['100', '101'])
                    If None, downloads recommended records
        
        Returns:
            success: Boolean indicating if download succeeded
        """
        try:
            import wfdb
        except ImportError:
            print("❌ WFDB package not installed!")
            print("Install with: pip install wfdb")
            return False
        
        print("\n" + "="*60)
        print("DOWNLOADING PHYSIONET MIT-BIH DATASET")
        print("="*60)
        
        # Recommended records with good quality data
        if records is None:
            records = ['100', '101', '103', '105', '106', '108', '109', '111', 
                      '112', '113', '115', '116', '117', '118', '119', '121']
        
        print(f"\nDownloading {len(records)} records...")
        print("This may take a few minutes...\n")
        
        downloaded = []
        for record in records:
            try:
                print(f"Downloading record {record}...", end=" ")
                
                # Download to data directory
                record_path = str(self.data_dir / 'mitdb' / record)
                os.makedirs(self.data_dir / 'mitdb', exist_ok=True)
                
                # Download record
                wfdb.dl_files('mitdb', self.data_dir / 'mitdb', [record])
                
                downloaded.append(record)
                print("✓")
                
            except Exception as e:
                print(f"✗ Error: {e}")
        
        print(f"\n✓ Successfully downloaded {len(downloaded)}/{len(records)} records")
        print(f"Saved to: {self.data_dir / 'mitdb'}")
        
        return len(downloaded) > 0
    
    def load_mitbih_data(self, records=None, max_samples_per_record=None):
        """
        Load MIT-BIH ECG data into a DataFrame
        
        Args:
            records: List of record IDs to load
            max_samples_per_record: Limit samples per record (for memory)
            
        Returns:
            df: DataFrame with ECG and derived vital signs
        """
        try:
            import wfdb
        except ImportError:
            print("❌ WFDB not installed. Run: pip install wfdb")
            return None
        
        print("\n" + "="*60)
        print("LOADING MIT-BIH DATASET")
        print("="*60)
        
        if records is None:
            records = ['100', '101', '103', '105', '106']
        
        all_data = []
        
        for record_id in records:
            try:
                print(f"\nLoading record {record_id}...")
                
                # Read record
                record_path = str(self.data_dir / 'mitdb' / record_id)
                
                # Try to read from downloaded files first
                if not os.path.exists(record_path + '.dat'):
                    print(f"  Downloading {record_id}...")
                    record = wfdb.rdrecord(record_id, pn_dir='mitdb')
                else:
                    record = wfdb.rdrecord(record_path)
                
                # Get annotation
                try:
                    annotation = wfdb.rdann(record_path, 'atr')
                except:
                    print(f"  ⚠ No annotations for {record_id}")
                    annotation = None
                
                # Extract ECG signal (usually first channel)
                ecg_signal = record.p_signal[:, 0]
                
                # Limit samples if specified
                if max_samples_per_record:
                    ecg_signal = ecg_signal[:max_samples_per_record]
                
                # Derive heart rate from R-peaks
                hr = self._derive_heart_rate(ecg_signal, record.fs)
                
                # Generate synthetic SpO2 and Temperature based on HR
                # (MIT-BIH only has ECG, so we simulate other vitals realistically)
                spo2 = self._generate_realistic_spo2(hr)
                temp = self._generate_realistic_temperature(len(hr))
                
                # Create timestamps
                timestamps = pd.date_range(
                    start='2024-01-01',
                    periods=len(hr),
                    freq=f'{int(1000/record.fs)}ms'
                )
                
                # Create DataFrame
                df_record = pd.DataFrame({
                    'timestamp': timestamps,
                    'patient_id': f'MITBIH_{record_id}',
                    'HR': hr,
                    'SpO2': spo2,
                    'Temperature': temp,
                    'ECG': ecg_signal[:len(hr)],  # Match length
                    'source': 'MIT-BIH',
                    'record_id': record_id
                })
                
                all_data.append(df_record)
                print(f"  ✓ Loaded {len(df_record)} samples")
                
            except Exception as e:
                print(f"  ✗ Error loading {record_id}: {e}")
        
        if not all_data:
            print("\n❌ No data loaded!")
            return None
        
        # Combine all records
        df = pd.concat(all_data, ignore_index=True)
        
        print(f"\n✓ Total dataset: {len(df)} samples from {len(all_data)} records")
        print(f"  Columns: {list(df.columns)}")
        
        return df
    
    def _derive_heart_rate(self, ecg_signal, fs=360):
        """Derive heart rate from ECG signal"""
        from scipy.signal import find_peaks
        
        # Detect R-peaks
        peaks, _ = find_peaks(ecg_signal, distance=int(0.6*fs), height=0.5)
        
        # Calculate instantaneous HR
        if len(peaks) < 2:
            # No peaks detected, use default
            return np.full(len(ecg_signal), 75.0)
        
        # Calculate RR intervals
        rr_intervals = np.diff(peaks) / fs  # in seconds
        hr_at_peaks = 60 / rr_intervals  # convert to bpm
        
        # Interpolate HR for all samples
        peak_times = peaks[1:]  # Align with HR values
        sample_times = np.arange(len(ecg_signal))
        
        hr = np.interp(sample_times, peak_times, hr_at_peaks, 
                      left=hr_at_peaks[0], right=hr_at_peaks[-1])
        
        # Smooth and clip to realistic range
        from scipy.ndimage import uniform_filter1d
        hr = uniform_filter1d(hr, size=int(fs))
        hr = np.clip(hr, 40, 180)
        
        return hr
    
    def _generate_realistic_spo2(self, hr):
        """Generate realistic SpO2 based on heart rate"""
        # Base SpO2
        spo2 = np.full_like(hr, 97.0)
        
        # Add variation based on HR
        hr_effect = -0.02 * (hr - 75)  # Lower SpO2 when HR is high
        spo2 += hr_effect
        
        # Add natural variation
        spo2 += np.random.randn(len(spo2)) * 0.5
        
        # Clip to realistic range
        spo2 = np.clip(spo2, 92, 100)
        
        return spo2
    
    def _generate_realistic_temperature(self, n_samples):
        """Generate realistic body temperature"""
        # Base temperature
        temp = np.full(n_samples, 37.0)
        
        # Add natural variation
        temp += np.random.randn(n_samples) * 0.2
        
        # Clip to realistic range
        temp = np.clip(temp, 36.0, 37.8)
        
        return temp
    
    # ========================================================================
    # KAGGLE DATASETS
    # ========================================================================
    
    def load_kaggle_dataset(self, dataset_name='heartbeat'):
        """
        Load Kaggle medical datasets
        
        Args:
            dataset_name: 'heartbeat', 'heart-disease', or custom path
            
        Returns:
            df: DataFrame with medical data
        """
        print("\n" + "="*60)
        print(f"LOADING KAGGLE DATASET: {dataset_name}")
        print("="*60)
        
        print("\n⚠ Manual Download Required:")
        print("1. Go to Kaggle and download the dataset")
        print("2. Extract to:", self.data_dir / 'kaggle' / dataset_name)
        print("3. Re-run this function")
        print("\nRecommended datasets:")
        print("  - ECG Heartbeat Categorization: kaggle.com/shayanfazeli/heartbeat")
        print("  - Heart Disease UCI: kaggle.com/ronitf/heart-disease-uci")
        
        # Try to load if exists
        kaggle_path = self.data_dir / 'kaggle' / dataset_name
        if kaggle_path.exists():
            # Try common file names
            for filename in ['mitbih_train.csv', 'data.csv', 'heart.csv']:
                filepath = kaggle_path / filename
                if filepath.exists():
                    print(f"\n✓ Found: {filename}")
                    df = pd.read_csv(filepath)
                    print(f"✓ Loaded {len(df)} samples")
                    return df
        
        print("\n❌ Dataset not found. Please download manually.")
        return None
    
    # ========================================================================
    # CSV DATA LOADER
    # ========================================================================
    
    def load_custom_csv(self, filepath, required_columns=None):
        """
        Load custom CSV file with vital signs
        
        Args:
            filepath: Path to CSV file
            required_columns: List of required column names
            
        Returns:
            df: DataFrame with vital signs
        """
        if required_columns is None:
            required_columns = ['timestamp', 'HR', 'SpO2', 'Temperature']
        
        print("\n" + "="*60)
        print(f"LOADING CUSTOM CSV: {filepath}")
        print("="*60)
        
        try:
            df = pd.read_csv(filepath)
            print(f"✓ Loaded {len(df)} rows")
            
            # Check required columns
            missing = [col for col in required_columns if col not in df.columns]
            if missing:
                print(f"⚠ Missing columns: {missing}")
                print(f"Available columns: {list(df.columns)}")
            
            # Convert timestamp if present
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            
            return df
            
        except Exception as e:
            print(f"❌ Error loading CSV: {e}")
            return None
    
    # ========================================================================
    # DATASET MANAGEMENT
    # ========================================================================
    
    def list_available_datasets(self):
        """List all available datasets in data directory"""
        print("\n" + "="*60)
        print("AVAILABLE DATASETS")
        print("="*60)
        
        datasets = []
        
        # Check MIT-BIH
        mitbih_dir = self.data_dir / 'mitdb'
        if mitbih_dir.exists():
            records = [f.stem for f in mitbih_dir.glob('*.dat')]
            if records:
                datasets.append(('MIT-BIH', len(records), str(mitbih_dir)))
                print(f"\n✓ MIT-BIH: {len(records)} records")
        
        # Check Kaggle
        kaggle_dir = self.data_dir / 'kaggle'
        if kaggle_dir.exists():
            kaggle_datasets = [d for d in kaggle_dir.iterdir() if d.is_dir()]
            if kaggle_datasets:
                datasets.append(('Kaggle', len(kaggle_datasets), str(kaggle_dir)))
                print(f"\n✓ Kaggle: {len(kaggle_datasets)} datasets")
        
        # Check custom CSV
        csv_files = list(self.data_dir.glob('*.csv'))
        if csv_files:
            datasets.append(('Custom CSVs', len(csv_files), str(self.data_dir)))
            print(f"\n✓ Custom CSVs: {len(csv_files)} files")
        
        if not datasets:
            print("\n❌ No datasets found!")
            print("\nTo get started:")
            print("  1. Run: loader.download_mitbih_dataset()")
            print("  2. Or download from Kaggle manually")
        
        return datasets
    
    def prepare_dataset_for_training(self, df, test_size=0.2):
        """
        Prepare dataset for model training
        
        Args:
            df: Raw dataset DataFrame
            test_size: Fraction for test set
            
        Returns:
            train_df, test_df: Split datasets
        """
        from sklearn.model_selection import train_test_split
        
        print("\n" + "="*60)
        print("PREPARING DATASET FOR TRAINING")
        print("="*60)
        
        print(f"\nTotal samples: {len(df)}")
        
        # Split by patient if patient_id exists
        if 'patient_id' in df.columns:
            unique_patients = df['patient_id'].unique()
            train_patients, test_patients = train_test_split(
                unique_patients, 
                test_size=test_size, 
                random_state=42
            )
            
            train_df = df[df['patient_id'].isin(train_patients)]
            test_df = df[df['patient_id'].isin(test_patients)]
            
            print(f"Train patients: {len(train_patients)} ({len(train_df)} samples)")
            print(f"Test patients: {len(test_patients)} ({len(test_df)} samples)")
        else:
            # Simple split
            train_df, test_df = train_test_split(df, test_size=test_size, random_state=42)
            print(f"Train samples: {len(train_df)}")
            print(f"Test samples: {len(test_df)}")
        
        return train_df, test_df


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def quick_load_mitbih(n_records=5):
    """
    Quick function to download and load MIT-BIH data
    
    Args:
        n_records: Number of records to load
        
    Returns:
        df: DataFrame with medical data
    """
    loader = RealDatasetLoader()
    
    records = ['100', '101', '103', '105', '106', '108', '109', '111'][:n_records]
    
    print("🏥 Quick MIT-BIH Data Loader")
    df = loader.load_mitbih_data(records=records, max_samples_per_record=10000)
    
    return df


def download_all_recommended_data():
    """Download all recommended datasets"""
    loader = RealDatasetLoader()
    
    print("\n" + "="*60)
    print("🚀 DOWNLOADING ALL RECOMMENDED DATASETS")
    print("="*60)
    
    # Download MIT-BIH
    print("\n1. MIT-BIH Arrhythmia Database")
    loader.download_mitbih_dataset()
    
    print("\n2. Kaggle Datasets")
    print("   ⚠ Please download manually from kaggle.com")
    
    print("\n✓ Download process complete!")
    loader.list_available_datasets()


# ============================================================================
# EXAMPLE USAGE
# ============================================================================
if __name__ == "__main__":
    loader = RealDatasetLoader()
    
    # Option 1: Quick load MIT-BIH
    print("\n" + "="*60)
    print("OPTION 1: QUICK LOAD MIT-BIH (Recommended)")
    print("="*60)
    
    df = quick_load_mitbih(n_records=3)
    
    if df is not None:
        print("\n✓ Dataset loaded successfully!")
        print(f"\nDataset info:")
        print(df.info())
        print(f"\nFirst few rows:")
        print(df.head())
        print(f"\nVital signs statistics:")
        print(df[['HR', 'SpO2', 'Temperature']].describe())
