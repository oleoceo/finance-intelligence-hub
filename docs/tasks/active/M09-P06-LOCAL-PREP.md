# M09-P06 — antecipação local/CI

**Status:** implementação técnica local/CI preparada e integrada; contrato [M09-P06](M09-P06.md) agora ACTIVE / AWAITING HUMAN OPERATOR EXECUTION (documentação 2026-11-02). [P05](../completed/M09-P05.md) foi encerrada no escopo Lab com exceção específica de evidência reconhecida pelo proprietário; nenhuma saída Restic/rclone/pg_restore ausente foi reconstruída. Nenhuma rotina P06 foi ativada na VPS. A fase operacional mantém seus testes e aprovações próprios.

**Objetivo:** preparar código, testes, evidências e plano de execução de P06 antes da operação manual final, reutilizando P01–P05.

**Superfície permitida:** `scripts/backup/`, `infra/finance-backup/`, testes M09, `docs/runbooks/`, este contrato, overview M09 e `PROJECT_STATE.md`. Nenhuma migração, documento congelado, serviço compartilhado ou acesso VPS.

**Critérios técnicos:** scheduler diário e check semanal com travamento; retenção Restic 14/8/12 e local curta; integridade do custom dump e repositório; estados de falha sem falso sucesso; detecção de cópia off-site com mais de 24h; recuperação de segredos independente da VPS documentada e testável; evidências reproduzíveis. Testes positivos e negativos em ambiente descartável, validação CI no HEAD e revisão técnica independente.

**Critérios operacionais preservados:** A restauração real da P05 foi executada e aceita pelo proprietário com lacuna histórica documentada; depois o operador humano deve comprovar scheduler, retenção, checks, alertas, segredos externos e medições de P06 no host. RPO/RTO não podem ser declarados cumpridos por testes locais. P06 só pode ser concluída com revisão operacional posterior. Gate C é avaliação separada.

**Exclusões:** acesso ou alteração da VPS pelo agente; Production; instalação/ativação de timers; prune em dados reais; exclusão de backups, volumes ou serviços; declaração de P05/P06 DONE, M09 DONE ou Gate C PASS.

**Implementação técnica:** runner Lab dedicado, sete unidades systemd preparadas sem ativação e procedimento manual no runbook final. O runner P03 permanece restrito a fixtures. A revisão independente identificou agrupamento incorreto de retenção, leitura integral do dump e risco de sync sobre a única cópia remota; os três defeitos foram corrigidos e a re-revisão deu PASS. Validação local após correção: instalação congelada, lint, formatação dos arquivos alterados, build, typecheck, 1.099 unitários e 592 integrações (incluindo 5 P06) PASS. O CI Linux no HEAD final é a prova independente de execução exigida. Isso não promove o contrato operacional PLANNED nem aceita P05.
