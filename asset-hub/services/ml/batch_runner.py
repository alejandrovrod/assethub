"""
Nightly/Daily Batch Runner for AssetHub Predictive Maintenance.
Extracts features from SQL Server, infers risk using XGBoost, and syncs to AssetHub API.
"""

import os
import time
import logging
import httpx
import pandas as pd
import numpy as np
import xgboost as xgb
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from apscheduler.schedulers.blocking import BlockingScheduler
from explain import extract_top_contributions

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000")
API_TOKEN = os.getenv("API_TOKEN", "")
DB_SERVER = os.getenv("DB_SERVER", "db32354.public.databaseasp.net")
DB_NAME = os.getenv("DB_NAME", "db32354")
DB_USER = os.getenv("DB_USER", "db32354")
DB_PASSWORD = os.getenv("DB_PASSWORD", "9y-P!Bt8e6R@")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING", "")
MODEL_PATH = os.getenv("MODEL_PATH", "models/xgboost_asset_health.json")
RUN_ONCE = os.getenv("RUN_ONCE", "false").lower() in ("true", "1", "yes")
BATCH_CRON_HOUR = int(os.getenv("BATCH_CRON_HOUR", "8"))
BATCH_CRON_MINUTE = int(os.getenv("BATCH_CRON_MINUTE", "27"))

# Training schedule (quincenal: día 1 y 15 de cada mes a las 3:00 UTC)
TRAIN_CRON_DAYS = os.getenv("TRAIN_CRON_DAYS", "1,15")
TRAIN_CRON_HOUR = int(os.getenv("TRAIN_CRON_HOUR", "3"))
TRAIN_CRON_MINUTE = int(os.getenv("TRAIN_CRON_MINUTE", "0"))

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

def determine_risk_level(prob: float) -> str:
    if prob >= 0.75:
        return "Critical"
    elif prob >= 0.50:
        return "High"
    elif prob >= 0.25:
        return "Moderate"
    return "Low"

def estimate_days_to_failure(prob: float, condition: float) -> int:
    if prob < 0.25:
        return 365
    elif prob < 0.50:
        return max(30, int(180 * (1.0 - prob)))
    elif prob < 0.75:
        return max(7, int(60 * (1.0 - prob)))
    else:
        return max(1, int(15 * (1.0 - prob)))

def run_batch_inference():
    logging.info("Starting AssetHub predictive maintenance batch job...")

    if not os.path.exists(MODEL_PATH):
        logging.warning(f"Model file {MODEL_PATH} not found. Running training step first...")
        from train import train_model
        train_model()

    model = xgb.XGBClassifier()
    model.load_model(MODEL_PATH)
    logging.info("XGBoost model loaded successfully.")

    try:
        engine = get_db_engine()
        query = """
        SELECT 
            AssetId,
            TenantId,
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
    except Exception as ex:
        logging.error(f"Failed to query SQL Server: {ex}")
        return

    if df.empty:
        logging.info("No assets found for inference.")
        return

    logging.info(f"Processing inference for {len(df)} assets...")
    X = df[FEATURE_COLUMNS].copy()
    probabilities = model.predict_proba(X)[:, 1]

    batch_payload = []
    for idx, row in df.iterrows():
        prob = float(probabilities[idx])
        risk_level = determine_risk_level(prob)
        days_to_fail = estimate_days_to_failure(prob, float(row["CurrentConditionIndex"]))
        explanation_json = extract_top_contributions(row.to_dict())

        batch_payload.append({
            "assetId": str(row["AssetId"]),
            "riskProbability": round(prob, 4),
            "riskLevel": risk_level,
            "predictedFailureDays": days_to_fail,
            "topFeatureContributionsJson": explanation_json
        })

    # Post batch to AssetHub API or fallback to direct SQL persistence
    headers = {"Content-Type": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"

    endpoint = f"{API_BASE_URL.rstrip('/')}/api/v1/assets/predictions/batch"
    logging.info(f"Posting {len(batch_payload)} predictions to {endpoint}...")

    synced = False
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(endpoint, json={"predictions": batch_payload}, headers=headers)
            if resp.status_code in (200, 201):
                logging.info(f"Batch successfully synchronized with API: {resp.text}")
                synced = True
            else:
                logging.warning(f"API returned status {resp.status_code}. Using database fallback.")
    except Exception as ex:
        logging.warning(f"Could not reach AssetHub API ({ex}). Using direct database fallback.")

    if not synced:
        import uuid
        from sqlalchemy import text
        logging.info("Writing predictions directly to SQL Server tenant.AssetHealthPredictions...")
        try:
            with engine.begin() as conn:
                for item in batch_payload:
                    t_rows = df[df["AssetId"].astype(str) == item["assetId"]]
                    tenant_id = str(t_rows["TenantId"].iloc[0]) if not t_rows.empty else str(uuid.uuid4())
                    
                    insert_sql = """
                    INSERT INTO [tenant].[AssetHealthPredictions] 
                    ([Id], [TenantId], [AssetId], [RiskProbability], [RiskLevel], [PredictedFailureDays], [TopFeatureContributionsJson], [CreatedAt])
                    VALUES (:id, :tenant_id, :asset_id, :prob, :level, :days, :features, GETUTCDATE())
                    """
                    conn.execute(text(insert_sql), {
                        "id": uuid.uuid4(),
                        "tenant_id": uuid.UUID(tenant_id),
                        "asset_id": uuid.UUID(item["assetId"]),
                        "prob": item["riskProbability"],
                        "level": item["riskLevel"],
                        "days": item["predictedFailureDays"],
                        "features": item["topFeatureContributionsJson"]
                    })
            logging.info(f"Successfully inserted {len(batch_payload)} predictions into SQL Server tenant.AssetHealthPredictions!")
        except Exception as db_ex:
            logging.error(f"Error persisting to SQL Server: {db_ex}")

def main():
    if RUN_ONCE:
        run_batch_inference()
        return

    scheduler = BlockingScheduler()
    # Schedule nightly batch
    scheduler.add_job(run_batch_inference, "cron", hour=BATCH_CRON_HOUR, minute=BATCH_CRON_MINUTE)
    logging.info(f"AssetHub ML Scheduler started. Scheduled daily at {BATCH_CRON_HOUR:02d}:{BATCH_CRON_MINUTE:02d} UTC.")

    # Schedule model training (quincenal: día 1 y 15 a las 3:00 UTC)
    train_days = [d.strip() for d in TRAIN_CRON_DAYS.split(",")]
    scheduler.add_job(
        lambda: train_model_wrapper(),
        "cron",
        day=",".join(train_days),
        hour=TRAIN_CRON_HOUR,
        minute=TRAIN_CRON_MINUTE
    )
    logging.info(f"Model training scheduled on days {TRAIN_CRON_DAYS} at {TRAIN_CRON_HOUR:02d}:{TRAIN_CRON_MINUTE:02d} UTC.")

    # Run immediate initial pass on startup
    run_batch_inference()

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logging.info("Scheduler stopped.")

def train_model_wrapper():
    """Wrapper para entrenar el modelo con logging."""
    logging.info("Starting scheduled model training...")
    try:
        from train import train_model
        train_model()
        logging.info("Model training completed successfully.")
    except Exception as ex:
        logging.error(f"Model training failed: {ex}")

if __name__ == "__main__":
    main()