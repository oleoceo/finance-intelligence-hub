# Gate 0 — evidências da inspeção de 2026-10-31 (operador)

**Escopo:** consolidação documental de saídas e screenshots apresentadas pelo operador `leoceo` durante inspeção read-only da VPS em 2026-10-31. **Proveniência:** outputs de terminal, captura de tela e relato do proprietário disponibilizados na conversa; não são coleta independente por este repositório nem um artefato original assinado do host. Não inclui IP, tokens, senhas, SSH keys, secrets, conteúdo de bancos nem dumps. **Status:** evidência consolidada, **não** Gate 0 PASS. Referências: [Gate 0 closure review](GATE-0-CLOSURE-REVIEW.md), [M06 accepted Lab](../../integrations/m06/LIVE-ACCEPTANCE-2026-10-29.md).

## Verificações efetivamente realizadas

| Critério | Saída ou testemunho do operador | Alcance / ressalva |
| --- | --- | --- |
| Serviços Finance | `finance-lab-api-1 Up 2 days (healthy)`; `postgres-products Up 3 days (healthy)`; `finance-hub-restore-test Up 2 days`; `n8n Up 2 days`; `evolution-api Up 2 days`; `redis-main Up 2 weeks (healthy)` | Lista `docker ps` real, não revalida IDs, imagens, mounts, logs ou versões |
| Infra compartilhada | `portainer`, `nginx-proxy-manager-app-1`, `members-api` e demais serviços de área de membros/checkout ativos | Não alterar nem reiniciar serviços compartilhados |
| Rede Finance | `network=finance-products-db internal=true containers=postgres-products finance-lab-api-1` | Reduz alcance externo, confirma membership dos dois contêineres na inspeção |
| Porta PostgreSQL | `docker inspect postgres-products --format '{{json .NetworkSettings.Ports}}'` → `{"5432/tcp":null}` | Sem porta publicada do container no host; não substitui teste externo |
| Firewall UFW | `Status: active`; logging `on (low)`; default `deny (incoming)`, `allow (outgoing)`, `deny (routed)`; ALLOW 22/tcp, 80, 443 IPv4/IPv6 | Porta publicada pelo Docker pode precisar de controle separado |
| Fail2Ban | `Status: active`; `Number of jail: 1`; `Jail list: sshd` | Jail existente, não prova a eficácia de todos os bloqueios |
| SSH efetivo | `port 22`; `permitrootlogin yes`; `passwordauthentication yes`; `pubkeyauthentication yes` | Hardening diferido por decisão do proprietário; **risco presente**, não remediado |
| Teste TCP externo (Windows) | 81=True; 8080=True; 9000=True; 5432=False; 6379=False | 5432 e 6379 não aceitaram conexão deste ponto de teste; não é scan exaustivo |
| Confirmação segunda rede | Navegação móvel: 81 mostra login Nginx Proxy Manager; 9000 mostra login Portainer; 8080 responde `Cannot GET /` | Painéis administrativos e API expostos externamente; sem teste de autenticação |
| Armazenamento | `/dev/sda1`: 193G total, 24G used, 170G available, 13% usado; `df -h /opt/apps /var/lib/docker` | Mesmo filesystem no dia; não representa dimensionamento garantido para staging P05 |
| Diretórios principais | `/opt/apps`, `/opt/apps/apps`, `/opt/apps/apps/lab`, `/opt/apps/backups`: `leoceo:leoceo`, UID/GID 1001:1001, mode 755 | Subdiretórios/volumes de todos os serviços ainda não inventariados neste registro |
| Diretório Lab backup | `/opt/apps/backups/databases/finance-hub/lab`: `leoceo:leoceo` mode 750 | Restringe acesso a outros fora do grupo; não prova sigilo de segredos de recuperação |
| Dumps anteriores | `finance_hub_lab_20261028_224103.dump` 917 bytes mode 600; `finance_hub_lab_postmigrations.dump` 51,801 bytes mode 664; `*.dump.gpg` modes 664; `*.sha256` modes 664 | Arquivos existem no Lab. `dump` em modo 664 é legível/escrevível pelo grupo; diretório 750 restringe outros. Sem novo restore nesta rodada |
| Cadeia de permissões | `namei -l` mostrou `/opt/apps/backups/databases/finance-hub` mode 755; diretório `lab` mode 750; arquivo pós-migração mode 664 | Não houve chmod ou chown, mudanças de ownership ou leitura de conteúdo |
| Conta humana | `id`: `uid=1001(leoceo) gid=1001(leoceo) groups=1001(leoceo),27(sudo),100(users),988(docker)` | Grupo `docker` e sudo irrestrito conferem poder equivalente a root |
| Sudo | `sudo -l`: `User leoceo may run ... (ALL : ALL) ALL` | Controle de acesso humano, NÃO least privilege de agente |
| Recuperação administrativa | Proprietário confirma acesso ao painel **e console web** da Hostinger | Console alternativo declarado, mas não testado no exercício atual |
| M06 backup/restore | `M06 RESTORE PASS`: backup do Finance Lab restaurado em DB temporário isolado com verificações (evidência integrada no repo) | Prova de recuperabilidade de DB de laboratório; não de snapshot de host/off-site nem P05 |

