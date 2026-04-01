# PostgreSQL Database System for University Study App

This system provides a robust, relational, and scalable storage solution for your university study application.

## Features
- **Relational Structure**: 13 core tables covering users, subjects, study sessions, notes, flashcards, quizzes, files, productivity, goals, achievements, AI interactions, and audit logs.
- **Performance**: Optimized with indices on frequently queried columns (emails, user IDs, dates).
- **Security**: 
  - **Audit Logs**: Tracks all major actions (LOGIN, DELETE, UPDATE) with old/new data snapshots.
  - **Row Level Security (RLS)**: Prepared for fine-grained access control.
  - **Encryption**: Uses `pgcrypto` for sensitive data handling.
- **Reliability**: Triggers for automatic `updated_at` management and structured for PITR (Point-In-Time Recovery).

## Files Created
- `/database/schema.sql`: The complete SQL script to initialize the database.
- `/src/lib/db.ts`: Backend utility for PostgreSQL connection pooling.
- `/server.ts`: Updated with a `/api/db-health` endpoint to verify connectivity.

## How to Use
1. **Configure Connection**: Add your PostgreSQL connection string to the `DATABASE_URL` variable in your environment (see `.env.example`).
2. **Initialize Schema**: Run the content of `/database/schema.sql` in your PostgreSQL instance.
3. **Verify**: Access the `/api/db-health` endpoint to ensure the backend can communicate with the database.

## Scalability & Backup
- **Scalability**: The use of UUIDs as primary keys prevents collisions and facilitates horizontal scaling.
- **Backup**: Recommended to use `pg_dump` for daily logical backups and `WAL-G` for continuous archiving.
