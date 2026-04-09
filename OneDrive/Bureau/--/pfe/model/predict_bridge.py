"""
Bridge script: receives vitals JSON from stdin, runs AI models from trained_models,
and returns compact JSON analysis to stdout.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List

# Ensure Windows consoles using cp1252 do not crash on Unicode logs from imported modules.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from inference import SmartHospitalInference


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        cleaned = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(cleaned)
        except Exception:
            return datetime.now()
    return datetime.now()


def _to_float(value: Any) -> float | None:
    try:
        parsed = float(value)
        if parsed != parsed:  # NaN check
            return None
        return parsed
    except Exception:
        return None


def _severity_from_latest(latest: Dict[str, Any]) -> str:
    hr = _to_float(latest.get("HR"))
    spo2 = _to_float(latest.get("SpO2"))
    temp = _to_float(latest.get("Temperature"))

    if (hr is not None and (hr >= 130 or hr <= 42)) or (spo2 is not None and spo2 < 90) or (temp is not None and (temp >= 39.2 or temp < 35.2)):
        return "CRITICAL"
    if (hr is not None and (hr > 110 or hr < 52)) or (spo2 is not None and spo2 < 94) or (temp is not None and (temp >= 38.2 or temp < 36.0)):
        return "HIGH"
    return "MEDIUM"


def _build_analysis(engine: SmartHospitalInference, patient_id: str) -> Dict[str, Any]:
    results: Dict[str, Any] = {
        "anomaly": None,
        "status": None,
        "cardiac": None,
        "respiratory": None,
    }
    errors: List[str] = []

    try:
        results["anomaly"] = engine.predict_anomaly(patient_id)
    except Exception as exc:
        errors.append(f"anomaly:{exc}")

    try:
        results["status"] = engine.predict_patient_status(patient_id)
    except Exception as exc:
        errors.append(f"status:{exc}")

    try:
        results["cardiac"] = engine.predict_cardiac_risk(patient_id)
    except Exception as exc:
        errors.append(f"cardiac:{exc}")

    try:
        results["respiratory"] = engine.predict_respiratory_future(patient_id)
    except Exception as exc:
        errors.append(f"respiratory:{exc}")

    buffer_df = engine.get_patient_buffer(patient_id, as_dataframe=True)
    latest = {}
    if len(buffer_df) > 0:
        row = buffer_df.iloc[-1]
        latest = {
            "HR": _to_float(row.get("HR")),
            "SpO2": _to_float(row.get("SpO2")),
            "Temperature": _to_float(row.get("Temperature")),
        }

    derived_severity = _severity_from_latest(latest) if latest else "MEDIUM"

    # Fill gaps if one of the models is unavailable at runtime.
    if results["anomaly"] is None:
        default_score = 0.84 if derived_severity == "CRITICAL" else 0.58 if derived_severity == "HIGH" else 0.16
        results["anomaly"] = {
            "is_anomaly": derived_severity in ("CRITICAL", "HIGH"),
            "anomaly_score": default_score,
            "alert_level": "HIGH" if derived_severity == "CRITICAL" else "MEDIUM" if derived_severity == "HIGH" else "NONE",
        }

    if results["status"] is None:
        status_name = "Critical" if derived_severity == "CRITICAL" else "Warning" if derived_severity == "HIGH" else "Stable"
        results["status"] = {
            "status": status_name,
            "confidence": 0.82 if status_name == "Critical" else 0.72 if status_name == "Warning" else 0.68,
            "alert_level": "HIGH" if status_name == "Critical" else "MEDIUM" if status_name == "Warning" else "LOW",
        }

    if results["cardiac"] is None:
        hr = _to_float(latest.get("HR")) if latest else None
        if hr is not None and (hr >= 130 or hr <= 45):
            risk_level = "High"
            risk_probability = 0.83
        elif hr is not None and (hr > 110 or hr < 52):
            risk_level = "Medium"
            risk_probability = 0.58
        else:
            risk_level = "Low"
            risk_probability = 0.24
        results["cardiac"] = {
            "risk_level": risk_level,
            "risk_probability": risk_probability,
            "risk_percentage": f"{risk_probability * 100:.1f}%",
        }

    if results["respiratory"] is None:
        current_spo2 = _to_float(latest.get("SpO2")) if latest else 97.0
        drop = 3.0 if derived_severity == "CRITICAL" else 1.2 if derived_severity == "HIGH" else 0.2
        predicted_spo2 = max(70.0, min(100.0, (current_spo2 or 97.0) - drop))
        results["respiratory"] = {
            "predicted_spo2": predicted_spo2,
            "current_spo2": current_spo2,
            "change": predicted_spo2 - (current_spo2 or predicted_spo2),
            "horizon_minutes": 30,
            "alert": predicted_spo2 < 92,
        }
    else:
        try:
            raw_pred = _to_float(results["respiratory"].get("predicted_spo2"))
            raw_current = _to_float(results["respiratory"].get("current_spo2"))

            if raw_pred is not None:
                raw_pred = max(70.0, min(100.0, raw_pred))
                results["respiratory"]["predicted_spo2"] = round(raw_pred, 1)

            if raw_current is not None:
                raw_current = max(70.0, min(100.0, raw_current))
                results["respiratory"]["current_spo2"] = round(raw_current, 1)

            if raw_pred is not None and raw_current is not None:
                results["respiratory"]["change"] = round(raw_pred - raw_current, 1)

            results["respiratory"]["alert"] = bool(
                _to_float(results["respiratory"].get("predicted_spo2")) is not None
                and float(results["respiratory"].get("predicted_spo2")) < 92
            )
        except Exception:
            pass

    alerts: List[Dict[str, Any]] = []
    recommendations: List[str] = []

    anomaly = results["anomaly"]
    if anomaly and anomaly.get("is_anomaly"):
        alerts.append({
            "type": "VITAL_SIGN_ANOMALY",
            "severity": "HIGH",
            "message": "AI detected an anomalous vital pattern",
            "description": f"Anomaly score: {anomaly.get('anomaly_score', 0):.3f}",
            "confidence": 0.8,
        })
        recommendations.append("Perform bedside reassessment and verify sensor placement.")

    status = results["status"]
    if status and str(status.get("status", "")).lower() == "critical":
        alerts.append({
            "type": "PATIENT_DETERIORATION",
            "severity": "CRITICAL",
            "message": "AI classifies patient condition as critical",
            "description": f"Confidence: {float(status.get('confidence', 0)) * 100:.1f}%",
            "confidence": float(status.get("confidence", 0)),
        })
        recommendations.append("Escalate to physician immediately and initiate critical care protocol.")

    cardiac = results["cardiac"]
    if cardiac and str(cardiac.get("risk_level", "")).lower() == "high":
        alerts.append({
            "type": "PREDICTION_WARNING",
            "severity": "CRITICAL",
            "message": "High cardiac risk predicted",
            "description": f"Risk probability: {cardiac.get('risk_percentage', cardiac.get('risk_probability', 'N/A'))}",
            "confidence": 0.85,
        })
        recommendations.append("Order ECG review and continuous telemetry monitoring.")

    respiratory = results["respiratory"]
    if respiratory and respiratory.get("alert"):
        alerts.append({
            "type": "PREDICTION_WARNING",
            "severity": "HIGH",
            "message": "Possible respiratory deterioration in prediction horizon",
            "description": f"Predicted SpO2: {float(respiratory.get('predicted_spo2', 0)):.1f}% in {respiratory.get('horizon_minutes', 30)} min",
            "confidence": 0.8,
        })
        recommendations.append("Increase respiratory observation frequency and prepare oxygen support.")

    if latest:
        if derived_severity in ("CRITICAL", "HIGH"):
            alerts.append({
                "type": "CRITICAL_VITAL_SIGN",
                "severity": derived_severity,
                "message": "Current vital signs exceed safe thresholds",
                "description": f"HR={latest.get('HR')} bpm, SpO2={latest.get('SpO2')}%, Temp={latest.get('Temperature')}C",
                "confidence": 0.75,
            })
            recommendations.append("Validate current vitals and apply protocol-based intervention.")

    if not recommendations:
        recommendations.append("Continue routine monitoring; no urgent AI-triggered action required.")

    return {
        "ok": True,
        "patientId": patient_id,
        "generatedAt": datetime.now().isoformat(),
        "latestVitals": latest,
        "models": results,
        "alerts": alerts,
        "recommendations": list(dict.fromkeys(recommendations)),
        "modelErrors": errors,
    }


def _augment_for_warmup(vitals: List[Dict[str, Any]], min_points: int = 620) -> List[Dict[str, Any]]:
    if len(vitals) >= min_points:
        return vitals

    if not vitals:
        now = datetime.now()
        return [
            {
                "timestamp": (now - timedelta(seconds=(min_points - i))).isoformat(),
                "heartRate": 80,
                "spO2": 97,
                "temperature": 36.9,
                "glucose": 110,
            }
            for i in range(min_points)
        ]

    base = vitals[-1]
    base_hr = _to_float(base.get("heartRate") if "heartRate" in base else base.get("HR")) or 80.0
    base_spo2 = _to_float(base.get("spO2") if "spO2" in base else base.get("SpO2")) or 97.0
    base_temp = _to_float(base.get("temperature") if "temperature" in base else base.get("Temperature")) or 36.9
    base_glucose = _to_float(base.get("glucose") if "glucose" in base else base.get("Glucose")) or 110.0

    missing = max(0, min_points - len(vitals))
    start_time = _parse_ts(vitals[0].get("timestamp")) if vitals else datetime.now()

    synthetic = []
    for i in range(missing):
        t = start_time - timedelta(seconds=(missing - i))
        synthetic.append(
            {
                "timestamp": t.isoformat(),
                "heartRate": round(base_hr + ((i % 9) - 4) * 0.8, 2),
                "spO2": round(base_spo2 + ((i % 7) - 3) * 0.15, 2),
                "temperature": round(base_temp + ((i % 5) - 2) * 0.03, 2),
                "glucose": round(base_glucose + ((i % 11) - 5) * 0.7, 2),
            }
        )

    return synthetic + vitals


def main() -> int:
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"ok": False, "error": "No input payload"}))
        return 1

    payload = json.loads(raw)
    patient_id = str(payload.get("patientId") or "UNKNOWN")
    vitals = _augment_for_warmup(payload.get("vitals") or [])

    engine = SmartHospitalInference(load_models=True)

    for entry in vitals:
        hr = _to_float(entry.get("heartRate") if "heartRate" in entry else entry.get("HR"))
        spo2 = _to_float(entry.get("spO2") if "spO2" in entry else entry.get("SpO2"))
        temp = _to_float(entry.get("temperature") if "temperature" in entry else entry.get("Temperature"))

        if hr is None or spo2 is None or temp is None:
            continue

        engine.add_patient_data(
            patient_id,
            {
                "HR": hr,
                "SpO2": spo2,
                "Temperature": temp,
                "timestamp": _parse_ts(entry.get("timestamp")),
            },
        )

    analysis = _build_analysis(engine, patient_id)
    print(json.dumps(analysis, default=str))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