## Decisão expressa sobre riscos, não equivalência a remediação

O proprietário decidiu em 2026-10-31 adiar, por escolha operacional: SSH root/senha habilitados; proteção extra de Nginx Proxy Manager (81) e Portainer (9000); revisão da `members-api` publicada diretamente (8080). Os riscos devem permanecer visíveis em registro de aceitação, proprietário da decisão e tratamento futuro; sem mudanças nesta inspeção. Este aceite verbal NÃO demonstra que superfícies públicas são seguras e NÃO substitui as barreiras duras de Gate C.

## Política atual de operação dos agentes

**Modo vigente declarado pelo proprietário:** operação da VPS **exclusivamente manual pelo humano**; agentes (Poracode/Claude/Codex) não estão autorizados a realizar mudanças em serviços operacionais, SSH, Docker, banco, rede, firewall ou backups. Revisão/CI/PRs e atividades documentais no GitHub seguem política própria. Eventual autorização futura de operação por agente exige revisão de chaves, usuário, privilégios, escopo e ação antes de utilizá-lo.

**Ressalva de capacidade:** a política declarada não revoga tecnicamente possíveis chaves SSH de agentes antigas. Se qualquer chave de agente ainda autenticar como `leoceo`, ela poderá herdar sudo irrestrito e acesso ao Docker. A identidade/autorização efetiva das chaves em `authorized_keys` não foi auditada nesta coleta; não alegar segregação técnica de acesso sem verificá-la.

## Prova Hostinger e itens ainda a fechar

**Evidência histórica adicional informada pelo proprietário em 2026-10-28:** backup VPS Hostinger mostrado no painel com data **2026-10-28 10:46**, tamanho **20,09 GB**, frequência descrita como **semanal**, e uma entrada anterior de **2026-10-20**. O painel oferecia a ação de **restauração**, ainda **não executada/testada** naquele momento. O proprietário também confirmou acesso ao painel e **Web Console**; sua função é fornecer recuperação administrativa alternativa ao SSH habitual, não provar que o snapshot foi efetivamente restaurado. Estes dados são **relato do operador sobre a UI**, e não screenshot original, snapshot ID de provedor ou evidência de teste de restore integral de host. A existência de snapshots em 20/10 e 28/10 comprova ao menos duas entradas datadas observadas, não determina a política completa de retenção nem cópia/off-host independente. Para auditabilidade, vincular captura ou registro do painel com essas entradas (ou equivalente) e documentar escopo/retention/restaurabilidade reportados pelo provedor; **não exigir execução de restore destrutivo** para inspecionar o Gate 0.

Inventário ainda não fechado no presente documento: exatos IDs/imagens e mounts/volumes dos serviços relevantes, CPU/RAM e versões correntes de Docker/Compose; pode ser satisfeita por artefatos já existentes **se datados e inequívocos**. Evitar repetir comandos já apresentados.

## Delimitação da decisão

Esta transcrição permite ao revisor mover as linhas efetivamente comprovadas de `EVIDÊNCIA PENDENTE` para `PASS COM EVIDÊNCIA DO OPERADOR`, com a qualificação de proveniência acima. Não autoriza declarar snapshot Hostinger verificado, acesso de agente tecnicamente bloqueado, Gate 0 PASS, M09-P05 ativo, operação na VPS nem Gate C PASS.

**Próxima ação documental:** associar prova verificável mínima da Hostinger e decidir explicitamente eventual risco residual de chaves SSH/conta administrativa e inventário, depois submeter o Gate 0 à revisão independente. Sem necessidade de repetir a M06 ou alterar a infraestrutura.


## Inspeção complementar — 2026-11-01 (operador)

Estas saídas são do operador, reportadas na conversa; não houve acesso administrativo independente do revisor nem modificação pelo revisor. Não substituir `GATE-0.md` nem mudar status formal.

