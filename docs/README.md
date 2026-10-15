# ERP Gulzar — stage-wise development

Read these two source documents first. They live in `D:\ERP_Gulzar\document`.

| Document | What it decides |
| --- | --- |
| ERP System Project Planning Blueprint | Modules, business flow, accounting rules, original phases |
| ERP Single Client Database Models and Relationships | Exact models, fields, relationships, indexes, implementation rules |

When the two documents disagree, follow the database document.

## Decisions that apply to every stage

- One business only. Do not create a `Company` model. Do not add `companyId` to schemas, APIs, queries, or indexes.
- `Branch` is the top location. `Warehouse` and `Shop` belong to a branch.
- Stock changes only through `InventoryService`.
- Debit and credit postings only through `AccountingService`.
- Posted documents are not edited in place. Use reversal or adjustment.
- Master records that history depends on are inactivated, not hard-deleted.
- Money and quantities use `Decimal128`, never JavaScript `number` for stored amounts.

## How to build

Build one stage and finish its checklist before starting the next stage. Each stage file lists models, endpoints, validation, cache, indexes, and the files to create.

Shared engineering rules (Scalar, compression, cache, reusable functions, validation) are in `00-standards.md`. Do not re-decide those inside a module.

| Order | File | You can start when |
| --- | --- | --- |
| 0 | `stages/00-foundation.md` | Now |
| 1 | `stages/01-auth-and-access.md` | Stage 0 is running |
| 2 | `stages/02-organization.md` | Login and permissions work |
| 3 | `stages/03-product-masters.md` | Branch and currency exist |
| 4 | `stages/04-parties.md` | Product masters exist |
| 5 | `stages/05-accounting-masters.md` | Parties exist (customer/supplier accounts) |
| 6 | `stages/06-inventory-engine.md` | Products, warehouses, and accounts exist |
| 7 | `stages/07-purchase.md` | InventoryService and AccountingService exist |
| 8 | `stages/08-sales.md` | Purchase posting pattern is proven |
| 9 | `stages/09-payments-and-vouchers.md` | Sales and purchases post ledger entries |
| 10 | `stages/10-expense-and-logistics.md` | Payments and receipts post correctly |
| 11 | `stages/11-reports.md` | Operational data is posting |
| 12 | `stages/12-audit-and-hardening.md` | Reports read real ledger and stock history |

Stages 4 and 3 can swap if you prefer parties before products. Do not swap anything after stage 5: purchase and sales depend on both engines.
