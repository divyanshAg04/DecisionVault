"""
Production training pipeline for DecisionVault placement predictions.

Outputs:
- models/placement_bundle.joblib
- models/placement_bundle.pkl
- models/placement_classifier.joblib
- models/placement_regressor.joblib
- models/reports/evaluation_report.md
- models/reports/model_comparison.csv
- models/reports/feature_importance.csv
- models/plots/*.png
"""

from __future__ import annotations

import json
import math
import os
import pickle
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

warnings.filterwarnings("ignore")

RANDOM_STATE = 42
BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "datasets"
MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = MODELS_DIR / "reports"
PLOTS_DIR = MODELS_DIR / "plots"

PLACEMENT_DATASET = DATASETS_DIR / "Indian_Student_Placement_Dataset_2025.csv"

sys.modules.setdefault("train_models", sys.modules[__name__])

FEATURE_COLUMNS = [
    "gender",
    "age",
    "degree",
    "branch",
    "cgpa",
    "backlogs",
    "internships",
    "certifications",
    "coding_skills",
    "communication_skills",
    "aptitude_score",
    "projects",
]

NUMERIC_COLUMNS = [
    "age",
    "cgpa",
    "backlogs",
    "internships",
    "certifications",
    "coding_skills",
    "communication_skills",
    "aptitude_score",
    "projects",
]

CATEGORICAL_COLUMNS = ["gender", "degree", "branch"]


def ensure_dirs() -> None:
    MODELS_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)


def optional_imports() -> dict[str, Any]:
    optional: dict[str, Any] = {}
    try:
        from xgboost import XGBClassifier, XGBRegressor

        optional["xgb_classifier"] = XGBClassifier
        optional["xgb_regressor"] = XGBRegressor
    except Exception:
        optional["xgb_classifier"] = None
        optional["xgb_regressor"] = None

    try:
        from catboost import CatBoostClassifier, CatBoostRegressor

        optional["cat_classifier"] = CatBoostClassifier
        optional["cat_regressor"] = CatBoostRegressor
    except Exception:
        optional["cat_classifier"] = None
        optional["cat_regressor"] = None

    try:
        from lightgbm import LGBMClassifier, LGBMRegressor

        optional["lgbm_classifier"] = LGBMClassifier
        optional["lgbm_regressor"] = LGBMRegressor
    except Exception:
        optional["lgbm_classifier"] = None
        optional["lgbm_regressor"] = None

    return optional


def load_dataset() -> pd.DataFrame:
    if not PLACEMENT_DATASET.exists():
        raise FileNotFoundError(f"Dataset not found: {PLACEMENT_DATASET}")

    df = pd.read_csv(PLACEMENT_DATASET)
    df.columns = [col.strip() for col in df.columns]
    return df


def clean_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.drop_duplicates()

    for col in NUMERIC_COLUMNS + ["placed", "package_lpa"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in CATEGORICAL_COLUMNS:
        df[col] = df[col].astype("string").str.strip()
        df[col] = df[col].replace({"": np.nan, "nan": np.nan, "None": np.nan})

    df["placed"] = df["placed"].fillna(0).astype(int).clip(0, 1)
    df["package_lpa"] = df["package_lpa"].fillna(0).clip(lower=0)

    for col in NUMERIC_COLUMNS:
        df[col] = df[col].fillna(df[col].median())

    for col in CATEGORICAL_COLUMNS:
        df[col] = df[col].fillna(df[col].mode().iloc[0])

    df = remove_iqr_outliers(df, NUMERIC_COLUMNS)
    df = df[(df["placed"] == 0) | (df["package_lpa"] > 0)].copy()
    df = df[(df["placed"] == 1) | (df["package_lpa"] == 0)].copy()

    return df.reset_index(drop=True)


def remove_iqr_outliers(df: pd.DataFrame, columns: list[str], factor: float = 1.5) -> pd.DataFrame:
    mask = pd.Series(True, index=df.index)
    for col in columns:
        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)
        iqr = q3 - q1
        if iqr <= 0:
            continue
        lower = q1 - factor * iqr
        upper = q3 + factor * iqr
        mask &= df[col].between(lower, upper)
    return df[mask].copy()


