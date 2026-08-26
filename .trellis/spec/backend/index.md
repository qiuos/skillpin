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
| [P8 Read-Only Catalog Workbench Contract](./catalog-workbench-api-contract.md) | Session catalog list/detail protected API and content-exposure boundary | P8 contract |
| [P9 Project Change Workflow Contract](./project-change-workflow-api-contract.md) | Protected project snapshot, plan, and transactional apply API boundary | P9 contract |
| [P10 Cross-Platform Acceptance Contract](./p10-cross-platform-acceptance-contract.md) | Three-OS integration acceptance, browser E2E matrix, and native-only evidence | P10 contract |
| [P11 Build and Install Delivery Contract](./p11-build-install-delivery-contract.md) | Single npm distribution, protected bundled static assets, and isolated install verification | P11 contract |

---

## Usage

These files record the P0 baseline plus P1/P2 executable contracts. Update them when a later task establishes a real, repeatable convention; do not treat roadmap directories or future dependencies as existing practice.

---

**Language**: Code-spec documentation is written in **English**. User-facing repository entrypoints may use their audience-specific language; the root `README.md` is Simplified Chinese by default and `README.en.md` is its English counterpart.
