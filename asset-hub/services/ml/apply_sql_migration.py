import os
import pyodbc

DB_SERVER = os.getenv("DB_SERVER", "db32354.public.databaseasp.net")
DB_NAME = os.getenv("DB_NAME", "db32354")
DB_USER = os.getenv("DB_USER", "db32354")
DB_PASSWORD = os.getenv("DB_PASSWORD", "9y-P!Bt8e6R@")

conn_str = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={DB_SERVER},1433;"
    f"DATABASE={DB_NAME};"
    f"UID={DB_USER};"
    f"PWD={DB_PASSWORD};"
    f"Encrypt=yes;"
    f"TrustServerCertificate=yes;"
)

print(f"Connecting to SQL Server {DB_SERVER}...")
conn = pyodbc.connect(conn_str, autocommit=True)
cursor = conn.cursor()

sql_file_path = "/app/migration_predictive_maintenance.sql"
if not os.path.exists(sql_file_path):
    sql_file_path = "../../src/backend/migration_predictive_maintenance.sql"

print(f"Reading SQL script from {sql_file_path}...")
with open(sql_file_path, "r", encoding="utf-8") as f:
    sql_content = f.read()

# Split batches by GO
batches = [b.strip() for b in sql_content.split("GO") if b.strip()]

for i, batch in enumerate(batches, 1):
    # Strip any standalone BEGIN TRANSACTION / COMMIT if present in batches
    clean_batch = batch.replace("BEGIN TRANSACTION;", "").replace("COMMIT;", "").strip()
    if not clean_batch:
        continue
    print(f"Executing batch {i}/{len(batches)}...")
    try:
        cursor.execute(clean_batch)
        print(f"Batch {i} executed successfully.")
    except Exception as e:
        print(f"Error in batch {i}: {e}")

cursor.close()
conn.close()
print("Migration completed!")
