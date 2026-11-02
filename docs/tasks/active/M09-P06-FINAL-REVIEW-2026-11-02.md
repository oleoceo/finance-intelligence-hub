# M09-P06 — matriz de revisão final e pré-check do Gate C

**Data:** 2026-11-02 (UTC). **Escopo:** Finance Lab na VPS. **Estado:** REVIEW PREPARATION — **não** é aceite P06, M09 DONE, Gate C PASS ou autorização de Production. **Base de código operacional revisada:** `bca0ab6678331ac434a965e545e43444fe241fa3`; documentação atualizada no PR #96, squash `ca32d333e5468d652ec659fd9274500803add8b4`, CI do PR #96 `41535762537` SUCCESS. Fonte dos resultados de host: saída reportada pelo operador humano e [Issue #93](https://github.com/oleoceo/finance-intelligence-hub/issues/93). Nenhum transcript nem SHA ausente deve ser inventado.

## A. Evidência P06 já comprovada — não repetir

| Requisito | Veredito limitado / referência |
| --- | --- |
| `daily` application-only real `finance_hub_lab` | **PASS**, manual e via `systemctl start finance-hub-lab-backup.service` em 2026-11-02 21:36:45Z. Serviço executou snapshot, retenção, cópia e verificação remota antes do marcador de sucesso. Não é execução iniciada pelo timer diário. |
| Artefato e restauração | **PASS**, dump PostgreSQL custom `PGDMP`, 120030 bytes, manifesto SHA-256 e `pg_restore --list`. P05 comprovou restauração SQL em PostgreSQL isolado com ressalva documental já aceita; **não repetir P05**. |
| Restic/Google Drive off-site | **PASS**, dois slots exclusivos legíveis, verificados pelo ownership marker; upload com rclone concluído e backup criptografado. |
| Recuperação de offsite em staging isolado da VPS | **PASS**, 2026-11-02 21:44:08Z: download do slot ativo do Google Drive, `restic check --read-data`, extração, manifesto/PGDMP/catálogo. **Não é recuperação após perda total da VPS.** |
| `weekly-check` e `status` como serviços systemd | **PASS**, `weekly-check` 21:08:40Z com `INTEGRITY_CHECK_COMPLETE`; status e marcador de última cópia verificada corretos. |
| Timers e primeira execução automática de status | **PASS**, três timers ativos; status timer disparou às 22:00:19Z e encontrou `last_success=2026-11-02T21:36:42Z`. |
| Concorrência e integridade local | **PASS**, `flock` recusa segundo processo, lock liberado, marcadores inalterados; baseline de backups históricos preservada. |
| Detecção de eventos | **PASS em fixture**, `FRESH`, `STALE >24h`, `FAILURE`, `MISSING`; não foram provocadas falhas destrutivas no ambiente ativo. |
| Política Restic e retenção local | **PASS — implementação/CI e política operacional**, `14 daily / 8 weekly / 12 monthly` e limite dos dumps locais próprios, preservando legados. Apenas dois snapshots reais em 2026-11-02; **retenção ao longo de 12 meses não é observável agora**, sem motivo para manter V0.1 parada por um ano. |
| Custódia externa de segredos | Senha Restic P06 previamente copiada ao Windows e comparada por hash; configuração rclone copiada para Windows conforme operador. Custódia **reportada**, não teste off-host de desastre. |

## B. Exceções explícitas e limites — sem falso PASS

