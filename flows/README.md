# Flows Source of Truth

This folder stores WhatsApp flow definitions and validation evidence.

## Gate Policy

We process one flow at a time.

A flow is marked PASS only when all checks are green:
1. Build check: `pnpm build`
2. Endpoint smoke for that flow
3. Manual WhatsApp run with expected screen transitions

Do not start the next flow until current flow report is PASS.

## Sequence

1. authFlow (in progress)
2. addProductFlow
3. productsFlow
4. updateProductFlow
5. ordersFlow
6. optimizedProductFlow
7. menuFlow

## Required Files Per Flow

- `<flow>.flow.json` : routing model and screen contracts
- `<flow>.checklist.md` : validation checklist
- `<flow>.test-report.md` : gate evidence and verdict
