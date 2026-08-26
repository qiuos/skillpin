# Frontend Hook Guidelines

## Current State

P0 has no custom hooks, server state, or client-side persistence.

## Future Convention

When a hook is introduced, name it `useX`, keep it feature-local until a second consumer exists, and obey `react-hooks/rules-of-hooks`. Do not create a hook merely to wrap a one-line local calculation.
