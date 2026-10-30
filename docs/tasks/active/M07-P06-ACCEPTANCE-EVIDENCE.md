# M07-P06 acceptance evidence

Status: **M07-P06 TECHNICALLY ACCEPTED / REVIEW PASS / MERGED**. Gate B, Gate 0 formal PASS, Gate C and Production acceptance remain pending.

The focused real PostgreSQL HTTP test is `tests/integration/api/m07-acceptance.test.ts`. It executes the frozen 500.00 Expense, 200.00 Refund, valid 450.00 correction, rejected 100.00 correction, blocked Expense Void, Refund Void, then Expense Void. It checks persisted amounts, statuses, versions, links and distinct audit histories. It also checks administrative authentication and strict path/query validation for both GETs, idempotent Refund/Void replay, multiple Refunds, and no state change after reads. Existing P01–P05 and P04 PostgreSQL tests remain in the suite.

Local evidence on 2026-10-30: native WSL frozen install, lint, build and typecheck PASS; 42 unit files / 1,060 tests PASS; 31 real PostgreSQL files / 518 tests PASS, including 2 focused P06 tests and 27 P04 concurrency tests. M06 native transport: 124 PASS. M06 simulated five-command acceptance: 25 PASS. An initial PostgreSQL run passed 517/518 with one timing-sensitive M03 Category/Book lock observation; its isolated rerun passed 36/36 and the complete rerun passed 518/518. The Windows-mounted WSL workspace reports 49 untouched files in global `format:check`; changed files pass a focused Prettier check. CI will verify a clean Linux checkout.

Final independent acceptance: PR #54 final head `0a07afbbaaa57c2edd94a1314f6552ca4523d24c`, independent REVIEW PASS #5715504972, exact CI #41090178258 SUCCESS (1,060 unit; 518 PostgreSQL incl 2 P06; 124 M06 native; 25 simulated; 2 synthetic leak), squash `66b95474ed5d1b1182bb220efe6ed3ec9aafe48e`, feature postmerge CI #41091824152 (SUCCESS required before documentary closure merge).

The technical milestone is completed locally/in CI, not homologated in Production; no live operations were executed.
