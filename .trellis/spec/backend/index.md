# Backend Development Guidelines

> Current repository conventions for core runtime and CLI-adjacent development.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Baseline documented |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations | Baseline documented |
| [Error Handling](./error-handling.md) | Error types, handling strategies | Baseline documented |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Baseline documented |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | Baseline documented |
| [Platform Link and Transaction Contract](./platform-link-contract.md) | Safe Node directory-link and transaction APIs | P1 contract |
| [P2 JSON Persistence Contract](./persistence-contract.md) | Versioned JSON schemas, repositories, and atomic replacement | P2 contract |
| [P3 Source Configuration and Catalog Contract](./source-catalog-contract.md) | Node-only sources, scanning, parsing, grouping, and search | P3 contract |
| [P4 Project Change Transaction Contract](./project-change-transaction-contract.md) | Project inspection, change planning, locks, transactions, and residue diagnostics | P4 contract |
| [P5 Local Session, HTTP, and WebSocket Contract](./local-session-api-contract.md) | CLI arguments, loopback local service, credentials, WebSocket lifecycle, and graceful shutdown | P5 contract |
| [P7 Protected Source Management Contract](./source-management-api-contract.md) | Session-owned source CRUD, scanning, directory metadata browsing, and guarded removal API | P7 contract |

---

## Usage

These files record the P0 baseline plus P1/P2 executable contracts. Update them when a later task establishes a real, repeatable convention; do not treat roadmap directories or future dependencies as existing practice.

---

**Language**: All documentation is written in **English**.
