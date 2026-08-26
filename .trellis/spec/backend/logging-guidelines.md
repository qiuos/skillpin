# Logging Guidelines

## Current State

P0 has no structured logging facility. The temporary CLI version banner is normal command output, not diagnostic logging.

## Guardrail

Future logging must not emit session secrets, user-home paths, skill source contents, or complete error objects without sanitization. Add a structured logger only when a feature needs diagnostics and define its redaction contract first.
