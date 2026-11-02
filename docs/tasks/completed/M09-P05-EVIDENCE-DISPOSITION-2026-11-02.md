# M09-P05 — decisão de aceite documental com exceção limitada (2026-11-02)

**Decisão:** proprietário autoriza encerrar **M09-P05 = DONE WITH DOCUMENTED EVIDENCE EXCEPTION**, estritamente a execução real Finance Lab. Trata-se de aceite humano explícito de evidência parcial para permitir a ativação DOCUMENTAL de P06, não de assinatura independente integral, dispensa de proteção de dados ou certificação de recuperação Production.

## Provas efetivamente disponíveis
- Execução humana reportada em 2026-11-02: dump custom de `finance_hub_lab`, novo repositório Restic criptografado, transferência ao Google Drive, recuperação em staging distinto, restauração no PostgreSQL 18.6 isolado e API isolada. Backup de origem original e Finance Lab preservados.
- Pacote privado revisado de forma independente: **sete checksums SHA-256 conferidos**, fingerprints antes/depois da origem idênticos; **13 tabelas financeiras e cadeia de migrações** equivalentes ao destino antes de teste sintético; logs de consulta API e idempotência sintética consistentes. O revisor registrou estes resultados e também registrou **BLOCKED** quanto à prova operacional original.
- Operador confirmou conservar cópias fora da VPS de **ambos** `p05-restic.password` e `p05-rclone.conf`. É declaração humana sem inspeção independente de conteúdo, validade atual ou recuperabilidade em host alternativo.
- Tests Replay/Conflict/Single Write/No Duplicate Effect são provas sintéticas **apenas no banco restaurado**; não reconstruíram uma requisição histórica.
- Registro no [PR #89](https://github.com/oleoceo/finance-intelligence-hub/pull/89); revisão limitada e lacuna explicitadas em [comentário do PR](https://github.com/oleoceo/finance-intelligence-hub/pull/89#issuecomment-6579867781). Nenhum arquivo privado, senha ou linha financeira incluído no Git.

## Ressalva de evidência assumida pelo proprietário

Os scripts da P05 redirecionaram saída normal de Restic/rclone para `/dev/null` e o transcript original de comando `pg_restore` não foi capturado. Portanto não existem logs históricos suficientes para o revisor comprovar diretamente a execução original do `restic check`, `rclone copy/check` e `pg_restore`; ele não assinou aceitação operacional independente plena. **Não atribuir PASS independente a essas etapas.** A conferência de conteúdo restaurado, origem sem mutação e testes da API reduz o risco, mas não substitui os transcripts ausentes.

Uma auditoria de somente leitura posterior foi tentada; falhou na descoberta ambígua do repositório recuperado; nenhum resultado novo comprovado é usado para este aceite. Não solicitar repetição do exercício P05 apenas para produzir transcript, e jamais apresentar nova verificação como se fosse original. O proprietário escolhe **aceitar explicitamente essa limitação residual para concluir somente a P05 Finance Lab**, sob sua responsabilidade de gestão de evidências.

## Restrições não dispensadas
- Não implica Production recoverability, RPO<=24h, RTO same-day, entrega de alertas, timers ativos ou M09/Gate C PASS.
- Não libera acessos automáticos do Poracode/agents à VPS. Qualquer instalação de timer, prune real, mudança de rede ou operação sobre `finance_hub_prod` exige o escopo/autorização apropriado e execução exclusiva por `leoceo`.
- P06 exige **evidência real contemporânea e independente**, incluindo execução recorrente, check de Restic, repositório Drive recuperável, retenção 14/8/12, recuperação externa de credenciais, falhas/alertas, lock, tempos e restauração mensal planejada. Não transportar a exceção P05 para P06/Gate C.
- Preservar evidências privadas, snapshot original, repositório recuperado, backup e banco isolado; sem limpeza/destruição nesta decisão.

## Consequência do aceite

**P05 DONE (somente Lab, ressalva explícita). P06 ACTIVE / AWAITING HUMAN OPERATOR EXECUTION.** Não é necessário baixar arquivos de script fora do Git nem refazer os testes P05; todos os arquivos de governança estão versionados. Conclusão P06 e Gate C permanecem decisões separadas baseadas em provas reais.