class FeatureEngineer(BaseEstimator, TransformerMixin):
    """Adds deterministic, inference-safe student profile features."""

    def fit(self, X: pd.DataFrame, y: Any = None) -> "FeatureEngineer":
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        X["skill_mean"] = X[["coding_skills", "communication_skills"]].mean(axis=1)
        X["academic_strength"] = (X["cgpa"] * 10 + X["aptitude_score"]) / 2
        X["experience_count"] = X["internships"] + X["projects"] + X["certifications"]
        X["has_backlogs"] = (X["backlogs"] > 0).astype(int)
        X["cgpa_coding_interaction"] = X["cgpa"] * X["coding_skills"]
        X["communication_aptitude_interaction"] = X["communication_skills"] * X["aptitude_score"]
        X["project_internship_interaction"] = X["projects"] * (X["internships"] + 1)
        X["profile_score"] = (
            X["cgpa"] * 8
            + X["coding_skills"] * 5
            + X["communication_skills"] * 4
            + X["aptitude_score"] * 0.35
            + X["internships"] * 3
            + X["projects"] * 2
            + X["certifications"]
            - X["backlogs"] * 6
        )
        return X

    def get_feature_names_out(self, input_features: Any = None) -> np.ndarray:
        base = list(input_features or FEATURE_COLUMNS)
        engineered = [
            "skill_mean",
            "academic_strength",
            "experience_count",
            "has_backlogs",
            "cgpa_coding_interaction",
            "communication_aptitude_interaction",
            "project_internship_interaction",
            "profile_score",
        ]
        return np.array(base + engineered)


# Keep persisted sklearn pipelines loadable from other Python entrypoints.
FeatureEngineer.__module__ = "train_models"


