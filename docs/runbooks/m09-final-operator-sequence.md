# M09 final — sequência única do operador

**Estado:** plano preparado; nenhuma etapa neste documento registra execução. Operador exclusivo da VPS: `leoceo`. Registrar data UTC, operador, checkout SHA, identidade exata do recurso, comando, exit status e evidência redigida em armazenamento privado. Parar em qualquer erro ou identidade inesperada. Segredos e dados financeiros não entram em Git, PR, logs públicos ou capturas de tela.

## 1. P05: cópia real e restauração isolada

1. Confirmar `main` e CI pós-merge de #83, contrato [P05](../tasks/active/M09-P05.md) e [runbook de restauração](finance-hub-restore.md). Revalidar apenas as identidades usadas: `finance_hub_lab`, `postgres-products`, rede privada, usuário de leitura, diretório de backup, espaço livre e PostgreSQL 18 da nova instância isolada. Preservar bancos, volumes, dumps e repositórios existentes.
2. Criar um novo dump custom do Lab, validar `PGDMP`, `pg_restore --list`, bytes, SHA-256 e manifesto; obter fingerprint da origem antes e depois. Parar se a origem mudar inesperadamente.
3. Criar novo repositório Restic com senha independente, guardar cópia de recuperação fora da VPS, copiar apenas objetos criptografados ao prefixo Finance Lab no Drive, conferir snapshot, `restic check` e `rclone check`. Baixar do Drive para diretório vazio independente e restaurar o snapshot de lá. Conferir novamente dump e manifesto.
4. Criar banco `finance_restore_*` novo e vazio em instância PostgreSQL 18 isolada; confirmar identidade distinta da origem. Aplicar bootstrap/grants com identidade apropriada e restaurar sem `--clean`/`--create`. Comparar fingerprints, migrações, permissões, Books, Accounts, Transactions, Refunds, Audit, Inbox, Idempotency e Summary; conectar API isolada sem tráfego WhatsApp. Registrar duração de cada etapa, resultado e não mutação da origem. Revisão independente do registro é pré-requisito de P05 DONE.

## 2. P06: operação recorrente, somente após aceite P05

1. Fazer revisão específica do host e das credenciais antes de instalar qualquer timer. Os timers e o runner P03 em `infra/finance-backup/` e `scripts/backup/finance-hub-scheduled.sh` continuam restritos a fixtures descartáveis; **não remover esse bloqueio nem apontar essas unidades à VPS**. O adaptador Lab `finance-hub-lab-scheduled.sh` e as unidades `finance-hub-lab-*` estão preparados para revisão operacional, sem instalação ou ativação. Confirmar que `/opt/apps/backups/restic/finance-hub-lab-p06` é um repositório novo, exclusivo e inicializado pelo operador, com marcador privado `.finance-lab-p06-owned` contendo um identificador aleatório de 32 caracteres hexadecimais, e que `finance-drive:FinanceHub-Backups/finance-lab-p06/<id>` é um prefixo novo e exclusivo. Nunca reutilizar o repositório P05 ou um destino compartilhado.
2. Na revisão do adaptador, exigir: fonte Finance Hub exclusiva, usuário de leitura, diretórios privados e espaço disponível; `flock` único para manual/timer/check; manifesto e archive validados antes da proteção; Restic `check` antes de qualquer `forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune`; escopo de snapshots verificado; cópia criptografada e conferida antes de marcar sucesso; no máximo três dumps locais válidos; nenhuma exclusão de artefato alheio. Uma falha de Drive deve deixar a cópia local e o runtime Finance íntegros, mas sinalizar falha/degradação.
3. Registrar o timer diário no fuso `America/Sao_Paulo`, o check semanal e a próxima execução via `systemctl list-timers`; demonstrar uma execução manual e uma disparada pelo timer. Registrar início/fim, ambiente, banco, tamanho do dump, snapshot ID, exit code, check e confirmação remota sem segredo. Demonstrar bloqueio de execução concorrente e recuperação após processo encerrado. Validar retenção por calendário de snapshots, não apenas pelo número bruto de snapshots.
4. Simular com segurança falha do destino, dump inválido, credencial incorreta, check falho e backup ausente/mais velho que 24 horas. Confirmar evento no journal, estado não saudável e entrega observável do alerta ao responsável. Restabelecer sucesso, validar que o alerta limpa apenas após nova cópia off-site conferida. Não registrar RPO <=24h sem horários reais; não registrar RTO same-day sem medição de recuperação real.
5. Verificar, por recuperação independente e sem depender da VPS original, posse da senha Restic, configuração/acesso rclone e segredos/bootstrap necessários. Guardar apenas referência ao custodiante e resultado da prova, nunca valores. Agendar restore isolado mensal após entrada em operação e registrar primeiro agendamento.
6. Reunir timestamps, IDs, hashes, logs redigidos, status dos timers, snapshots, checks, alerta positivo/negativo, custódia externa e revisão independente. Somente então avaliar P06 pelo contrato [PLANNED](../tasks/planned/M09-P06.md). A ausência de qualquer prova mantém P06 pendente.

O destino P06 possui dois repositórios remotos completos, `slot-a` e `slot-b`, sob o prefixo exclusivo. Cada execução sincroniza e confere apenas o slot inativo; o slot ativo anterior permanece recuperável durante uma falha do Drive. O controle privado `.finance-lab-p06-active-slot` identifica o último slot conferido, junto do timestamp `.finance-lab-p06-success`. Na prova de recuperação, baixar primeiro o slot ativo para diretório vazio e conferir `restic check`; testar também a leitura do slot anterior. Não apagar nenhum slot como limpeza manual sem uma autorização operacional específica. A retenção 14/8/12 é aplicada aos snapshots de cada versão verificada do repositório, com agrupamento único de snapshots Finance Lab.