| Critério | Saída e limite |
| --- | --- |
| Diretório real da API Finance Lab | `docker inspect finance-lab-api-1`: projeto Compose `finance-lab`, working_dir `/opt/apps/apps/lab/finance-hub/infra/finance-lab`. A árvore também confirmou `/opt/apps/apps/lab/finance-hub`. |
| Diretório real do PostgreSQL | `docker inspect postgres-products`: projeto `postgres-products`, working_dir `/opt/apps/apps/databases/postgres-products`. |
| Diretório de backup pai | `/opt/apps/backups/databases/finance-hub`: `root:root` mode 755. |
| Diretório backup Lab (observação atual) | `/opt/apps/backups/databases/finance-hub/lab`: `leoceo:leoceo` mode **700**. Em 2026-10-31 havia sido visto como 750; não inferir causa ou afirmar mudança autorizada sem evidência. |
| Runtime e arquitetura | Ubuntu 24.04.4 LTS, x86_64. |
| Ferramentas de proteção instaladas pelo operador | `/usr/bin/restic` 0.16.4 e `/usr/bin/rclone` 1.75.2, versões confirmadas por comandos. `apt update` e instalação de Restic reportados. Essa instalação real ocorreu **antes** da decisão formal Gate 0, não altera retrospectivamente a elegibilidade para M09-P05 e **não comprova cópia off-site**. |
| Conta operacional de backup | `getent passwd finance-backup`: inexistente; `/etc/finance-hub` e `/var/lib/finance-hub-backup` inexistentes na coleta; ainda não provisionar por inferência. |
| Chaves autorizadas no caminho padrão do usuário | `/home/leoceo/.ssh/authorized_keys`: **não existe** no momento testado. |
| Chaves autorizadas no caminho padrão do root | `/root/.ssh/authorized_keys`: arquivo `root:root`, modo **600**, **0 bytes**, contagem por `awk` **0 entradas**; erro do `ssh-keygen -lf` é esperado para arquivo vazio. |
| Limite da auditoria de chaves | Os **dois caminhos padrão** não contêm chaves; **não prova ausência de AuthorizedKeysFile alternativo**, outras contas, certificados, `AuthorizedKeysCommand`, autenticação por senha ou acesso de agentes em outros caminhos. Não remover/modificar chaves nem alterar SSH no Gate 0. |

**Decisão operacional reafirmada:** o proprietário mantém administração humana da VPS, sem autorização para agentes efetuarem ações operacionais, e adia endurecimento SSH e interfaces administrativas. A ausência de duas listas de chaves não é prova de que a restrição de agentes esteja tecnicamente imposta.

**Progresso real vs. status formal:** descobertas de paths/ownership, ferramentas instaladas e achados SSH foram incorporados para impedir repetição. Ainda não há `Gate 0 PASS`, backup externo criptografado real, OAuth do rclone implantado, usuário `finance-backup`, restauração M09-P05, Gate C ou autorização genérica de deploy.

**Próxima evidência humana estritamente necessária:** referência de backup Hostinger recuperável — o backup semanal informado de 2026-10-28 10:46, 20,09 GB, entrada de 2026-10-20, tipo/escopo, retenção e opção de recuperação do painel — por captura sanitizada ou documento equivalente. Não executar restauração destrutiva da VPS para gerar evidência documental.

## Comprovantes visuais recebidos — Hostinger e SSH (2026-11-01)

**Proveniência:** duas capturas de tela enviadas diretamente pelo operador na conversa de inspeção em 2026-11-01. O presente texto é transcrição sanitizada dos campos visíveis; **não corresponde a um artefato de screenshot hospedado/verificado pelo GitHub**. As imagens originais devem ser preservadas pelo operador de modo privado para auditoria. Nenhuma ação de restore foi acionada.

**Hostinger hPanel — VPS → Snapshots e Backups:**

| Campo observável | Resultado |
| --- | --- |
| Tipo de backup | `Backups automáticos — Semanalmente` |
| Entrada 1 | `2026-10-28 10:46`; `Brasil`; `20.09 GB`; `Ubuntu 24.04 LTS` |
| Entrada 2 | `2026-10-20 20:48`; `Brasil`; `20.07 GB`; `Ubuntu 24.04 LTS` |
| Restauração | Botão `Restaurar` visível em ambas as entradas |
| Tempo exibido | `46m` para cada entrada — **estimativa da UI, não tempo de restore observado** |
| Cópia off-host | Mensagem da UI: `Os backups são armazenados separadamente do seu servidor principal` |
| Retenção | Mensagem da UI: `Backups antigos são substituídos automaticamente`; **quantidade/política exata de retenção não exibida** |
| Recuperação administrativa | Botão `Web console` visível no painel, complementando confirmação do operador de acesso |

**Limite importante:** a interface comprova entradas de backup de host e opção de restauração **oferecida pelo provedor**, não um teste de recuperação integral executado. A prova anterior `M06 RESTORE PASS` continua sendo de **banco Finance Lab isolado** e distinta do snapshot de VPS. A política de substituição impede alegar retenção prolongada ou RPO de 24h de snapshots **semanais**. Nenhum arquivo contendo senhas, tokens ou dados financeiros foi compartilhado.

**SSH efetivo — saída `sudo sshd -T | grep -E ...`:**

```text
permitrootlogin yes
pubkeyauthentication yes
passwordauthentication yes
authorizedkeyscommand none
authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2
```

