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

O proprietário declarou existência de backup/recuperação da Hostinger e acesso ao painel/console web. **Não foram fornecidos neste registro** snapshot/backup ID, data, escopo, local externo, retenção, opção de restauração oferecida pelo provedor ou evidência de recuperação de host. Esses dados documentais, ou equivalentes auditáveis, precisam ser referenciados antes de validar a recuperabilidade do host conforme `GATE0-REMAINING.md`. Não pedir restore destrutivo para gerar prova.

Inventário ainda não fechado no presente documento: exatos IDs/imagens e mounts/volumes dos serviços relevantes, CPU/RAM e versões correntes de Docker/Compose; pode ser satisfeita por artefatos já existentes **se datados e inequívocos**. Evitar repetir comandos já apresentados.

## Delimitação da decisão

Esta transcrição permite ao revisor mover as linhas efetivamente comprovadas de `EVIDÊNCIA PENDENTE` para `PASS COM EVIDÊNCIA DO OPERADOR`, com a qualificação de proveniência acima. Não autoriza declarar snapshot Hostinger verificado, acesso de agente tecnicamente bloqueado, Gate 0 PASS, M09-P05 ativo, operação na VPS nem Gate C PASS.

**Próxima ação documental:** associar prova verificável mínima da Hostinger e decidir explicitamente eventual risco residual de chaves SSH/conta administrativa e inventário, depois submeter o Gate 0 à revisão independente. Sem necessidade de repetir a M06 ou alterar a infraestrutura.
