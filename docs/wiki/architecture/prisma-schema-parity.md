# Prisma Schema Parity

SQLite is the default local database and PostgreSQL is supported for service deployments. Equivalent model and migration contracts must remain aligned.

Run schema parity checks when changing fields, enums, indexes, or migrations. Database reset and destructive cleanup require an explicit approval, a verified backup, and a restore check.