Os arquivos padrão `/home/leoceo/.ssh/authorized_keys` (ausente) e `/root/.ssh/authorized_keys` (vazio, 0 bytes, modo 600) já foram examinados. **Nova informação:** `authorized_keys2` também é um arquivo configurado pelo sshd e **não foi inspecionado** nas contas relevantes. Não afirmar ausência total de chaves ou acesso de agentes. A configuração SSH aceita senha e root; o risco de exposição continua conhecido e com hardening adiado pelo proprietário.

**Estado para decisão Gate 0:** backup pré-mudança oferecido por provedor e console alternativo têm agora **prova visual de interface** declarada, suficiente para sustentar somente seu alcance expresso. Antes da promoção formal a PASS, o revisor deve avaliar o critério de prova de recuperação do host versus disponibilidade da opção de restore e resolver a rota `authorized_keys2` (ou aceitar formalmente seu risco caso os contratos permitam), além do inventário faltante. Gate 0 não é prova de Restic/Google Drive e não autoriza implantação P05.

## Encerramento direcionado de `authorized_keys2` — relato do operador, 2026-11-01

No handoff de 2026-11-01, o proprietário informou expressamente os seguintes resultados para os **dois arquivos restantes** da configuração efetiva `AuthorizedKeysFile`:

| Caminho | Resultado informado |
| --- | --- |
| `/home/leoceo/.ssh/authorized_keys2` | **NÃO EXISTE** |
| `/root/.ssh/authorized_keys2` | **NÃO EXISTE** |

Combinados aos exames anteriores, os **quatro arquivos de chaves explicitamente configurados** para `leoceo` e `root` não contêm entradas de chaves autorizadas: `leoceo/authorized_keys` e ambos os `authorized_keys2` ausentes, `root/authorized_keys` vazio (0 bytes). **Proveniência:** relato textual do operador; o revisor não executou SSH nem obteve novo comando assinado do host. Não houve alteração de arquivos, permissões ou do serviço SSH.

**Limites mantidos:** a verificação está restrita a estas duas contas e aos caminhos da configuração `sshd -T` anteriormente registrada; não inventaria outras contas, serviços ou mecanismos de autenticação. `authorizedkeyscommand none` foi registrado anteriormente. Continuam ativos, por escolha e risco aceito do proprietário, `passwordauthentication yes` e `permitrootlogin yes`; não declarar hardening, impossibilidade absoluta de acesso por agentes ou revogação de credenciais a partir da ausência de arquivos.

Esta evidência encerra apenas a **pendência dos dois `authorized_keys2`**. Não concede Gate 0 PASS; o revisor ainda deve examinar a adequação da recuperação da Hostinger e os metadados de inventário residuais contra o contrato congelado.

## Pré-validação operacional rclone/Google Drive — relato do operador, 2026-11-01

O operador apresentou capturas do PowerShell Windows e terminal da VPS demonstrando, **antes do Gate 0 PASS**, um teste com destino remoto `finance-drive:FinanceHub-Backups`, sem backup financeiro:

- Autorização OAuth iniciada pelo rclone no Windows e configuração transferida para o arquivo privado de `finance-backup` em `/var/lib/finance-hub-backup/.config/rclone/rclone.conf`. A tela da VPS exibiu `rclone lsd finance-drive:` com a pasta `FinanceHub-Backups`.
- `rclone about finance-drive:` reportou aproximadamente **15 GiB** totais e **14.994 GiB** livres na conta Google; isso **não comprova** capacidade suficiente para a política de retenção futura.
- A VPS executou `rclone rcat` para enviar texto **sintético** (`TESTE DE CONEXAO FINANCE HUB - SEM DADOS FINANCEIROS`) a um nome `teste-vps-<timestamp>.txt` dentro de `FinanceHub-Backups`; `rclone cat` devolveu exatamente essa linha; `rclone deletefile` retornou ao prompt sem erro. Não houve verificação independente pós-exclusão e nenhum dado financeiro foi usado neste teste.
- O proprietário informou que as credenciais/chaves OAuth anteriormente expostas em capturas foram substituídas. Esta é uma **declaração do operador**, não prova técnica de revogação de tokens antigos nem de configuração atualizada. Não registrar valores de Client ID, Client Secret ou tokens.
  
**Alcance:** conectividade, leitura, gravação e exclusão pontual de arquivo fictício por `finance-backup`. **Não** houve inicialização/transferência de repositório Restic, criptografia comprovada no Drive, `restic check`, recuperação off-site, cron/timer, backups reais, M09-P05 PASS, M09-P06 PASS ou Gate 0 PASS. Preservar a separação entre preflight e autorização formal para operação financeira.

## Restic — prova criptográfica sintética local (operador, 2026-11-01)

Captura do operador (terminal da VPS) registrou os seguintes resultados em ambiente **descartável**, segregado em `/var/lib/finance-hub-backup/restic-prova`, com conta `finance-backup` e senha de teste por arquivo, sem conteúdo financeiro real:

- `restic init` criou repositório local ID `dad15f1600` (abreviado `dad15f16`).
- `restic backup` do diretório de fonte fictícia reportou **1 arquivo novo de 43 bytes** e snapshot `42a6da7e`; o Restic criou cache próprio da conta de serviço.
- `restic check` abriu o mesmo repositório, leu índices e snapshots, verificou árvores e blobs, terminando com `no errors were found`.
- Nenhuma cópia de repositório criptografado ao Google Drive, download de repositório remoto, `restic restore`, backup PostgreSQL, agendamento ou retenção foi demonstrada nesta captura.

**Classificação:** PASS restrito ao *ensaio sintético local Restic*. Não constitui prova de recuperação off-site/M09-P05, automação M09-P06, autorização para dados financeiros reais, nem Gate 0 PASS. Evidência proveniente da captura do proprietário, sem execução pelo revisor.

## Recuperação Restic off-site com arquivo sintético — relato do operador, 2026-11-01

O proprietário informou, após executar o roteiro de teste, o resultado final literal `RECUPERACAO OFFSITE SINTETICA: PASS`. O fluxo instruído utilizou exclusivamente o repositório Restic **descartável** `dad15f1600` e o snapshot `42a6da7e`, com arquivo de conteúdo fictício (43 bytes) e senha de teste, não uma origem PostgreSQL.

**Procedimento indicado ao operador:** (1) `rclone copy` do repositório local privado para `finance-drive:FinanceHub-Backups/Restic-Teste-Sintetico-20261101`; (2) comparação `rclone check --download`; (3) transferência de volta a um diretório privado separado; (4) `restic check` no repositório recuperado; (5) `restic restore 42a6da7e` para um segundo diretório; (6) `cmp` do arquivo restaurado contra a fonte fictícia e impressão da frase PASS somente se o conteúdo coincidir.

**Proveniência e limite:** a confirmação final é textual do operador; não foram fornecidos aqui logs sanitizados de cada comando ou prova externa de distribuição/revogação de credenciais. Ela sustenta **PASS relatado para a prova técnica sintética off-site**, não valida volumes financeiros, dump SQL, roles, integridade do histórico da aplicação, programação diária, política de retenção, RPO/RTO ou recuperação operacional M09-P05. Não houve alteração documentada de PostgreSQL, Docker ou serviços compartilhados nesse teste.

**Governança:** o PR #78 continua sendo documentação de preflight/inspeção e **não concede Gate 0 PASS** por conta da prova sintética. A lista de inventário obrigatório residual, a decisão de riscos aceitos e o procedimento de recuperação Hostinger exigem decisão formal independente antes de ativar P05. O repositório de teste e seus segredos permanecem sob responsabilidade do operador; qualquer limpeza posterior deve ser específica e autorizada, sem remoção automática de dados existentes.

## Inventário direcionado complementar — relato textual do operador (2026-11-01)

O proprietário forneceu nova saída de terminal **read-only**. Parte das linhas de comandos foi intercalada/truncada durante a colagem; registrar apenas resultados que apareceram claramente, sem inferir execução dos demais comandos.

| Campo | Evidência observada | Limite |
| --- | --- | --- |
| CPU lógico | `nproc` apresentou **4** no fluxo intercalado com texto do próximo comando | Não registra o modelo do processador |
| Memória | `free -h`: **15 GiB total**, **3.9 GiB used**, **11 GiB available**, **0 B swap** | Fotografia pontual, não garantia de capacidade futura |
| Docker Engine | `sudo docker version --format 'Engine={{.Server.Version}}'` retornou **Engine=29.3.0** | Não confirma versão Docker Compose, cujo resultado não veio |
| Redes Finance | `finance-products-db` (`internal=true`) com `postgres-products, finance-lab-api-1`; `finance-hub-transport` (`internal=true`) com `n8n, finance-lab-api-1`; `finance-hub-restore-test-net` (`internal=true`) com `finance-hub-restore-test` | Nomes/associação observados neste comando; não substitui todos os metadados de container |
| Redes compartilhadas | Listagem nome/driver/`internal`/membros para `apps-backend`, `n8n_internal`, `proxy`, redes WordPress, checkout, membros, NPM, Portainer e redes padrão `bridge`, `host`, `none` | Não foram incluídos IPs/sub-redes; nenhum ajuste de rede realizado |
| Volumes nomeados | `finance_hub_restore_test_data`, `finance_postgres_products_data`, `members-platform_members-db-data`, `platform-members_member-db-data`, `platform-members_members-db-data`, `portainer_data` | **Seis nomes**, sem `Mountpoint`, tamanho ou associação a container demonstrada nesta saída |
| Metadados de containers | Comando `docker ps -a --no-trunc ...` foi colado, mas não houve uma tabela de resultado claramente visível | IDs, imagens e portas continuam **não recebidos** nesta rodada |
| Docker Compose e armazenamento detalhado | Comandos para `docker compose version --short` e `docker system df -v` foram colados, mas seus resultados não foram apresentados em linhas separadas | Permanecem **pendentes**, não FAIL |

