# Gate C — pré-auditoria de rastreabilidade (NÃO é ativação nem PASS)

**Preparação:** 2026-11-03 (UTC). **Estado:** PRE-REVIEW; Gate C permanece [PLANNED](GATE-C.md). **Baseline `main` na abertura:** `ad9a3ddcb9dab02416d1c7525ffbae2d4fc0afee`. **Condição formal de ativação:** M09 aceita, inclusive o exercício isolado de restauração; sem isso, a revisão abaixo é apenas recuperação de evidências existentes. **Proveniência:** contratos GitHub, CI aprovado e evidências humanas reportadas no Lab; nenhum acesso ou alteração da VPS, Production ou Windows/WSL nesta preparação.

## Convenção de classificação

- **EVIDÊNCIA REUTILIZÁVEL:** prova existente e revisada em milestone/gate anterior; não implica automaticamente Gate C PASS.
- **REVISÃO DE SEGURANÇA PRÉ-PRODUCTION:** aceites de Lab/inventário não eliminam exposição ou risco para dados reais.
- **PENDENTE DE FECHAMENTO M09:** requisito cuja execução/documentação ainda depende da P06.
- **NÃO COMPROVADO:** nenhuma evidência apresentada suficiente para esse atributo; nunca marcar PASS por inferência.

## Checklist Gate C — mapeamento item a item

| Categoria | Exigência do [Gate C](GATE-C.md) | Evidência já existente | Estado de pré-auditoria |
| --- | --- | --- | --- |
| CORE | Expense create/query/correct/void | [Gate A](../completed/GATE-A.md), [Gate B](../completed/GATE-B.md) | EVIDÊNCIA REUTILIZÁVEL — local/CI |
| CORE | Income create/query | Gate A, [M08 P06](../completed/M08-P06.md) | EVIDÊNCIA REUTILIZÁVEL |
| CORE | Transfer create/query | Gate A, Gate B | EVIDÊNCIA REUTILIZÁVEL |
| CORE | Correction optimistic locking | Gate B (concorrência, PATCH/version) | EVIDÊNCIA REUTILIZÁVEL |
| CORE | Void idempotente | Gate B (replay/efeitos) | EVIDÊNCIA REUTILIZÁVEL |
| CORE | Refund partial/full/multiple, concurrent | Gate B frozen seven-step scenario and races | EVIDÊNCIA REUTILIZÁVEL |
| INTEGRITY | Precisão money/decimal sem float | Gate B, [M08 P06](../completed/M08-P06.md) usa `bigint`/decimal string | EVIDÊNCIA REUTILIZÁVEL |
| INTEGRITY | Book isolation | Gate B, M08 P06 multi-Book | EVIDÊNCIA REUTILIZÁVEL |
| INTEGRITY | Currency consistency | Gate A/B contratos e integrações | EVIDÊNCIA REUTILIZÁVEL; confirmar referência específica antes de marcar PASS Gate C |
| INTEGRITY | Create/void/refund idempotency | Gate B/replay | EVIDÊNCIA REUTILIZÁVEL |
| INTEGRITY | Audit for financial operations | Gate B + M08 P06 snapshots de Audit | EVIDÊNCIA REUTILIZÁVEL |
| INGESTION | AuthorizedSender before raw persistence | [M06 Lab](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md), Gate B; M05 ingress tests | EVIDÊNCIA REUTILIZÁVEL, checar prova do ordenamento |
| INGESTION | Pre-raw authorization ordering | Contratos M05/M06, provas negativas de ingestão | EVIDÊNCIA REUTILIZÁVEL; localizar teste exato |
| INGESTION | Inbox processed/failed/stale retry | Gate B e integrações M05/M07 | EVIDÊNCIA REUTILIZÁVEL |
| INGESTION | ConfirmationSession lifecycle | M05/M07 testes/contratos e Gate B pipeline | EVIDÊNCIA REUTILIZÁVEL; localizar teste exato de todos os estados |
| INGESTION | WhatsApp commands E2E | M06 Lab cinco comandos reais, [M08 P03](../completed/M08-P03.md) resumo via pipeline | EVIDÊNCIA REUTILIZÁVEL restrita Lab |
| REPORTING | Cinco fórmulas corretas | [M08 P06](../completed/M08-P06.md), suite PostgreSQL e reconciliação CSV/API | EVIDÊNCIA REUTILIZÁVEL |
| REPORTING | WhatsApp Summary | [M08 P03](../completed/M08-P03.md), M08 P06 | EVIDÊNCIA REUTILIZÁVEL |
| REPORTING | CSV injection mitigation | [M08 P04](../completed/M08-P04.md), M08 P06 | EVIDÊNCIA REUTILIZÁVEL |
| SECURITY | Ingest credential não é admin | M06 Lab negativos + [M08 P02](../completed/M08-P02.md), M08 P06; testes de escopo | EVIDÊNCIA REUTILIZÁVEL; revisão final em ambiente alvo |
| SECURITY | finance:admin segregado | M08 P02 e M06 Lab | EVIDÊNCIA REUTILIZÁVEL; revisão final em ambiente alvo |
| SECURITY | PostgreSQL não público | [Gate 0](../active/GATE-0-CLOSURE-REVIEW.md) evidência de portas/rede interna | EVIDÊNCIA REUTILIZÁVEL na data da inspeção |
| SECURITY | Redis não público | Gate 0, portas e redes na data da inspeção | EVIDÊNCIA REUTILIZÁVEL na data da inspeção |
| SECURITY | Secrets não vazam em logs/Git/respostas | [M08 P05](../completed/M08-P05.md), M06 logging patch/negative synthetic, Gate 0 | EVIDÊNCIA REUTILIZÁVEL, revisão de risco pré-Production |
| SECURITY | Privilégios de agentes limitados | Gate 0 registra política `human-only`; não prova revogação técnica genérica | **REVISÃO DE SEGURANÇA PRÉ-PRODUCTION** |
| OPERATIONS | Logs estruturados, IDs | M08 P05/CI | EVIDÊNCIA REUTILIZÁVEL |
| OPERATIONS | Endpoint health | M08 P05/CI, M06 Lab | EVIDÊNCIA REUTILIZÁVEL |
| OPERATIONS | Endpoint readiness | M08 P05/CI e M06 Lab | EVIDÊNCIA REUTILIZÁVEL |
| OPERATIONS | Redação de secrets | M08 P05, M06 patch/log negative | EVIDÊNCIA REUTILIZÁVEL com limites registrados |
| RECOVERY | Daily backup executando | [P06 matriz](../active/M09-P06-FINAL-REVIEW-2026-11-02.md): manual + `systemctl start` PASS; timer diário ativo, primeira execução agendada ainda não observada | **PENDENTE DE FECHAMENTO M09** |
| RECOVERY | Encrypted off-site copy | P06 Restic/rclone/slot-a e slot-b, `restic check --read-data` de download remoto | EVIDÊNCIA REUTILIZÁVEL no Lab |
| RECOVERY | 14/8/12 retention enforced | [M09 P03](../completed/M09-P03.md) testes sintéticos + runner P06 real; ainda não há 12 meses de histórico | EVIDÊNCIA REUTILIZÁVEL da política e fixtures; não histórico longitudinal |
| RECOVERY | Restore runbook | [Restaurar Finance](../../runbooks/finance-hub-restore.md) + [procedimento mensal](../../runbooks/m09-final-operator-sequence.md) | EVIDÊNCIA REUTILIZÁVEL (documentação) |
| RECOVERY | Actual isolated restore validated | [M09 P05 aceite limitado](../completed/M09-P05-EVIDENCE-DISPOSITION-2026-11-02.md), P06 recuperação snapshot remoto em staging | EVIDÊNCIA REUTILIZÁVEL com ressalva de transcritos P05 |
| RECOVERY | Production untouched | Evidência P05 e P06 de não mutação do source Lab e checkout M06 preservado | EVIDÊNCIA REUTILIZÁVEL; nenhum teste Production nesta fase |