### Preparação manual dos timers, após P05 aceito

**Correção de prontidão após PR #85:** as unidades diárias, semanais e de status executam como `leoceo`, a identidade já autorizada para Docker e proprietária do diretório Lab `leoceo:leoceo` 0700. A conta `finance-backup` permanece apenas no marcador de alerta e não recebe Docker nem sudo. O dump do agendamento chama `finance-hub-lab-docker-dump.sh`, que exige checkout `/opt/finance-hub`, diretório Lab gravável pelo proprietário, credencial 0600 pertencente ao mesmo UID, rede interna `finance-products-db` e `postgres-products` nessa rede. O cliente P05 PostgreSQL 18.6 é iniciado sem porta publicada, como UID:GID de `leoceo`, com checkout, credencial e raiz de backup somente leitura; apenas o diretório Lab é montado para escrita. O adaptador exige o ID SHA-256 da imagem revisada e executa por esse ID, evitando troca da tag após a conferência. O papel PostgreSQL continua somente leitura. Como `leoceo` já detém Docker, o operador deve verificar que o checkout e as unidades instaladas só podem ser alterados por administradores autorizados; não conceder escrita do checkout a outra conta. A revisão local/CI não comprova a topologia da VPS.

Antes de instalar ou ativar as unidades, `leoceo` registra privadamente o SHA revisado e executa estes checkpoints sem revelar segredos:

```bash
test "$(id -un)" = leoceo
test "$(stat -c %U:%G:%a /opt/apps/backups/databases/finance-hub/lab)" = leoceo:leoceo:700
test -w /opt/apps/backups/databases/finance-hub/lab
test "$(stat -c %U:%a "$PGPASSFILE")" = leoceo:600
test "$(docker network inspect --format '{{.Internal}}' finance-products-db)" = true
docker inspect --format '{{json .NetworkSettings.Networks}}' postgres-products
docker image inspect finance-hub-p05-client --format '{{.Id}}'
systemd-analyze verify /opt/finance-hub/infra/finance-backup/finance-hub-lab-*.service
```

Conferir visualmente que o container está na rede indicada. Construir a imagem P05 revisada se ausente, conforme o runbook P05. Registrar seu ID `sha256:...` no arquivo privado de ambiente como `FINANCE_P06_CLIENT_IMAGE_ID`, após comparação com a imagem revisada. O operador carrega apenas esse arquivo privado e executa o adaptador antes de ativar timers:

```bash
set -a
. /etc/finance-hub/backup-lab-p06.env
set +a
bash /opt/finance-hub/scripts/backup/finance-hub-lab-docker-dump.sh
```

Registrar exit status e nome do novo artefato, depois verificar `PGDMP`, manifesto, hash, UID e modo 0700 sem imprimir conteúdo financeiro. Se qualquer checkpoint falhar, interromper a instalação. O operador instala as unidades apenas depois do aceite operacional P05 e da revisão do resultado manual; registrar `systemctl show` para confirmar `User=leoceo`, `Group=leoceo` e o `ExecStart` efetivos. Nunca mudar proprietário/permissão global da árvore nem publicar PostgreSQL.

O operador revisa o checkout e instala manualmente apenas as sete unidades `finance-hub-lab-*` de `infra/finance-backup/`, após confirmar proprietário e permissões. O arquivo privado `/etc/finance-hub/backup-lab-p06.env` fornece `FINANCE_LAB_SCHEDULE_ENABLED=yes`, `FINANCE_BACKUP_ALLOWED_DATABASE=finance_hub_lab`, `FINANCE_BACKUP_ROOT=/opt/apps/backups`, `FINANCE_RESTIC_REPOSITORY=/opt/apps/backups/restic/finance-hub-lab-p06`, o prefixo remoto exclusivo e os caminhos para `PGPASSFILE`, `RESTIC_PASSWORD_FILE` e `RCLONE_CONFIG_FILE`, todos externos à árvore de backup. Configurar `PGHOST=postgres-products`, `PGPORT=5432` e usuário PostgreSQL somente de leitura. Não colocar valores de segredos no arquivo de unidades, Git ou logs. A configuração de rclone usa acesso limitado ao prefixo Finance Lab. Revisar `systemd-analyze verify`, depois `systemctl daemon-reload`, `enable --now` dos três timers e `list-timers` somente sob autorização operacional posterior. Conectar os eventos `ALERT` do journal a um canal de entrega comprovável ao responsável; o marcador de journal sozinho não prova entrega. O timer horário executa `finance-hub-lab-scheduled.sh status` para detectar falta de cópia verificada ou idade superior a 24 horas. Guardar a cópia independente das credenciais e provar recuperação em máquina isolada.

## 3. Gate C: avaliação separada

Após P05 e P06 aceitos, usar a [matriz Gate C](../tasks/planned/GATE-C.md) para reunir Core, integridade, ingestão, reporting, segurança, operações e recuperação no mesmo SHA aprovado e CI exato. Verificar condições de hard FAIL e obter aceite humano explícito antes de qualquer PASS, Production ou release. Nenhum teste local/CI substitui backup e restore reais.
