"""
Simple script to download PhysioNet MIT-BIH data
"""

import wfdb
import os
from pathlib import Path

# Data directory
data_dir = Path(__file__).parent / 'data' / 'mitdb'
data_dir.mkdir(parents=True, exist_ok=True)

print("="*60)
print("DOWNLOADING PHYSIONET MIT-BIH DATASET")
print("="*60)
print(f"\nSaving to: {data_dir}")

# Records to download (high quality)
records = ['100', '101', '103', '105', '106']

print(f"\nDownloading {len(records)} ECG records...")
print("This may take 2-3 minutes...\n")

downloaded = []
for record in records:
    try:
        print(f"Downloading record {record}...", end=" ", flush=True)
        
        # Download directly from PhysioNet
        rec = wfdb.rdrecord(record, pn_dir='mitdb', sampfrom=0, sampto=650000)
        
        # Save to local directory
        wfdb.wrsamp(
            record_name=str(data_dir / record),
            fs=rec.fs,
            units=rec.units,
            sig_name=rec.sig_name,
            p_signal=rec.p_signal
        )
        
        print("✓")
        downloaded.append(record)
        
    except Exception as e:
        print(f"✗ Error: {e}")

print(f"\n✓ Downloaded {len(downloaded)}/{len(records)} records")

# List downloaded files
if downloaded:
    print(f"\n📁 Downloaded files in: {data_dir}")
    for f in sorted(data_dir.glob('*')):
        size_mb = f.stat().st_size / 1024 / 1024
        print(f"  - {f.name} ({size_mb:.1f} MB)")
    
    print(f"\n✅ SUCCESS! Data ready for training.")
    print(f"\nNext step: python train.py --real-data --records {len(downloaded)}")
else:
    print("\n❌ No data downloaded. Check internet connection.")
