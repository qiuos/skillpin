# Database Guidelines

## Current State

P0 deliberately has no database or persistence dependency. Do not add a database, ORM, migration tool, or remote service for baseline work.

## Future Trigger

The approved product direction is JSON files with atomic writes for local state. Introduce concrete persistence guidance only with the project-state/transaction implementation, including migration and recovery tests.
