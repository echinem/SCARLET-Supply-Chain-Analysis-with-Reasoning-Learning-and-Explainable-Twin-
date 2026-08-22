import os
import random
import logging
import pandas as pd
import numpy as np
import xgboost as xgb
import shap
import joblib

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "routing_model.pkl")
FEATURES = [
    "distance", "duration", "congestion", "demand", 
    "from_degree", "to_degree", "from_centrality", "to_centrality"
]

_model = None
_explainer = None

def generate_synthetic_data(num_rows=5000):
    """
    Generate synthetic data for Monte Carlo simulation of route delays.
    Features: distance, duration, congestion, demand, graph metrics.
    """
    logger.info(f"Generating {num_rows} rows of synthetic routing data...")
    np.random.seed(42)
    
    # Distance in meters (1km to 1500km)
    distances = np.random.uniform(1000, 1500000, num_rows)
    # Duration in seconds roughly based on 60km/h average (60000m / 3600s = 16.6 m/s)
    durations = distances / np.random.uniform(10, 25, num_rows)
    
    # Simulated metrics (0 to 1)
    congestions = np.random.beta(2, 5, num_rows)
    demands = np.random.beta(2, 2, num_rows)
    
    # Graph metrics
    from_degrees = np.random.randint(1, 10, num_rows)
    to_degrees = np.random.randint(1, 10, num_rows)
    from_centralities = np.random.uniform(0.01, 0.5, num_rows)
    to_centralities = np.random.uniform(0.01, 0.5, num_rows)
    
    # Delay formula heuristic:
    # 0 baseline delay, increases heavily with congestion and demand, combined with distance.
    base_delays = (durations * 0.1) # 10% base fluctuation
    congestion_impact = (congestions ** 1.5) * 3600 * 2 # up to 2 hours of delay
    demand_impact = (demands ** 1.2) * 1800 # up to 30 mins
    hub_impact = (to_degrees * 60) + (from_centralities * 1200) # busy hubs add delay
    
    delays = base_delays + congestion_impact + demand_impact + hub_impact
    # Adding noise
    delays += np.random.normal(0, 300, num_rows)
    delays = np.maximum(0, delays) # No negative delays
    
    df = pd.DataFrame({
        "distance": distances,
        "duration": durations,
        "congestion": congestions,
        "demand": demands,
        "from_degree": from_degrees,
        "to_degree": to_degrees,
        "from_centrality": from_centralities,
        "to_centrality": to_centralities,
        "delay": delays
    })
    return df

def train_routing_model():
    """
    Trains the XGBoost regressor using synthetic data and saves it.
    """
    df = generate_synthetic_data()
    X = df[FEATURES]
    y = df["delay"]
    
    logger.info("Training XGBoost routing model...")
    model = xgb.XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42)
    model.fit(X, y)
    
    logger.info(f"Saving model to {MODEL_PATH}")
    joblib.dump(model, MODEL_PATH)
    return model

def load_model():
    global _model, _explainer
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            logger.info("Model not found. Initializing training sequence.")
            _model = train_routing_model()
        else:
            _model = joblib.load(MODEL_PATH)
        
        # Initialize SHAP explainer
        _explainer = shap.TreeExplainer(_model)
    return _model, _explainer

def predict_delay(features_dict: dict):
    """
    Predicts delay and provides SHAP explanation.
    """
    model, explainer = load_model()
    
    # Ensure ordered features
    df = pd.DataFrame([features_dict], columns=FEATURES)
    
    prediction = float(model.predict(df)[0])
    
    # Compute SHAP values
    shap_values = explainer.shap_values(df)
    
    # Extract top 2 contributing features
    # shap_values[0] since we passed 1 row
    feature_impacts = [{"feature": f, "impact": float(imp)} for f, imp in zip(FEATURES, shap_values[0])]
    feature_impacts.sort(key=lambda x: abs(x["impact"]), reverse=True)
    top_explanations = feature_impacts[:2]
    
    # Determine risk level
    # Arbitrary threshold: delay > 1800s (30m) is high risk
    risk_level = "HIGH" if prediction > 1800 else "LOW"
    
    return {
        "predicted_delay": prediction,
        "risk_level": risk_level,
        "explanation": top_explanations
    }
