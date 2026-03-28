"""
Demonstration: What contamination parameter really means
"""

import numpy as np
import matplotlib.pyplot as plt
from data_preprocessing import create_synthetic_data, DataPreprocessor
from feature_extraction import FeatureExtractor
from model_isolation_forest import AnomalyDetector

print("="*80)
print("CONTAMINATION PARAMETER EXPLAINED")
print("="*80)

# Generate sample data
print("\n1. Generating 1000 patient vital sign readings...")
df = create_synthetic_data(n_patients=5, duration_hours=2)
df_vitals = df.set_index('timestamp')[['HR', 'SpO2', 'Temperature']]

# Preprocess
preprocessor = DataPreprocessor()
df_clean = preprocessor.preprocess_pipeline(df_vitals, for_training=True)

# Extract features
extractor = FeatureExtractor()
X = extractor.create_feature_matrix(df_clean, window_size=60, stride=30)
X = np.nan_to_num(X, nan=0.0)

print(f"   ✓ Created {len(X)} feature windows")

print("\n" + "="*80)
print("TESTING DIFFERENT CONTAMINATION LEVELS")
print("="*80)

contamination_levels = [0.01, 0.03, 0.05, 0.10, 0.20]

results = []

for contamination in contamination_levels:
    print(f"\n📊 Contamination = {contamination*100:.0f}% ({contamination})")
    print("-" * 60)
    
    # Train model with this contamination level
    detector = AnomalyDetector(contamination=contamination)
    detector.train(X)
    
    # Get predictions
    predictions = detector.predict(X)
    anomaly_scores = detector.get_anomaly_scores(X)
    
    # Count anomalies
    n_anomalies = np.sum(predictions == -1)
    n_normal = np.sum(predictions == 1)
    pct_anomalies = (n_anomalies / len(predictions)) * 100
    
    print(f"   Total readings:     {len(predictions)}")
    print(f"   Normal readings:    {n_normal} ({100-pct_anomalies:.1f}%)")
    print(f"   Anomaly readings:   {n_anomalies} ({pct_anomalies:.1f}%)")
    print(f"   Anomaly score range: {anomaly_scores.min():.3f} to {anomaly_scores.max():.3f}")
    
    # Find the threshold
    threshold_idx = int(len(anomaly_scores) * (1 - contamination))
    sorted_scores = np.sort(anomaly_scores)
    threshold = sorted_scores[threshold_idx] if threshold_idx < len(sorted_scores) else sorted_scores[-1]
    print(f"   Decision threshold:  {threshold:.3f}")
    print(f"   → Scores > {threshold:.3f} = ANOMALY")
    
    results.append({
        'contamination': contamination,
        'n_anomalies': n_anomalies,
        'pct': pct_anomalies,
        'threshold': threshold
    })

print("\n" + "="*80)
print("WHAT THIS MEANS FOR YOUR SMART HOSPITAL")
print("="*80)

print("\n🏥 In a real hospital with 100 patients being monitored:")

for r in results:
    print(f"\n   Contamination = {r['contamination']*100:.0f}%:")
    print(f"   • {int(r['contamination']*100)} out of 100 readings flagged as unusual")
    print(f"   • Medical staff get {int(r['contamination']*100)} alerts per 100 measurements")
    
    # Practical interpretation
    if r['contamination'] >= 0.10:
        print(f"   ⚠️  TOO MANY ALERTS - Staff overwhelmed!")
    elif r['contamination'] >= 0.05:
        print(f"   ⚠️  HIGH - Use for high-risk units only")
    elif r['contamination'] >= 0.03:
        print(f"   ✅ RECOMMENDED - Good balance")
    else:
        print(f"   ℹ️  CONSERVATIVE - May miss some issues")

print("\n" + "="*80)
print("RECOMMENDATION")
print("="*80)

print("""
For the Smart Hospital PFE:

✅ Use contamination = 0.03 (3%)
   • 3 alerts per 100 readings
   • If monitoring every minute: ~43 alerts per day per patient
   • Manageable for nursing staff
   • Catches real deterioration without alert fatigue

⚙️ Adjustable Settings:
   • ICU patients: 0.02 (2%) - stricter monitoring
   • General ward: 0.03 (3%) - balanced
   • Emergency dept: 0.05 (5%) - more tolerance for variation
   • Recovery unit: 0.01 (1%) - very conservative

🎯 The algorithm learns what's "normal" for each patient and flags
   deviations that fall outside the expected patterns.
""")

print("\n" + "="*80)
print("EXAMPLE: What Gets Flagged as Anomaly?")
print("="*80)

print("""
Normal Pattern:
   HR: 70-75 bpm, SpO2: 97-99%, Temp: 36.8-37.2°C
   → Anomaly Score: 0.1 (NORMAL)

Concerning Pattern:
   HR: 110 bpm, SpO2: 94%, Temp: 37.8°C
   → Anomaly Score: 0.6 (ANOMALY - Multiple vital signs elevated)

Critical Pattern:
   HR: 130 bpm, SpO2: 88%, Temp: 39.1°C
   → Anomaly Score: 0.9 (SEVERE ANOMALY - Immediate attention)

The contamination parameter determines where the cutoff line is drawn
between "normal variation" and "true anomaly worth alerting on."
""")