def make_preprocessor(scale_numeric: bool = False):
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    engineered_numeric = NUMERIC_COLUMNS + [
        "skill_mean",
        "academic_strength",
        "experience_count",
        "has_backlogs",
        "cgpa_coding_interaction",
        "communication_aptitude_interaction",
        "project_internship_interaction",
        "profile_score",
    ]

    numeric_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scaler", StandardScaler()))

    numeric_pipeline = Pipeline(numeric_steps)
    categorical_pipeline = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    return ColumnTransformer(
        [
            ("num", numeric_pipeline, engineered_numeric),
            ("cat", categorical_pipeline, CATEGORICAL_COLUMNS),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def make_pipeline(model: Any, scale_numeric: bool = False):
    from sklearn.pipeline import Pipeline

    return Pipeline(
        [
            ("features", FeatureEngineer()),
            ("preprocess", make_preprocessor(scale_numeric=scale_numeric)),
            ("model", model),
        ]
    )


def get_feature_names(fitted_pipeline: Any) -> list[str]:
    preprocessor = fitted_pipeline.named_steps["preprocess"]
    try:
        return list(preprocessor.get_feature_names_out())
    except Exception:
        return [f"feature_{idx}" for idx in range(len(getattr(fitted_pipeline.named_steps["model"], "feature_importances_", [])))]


def get_feature_importance(fitted_pipeline: Any, top_n: int = 15) -> pd.DataFrame:
    model = fitted_pipeline.named_steps["model"]
    names = get_feature_names(fitted_pipeline)

    if hasattr(model, "feature_importances_"):
        values = model.feature_importances_
    elif hasattr(model, "coef_"):
        coef = np.ravel(model.coef_)
        values = np.abs(coef)
    else:
        return pd.DataFrame(columns=["feature", "importance"])

    importances = pd.DataFrame({"feature": names[: len(values)], "importance": values})
    importances = importances.sort_values("importance", ascending=False).head(top_n)
    return importances.reset_index(drop=True)


@dataclass
class ModelResult:
    name: str
    estimator: Any
    metrics: dict[str, float]
    cv_score: float | None = None


def evaluate_classifier(name: str, estimator: Any, X_test: pd.DataFrame, y_test: pd.Series) -> ModelResult:
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score

    pred = estimator.predict(X_test)
    if hasattr(estimator, "predict_proba"):
        proba = estimator.predict_proba(X_test)[:, 1]
    else:
        scores = estimator.decision_function(X_test)
        proba = 1 / (1 + np.exp(-scores))

    metrics = {
        "accuracy": accuracy_score(y_test, pred),
        "precision": precision_score(y_test, pred, zero_division=0),
        "recall": recall_score(y_test, pred, zero_division=0),
        "f1": f1_score(y_test, pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, proba),
    }
    return ModelResult(name=name, estimator=estimator, metrics=metrics)


def evaluate_regressor(name: str, estimator: Any, X_test: pd.DataFrame, y_test: pd.Series) -> ModelResult:
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    pred = estimator.predict(X_test)
    mse = mean_squared_error(y_test, pred)
    metrics = {
        "r2": r2_score(y_test, pred),
        "mae": mean_absolute_error(y_test, pred),
        "rmse": math.sqrt(mse),
        "mse": mse,
    }
    return ModelResult(name=name, estimator=estimator, metrics=metrics)


def classifier_candidates(optional: dict[str, Any]) -> dict[str, tuple[Any, dict[str, list[Any]], bool]]:
    from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import SVC

    candidates: dict[str, tuple[Any, dict[str, list[Any]], bool]] = {
        "Logistic Regression": (
            LogisticRegression(max_iter=2000, class_weight="balanced", random_state=RANDOM_STATE),
            {"model__C": [0.1, 1.0, 3.0]},
            True,
        ),
        "Random Forest Classifier": (
            RandomForestClassifier(class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1),
            {
                "model__n_estimators": [180],
                "model__max_depth": [None, 18],
                "model__min_samples_leaf": [1, 2],
            },
            False,
        ),
        "Gradient Boosting Classifier": (
            GradientBoostingClassifier(random_state=RANDOM_STATE),
            {
                "model__n_estimators": [180],
                "model__learning_rate": [0.06],
                "model__max_depth": [2, 3],
            },
            False,
        ),
        "Extra Trees Classifier": (
            ExtraTreesClassifier(class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1),
            {
                "model__n_estimators": [220],
                "model__max_depth": [None, 22],
                "model__min_samples_leaf": [1],
            },
            False,
        ),
        "Support Vector Machine": (
            SVC(probability=False, class_weight="balanced", random_state=RANDOM_STATE),
            {"model__C": [1.0, 3.0], "model__gamma": ["scale"]},
            True,
        ),
    }

    if optional.get("xgb_classifier"):
        XGBClassifier = optional["xgb_classifier"]
        candidates["XGBoost Classifier"] = (
            XGBClassifier(
                objective="binary:logistic",
                eval_metric="logloss",
                random_state=RANDOM_STATE,
                n_jobs=-1,
                tree_method="hist",
            ),
            {
                "model__n_estimators": [220],
                "model__max_depth": [3, 5],
                "model__learning_rate": [0.06],
                "model__subsample": [0.9],
            },
            False,
        )

    if optional.get("cat_classifier"):
        CatBoostClassifier = optional["cat_classifier"]
        candidates["CatBoost Classifier"] = (
            CatBoostClassifier(random_seed=RANDOM_STATE, verbose=False, allow_writing_files=False),
            {"model__iterations": [250], "model__depth": [4, 6], "model__learning_rate": [0.06]},
            False,
        )

    if optional.get("lgbm_classifier"):
        LGBMClassifier = optional["lgbm_classifier"]
        candidates["LightGBM Classifier"] = (
            LGBMClassifier(random_state=RANDOM_STATE, n_jobs=-1, verbose=-1),
            {"model__n_estimators": [250], "model__num_leaves": [31, 63], "model__learning_rate": [0.06]},
            False,
        )

    return candidates


def regressor_candidates(optional: dict[str, Any]) -> dict[str, tuple[Any, dict[str, list[Any]], bool]]:
    from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
    from sklearn.linear_model import LinearRegression, Ridge

    candidates: dict[str, tuple[Any, dict[str, list[Any]], bool]] = {
        "Linear Regression": (LinearRegression(), {}, True),
        "Ridge Regression": (Ridge(random_state=RANDOM_STATE), {"model__alpha": [0.1, 1.0, 5.0]}, True),
        "Random Forest Regressor": (
            RandomForestRegressor(random_state=RANDOM_STATE, n_jobs=-1),
            {
                "model__n_estimators": [220],
                "model__max_depth": [None, 18],
                "model__min_samples_leaf": [1, 2],
            },
            False,
        ),
        "Gradient Boosting Regressor": (
            GradientBoostingRegressor(random_state=RANDOM_STATE),
            {
                "model__n_estimators": [220],
                "model__learning_rate": [0.06],
                "model__max_depth": [2, 3],
            },
            False,
        ),
        "Extra Trees Regressor": (
            ExtraTreesRegressor(random_state=RANDOM_STATE, n_jobs=-1),
            {
                "model__n_estimators": [260],
                "model__max_depth": [None, 22],
                "model__min_samples_leaf": [1, 2],
            },
            False,
        ),
    }

    if optional.get("xgb_regressor"):
        XGBRegressor = optional["xgb_regressor"]
        candidates["XGBoost Regressor"] = (
            XGBRegressor(
                objective="reg:squarederror",
                random_state=RANDOM_STATE,
                n_jobs=-1,
                tree_method="hist",
            ),
            {
                "model__n_estimators": [260],
                "model__max_depth": [3, 5],
                "model__learning_rate": [0.06],
                "model__subsample": [0.9],
            },
            False,
        )

    if optional.get("cat_regressor"):
        CatBoostRegressor = optional["cat_regressor"]
        candidates["CatBoost Regressor"] = (
            CatBoostRegressor(random_seed=RANDOM_STATE, verbose=False, allow_writing_files=False),
            {"model__iterations": [250], "model__depth": [4, 6], "model__learning_rate": [0.06]},
            False,
        )

    if optional.get("lgbm_regressor"):
        LGBMRegressor = optional["lgbm_regressor"]
        candidates["LightGBM Regressor"] = (
            LGBMRegressor(random_state=RANDOM_STATE, n_jobs=-1, verbose=-1),
            {"model__n_estimators": [250], "model__num_leaves": [31, 63], "model__learning_rate": [0.06]},
            False,
        )

    return candidates


def tune_and_train(
    candidates: dict[str, tuple[Any, dict[str, list[Any]], bool]],
    X_train: pd.DataFrame,
    y_train: pd.Series,
    problem_type: str,
) -> list[tuple[str, Any, float | None]]:
    from sklearn.model_selection import GridSearchCV, StratifiedKFold, KFold

    trained: list[tuple[str, Any, float | None]] = []
    if problem_type == "classification":
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
        scoring = "f1"
    else:
        cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
        scoring = "r2"

    for name, (model, params, scale_numeric) in candidates.items():
        print(f"Training {name}...")
        pipeline = make_pipeline(model, scale_numeric=scale_numeric)
        try:
            if params:
                search = GridSearchCV(
                    pipeline,
                    params,
                    cv=cv,
                    scoring=scoring,
                    n_jobs=-1,
                    verbose=0,
                    error_score="raise",
                )
                search.fit(X_train, y_train)
                trained.append((name, search.best_estimator_, float(search.best_score_)))
                print(f"  best CV {scoring}: {search.best_score_:.4f}")
            else:
                pipeline.fit(X_train, y_train)
                trained.append((name, pipeline, None))
                print("  fitted")
        except Exception as exc:
            print(f"  skipped {name}: {exc}")

    return trained


def plot_outputs(
    best_classifier: ModelResult,
    best_regressor: ModelResult,
    X_class_test: pd.DataFrame,
    y_class_test: pd.Series,
    X_reg_test: pd.DataFrame,
    y_reg_test: pd.Series,
    feature_importance: pd.DataFrame,
) -> None:
    try:
        import matplotlib.pyplot as plt
        from sklearn.metrics import ConfusionMatrixDisplay, PrecisionRecallDisplay, RocCurveDisplay
        from sklearn.model_selection import LearningCurveDisplay, StratifiedKFold

        ConfusionMatrixDisplay.from_estimator(best_classifier.estimator, X_class_test, y_class_test)
        plt.title("Confusion Matrix")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "confusion_matrix.png", dpi=160)
        plt.close()

        RocCurveDisplay.from_estimator(best_classifier.estimator, X_class_test, y_class_test)
        plt.title("ROC Curve")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "roc_curve.png", dpi=160)
        plt.close()

        PrecisionRecallDisplay.from_estimator(best_classifier.estimator, X_class_test, y_class_test)
        plt.title("Precision-Recall Curve")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "precision_recall_curve.png", dpi=160)
        plt.close()

        if not feature_importance.empty:
            feature_importance.sort_values("importance").plot.barh(x="feature", y="importance", legend=False, figsize=(9, 6))
            plt.title("Top 15 Feature Importances")
            plt.tight_layout()
            plt.savefig(PLOTS_DIR / "feature_importance.png", dpi=160)
            plt.close()

        y_pred = best_regressor.estimator.predict(X_reg_test)
        plt.figure(figsize=(7, 6))
        plt.scatter(y_reg_test, y_pred, alpha=0.55)
        mn = min(y_reg_test.min(), y_pred.min())
        mx = max(y_reg_test.max(), y_pred.max())
        plt.plot([mn, mx], [mn, mx], "r--")
        plt.xlabel("Actual Package LPA")
        plt.ylabel("Predicted Package LPA")
        plt.title("Actual vs Predicted Package")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "actual_vs_predicted.png", dpi=160)
        plt.close()

        residuals = y_reg_test - y_pred
        plt.figure(figsize=(7, 6))
        plt.scatter(y_pred, residuals, alpha=0.55)
        plt.axhline(0, color="red", linestyle="--")
        plt.xlabel("Predicted Package LPA")
        plt.ylabel("Residual")
        plt.title("Residual Plot")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "residual_plot.png", dpi=160)
        plt.close()

        LearningCurveDisplay.from_estimator(
            best_classifier.estimator,
            X_class_test,
            y_class_test,
            cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE),
            scoring="f1",
        )
        plt.title("Classification Learning Curve")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "learning_curve.png", dpi=160)
        plt.close()
    except Exception as exc:
        print(f"Plot generation skipped: {exc}")


