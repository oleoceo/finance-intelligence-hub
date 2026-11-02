# M09-P06 — antecipação local/CI

**Status:** IMPLEMENTATION READY / AWAITING OPERATOR EXECUTION para a fase técnica local/CI, condicionado ao CI verde no HEAD final do PR. O contrato de aceite [M09-P06](../planned/M09-P06.md) permanece PLANNED para execução operacional. P05 permanece ACTIVE e aguarda restauração real. Esta autorização decorre da instrução explícita do proprietário em 2026-11-01; não altera o ciclo de aceite operacional.

**Objetivo:** preparar código, testes, evidências e plano de execução de P06 antes da operação manual final, reutilizando P01–P05.

**Superfície permitida:** `scripts/backup/`, `infra/finance-backup/`, testes M09, `docs/runbooks/`, este contrato, overview M09 e `PROJECT_STATE.md`. Nenhuma migração, documento congelado, serviço compartilhado ou acesso VPS.

**Critérios técnicos:** scheduler diário e check semanal com travamento; retenção Restic 14/8/12 e local curta; integridade do custom dump e repositório; estados de falha sem falso sucesso; detecção de cópia off-site com mais de 24h; recuperação de segredos independente da VPS documentada e testável; evidências reproduzíveis. Testes positivos e negativos em ambiente descartável, validação CI no HEAD e revisão técnica independente.

**Critérios operacionais preservados:** P05 deve primeiro comprovar recuperação real do off-site e restauração isolada; depois o operador humano deve comprovar scheduler, retenção, checks, alertas, segredos externos e medições de P06 no host. RPO/RTO não podem ser declarados cumpridos por testes locais. P06 só pode ser promovido/aceito em revisão operacional posterior. Gate C é avaliação separada.

**Exclusões:** acesso ou alteração da VPS pelo agente; Production; instalação/ativação de timers; prune em dados reais; exclusão de backups, volumes ou serviços; declaração de P05/P06 DONE, M09 DONE ou Gate C PASS.

**Implementação técnica:** runner Lab dedicado, sete unidades systemd preparadas sem ativação e procedimento manual no runbook final. O runner P03 permanece restrito a fixtures. A revisão independente identificou agrupamento incorreto de retenção, leitura integral do dump e risco de sync sobre a única cópia remota; os três defeitos foram corrigidos e a re-revisão deu PASS. Validação local após correção: instalação congelada, lint, formatação dos arquivos alterados, build, typecheck, 1.099 unitários e 592 integrações (incluindo 5 P06) PASS. O CI Linux no HEAD final é a prova independente de execução exigida. Isso não promove o contrato operacional PLANNED nem aceita P05.
