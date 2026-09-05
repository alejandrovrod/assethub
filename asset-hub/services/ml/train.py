"""
Training pipeline for Asset Failure Risk using XGBoost.
Combines historical data from SQL Server with domain baseline profiles
to ensure correct physical grounding even with small/cold-start asset counts.
"""

import os
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

DB_SERVER = os.getenv("DB_SERVER", "db32354.public.databaseasp.net")
DB_NAME = os.getenv("DB_NAME", "db32354")
DB_USER = os.getenv("DB_USER", "db32354")
DB_PASSWORD = os.getenv("DB_PASSWORD", "9y-P!Bt8e6R@")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING", "")

def get_db_engine():
    if DB_CONNECTION_STRING:
        return create_engine(DB_CONNECTION_STRING)
    connection_url = URL.create(
        "mssql+pyodbc",
        username=DB_USER,
        password=DB_PASSWORD,
        host=DB_SERVER,
        port=1433,
        database=DB_NAME,
        query={
            "driver": "ODBC Driver 18 for SQL Server",
            "TrustServerCertificate": "yes",
            "Encrypt": "yes"
        }
    )
    return create_engine(connection_url)

MODEL_DIR = os.getenv("MODEL_DIR", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "xgboost_asset_health.json")

FEATURE_COLUMNS = [
    "CurrentConditionIndex",
    "AssetAgeDays",
    "AvgConditionLast30Days",
    "AvgConditionLast90Days",
    "TotalIncidentsCount",
    "IncidentsLast30Days",
    "IncidentsLast90Days",
    "TotalMaintenanceOrdersCount",
    "CompletedMaintenanceOrdersCount",
    "DaysSinceLastCompletedMaintenance",
    "PendingWorkTasksCount"
]

def generate_domain_baseline_dataset(n_samples=600):
    """
    Generates physically grounded lifecycle profiles to avoid cold-start degenerate splits.
    """
    np.random.seed(42)
    n_healthy = n_samples // 2
    healthy_data = {
        "CurrentConditionIndex": np.random.uniform(85, 100, n_healthy),
        "AssetAgeDays": np.random.uniform(0, 180, n_healthy),
        "AvgConditionLast30Days": np.random.uniform(85, 100, n_healthy),
        "AvgConditionLast90Days": np.random.uniform(80, 100, n_healthy),
        "TotalIncidentsCount": np.random.poisson(0.1, n_healthy),
        "IncidentsLast30Days": np.zeros(n_healthy),
        "IncidentsLast90Days": np.zeros(n_healthy),
        "TotalMaintenanceOrdersCount": np.random.poisson(0.5, n_healthy),
        "CompletedMaintenanceOrdersCount": np.random.poisson(0.5, n_healthy),
        "DaysSinceLastCompletedMaintenance": np.random.uniform(0, 60, n_healthy),
        "PendingWorkTasksCount": np.zeros(n_healthy)
    }
    y_healthy = np.zeros(n_healthy, dtype=int)

    n_failing = n_samples - n_healthy
    failing_data = {
        "CurrentConditionIndex": np.random.uniform(10, 55, n_failing),
        "AssetAgeDays": np.random.uniform(180, 1200, n_failing),
        "AvgConditionLast30Days": np.random.uniform(15, 60, n_failing),
        "AvgConditionLast90Days": np.random.uniform(20, 65, n_failing),
        "TotalIncidentsCount": np.random.randint(2, 8, n_failing),
        "IncidentsLast30Days": np.random.randint(1, 4, n_failing),
        "IncidentsLast90Days": np.random.randint(2, 6, n_failing),
        "TotalMaintenanceOrdersCount": np.random.randint(1, 6, n_failing),
        "CompletedMaintenanceOrdersCount": np.random.randint(0, 2, n_failing),
        "DaysSinceLastCompletedMaintenance": np.random.uniform(180, 500, n_failing),
        "PendingWorkTasksCount": np.random.randint(1, 5, n_failing)
    }
    y_failing = np.ones(n_failing, dtype=int)

    X_base = pd.concat([pd.DataFrame(healthy_data), pd.DataFrame(failing_data)], ignore_index=True)
    y_base = np.concatenate([y_healthy, y_failing])
    return X_base, y_base

def load_data(engine):
    query = """
    SELECT 
        AssetId,
        CurrentConditionIndex,
        AssetAgeDays,
        AvgConditionLast30Days,
        AvgConditionLast90Days,
        TotalIncidentsCount,
        IncidentsLast30Days,
        IncidentsLast90Days,
        TotalMaintenanceOrdersCount,
        CompletedMaintenanceOrdersCount,
        DaysSinceLastCompletedMaintenance,
        PendingWorkTasksCount
    FROM tenant.v_AssetMLFeatures
    """
    df = pd.read_sql(query, con=engine)
    return df

def train_model():
    os.makedirs(MODEL_DIR, exist_ok=True)
    engine = get_db_engine()
    print("Loading feature data from SQL Server...")
    
    X_train, y_train = generate_domain_baseline_dataset(600)

    try:
        df = load_data(engine)
        if len(df) > 0:
            print(f"Enriching training set with {len(df)} active assets from SQL Server...")
            X_real = df[FEATURE_COLUMNS].copy()
            y_real = ((X_real["CurrentConditionIndex"] < 50) | (X_real["IncidentsLast30Days"] >= 2)).astype(int).values
            X_train = pd.concat([X_train, X_real], ignore_index=True)
            y_train = np.concatenate([y_train, y_real])
    except Exception as ex:
        print(f"Warning querying database during training: {ex}")

    model = xgb.XGBClassifier(
        n_estimators=80,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=42
    )

    print("Fitting XGBoost Classifier...")
    model.fit(X_train, y_train)

    model.save_model(MODEL_PATH)
    print(f"Model successfully saved to {MODEL_PATH}")

if __name__ == "__main__":
    train_model()