1. **Entrega externa de alertas:** o proprietário escolheu adiar e-mail/Telegram até depois da V0.1. [Issue #95](https://github.com/oleoceo/finance-intelligence-hub/issues/95). Monitoramento local `status`/journal existe; ninguém deve declarar `external alert delivered PASS`. Risco: falha pode não chegar proativamente ao operador.
2. **Recuperação em outra máquina:** o proprietário não autoriza instalar ferramentas ou testar recuperação no Windows/WSL; a operação é VPS-only. Cópias de credenciais foram mantidas fora da VPS, e restaurações isoladas já ocorreram na VPS. **Full VPS loss / off-host recovery NOT TESTED**. Não afirmar RTO de perda integral nem exigir repetição de comandos locais. Risco residual distinto de integridade do backup.
3. **Retenção histórica:** implementação e testes sintéticos de `14/8/12` do [M09-P03](../completed/M09-P03.md) PASS; a operação começou há menos de um ciclo de retenção, de forma que não há 12 meses de evidência operacional real.
4. **RPO/RTO:** alvo de RPO <=24h, RTO mesmo dia, definidos nos contratos; não afirmá-los como SLA medido de desastre. Última confirmação verificável do offsite em 2026-11-02 21:36:42Z, observada pelo timer de status às 22:00:19Z. A duração de restauração integral desde desastre e retorno ao serviço não foi medida.
5. **P05:** aceite limitado ao Lab com exceção expressa da falta de transcripts históricos e assinatura independente integral; [decisão](../completed/M09-P05-EVIDENCE-DISPOSITION-2026-11-02.md). Não ampliar esse aceite para Production.

## C. Restante efetivo de P06 — sem bloquear trabalho com uma espera

- [ ] Registrar **a primeira execução do timer diário** quando acontecer naturalmente (prevista 2026-11-03 06:00Z); observar `LastTriggerUSec`, `Result`, journal `OFFSITE_RETENTION_VERIFIED` e marcador de sucesso. A rotina `daily` já passou pelo serviço; não executar outro backup manual para antecipar o timer.
- [ ] Montar aceite/revisão final P06 e registro das exceções do item B; documentação final deve citar hashes/timestamps reais conhecidos. Não criar SHA de transcript ausente.
- [ ] Incluir no runbook operacional **procedimento mensal** de restauração isolada após entrada em produção, compatível com [restore existente](../../runbooks/finance-hub-restore.md); separar lançamento futuro de execução já realizada.
- [ ] Registrar a decisão do revisor sobre RPO/RTO não medidos, retenção longitudinal e risco de notificações externas; se condição inderrogável da autoridade congelada ficar sem prova, registrar BLOCKED e não fingir PASS.

## D. Gate C — pré-matriz de rastreabilidade, sem ativação prematura

A [matriz oficial Gate C](../planned/GATE-C.md) continua `PLANNED` e requer aceitação da M09. O material abaixo localiza evidência existente, **não marca como PASS nenhum item de Gate C** sem revisão específica do contrato e dos resultados congelados.

| Categoria | Fonte já existente / revisão ainda necessária |
| --- | --- |
| CORE + INTEGRITY | [Gate B DONE](../completed/GATE-B.md), M04–M07 implementados, testes de concorrência/Refund/Correction; mapear cada invariante do checklist Gate C à prova e SHA correspondentes, sem refazer todo o CI. |
| INGESTION | M05–M07 e [M06 Lab acceptance](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md); vincular evidência específica de autorização pré-raw, lifecycle e replay. |
| REPORTING | [M08 DONE](../completed/M08-OVERVIEW.md); reconciliar fórmulas Summary, WhatsApp Summary e CSV injection. |
| SECURITY + OPERATIONS | Gate 0 inspection PASS e M06/M08; verificar log/secret redaction, escopos `finance:ingest`/`finance:admin`, Postgres/Redis sem exposição e health/readiness. **Riscos já aceitos do Gate 0**, como SSH root/password e painéis administrativos, não são considerados corrigidos por esse aceite; reavaliar antes de `REAL DATA READY`. |
| RECOVERY | P05 real isolated SQL restore (aceite com exceção), P06 serviço diário, backup offsite criptografado e recuperação de snapshot, timer/retention/status; distinguir prova diária por serviço de disparo diário pelo timer e as exceções do item B. |

**Critério de saída:** P06 só vai a DONE após decisão independente sobre a matriz e seus requisitos; Gate C só pode ser ativado e julgado depois de M09 aceita. Não conceder `REAL DATA READY`, uso de dados financeiros reais ou criação de tag/release `v0.1.0` por este documento. **Operações na VPS continuam exclusivas de `leoceo`**; checkout funcional em execução não deve sofrer `git pull` apenas por mudanças de documentação.