**Conclusão pontual:** evidência suficiente para fechar campos de CPU lógico, RAM, Engine e membership de redes Finance no inventário; não converter ausência de output de containers/Compose/mounts/tamanhos em prova técnica. Solicitar somente os comandos de leitura ainda faltantes, **um bloco de cada vez**, evitando novo paste intercalado. Nenhum segredo ou conteúdo de dados é necessário, nenhuma mudança na VPS foi feita pela integração GitHub. O Gate 0 permanece sujeito à revisão formal.

## Contêineres e volumes — inventário íntegro enviado pelo operador, 2026-11-01

**Origem:** saída textual direta dos comandos somente leitura no terminal. `docker compose version --short` apresentou **5.1.0**. `docker ps -a --no-trunc` apresentou **27 containers** (26 `Up`, 1 `Exited (0)` histórico), nomes, IDs completos, referências de imagens, estado e `Ports` exatamente como exibidos. A coluna `Image` é referência de imagem usada pelo container, não necessariamente um `image inspect .Id` imutável; imagens `:latest` continuam não fixadas. Valores `5432/tcp`/`6379/tcp` sem host binding **não** significam publicação da porta.

### Saída de containers recebida (sem segredo)

```text
Name | Container ID | Image reference | Status | Ports
n8n | 5eeaebf16102f0eb89f87f06e3061ed8c324ab10c75ff35389ded766c828b644 | docker.n8n.io/n8nio/n8n:latest | Up 2 days | 5678/tcp
evolution-api | 1bc46d5aebe833fe3343bbbc5f19070a4e8ee29927b48c9cec169cd7ab8b73eb | evolution-m06-logging:2.3.7-f518183 | Up 3 days | 8080/tcp
finance-lab-api-1 | ee2821d759ac554706fac586f1a3295fea459512517f59dc76d7c2259ad03646 | finance-hub-api:lab | Up 3 days (healthy) | 3000/tcp
finance-hub-restore-test | f23d3ee75f898d96f4acff6793ffa4f56fcf8e729383e45922b1cc3c2bddd34c | postgres:18.6-bookworm@sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8 | Up 3 days | 5432/tcp
postgres-products | 5600d8abb753e6cf8ef1c7d39420f4f50ced29e6eb66eff16c5090380d4f6ea8 | postgres:18.6-bookworm@sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8 | Up 3 days (healthy) | 5432/tcp
members-web | abb8d9845b1b2795393af1a7904f53e730d46cc15709c09f9b46a81338c399fa | members-platform-members-web | Up 3 days | 80/tcp
members-db | 6d9c1ed024a10d84a8da4b96cce62981ff2b13ae19509f56123614633bb72e7f | postgres:16-alpine | Up 3 days | 5432/tcp
n8n-postgres | aff63d16d617de35c9d0d7a979885612bdf77a24aeaf28ba365957351aff781e | postgres:16-alpine | Up 2 weeks | 5432/tcp
evolution-postgres | 3a709cb3777fad41aced0a42de6e9049d0831c3c3af3da70ddf745ca1c2c37a9 | postgres:16-alpine | Up 2 weeks (healthy) | 5432/tcp
redis-main | a3c2439bf663e09bc30cf9cf905fc8d99645dc75d60a60370d8d04599590a143 | redis:7-alpine | Up 2 weeks (healthy) | 6379/tcp
checkout-flowcheckout-prod | aaaa6abed544f84de8ad2b31b30ba711a69023612847d1ce7627884388936ab9 | wordpress:6.5.5-php8.2-apache | Up 2 weeks | 80/tcp
checkout-flowcheckout-prod-db | bc4cc58cb0eed20efc4f2269533d3d8b356cf33e23e55ef19c8a95400a880065 | mariadb:10.6 | Up 2 weeks | 3306/tcp
checkout-flowcheckout-teste | 54af10531f9c934ef33a44a14ccc439f268755e73c18aaf7c836683a5b9c39da | wordpress:6.5.5-php8.2-apache | Up 2 weeks | 80/tcp
checkout-flowcheckout-teste-db | 8b4fa97a79aa3c404bc6ff86f11c9ad46653167e758854dc81e7722102e43d4c | mariadb:10.6 | Up 2 weeks | 3306/tcp
member-api | 93201e4a8af7c9138c2d10d18ea725882d9fab781b3e5c4d3a0bb008c6cdabc0 | platform-members-member-api | Up 2 weeks | 8080/tcp
member-db | b598ef468cf4bbd5db061b8ab41d59bf4d50fa7113256cc71f9e6062b6ec9001 | postgres:16-alpine | Up 2 weeks | 5432/tcp
member-web | b74284b3c796f921e1ed0259f5d1992c8aa20a84a024af6c89f6928c55d84553 | platform-members-member-web | Up 2 weeks | 80/tcp
members-api | 672a4c4046462c8915b78036f2a4ff20b17460e8d7d33e97a2c280bbc8a0441b | members-platform-members-api | Up 2 weeks | 0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp
checkout-flowcheckout | d93c2253ba4d03976941c274a814fff7fad142fcf942b48bfbfa393e3fe88c91 | wordpress:6.5.5-php8.2-apache | Up 2 weeks | 80/tcp
checkout-flowcheckout-db | 40f7f2a5ccba3ae74bce04cf4e9602efba45750dc8ef7088b27630b13fb93ee2 | mariadb:10.6 | Up 2 weeks | 3306/tcp
areamembros-flowmembers | 240cde9d51b5f670c52bf4b7e5e28c5ea68e9c5009479d2986a5f90796985cd0 | wordpress:6.5.5-php8.2-apache | Up 2 weeks | 80/tcp
areamembros-flowmembers-db | 1206209a591bc3b3cbf086086ebba99639ca652366bfbf35b9fd80ddc23a4ad3 | mariadb:10.6 | Up 2 weeks | 3306/tcp
lp-deepsecrets | 42bb04d4ada6ccda43336d5777b101c2054d7452d5d215a634d8545312263bd8 | php:8.2-apache | Up 2 weeks | 80/tcp
portainer | daafad5fd2332873dbb24a032a7213bca03bca66e6614fbfd1e44b0eb165ced5 | portainer/portainer-ce:latest | Up 2 weeks | 8000/tcp, 9443/tcp, 0.0.0.0:9000->9000/tcp, [::]:9000->9000/tcp
nginx-proxy-manager-app-1 | b89cedcc0936b70c393bcd3d9593eae5bfe4eec1ce3cbe3ee3152a273362c816 | jc21/nginx-proxy-manager:latest | Up 2 weeks | 0.0.0.0:80-81->80-81/tcp, [::]:80-81->80-81/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
nginx-proxy-manager-db-1 | 6339dc5d0dce3d4aeba95eb0f4dba75adbcd1a84c2ddc2a6889f4fc95c51b30a | mariadb:10.5 | Up 2 weeks | 3306/tcp
priceless_rosalind | 79e9519a380b24b6d39d632fe40d9a029c03ed178ca31487c84003728effbb4d | hello-world | Exited (0) 7 months ago |
```

