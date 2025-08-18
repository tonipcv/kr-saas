#!/bin/bash

# Database connection parameters
DB_HOST="dpbdp1.easypanel.host"
DB_PORT="140"
DB_NAME="servidor"
DB_USER="postgres"
DB_PASSWORD="4582851d42f33edc95b0"

echo "Executing SQL schema on database..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f prisma/schema.sql

echo "SQL execution completed!"