def write_report(
    best_classifier: ModelResult,
    best_regressor: ModelResult,
    comparison_df: pd.DataFrame,
    feature_importance: pd.DataFrame,
    correlations: pd.DataFrame,
) -> None:
    comparison_df.to_csv(REPORTS_DIR / "model_comparison.csv", index=False)
    feature_importance.to_csv(REPORTS_DIR / "feature_importance.csv", index=False)
    correlations.to_csv(REPORTS_DIR / "feature_correlations.csv")

    report = f"""# DecisionVault ML Evaluation Report

==============================
CLASSIFICATION RESULTS
==============================

Best Model: {best_classifier.name}
Accuracy: {best_classifier.metrics['accuracy']:.4f}
Precision: {best_classifier.metrics['precision']:.4f}
Recall: {best_classifier.metrics['recall']:.4f}
F1 Score: {best_classifier.metrics['f1']:.4f}
ROC-AUC: {best_classifier.metrics['roc_auc']:.4f}

==============================
REGRESSION RESULTS
==============================

Best Model: {best_regressor.name}
R2 Score: {best_regressor.metrics['r2']:.4f}
MAE: {best_regressor.metrics['mae']:.4f}
RMSE: {best_regressor.metrics['rmse']:.4f}
MSE: {best_regressor.metrics['mse']:.4f}

## Top 15 Feature Importances

{feature_importance.to_string(index=False)}

## Model Comparison

{comparison_df.to_string(index=False)}
"""
    (REPORTS_DIR / "evaluation_report.md").write_text(report, encoding="utf-8")