### Saída dos volumes nomeados (caminho e ocupação)

```text
Volume | Mountpoint | du -sh
finance_hub_restore_test_data | /var/lib/docker/volumes/finance_hub_restore_test_data/_data | 47M
finance_postgres_products_data | /var/lib/docker/volumes/finance_postgres_products_data/_data | 65M
members-platform_members-db-data | /var/lib/docker/volumes/members-platform_members-db-data/_data | 48M
platform-members_member-db-data | /var/lib/docker/volumes/platform-members_member-db-data/_data | 48M
platform-members_members-db-data | /var/lib/docker/volumes/platform-members_members-db-data/_data | 4.0K
portainer_data | /var/lib/docker/volumes/portainer_data/_data | 224K
```

**Interpretação limitada:** os seis *Docker named volumes* agora possuem nomes, `Mountpoint` e tamanho estimado. O inventário não inclui *bind mounts* declarados diretamente nas configurações de containers nem associa cada volume ao container consumidor por `Mounts`. Não assumir que todos os dados persistentes ficam nesses seis volumes: aplicações n8n, Evolution, WordPress, outros bancos e Finance podem usar binds. Releitura focalizada de `.Mounts` de containers relevantes, sem `Env` nem conteúdo de arquivos, é a forma de fechar apenas esse campo se exigido no Gate 0. Nenhuma alteração foi feita na VPS.

**Segurança observada:** `members-api` publica `0.0.0.0/[::]:8080`, `portainer` publica `0.0.0.0/[::]:9000` e NPM publica `80/81/443` em IPv4/IPv6; já registrados como risco aceito pelo proprietário. `postgres-products` e `redis-main` não mostram bind de host no `docker ps`, consistente com as verificações anteriores; isso não é uma varredura universal de rede. Containers Finance API e PostgreSQL `healthy`; Evolution e n8n `Up`, sem `healthy` exibido nesse comando, o que **não** equivale a prova de falha de saúde.

## Encerramento do inventário dos mounts e Proxy Hosts — operador, 2026-11-01

O operador realizou os dois **últimos comandos de leitura direcionados**. Estes dados complementam o inventário de 27 containers, redes e seis volumes nomeados já reproduzido acima. Nenhuma operação de alteração de containers, redes, bancos, serviços ou NPM foi executada.

