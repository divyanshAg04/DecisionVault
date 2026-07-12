"""
CLI predictor for DecisionVault placement/package models.

Usage:
  python predict_placement.py '{"gender":"Male","age":21,...}'

The script reads the trained placement_bundle.joblib and prints JSON compatible
with the existing Express API response shape.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
BUNDLE_PATH = MODELS_DIR / "placement_bundle.joblib"

# Import train_models so persisted pipelines can resolve FeatureEngineer.
sys.path.insert(0, str(BASE_DIR))
import train_models  # noqa: F401,E402


def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "gender": payload.get("gender", "Male"),
        "age": int(float(payload.get("age", 21))),
        "degree": payload.get("degree", "BTech"),
        "branch": payload.get("branch", "CS"),
        "cgpa": float(payload.get("cgpa", 7.5)),
        "backlogs": int(float(payload.get("backlogs", 0))),
        "internships": int(float(payload.get("internships", 0))),
        "certifications": int(float(payload.get("certifications", 0))),
        "coding_skills": int(float(payload.get("codingSkills", payload.get("coding_skills", 5)))),
        "communication_skills": int(float(payload.get("communicationSkills", payload.get("communication_skills", 5)))),
        "aptitude_score": int(float(payload.get("aptitudeScore", payload.get("aptitude_score", 70)))),
        "projects": int(float(payload.get("projects", 0))),
    }


def predict(payload: dict[str, Any]) -> dict[str, Any]:
    if not BUNDLE_PATH.exists():
        raise FileNotFoundError(f"Trained model bundle not found at {BUNDLE_PATH}")

    bundle = joblib.load(BUNDLE_PATH)
    row = pd.DataFrame([normalize_payload(payload)])

    classifier = bundle["classifier"]
    regressor = bundle["regressor"]

    if hasattr(classifier, "predict_proba"):
        placed_probability = float(classifier.predict_proba(row)[0][1])
    else:
        placed_probability = float(classifier.predict(row)[0])

    expected_package = 0.0
    expected_package_min = 0.0
    expected_package_max = 0.0
    if placed_probability >= 0.35:
        expected_package = float(regressor.predict(row)[0])
        expected_package = max(0.0, min(45.0, expected_package))
        
        # Calculate standard deviation from estimators
        std = 1.5 # fallback margin
        if hasattr(regressor, "named_steps") and "model" in regressor.named_steps:
            model = regressor.named_steps["model"]
            if hasattr(model, "estimators_"):
                try:
                    transformed_row = row
                    for name, step in regressor.named_steps.items():
                        if name != "model":
                            transformed_row = step.transform(transformed_row)
                    
                    preds = [float(tree.predict(transformed_row)[0]) for tree in model.estimators_]
                    if len(preds) > 0:
                        mean = sum(preds) / len(preds)
                        variance = sum((x - mean) ** 2 for x in preds) / len(preds)
                        std = variance ** 0.5
                except Exception as e:
                    print(f"Error calculating forest std-dev: {e}", file=sys.stderr)
        
        std = max(0.5, std) # Ensure it is not degenerate
        expected_package_min = max(3.0, round(expected_package - std, 2))
        expected_package_max = min(45.0, round(expected_package + std, 2))
        if expected_package_min >= expected_package_max:
            expected_package_max = expected_package_min + 1.0

    return {
        "placedProbability": placed_probability,
        "expectedPackageLpa": round(expected_package, 2),
        "expectedPackageMin": expected_package_min,
        "expectedPackageMax": expected_package_max,
        "status": "Success",
        "modelSource": "python-sklearn",
        "classifierModel": bundle.get("classifier_name"),
        "regressorModel": bundle.get("regressor_name"),
        "dataDisclaimer": "Trained on synthetic data; illustrative only, not a real placement guarantee",
    }


def main() -> int:
    try:
        if len(sys.argv) > 1:
            raw = sys.argv[1]
        else:
            raw = sys.stdin.read()
        payload = json.loads(raw or "{}")
        print(json.dumps(predict(payload)))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "Model prediction failed", "message": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
