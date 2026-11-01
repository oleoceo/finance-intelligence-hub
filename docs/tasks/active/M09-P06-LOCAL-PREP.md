# M09-P06 — antecipação local/CI

**Status:** ACTIVE apenas para implementação e revisão local/CI. O contrato de aceite [M09-P06](../planned/M09-P06.md) permanece PLANNED para execução operacional. P05 permanece ACTIVE e aguarda restauração real. Esta autorização decorre da instrução explícita do proprietário em 2026-11-01; não altera o ciclo de aceite operacional.

**Objetivo:** preparar código, testes, evidências e plano de execução de P06 antes da operação manual final, reutilizando P01–P05.

**Superfície permitida:** `scripts/backup/`, `infra/finance-backup/`, testes M09, `docs/runbooks/`, este contrato, overview M09 e `PROJECT_STATE.md`. Nenhuma migração, documento congelado, serviço compartilhado ou acesso VPS.

**Critérios técnicos:** scheduler diário e check semanal com travamento; retenção Restic 14/8/12 e local curta; integridade do custom dump e repositório; estados de falha sem falso sucesso; detecção de cópia off-site com mais de 24h; recuperação de segredos independente da VPS documentada e testável; evidências reproduzíveis. Testes positivos e negativos em ambiente descartável, validação CI no HEAD e revisão técnica independente.

**Critérios operacionais preservados:** P05 deve primeiro comprovar recuperação real do off-site e restauração isolada; depois o operador humano deve comprovar scheduler, retenção, checks, alertas, segredos externos e medições de P06 no host. RPO/RTO não podem ser declarados cumpridos por testes locais. P06 só pode ser promovido/aceito em revisão operacional posterior. Gate C é avaliação separada.

**Exclusões:** acesso ou alteração da VPS pelo agente; Production; instalação/ativação de timers; prune em dados reais; exclusão de backups, volumes ou serviços; declaração de P05/P06 DONE, M09 DONE ou Gate C PASS.

**Implementação local em revisão:** runner Lab dedicado, sete unidades systemd preparadas sem ativação e procedimento manual no runbook final. O runner P03 permanece restrito a fixtures. Os testes descartáveis cobrem locks, dump inválido, credenciais, falha e recuperação remota, retenção e detecção de backup obsoleto. Esta fase só recebe `IMPLEMENTATION READY / AWAITING OPERATOR EXECUTION` após CI no HEAD exato e revisão independente. Isso não promove o contrato operacional PLANNED nem aceita P05.
