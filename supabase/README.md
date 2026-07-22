# Database migrations

The SQL files in `migrations/` are the source of truth for the WriteOffs
database schema. Apply them in filename order through the Supabase migration
workflow.

The baseline migration is additive. It represents the schema the application
used before migrations were introduced and can be applied to the existing
project without dropping tables or data. Later migrations introduce the new
business-owned, provider-neutral financial model separately.

Do not edit a migration after it has been applied to a shared environment.
Create a new migration for every subsequent schema change.