def train_placement_models() -> None:
    from sklearn.model_selection import train_test_split

    ensure_dirs()
    optional = optional_imports()

    raw_df = load_dataset()
    df = clean_dataset(raw_df)
    print(f"Loaded {len(raw_df):,} rows; {len(df):,} rows after cleaning.")
    print(f"Placed rate: {df['placed'].mean():.3f}")

    correlations = df[NUMERIC_COLUMNS + ["placed", "package_lpa"]].corr(numeric_only=True)

    X = df[FEATURE_COLUMNS]
    y_class = df["placed"].astype(int)

    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(
        X,
        y_class,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=y_class,
    )

    trained_classifiers = tune_and_train(classifier_candidates(optional), X_train_c, y_train_c, "classification")
    classifier_results = [evaluate_classifier(name, model, X_test_c, y_test_c) for name, model, cv_score in trained_classifiers]
    for result, (_, _, cv_score) in zip(classifier_results, trained_classifiers):
        result.cv_score = cv_score
    best_classifier = max(classifier_results, key=lambda result: (result.metrics["f1"], result.metrics["roc_auc"]))

    reg_df = remove_iqr_outliers(df, ["package_lpa"], factor=1.5)
    X_reg = reg_df[FEATURE_COLUMNS]
    y_reg = reg_df["package_lpa"]

    X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(
        X_reg,
        y_reg,
        test_size=0.2,
        random_state=RANDOM_STATE,
    )

    trained_regressors = tune_and_train(regressor_candidates(optional), X_train_r, y_train_r, "regression")
    regressor_results = [evaluate_regressor(name, model, X_test_r, y_test_r) for name, model, cv_score in trained_regressors]
    for result, (_, _, cv_score) in zip(regressor_results, trained_regressors):
        result.cv_score = cv_score
    best_regressor = max(regressor_results, key=lambda result: (result.metrics["r2"], -result.metrics["mae"]))

    comparison_rows = []
    for result in classifier_results:
        comparison_rows.append({"task": "classification", "model": result.name, "cv_score": result.cv_score, **result.metrics})
    for result in regressor_results:
        comparison_rows.append({"task": "regression", "model": result.name, "cv_score": result.cv_score, **result.metrics})
    comparison_df = pd.DataFrame(comparison_rows)

    classifier_importance = get_feature_importance(best_classifier.estimator, top_n=15)
    regressor_importance = get_feature_importance(best_regressor.estimator, top_n=15)
    feature_importance = pd.concat(
        [
            classifier_importance.assign(task="classification"),
            regressor_importance.assign(task="regression"),
        ],
        ignore_index=True,
    )

    bundle = {
        "classifier": best_classifier.estimator,
        "regressor": best_regressor.estimator,
        "classifier_name": best_classifier.name,
        "regressor_name": best_regressor.name,
        "feature_columns": FEATURE_COLUMNS,
        "categorical_columns": CATEGORICAL_COLUMNS,
        "numeric_columns": NUMERIC_COLUMNS,
        "classification_metrics": best_classifier.metrics,
        "regression_metrics": best_regressor.metrics,
        "regression_target": "expected_package_lpa",
        "random_state": RANDOM_STATE,
    }

    joblib.dump(best_classifier.estimator, MODELS_DIR / "placement_classifier.joblib")
    joblib.dump(best_regressor.estimator, MODELS_DIR / "placement_regressor.joblib")
    joblib.dump(bundle, MODELS_DIR / "placement_bundle.joblib")
    with (MODELS_DIR / "placement_bundle.pkl").open("wb") as file:
        pickle.dump(bundle, file)

    metrics_json = {
        "classification": {"best_model": best_classifier.name, **best_classifier.metrics},
        "regression": {"best_model": best_regressor.name, **best_regressor.metrics},
    }
    (REPORTS_DIR / "metrics.json").write_text(json.dumps(metrics_json, indent=2), encoding="utf-8")

    plot_outputs(best_classifier, best_regressor, X_test_c, y_test_c, X_test_r, y_test_r, feature_importance)
    write_report(best_classifier, best_regressor, comparison_df, feature_importance, correlations)

    print("\n==============================")
    print("CLASSIFICATION RESULTS")
    print("==============================")
    print(f"Best Model: {best_classifier.name}")
    print(f"Accuracy: {best_classifier.metrics['accuracy']:.4f}")
    print(f"Precision: {best_classifier.metrics['precision']:.4f}")
    print(f"Recall: {best_classifier.metrics['recall']:.4f}")
    print(f"F1 Score: {best_classifier.metrics['f1']:.4f}")
    print(f"ROC-AUC: {best_classifier.metrics['roc_auc']:.4f}")

    print("\n==============================")
    print("REGRESSION RESULTS")
    print("==============================")
    print(f"Best Model: {best_regressor.name}")
    print(f"R2 Score: {best_regressor.metrics['r2']:.4f}")
    print(f"MAE: {best_regressor.metrics['mae']:.4f}")
    print(f"RMSE: {best_regressor.metrics['rmse']:.4f}")
    print(f"MSE: {best_regressor.metrics['mse']:.4f}")


if __name__ == "__main__":
    train_placement_models()
