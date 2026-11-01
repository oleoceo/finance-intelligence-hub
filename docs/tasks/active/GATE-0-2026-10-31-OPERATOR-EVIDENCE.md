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