## Riscos reais que não devem ser diluídos na V0.1

1. **Segurança antes de dados reais:** [Gate 0](../active/GATE-0-CLOSURE-REVIEW.md) registrou `PermitRootLogin yes`, `PasswordAuthentication yes`, painéis de administração expostos em portas públicas 81/9000/8080, além de política humana `human-only` sem comprovação universal de revogação técnica. A decisão anterior de postergar hardening foi aceite de **inspeção/risco existente**, **não certificação de exposição segura para Production**. Uma revisão pontual de risco precisa concluir se isso configura impedimento para `REAL DATA READY`; não reexecutar todo o inventário da VPS.
2. **Backups e responsabilidade de alerta:** o script `status` detecta falhas e >24h e o journal registra alertas; o proprietário escolheu entrega de e-mail/Telegram apenas **pós-V0.1** [#95](https://github.com/oleoceo/finance-intelligence-hub/issues/95). Risco de não receber notificação automaticamente em caso de falha, **não PASS de entrega**.
3. **Desastre total da VPS:** backup externo foi recuperado para staging da própria VPS e P05 restaurou SQL em ambiente isolado na VPS. Recuperação fora da VPS após perda completa **NÃO TESTADA** por decisão expressa do proprietário, sem exigir teste ou instalação no Windows/WSL. O procedimento off-host futuro deve ser considerado separadamente do aceite de Lab.
4. **SLA não medido:** metas RPO <=24h e RTO mesmo dia estão previstas; medições pontuais e testes isolados não provam RTO de perda integral. Não atribuir valores inventados.
5. **P05:** aceite humano limitado a Finance Lab, com falta de transcritos Restic/rclone/pg_restore históricos; evidências presentes não podem ser retroativamente apresentadas como assinatura independente plena.

## Condição exata de avanço

**Agora:** revisar mapeamento Gate C com material aprovado; não executar suíte duplicada, não modificar VPS/Windows. **Antes de Gate C PASS:** concluir e aceitar M09, adjudicar riscos de segurança pré-Production e demais hard FAIL do [Gate C](GATE-C.md), conferir CI no SHA final e registrar aceite explícito do proprietário. Não converter o pré-check em decisão PASS automática. `v0.1.0` tag/release requer autorização adicional específica. A primeira evidência futura do timer diário pode ser acrescentada depois sem bloquear revisão documental.