### `docker inspect --format '{{range .Mounts}}...'` — bindings efetivos

| Container | Tipo | Origem (host / named volume) | Destino no container |
| --- | --- | --- | --- |
| `postgres-products` | bind | `/opt/apps/apps/databases/postgres-products/secrets/postgres_password` | `/run/secrets/postgres_password` |
| `postgres-products` | volume | `finance_postgres_products_data` (`/var/lib/docker/volumes/finance_postgres_products_data/_data`) | `/var/lib/postgresql` |
| `finance-lab-api-1` | bind | `/opt/apps/apps/lab/finance-hub/secrets/ingest_token` | `/run/secrets/ingest_token` |
| `finance-lab-api-1` | bind | `/opt/apps/apps/lab/finance-hub/secrets/app_password` | `/run/secrets/app_password` |
| `finance-lab-api-1` | bind | `/opt/apps/apps/lab/finance-hub/secrets/admin_token` | `/run/secrets/admin_token` |
| `finance-hub-restore-test` | volume | `finance_hub_restore_test_data` (`/var/lib/docker/volumes/finance_hub_restore_test_data/_data`) | `/var/lib/postgresql` |
| `finance-hub-restore-test` | bind | restricted Lab restore secret mount (exact private temporary filename held by operator) | `/run/secrets/postgres_password` |
| `n8n` | bind | `/opt/apps/apps/n8n/n8n_data` | `/home/node/.n8n` |
| `n8n` | bind | `/opt/apps/apps/n8n/finance-m06-custom` | `/opt/finance-m06-custom` |
| `n8n-postgres` | bind | `/opt/apps/apps/n8n/postgres_data` | `/var/lib/postgresql/data` |
| `evolution-api` | bind | `/opt/apps/apps/platforms/evolution-main/evolution_instances` | `/evolution/instances` |
| `evolution-postgres` | bind | `/opt/apps/apps/platforms/evolution-main/postgres_data` | `/var/lib/postgresql/data` |
| `redis-main` | bind | `/opt/apps/apps/cache/redis-main/redis_data` | `/data` |
| `portainer` | bind | `/opt/apps/infra/portainer/data` | `/data` |
| `portainer` | bind | `/var/run/docker.sock` | `/var/run/docker.sock` |
| `nginx-proxy-manager-app-1` | bind | `/opt/apps/infra/nginx-proxy-manager/data` | `/data` |
| `nginx-proxy-manager-app-1` | bind | `/opt/apps/infra/nginx-proxy-manager/letsencrypt` | `/etc/letsencrypt` |
| `nginx-proxy-manager-db-1` | bind | `/opt/apps/infra/nginx-proxy-manager/data/mysql` | `/var/lib/mysql` |

**Segurança:** apenas nomes/caminhos de mounts, jamais leitura dos arquivos `secrets/*`. O container de restauração temporária já existia; não o apagar nem presumir que suas credenciais possam ser reaproveitadas. As pastas de dados de n8n/Evolution/Redis são *bind mounts*, não parte dos seis named volumes. O host continua compartilhado; o backup Finance não deve absorver os dados desses serviços.

### Nginx Proxy Manager — encaminhamentos observados

Saída do `grep` sobre `/data/nginx/proxy_host/*.conf`, sem leitura de credenciais:

| Domínio(s) no proxy | Destino `http://container:porta` |
| --- | --- |
| `pay.flowcheckout.com.br` | `checkout-flowcheckout-prod:80` |
| `n8n.leoceo.online` | `n8n:5678` |
| `evo.leoceo.online` | `evolution-api:8080` |
| `deepsecrets.site`, `www.deepsecrets.site` | `lp-deepsecrets:80` |
| `app.flowmembers.com.br` | `areamembros-flowmembers:80` |
| `old.flowcheckout.com.br` | `checkout-flowcheckout:80` |
| `solucoes.digital` | `members-web:80` |
| `teste.solucoes.digital` | `member-web:80` |
| `teste.flowcheckout.com.br` | `checkout-flowcheckout-teste:80` |

NPM routing inventory is not a claim about external DNS availability, TLS strength or security of published administrative ports. The Finance API remains unlisted as a public NPM Proxy Host in this inspected set. Existing management-port exposure is an explicitly accepted **residual risk**, not a hardened state.

### Resultado da coleta

**O inventário read-only previsto pelo Gate 0 está materialmente completo** para recursos host, Docker/Compose, containers, redes, named volumes/mountpoints/sizes, binds dos serviços relevantes, Proxy Hosts e segurança/backup conhecidos. Nenhum outro comando de inventário é solicitado neste fechamento. O revisor deve decidir o Gate 0 com as limitações explícitas da recuperação Hostinger (opção de restore não exercitada), credenciais/SSH e serviços publicados; não elevar resultados sintéticos a M09-P05 operacional.
