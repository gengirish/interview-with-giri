"""Prediction engine: correlates interview signals with hiring success."""

from __future__ import annotations

import math


def extract_features(report, engagement_profile=None, overall_score=None) -> dict:
    """Extract prediction features from an interview report."""
    features: dict = {}
    if report:
        overall = 0.0
        if overall_score is not None:
            overall = float(overall_score)
        elif hasattr(report, "overall_score") and report.overall_score is not None:
            overall = float(report.overall_score)
        elif hasattr(report, "session") and report.session and report.session.overall_score is not None:
            overall = float(report.session.overall_score)
        elif hasattr(report, "extended_data") and report.extended_data:
            od = report.extended_data
            if isinstance(od, dict) and "overall_score" in od:
                overall = float(od.get("overall_score", 0) or 0)
        features["overall_score"] = overall

        skills = report.skill_scores or {}
        for skill, score in skills.items():
            if isinstance(score, (int, float)):
                features[f"skill_{skill}"] = float(score)
            elif isinstance(score, dict) and "score" in score:
                features[f"skill_{skill}"] = float(score.get("score", 0) or 0)
            else:
                features[f"skill_{skill}"] = 0.0

        behavioral = report.behavioral_scores or {}
        for dim, score in behavioral.items():
            if isinstance(score, (int, float)):
                features[f"behavioral_{dim}"] = float(score)
            elif isinstance(score, dict) and "score" in score:
                features[f"behavioral_{dim}"] = float(score.get("score", 0) or 0)
            else:
                features[f"behavioral_{dim}"] = 0.0

        features["confidence_score"] = float(report.confidence_score or 0)
        features["strengths_count"] = len(report.strengths or [])
        features["concerns_count"] = len(report.concerns or [])

        rec_map = {
            "strong_hire": 1.0,
            "hire": 0.75,
            "maybe": 0.5,
            "lean_no_hire": 0.4,
            "no_hire": 0.25,
            "strong_no_hire": 0.0,
        }
        rec = (report.recommendation or "").lower().replace("-", "_")
        features["recommendation_score"] = rec_map.get(rec, 0.5)

    if engagement_profile and isinstance(engagement_profile, dict):
        features["engagement_overall"] = engagement_profile.get("overall_engagement", 0.5)
        speed = engagement_profile.get("response_speed", {})
        features["avg_response_ms"] = speed.get("avg_ms", 5000)
        confidence = engagement_profile.get("confidence_pattern", {})
        features["avg_confidence"] = confidence.get("avg", 0.5)

    return features


def heuristic_prediction(features: dict) -> dict:
    """Simple heuristic prediction when ML model isn't trained yet."""
    score = features.get("overall_score", 5)
    rec = features.get("recommendation_score", 0.5)
    engagement = features.get("engagement_overall", 0.5)
    confidence = features.get("avg_confidence", 0.5)

    probability = (score / 10 * 0.4) + (rec * 0.3) + (engagement * 0.15) + (confidence * 0.15)
    probability = round(min(max(probability, 0), 1), 2)

    contributing: list[dict] = []
    risk: list[dict] = []
    if score >= 7:
        contributing.append({"factor": "High interview score", "value": score, "impact": "positive"})
    elif score < 5:
        risk.append({"factor": "Low interview score", "value": score, "impact": "negative"})
    if rec >= 0.75:
        contributing.append({"factor": "Strong hire recommendation", "impact": "positive"})
    if engagement >= 0.7:
        contributing.append({"factor": "High engagement level", "value": round(engagement, 2), "impact": "positive"})
    elif engagement < 0.4:
        risk.append({"factor": "Low engagement", "value": round(engagement, 2), "impact": "negative"})
    if features.get("concerns_count", 0) >= 3:
        risk.append(
            {"factor": "Multiple concerns flagged", "value": features["concerns_count"], "impact": "negative"}
        )

    return {
        "success_probability": probability,
        "confidence": "low",
        "contributing_factors": contributing,
        "risk_factors": risk,
        "is_heuristic": True,
    }


def train_model(outcomes_with_features: list[dict]) -> dict:
    """Train a simple weighted model. Returns feature weights and accuracy."""
    if len(outcomes_with_features) < 10:
        return {"error": "Need at least 10 outcomes to train"}

    all_features: set[str] = set()
    for item in outcomes_with_features:
        all_features.update(item.get("features", {}).keys())

    feature_weights: dict[str, float] = {}
    for feature in all_features:
        values = [(item["features"].get(feature, 0), item["success"]) for item in outcomes_with_features]
        if not values:
            continue
        successful = [v for v, s in values if s]
        unsuccessful = [v for v, s in values if not s]
        avg_success = sum(successful) / len(successful) if successful else 0
        avg_fail = sum(unsuccessful) / len(unsuccessful) if unsuccessful else 0
        diff = avg_success - avg_fail
        feature_weights[feature] = round(diff / 10, 3)

    total_w = sum(abs(w) for w in feature_weights.values()) or 1
    feature_weights = {k: round(v / total_w, 3) for k, v in feature_weights.items()}

    correct = 0
    for item in outcomes_with_features:
        score = sum(item["features"].get(f, 0) * w for f, w in feature_weights.items())
        predicted = score > 0
        if predicted == item["success"]:
            correct += 1
    accuracy = round(correct / len(outcomes_with_features), 2)

    return {
        "feature_weights": feature_weights,
        "accuracy_metrics": {"accuracy": accuracy, "sample_size": len(outcomes_with_features)},
        "training_sample_size": len(outcomes_with_features),
    }


def apply_model(features: dict, feature_weights: dict) -> dict:
    """Apply trained model weights to features and return prediction."""
    score = sum(features.get(f, 0) * w for f, w in feature_weights.items())
    probability = 1 / (1 + math.exp(-score * 5))  # sigmoid-like
    probability = round(min(max(probability, 0), 1), 2)

    contributing: list[dict] = []
    risk: list[dict] = []
    for f, w in sorted(feature_weights.items(), key=lambda x: -abs(x[1]))[:5]:
        val = features.get(f, 0)
        if w > 0 and val > 0.5:
            contributing.append({"factor": f.replace("_", " ").title(), "value": val, "impact": "positive"})
        elif w < 0 and val > 0.5:
            risk.append({"factor": f.replace("_", " ").title(), "value": val, "impact": "negative"})

    return {
        "success_probability": probability,
        "confidence": "medium" if len(feature_weights) >= 5 else "low",
        "contributing_factors": contributing[:3],
        "risk_factors": risk[:3],
        "is_heuristic": False,
    }
