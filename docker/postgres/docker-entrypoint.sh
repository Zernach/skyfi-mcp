#!/bin/bash
set -e

# Function to ensure database and user exist
ensure_db_and_user() {
  # Get environment variables
  POSTGRES_USER="${POSTGRES_USER:-skyfi_user}"
  POSTGRES_DB="${POSTGRES_DB:-skyfi_mcp}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
  
  # When POSTGRES_USER is set, that user becomes the superuser
  # So we use that user for admin operations
  ADMIN_USER="${POSTGRES_USER}"
  
  # Wait for PostgreSQL to be ready using the admin user
  # Use template1 database for readiness check (always exists in PostgreSQL)
  until pg_isready -U "$ADMIN_USER" -d template1 > /dev/null 2>&1; do
    sleep 1
  done

  # Small additional wait to ensure postgres is fully ready
  sleep 2

  echo "Ensuring database '$POSTGRES_DB' and user '$POSTGRES_USER' exist..."

  # User already exists (created by PostgreSQL entrypoint when POSTGRES_USER is set)
  # We just need to ensure the database exists
  # Use template1 database for connection (always exists)
  psql -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d template1 <<-EOSQL
      SELECT 'CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB')\gexec
EOSQL

  # Grant privileges (though user is already owner)
  # First check if database exists before trying to connect to it
  DB_EXISTS=$(psql -U "$ADMIN_USER" -d template1 -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'")
  if [ "$DB_EXISTS" = "1" ]; then
    psql -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d "$POSTGRES_DB" <<-EOSQL
        GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
        GRANT ALL PRIVILEGES ON SCHEMA public TO $POSTGRES_USER;
EOSQL
  fi

  echo "Database and user setup complete!"
}

# Start the database/user setup in the background
ensure_db_and_user &

# Run the default PostgreSQL entrypoint (this is the main process)
exec /usr/local/bin/docker-entrypoint.sh "$@"
