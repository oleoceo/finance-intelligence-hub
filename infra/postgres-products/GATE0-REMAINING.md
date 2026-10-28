# Gate 0 — fechamento operacional (REVIEW REQUIRED)

Coleta administrativa informada em 2026-10-28, sem saída bruta anexada: Docker 29.3.0; Compose 5.1.0; 12 GiB RAM; 173 GB livres. n8n 2.23.3 em `n8n_internal`/`proxy`; Evolution em `apps-backend`/`proxy`; Redis em `apps-backend`. `postgres-products` ausente do inventário de contêineres; volume `finance_postgres_products_data` e rede `finance-products-db` inexistentes. UFW e Fail2Ban ativos. SSH efetivo: `permitrootlogin yes`, `passwordauthentication yes`, `pubkeyauthentication yes`. Backup e recuperação pré-mudança sem comprovação. Gate 0 ainda não é PASS.

## Coleta final única, somente leitura

Um operador autorizado executa em uma sessão e entrega saída datada e sanitizada. Não incluir segredos, variáveis de ambiente, `docker inspect` integral, logs, conteúdo de backup ou chaves. Preservar IDs, nomes, redes, mounts, portas e UID/GID. Falhas ficam `UNKNOWN`; não elevar `fih-audit`.

```bash
date -u +%FT%TZ
hostname
sudo -n docker version --format 'docker={{.Server.Version}}'
sudo -n docker compose version
nproc
free -h
df -hT /opt/apps /var/lib/docker
sudo -n docker ps -a --format '{{.ID}} {{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
sudo -n docker network ls --format '{{.Name}} {{.Driver}}'
sudo -n docker network inspect n8n_internal apps-backend proxy --format '{{.Name}} internal={{.Internal}} {{range $id,$c := .Containers}}{{$c.Name}} {{end}}'
sudo -n docker network inspect finance-products-db --format '{{.Name}} internal={{.Internal}}' 2>&1 || true
sudo -n docker volume ls --format '{{.Name}} {{.Driver}}'
sudo -n docker volume inspect finance_postgres_products_data --format '{{.Name}} {{.Driver}} {{.Mountpoint}}' 2>&1 || true
sudo -n docker ps -a --filter name='^/postgres-products$' --format '{{.ID}} {{.Names}} {{.Status}} {{.Ports}}'
sudo -n docker ps -a --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}' | grep -Ei 'n8n|evolution|redis|postgres|portainer|nginx|npm' || true
sudo -n docker inspect n8n evolution-api redis-main --format '{{.Name}} image_id={{.Image}} networks={{range $n,$v := .NetworkSettings.Networks}}{{$n}} {{end}} mounts={{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}} {{end}} ports={{json .NetworkSettings.Ports}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>&1 || true
sudo -n stat -c '%n %u:%g %a %F' /opt/apps /opt/apps/apps /opt/apps/apps/databases /opt/apps/apps/databases/postgres-products /opt/apps/apps/lab /opt/apps/apps/lab/finance-hub /opt/apps/backups /opt/apps/backups/databases/finance-hub/lab 2>&1 || true
sudo -n find /opt/apps/backups/databases/finance-hub/lab -maxdepth 1 -type f -printf '%f %s bytes %TY-%Tm-%Td\n' 2>&1 || true
sudo -n ufw status verbose
sudo -n fail2ban-client status
sudo -n sshd -T | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port) '
id
sudo -n -l 2>&1
```

Substituir `n8n`, `evolution-api` e `redis-main` pelos nomes exatos do inventário se divergirem. Sanitizar a saída de `sudo -n -l`. O operador acrescenta declaração verificável, sem credenciais: backups atuais, destino externo e retenção; data, alvo e resultado do último restore de prova; identificador de snapshot recuperável pré-mudança; RPO/RTO; responsável e rota de recuperação SSH; sondagem externa autorizada de 5432/6379; mounts e UID/GID dos volumes relevantes; modelo de privilégio delimitado para a stack Finance. Arquivos ou volumes presentes não provam restore.

## Aceite e decisões

| Item | Estado | Critério objetivo |
| --- | --- | --- |
| Inventário, redes, mounts, portas e health | Parcial | Saída datada com IDs e serviços existentes; nenhum conflito no alvo Finance |
| Banco Finance | Contêiner, volume e rede ausentes | Confirmar pelos três inventários; ausência direciona INFRA-T01 e não impede Gate 0 PASS |
| Permissões | UNKNOWN | UID/GID e modos dos diretórios/volumes relevantes; operador auditável e delimitado, sem Docker socket ou sudo irrestrito para `fih-audit` |
| SSH | Root e senha habilitados | Configuração registrada, recuperação comprovada e risco aceito expressamente ou remediação separada definida |
| Recuperação pré-mudança | UNKNOWN — bloqueio real | Snapshot recuperável, cópia/retensão e restauração de prova comprovados; RPO/RTO e responsável definidos |
| PostgreSQL/Redis públicos | UNKNOWN | Sondagem externa autorizada confirma 5432/6379 inacessíveis |

Gate 0 PASS exige todas as categorias comprovadas e decisão humana registrada. Falta de recuperação, colisão de recursos, exposição pública de PostgreSQL/Redis ou ausência de acesso operacional/recuperação bloqueiam a mudança. SSH com root/senha habilitados é risco explícito a decidir, sem alterar SSH nesta tarefa. Portas 8080/81/9000, rotação de senha de outra aplicação, rota n8n → API do ADR-003 e autenticidade do webhook são riscos ou dependências posteriores; não bloqueiam a preparação isolada do banco. M06 live depende de suas próprias provas.

Decisões finais: responsável decide a postura SSH e valida recuperação; atesta snapshot/restore, RPO/RTO e privilégios; depois de Gate 0 PASS, autoriza separadamente a INFRA-T01 descrita em `OPERATIONS.md`. Esta coleta não inclui deploy.
