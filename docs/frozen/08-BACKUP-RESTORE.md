# 08-BACKUP-RESTORE.md

# Finance Intelligence Hub
## Backup, Restore and Disaster Recovery — V0.1

**Documento:** `08-BACKUP-RESTORE.md`  
**Versão:** 0.3  
**Status:** FROZEN — Baseline for Implementation
**Projeto:** Finance Intelligence Hub  

**Autoridade de decisão:**
- `FINAL-FREEZE-DECISIONS.md`
- `00-PROJECT-BLUEPRINT.md`
- `01-MVP-REQUIREMENTS.md`
- `02-DOMAIN-MODEL.md`
- `03-ARCHITECTURE.md`
- `04-DATABASE.md`
- `05-API-CONTRACTS.md`
- `06-WHATSAPP-FLOWS.md`
- `07-SECURITY.md`

---

# 1. Objetivo

Este documento define a estratégia oficial de:

```text id="pmrgjf"
backup

off-site protection

retention

validation

restore

disaster recovery

pre-migration protection

recovery testing
```

do Finance Intelligence Hub.

---

# 2. Princípio principal

Backup só é considerado útil quando:

```text id="a6sdnh"
foi criado
+
foi validado
+
pode ser restaurado
```

---

# 3. Regra fundamental

```text id="4y79tf"
backup existente
≠
backup recuperável
```

---

# 4. Restore faz parte do produto

Restore não será tratado como:

```text id="y6rdpv"
operação futura opcional
```

A capacidade de restauração deverá ser validada antes de uso financeiro real contínuo.

---

# 5. Source of Truth protegido

O principal ativo a proteger é:

```text id="2clzw2"
PostgreSQL Finance Hub
```

---

# 6. Ativos persistentes

O backup da aplicação deverá considerar:

```text id="r236gn"
Finance Hub database

Finance Hub persistent storage

versioned repository/configuration

recovery secrets
```

---

# 7. Git não substitui backup de dados

Git protege:

```text id="7abmc6"
code

migrations

documentation

scripts

configuration templates
```

Não protege:

```text id="yhwcbd"
Transactions

Inbox data

AuditEvents

Production configuration secrets
```

---

# 8. Backup não substitui Git

Um dump de banco também não substitui:

```text id="qwm9h9"
repository

migrations

AGENTS

PROJECT_STATE

runbooks
```

---

# 9. Recoverability completa

Recuperação ideal depende de:

```text id="5n47zr"
Git
+
Finance DB backup
+
Finance storage backup
+
recovery secrets
+
documentation
```

---

# 10. Escopo do backup Finance Hub

O backup da aplicação inclui:

```text id="cxw6d5"
finance_hub_prod
```

e:

```text id="n9upt7"
Finance Hub persistent storage
```

quando houver arquivos persistentes.

---

# 11. Lab

Também poderá possuir backup quando útil:

```text id="2dkk06"
finance_hub_lab
```

mas Production é prioridade.

---

# 12. O backup da aplicação não é backup global do PostgreSQL

Não executar como rotina Finance Hub:

```text id="z7m2rd"
pg_dumpall
```

para proteger indiscriminadamente todos os databases de `postgres-products`.

---

# 13. Motivo

`postgres-products` poderá hospedar futuramente:

```text id="dw1g1j"
Finance Hub

outros produtos

MVPs

clientes

aplicações
```

O Finance Hub não deve assumir responsabilidade por todos esses dados.

---

# 14. Responsabilidade da aplicação

```text id="fub6s4"
Finance Hub
→ Finance Hub database
→ Finance Hub storage
```

---

# 15. Responsabilidade de infraestrutura

Backup global da instância PostgreSQL compartilhada, caso exista, será responsabilidade separada da infraestrutura da VPS.

---

# 16. Database Production

Nome canônico:

```text id="bjfq8b"
finance_hub_prod
```

---

# 17. Database Lab

```text id="3mvjgw"
finance_hub_lab
```

---

# 18. Banco operacional de terceiros

Finance backup não inclui:

```text id="jdsqhd"
n8n-postgres

evolution-postgres
```

---

# 19. Database backup format

Preferência:

```text id="9gvc05"
pg_dump
custom format
```

Exemplo conceitual:

```bash id="w65lhq"
pg_dump \
  --format=custom \
  --file=finance_hub_prod_YYYY-MM-DD_HHMM.dump \
  finance_hub_prod
```

---

# 20. Custom format

Permite:

```text id="ohj9qq"
pg_restore

selective restore

parallel options where useful

validation tooling
```

---

# 21. Database consistency

`pg_dump` deverá utilizar mecanismos normais de snapshot consistente do PostgreSQL.

Não pausar Finance Hub simplesmente para cada backup normal.

---

# 22. Backup naming

Arquivos deverão possuir:

```text id="vmnf7x"
environment

database

date

time
```

Exemplo:

```text id="llhg5a"
finance_hub_prod_2026-09-04_030000.dump
```

---

# 23. Timezone de naming

Preferir timezone operacional conhecido/documentado.

Inicialmente:

```text id="sv8ixf"
America/Sao_Paulo
```

---

# 24. Storage

Diretório persistente do Finance Hub poderá futuramente conter:

```text id="v8zc98"
receipts

attachments

imports

generated files
```

---

# 25. V0.1 storage pode estar vazio

A ausência de arquivos persistentes na V0.1 inicial não deverá fazer a rotina de backup falhar indevidamente.

---

# 26. Empty storage handling

Rotina deverá tratar com segurança:

```text id="pkol0b"
directory exists but empty
```

e, conforme implantação:

```text id="78mtxu"
storage directory not yet created
```

sem gerar falsa corrupção.

---

# 27. Banco sempre prioritário

Mesmo com storage vazio:

```text id="b19iwo"
database backup
```

continua obrigatório.

---

# 28. Estrutura oficial da VPS

Backups ficarão sob:

```text id="plu2z8"
/opt/apps/backups
```

---

# 29. Estrutura oficial Finance Hub

```text id="jg7zhn"
/opt/apps/backups/
├── databases/
│   └── finance-hub/
│       ├── lab/
│       └── production/
│
└── files/
    └── finance-hub/
        ├── lab/
        └── production/
```

---

# 30. Não utilizar estrutura paralela ambígua

Não criar como padrão oficial:

```text id="nhi6za"
/opt/apps/backups/finance-hub/
```

com banco e arquivos misturados.

---

# 31. Banco e arquivos separados

Obrigatório.

---

# 32. Local staging

Backup local será inicialmente criado em área controlada da VPS antes do envio off-site.

---

# 33. Local retention curta

Manter localmente aproximadamente:

```text id="al52cb"
2–3 dumps recentes
```

quando espaço permitir.

---

# 34. Motivo

Permitir restauração rápida para incidentes simples sem depender imediatamente do off-site.

---

# 35. Local staging não é única cópia

Obrigatório possuir proteção off-site.

---

# 36. Off-site architecture

Fluxo canônico:

```text id="7xl99q"
PostgreSQL dump
+
Finance storage
        ↓
local staging
        ↓
Restic encrypted repository
        ↓
rclone
        ↓
Google Drive
```

---

# 37. Restic

Será responsável principalmente por:

```text id="2eufms"
encryption

deduplication

snapshots

retention

repository integrity
```

---

# 38. rclone

Será utilizado como camada de acesso/transporte ao destino remoto.

---

# 39. Google Drive

Função:

```text id="q00juf"
off-site repository location
```

---

# 40. Google Drive não é runtime

Finance Hub deverá funcionar normalmente se:

```text id="y8nm5o"
Google Drive
```

estiver indisponível.

---

# 41. Google Drive não é storage operacional

Não ler Receipt diretamente do Google Drive como arquitetura principal futura apenas porque backups usam Drive.

---

# 42. Encryption

Backup off-site deverá permanecer criptografado.

---

# 43. Plaintext dump no Drive

Não será fluxo oficial.

Evitar:

```text id="sf0czx"
finance_hub_prod.dump
↓
upload direto plaintext
↓
Google Drive
```

---

# 44. Restic repository password

Tratar como:

```text id="6yqfbl"
critical recovery secret
```

---

# 45. Recovery secrets não ficam apenas na VPS

Obrigatório.

---

# 46. Motivo

Se a VPS for perdida completamente:

```text id="chsdsg"
recovery secret
```

precisa continuar disponível.

---

# 47. Recovery material

Pode incluir:

```text id="1ryghf"
Restic repository password

rclone recovery/config credentials

DB/bootstrap secrets where appropriate

SSH/recovery information
```

armazenados de forma segura fora do host principal.

---

# 48. Não versionar recovery secrets

Git não recebe secrets reais.

---

# 49. Backup logs

Não deverão incluir:

```text id="5m1iqg"
Restic password

Google credential secrets

DB password

full DATABASE_URL
```

---

# 50. Frequency V0.1

No mínimo:

```text id="f67lkm"
daily
```

para Production.

---

# 51. RPO inicial

Target:

```text id="1vccnv"
RPO <= 24 hours
```

---

# 52. Significado

Em desastre total, a meta inicial aceita perder no máximo aproximadamente:

```text id="4khfyw"
up to one day of data
```

dependendo do último backup bem-sucedido.

---

# 53. RPO futuro

Se uso real demonstrar necessidade:

```text id="z4f93k"
<= 6 hours
```

poderá ser adotado.

Não bloquear V0.1 por isso.

---

# 54. RTO inicial

Objetivo:

```text id="gta3n8"
same-day recovery
```

para sistema pessoal.

---

# 55. RTO não é promessa automática

Depende de:

```text id="jdyfun"
incident

VPS availability

replacement host

off-site access

operator availability
```

---

# 56. Scheduler

Preferência:

```text id="r5q5th"
systemd timer
```

---

# 57. Alternativa aceitável

```text id="evhwgi"
cron
```

se apropriado ao ambiente.

---

# 58. n8n não será único scheduler do backup

Não depender exclusivamente de:

```text id="88ii7z"
n8n workflow
```

para proteger os dados do próprio Finance Hub.

---

# 59. Motivo

Se n8n estiver indisponível:

```text id="2m28oc"
backup still needs to run
```

---

# 60. Backup script

Preferência:

```text id="h25dcp"
scripts/backup/
```

no repositório, sem secrets embutidos.

---

# 61. Script versionado

Deverá definir:

```text id="aee79c"
steps

error handling

validation

retention calls

logging
```

---

# 62. Environment configuration

Secrets/paths variáveis entram via configuração externa.

---

# 63. Backup atomicity conceitual

Database dump e file snapshot não precisam ser bit-a-bit transacionais entre si na V0.1 quando storage não participa do núcleo financeiro.

---

# 64. Future Receipt consistency

Quando arquivos passarem a ter relação crítica com registros de Receipt, a estratégia poderá ganhar:

```text id="945y8w"
manifest

checksum

snapshot coordination
```

mais rígida.

---

# 65. Retention policy

Congelada inicialmente em:

```text id="smt8x1"
14 daily

8 weekly

12 monthly
```

---

# 66. Restic forget/prune

Deverá refletir a política acordada.

Exemplo conceitual:

```text id="dlzpvc"
keep-daily 14

keep-weekly 8

keep-monthly 12
```

---

# 67. Prune

Executar conscientemente.

Não necessariamente a cada backup se isso tornar operação excessiva.

---

# 68. Repository check

Executar:

```text id="du969e"
weekly
```

como baseline.

---

# 69. Restic check

Objetivo:

```text id="iy1nyl"
detect repository corruption/issues
```

antes do dia de desastre.

---

# 70. Snapshot listing

Rotina operacional deverá permitir verificar:

```text id="5q5y92"
latest successful snapshot
```

---

# 71. Backup success não é apenas exit code do pg_dump

A rotina completa deverá verificar, conforme etapa:

```text id="5hw2na"
dump created

dump non-empty

pg_restore can inspect it

Restic snapshot created

remote repository reachable
```

---

# 72. Dump validation

Exemplo:

```bash id="obsxws"
pg_restore --list <dump>
```

ou mecanismo equivalente.

---

# 73. Empty/corrupt dump

Deverá fazer a rotina falhar.

---

# 74. False success

Proibido registrar:

```text id="1yggcn"
BACKUP OK
```

se apenas o dump local funcionou mas o off-site exigido falhou.

---

# 75. Backup result states

Operacionalmente distinguir:

```text id="j5d98j"
SUCCESS

FAILED

PARTIAL/DEGRADED
```

se necessário.

---

# 76. Off-site failure

Se local dump funcionar, mas remote upload falhar:

```text id="4cwd65"
Finance runtime continues
```

mas backup run deverá ser considerado falho/degradado e observável.

---

# 77. Backup failure não derruba Finance API

Backup é processo operacional separado.

---

# 78. Mas falhas recorrentes são blocker operacional

Não ignorar backups falhando continuamente.

---

# 79. Observability

Cada execução deverá registrar:

```text id="s4pl6y"
started_at

finished_at

environment

database

result

dump size

snapshot id when available

error code/message
```

sem secrets.

---

# 80. Notification

V0.1 poderá adicionar alerta simples para falha.

Não é obrigatório criar plataforma de monitoring complexa.

---

# 81. Manual verification

Periodicamente verificar manualmente:

```text id="i90wux"
latest snapshot exists

expected database included

repository accessible
```

---

# 82. Pre-migration backup

Obrigatório antes de migration relevante em Production.

---

# 83. Pre-destructive backup

Obrigatório antes de:

```text id="ox1nrv"
destructive DB operation

bulk data transformation

Production restore

high-risk infrastructure change
```

quando apropriado.

---

# 84. High-risk operation examples

```text id="6hv84l"
DROP

TRUNCATE

large DELETE

destructive migration

storage restructuring

PostgreSQL major changes
```

---

# 85. Dated backup

Backup pré-risco deverá ser claramente identificável.

---

# 86. Gate 0 backup

Gate 0 também deverá avaliar estado de backup da VPS antes das primeiras mudanças.

---

# 87. Gate 0 backup != M09

São conceitos relacionados, mas diferentes.

---

# 88. Gate 0

Objetivo:

```text id="7e9kg5"
protect current VPS before project changes
```

---

# 89. M09

Objetivo:

```text id="va6bkx"
operational recurring backup/restore of Finance Hub
```

---

# 90. Restore principle

Nunca assumir que backup funciona sem restauração real.

---

# 91. Restore obrigatório antes de dados reais

Antes de considerar:

```text id="pb0ct3"
REAL DATA READY
```

deverá existir:

```text id="jo3v93"
at least one successful isolated restore
```

---

# 92. Restore target

Nunca começar restaurando sobre:

```text id="gtp11u"
finance_hub_prod
```

---

# 93. Isolated target

Exemplo:

```text id="65wwb4"
finance_hub_restore_test
```

---

# 94. Restore environment

Deverá estar isolado da Production operacional.

---

# 95. Restore workflow

```text id="wvbu4y"
identify snapshot
↓
prepare isolated PostgreSQL database
↓
restore dump
↓
restore files if applicable
↓
configure temporary Finance API
↓
run validation
↓
record result
↓
destroy test environment when safe
```

---

# 96. Restore database command

Conceitualmente:

```bash id="i1l6y7"
pg_restore \
  --dbname=finance_hub_restore_test \
  finance_hub_prod_<date>.dump
```

com opções apropriadas à implementação real.

---

# 97. Owner/role differences

Restore deverá considerar que:

```text id="3s2opk"
database roles
```

podem ser recriados separadamente.

---

# 98. Shared roles

Não depender de:

```text id="kcrkxd"
global PostgreSQL cluster dump
```

como único meio de recuperar:

```text id="3ypo5q"
finance_hub_app

finance_hub_migrations

finance_hub_readonly
```

---

# 99. Roles/grants recovery

Deverão ser recriáveis através de:

```text id="fxx1e3"
versioned bootstrap/infrastructure scripts
+
externally injected secrets
```

---

# 100. Restore must validate application

Não basta:

```text id="njh954"
pg_restore exited 0
```

---

# 101. Application-level validation

Depois do restore, validar:

```text id="4z06br"
Finance API connects

Books readable

Accounts readable

Transactions readable

Audit readable

summary works
```

---

# 102. Basic row validation

Comparar quando aplicável:

```text id="hsbmsu"
expected counts

sample IDs

known human_refs
```

---

# 103. Financial consistency check

Exemplo:

```text id="4tk1g6"
summary before backup
=
summary after isolated restore
```

para amostra/teste controlado.

---

# 104. Refund validation

Restored database deverá preservar:

```text id="wwhcr6"
refund_of_transaction_id
```

e reporting correto.

---

# 105. Audit validation

AuditEvents deverão permanecer associados aos recursos esperados.

---

# 106. Inbox validation

Não é obrigatório reprocessar Inbox durante restore.

Objetivo é preservar estado histórico corretamente.

---

# 107. ConfirmationSessions antigas

Restore deverá reproduzir database fielmente.

Sessões já expiradas podem ser tratadas pela aplicação após boot conforme TTL/lifecycle.

---

# 108. Idempotency records

Devem ser preservados.

---

# 109. Motivo

Restore não deverá reabrir possibilidade trivial de replay de antigas `Idempotency-Key` já concluídas.

---

# 110. Storage restore

Quando existir conteúdo persistente:

```text id="qggn2h"
restore directories/files
```

no target isolado.

---

# 111. File validation

Quando aplicável:

```text id="spx9py"
file exists

expected size

checksum/sample validation
```

---

# 112. Empty V0.1 storage

Não deverá fazer restore test falhar se storage legitimamente estiver vazio.

---

# 113. Monthly restore test

Depois que Production estiver em uso:

```text id="mzgi6a"
monthly
```

---

# 114. Objetivo

Evitar descobrir somente no desastre que:

```text id="fcr1z2"
backup exists
but restore is broken
```

---

# 115. Restore evidence

Cada teste deverá registrar:

```text id="16kmgj"
date

snapshot

source environment

restore target

application version

database validation

storage validation

result

issues
```

---

# 116. Restore record location

Poderá ficar em:

```text id="zhn1qc"
docs/runbooks/

docs/reviews/

operations record
```

conforme processo adotado.

---

# 117. Não incluir secrets no evidence

Obrigatório.

---

# 118. Restore cleanup

Depois do teste:

```text id="dik1g5"
temporary DB
temporary files
```

podem ser removidos conscientemente.

---

# 119. Cleanup não será automático destrutivo sem validação

Confirmar que o target é realmente temporário.

---

# 120. Production restore

Só ocorrerá quando incidente realmente exigir.

---

# 121. Production restore requires approval

Obrigatório:

```text id="rldgln"
explicit human approval
```

---

# 122. Antes do Production restore

Quando possível:

```text id="otztw7"
preserve current damaged state
```

para investigação/recovery alternativo.

---

# 123. Production restore strategy

Preferir:

```text id="5byye2"
restore isolated
↓
validate
↓
plan cutover
```

em vez de:

```text id="x2ac0r"
overwrite Production blindly
```

---

# 124. Disaster scenario — application code lost

Recuperar via:

```text id="yzq5gu"
Git
```

---

# 125. Disaster scenario — Finance container lost

Recriar via:

```text id="0z51tt"
Compose

image/build

.env

network config
```

---

# 126. Disaster scenario — Finance database lost

```text id="ciqbe6"
create target database
↓
roles/grants bootstrap
↓
restore pg_dump
↓
validate
```

---

# 127. Disaster scenario — entire VPS lost

```text id="k5h5aq"
new VPS
↓
base infrastructure
↓
Docker/networks
↓
postgres-products
↓
Finance roles/databases
↓
Finance repository
↓
restore database
↓
restore files
↓
configure secrets
↓
Finance API
↓
validate
↓
restore integrations
```

---

# 128. Integration restoration order

Finance Core deverá voltar antes de:

```text id="7aslw5"
WhatsApp

Firefly

analytics
```

quando possível.

---

# 129. Motivo

Finance Core é a capacidade essencial.

---

# 130. Evolution loss

Não implica perda do histórico financeiro canônico.

---

# 131. n8n loss

Não implica perda das Transactions.

---

# 132. Redis loss

Não implica perda definitiva das Transactions.

---

# 133. Firefly loss

Futuro: não implica perda da Source of Truth.

---

# 134. Google Drive temporary outage

Não implica perda imediata do runtime.

---

# 135. Local disk loss

Off-site deverá permitir recuperação.

---

# 136. Off-site account loss

Recovery planning deverá considerar acesso/controle da conta remota.

---

# 137. Restic repository corruption

Weekly check ajuda a detectar cedo.

---

# 138. Multiple backup generations

Retention oferece recuperação contra:

```text id="o3hh33"
logical corruption

accidental changes

bad migration

late-discovered issue
```

---

# 139. Backup after corruption

Ter apenas "latest backup" não é suficiente.

---

# 140. Retention reason

Snapshots históricos permitem voltar para ponto anterior ao incidente.

---

# 141. Backup before dangerous migration

Cria checkpoint conhecido imediatamente anterior.

---

# 142. Schema migrations and backup compatibility

Cada release deverá saber qual migration/schema espera.

---

# 143. Restore old backup into new code

Não assumir compatibilidade automaticamente.

---

# 144. Safe process

```text id="61p40l"
restore backup
↓
identify schema version
↓
use compatible application/migrations
↓
upgrade deliberately
```

---

# 145. Database schema version

Migration framework deverá permitir identificar versão aplicada.

---

# 146. Backup manifest

V0.1 poderá registrar metadata simples:

```text id="qw5rs1"
application version

database/schema version

timestamp

environment
```

junto do processo de backup.

---

# 147. Manifest não precisa virar sistema complexo

Pode ser arquivo pequeno/metadata de snapshot.

---

# 148. Checksum

Pode ser utilizado para dump local quando útil.

Exemplo:

```text id="c37a85"
SHA-256
```

---

# 149. Checksum não substitui restore

Obrigatório entender essa diferença.

---

# 150. Encryption at rest no host

Não é requisito obrigatório da V0.1 além das proteções normais do host/filesystem.

---

# 151. Off-site encryption é obrigatória

Via Restic.

---

# 152. Backup access

Somente identidades/processos necessários deverão possuir acesso.

---

# 153. Finance application runtime

Não precisa necessariamente possuir acesso completo ao repository off-site.

---

# 154. Backup process separation

Preferir credenciais específicas de backup.

---

# 155. Google Drive credential

Não reutilizar credential administrativa Finance API.

---

# 156. Restic password

Não reutilizar DB password.

---

# 157. Database password

Não reutilizar token do n8n.

---

# 158. Secret compartmentalization

Objetivo:

```text id="v53484"
one leaked credential
≠
complete environment compromise
```

---

# 159. File permissions

Backups locais deverão possuir acesso restrito.

---

# 160. Recursive permissions

Nunca resolver problema de backup fazendo indiscriminadamente:

```bash id="cjbuaa"
chmod -R 777 /opt/apps/backups
```

---

# 161. Ownership

Configurar apenas paths específicos e com UID/GID conhecidos.

---

# 162. Backup scripts e sudo

Se comandos privilegiados forem necessários, reduzir escopo.

---

# 163. Codex

Não deverá executar Production restore autonomamente.

---

# 164. Codex backup tasks

Pode ajudar a:

```text id="4uzsd7"
write scripts

test scripts in Lab

validate restore runbook
```

dentro de escopo autorizado.

---

# 165. Codex Production backup modification

Mudança relevante deverá passar por review/aprovação.

---

# 166. Codex destructive restore

Sempre requer aprovação explícita.

---

# 167. Monitoring baseline

No mínimo precisamos saber:

```text id="3wuctw"
when last successful backup happened
```

---

# 168. Stale backup detection

Se último backup bem-sucedido ultrapassar:

```text id="60p849"
expected schedule + tolerance
```

deverá ser considerado problema operacional.

---

# 169. RPO breach

Se último backup válido tiver mais de 24h em Production:

```text id="075xgu"
RPO target breached
```

---

# 170. Não esconder RPO breach

Deverá ser observável.

---

# 171. Backup job locking

Evitar duas execuções simultâneas da mesma rotina se isso puder causar conflito.

---

# 172. Estratégias possíveis

```text id="h4ow2o"
flock

systemd execution semantics

lock file
```

---

# 173. Lock stale

Implementação deverá evitar lock eterno após crash.

---

# 174. Disk space

Antes/durante backup, monitorar espaço suficiente para staging.

---

# 175. Disk-full failure

Backup deverá falhar claramente.

---

# 176. Não deixar dumps locais ilimitados

Aplicar política local curta.

---

# 177. Restic retention é distinta da retenção local

Local:

```text id="d3fxof"
2–3 recent dumps
```

Off-site:

```text id="51jumz"
14 daily

8 weekly

12 monthly
```

---

# 178. Backup Lab

Pode possuir retenção menor se futuramente desejado.

Mas qualquer mudança deverá ser explícita.

---

# 179. Production é prioridade

Recursos de backup devem priorizar Production.

---

# 180. Pre-Production requirement

Antes de dados financeiros reais:

```text id="yqez56"
backup automation configured

off-site repository working

restore performed successfully
```

---

# 181. Gate C backup criteria

```text id="ipn44f"
[ ] Production backup procedure documented

[ ] encrypted off-site repository operational

[ ] retention configured

[ ] repository check configured

[ ] recovery secrets exist outside VPS

[ ] restore runbook exists

[ ] isolated restore succeeded
```

---

# 182. M09 scope

Implementar:

```text id="mebecm"
pg_dump automation

storage collection

Restic repository

rclone remote

retention

repository check

logging

restore runbook

restore test
```

---

# 183. M09 não exige

```text id="vppvlp"
enterprise backup appliance

multi-region database replication

continuous WAL archiving

PITR
```

para V0.1.

---

# 184. PITR

Pode ser considerado futuramente se RPO real justificar.

---

# 185. Replication

Não necessária inicialmente.

---

# 186. High Availability

Não é objetivo da V0.1.

---

# 187. Backup ≠ High Availability

Backup resolve:

```text id="ilxdof"
recoverability
```

não:

```text id="oacsv5"
instant failover
```

---

# 188. RPO vs RTO

RPO:

```text id="u1bfgq"
quanto dado podemos perder
```

RTO:

```text id="z0v1t6"
quanto tempo podemos levar para voltar
```

---

# 189. Baseline V0.1

```text id="akvodk"
RPO <= 24h

RTO = same-day target
```

---

# 190. Test — successful dump

Validar:

```text id="j0alj3"
file created

file non-zero

pg_restore list succeeds
```

---

# 191. Test — Restic snapshot

Validar snapshot novo no repository.

---

# 192. Test — remote outage

Simular falha no destino remoto.

Esperado:

```text id="xwtlw3"
Finance runtime remains healthy

backup run reports failure
```

---

# 193. Test — missing storage

Se storage ainda não existe legitimamente:

```text id="nvj1iz"
database backup still succeeds
```

e condição é registrada corretamente.

---

# 194. Test — empty storage

Sucesso válido.

---

# 195. Test — corrupted dump

Validation deverá detectar.

---

# 196. Test — insufficient disk

Routine reports clear failure.

---

# 197. Test — wrong credentials

Falha sem expor segredo em log.

---

# 198. Test — restore database

Restaurar em database temporário.

---

# 199. Test — application validation

Finance API deve conseguir consultar database restaurado.

---

# 200. Test — Book/Account

Validar objetos básicos.

---

# 201. Test — Transactions

Validar quantidade/amostra.

---

# 202. Test — Refund relationship

Validar que Refund continua:

```text id="fqtx1g"
type = income

refund_of_transaction_id != null
```

---

# 203. Test — Summary

Resultados esperados permanecem corretos.

---

# 204. Test — Audit

Histórico preservado.

---

# 205. Test — Idempotency records

Persistidos corretamente.

---

# 206. Test — storage files

Quando existirem, validar amostra/checksum.

---

# 207. Test — backup without n8n

Backup deverá executar normalmente mesmo com n8n offline.

---

# 208. Test — backup without Evolution

Também.

---

# 209. Test — backup without Firefly

Também.

---

# 210. Test — recovery without original VPS

Idealmente o runbook deverá ser suficiente para reconstrução em novo host compatível.

---

# 211. Restore runbook mínimo

Deverá responder:

```text id="30plep"
onde está o backup?

como acessar?

qual snapshot usar?

como recuperar secrets?

como criar database?

como recriar roles?

como restaurar?

como validar?

como promover?
```

---

# 212. Runbook não contém secrets

Apenas instruções/referências seguras.

---

# 213. Recovery prerequisites

Exemplo:

```text id="bo0wu9"
Linux host

Docker

PostgreSQL compatible version

Restic

rclone

Git access

recovery credentials
```

---

# 214. PostgreSQL version compatibility

Restore deverá considerar compatibilidade entre versões.

---

# 215. Major PostgreSQL upgrade

Não fazer junto de restore emergencial sem necessidade.

---

# 216. Restore into compatible PostgreSQL first

Preferível.

---

# 217. Database creation

Criar database vazio antes de `pg_restore`, conforme tooling escolhido.

---

# 218. Role bootstrap

Executar scripts versionados apropriados.

---

# 219. Secrets injection

Fornecer separadamente.

---

# 220. Migration handling after restore

Se backup for de versão anterior:

```text id="biu6ja"
restore
↓
validate
↓
run supported migrations
↓
validate again
```

---

# 221. Não aplicar migration desconhecida automaticamente durante desastre

---

# 222. Restore smoke tests

No mínimo:

```text id="cuzum4"
health

readiness

GET Books

GET Accounts

GET sample Transactions

Summary
```

em ambiente controlado.

---

# 223. Write smoke test

Pode utilizar dados sintéticos no ambiente de restore.

Não necessário tocar Production real para validar.

---

# 224. Restore evidence final

Registrar resultado como:

```text id="bmxi4l"
PASS

FAIL
```

com observações.

---

# 225. Falha de restore

Bloqueia:

```text id="z2fsc8"
REAL DATA READY
```

até corrigida.

---

# 226. Backup Definition of Done V0.1

```text id="5o0nkn"
[ ] finance_hub_prod dump automated

[ ] custom-format dump

[ ] Finance storage handled

[ ] empty/missing storage handled safely

[ ] official backup paths used

[ ] local staging works

[ ] 2–3 recent local dumps retained

[ ] Restic repository configured

[ ] off-site encrypted

[ ] rclone/Drive configured

[ ] daily schedule configured

[ ] RPO <=24h target

[ ] 14 daily retention

[ ] 8 weekly retention

[ ] 12 monthly retention

[ ] weekly repository check

[ ] backup result logged

[ ] failures observable

[ ] recovery secrets outside VPS

[ ] no plaintext Drive dump workflow

[ ] restore runbook documented

[ ] isolated restore completed

[ ] Finance API validated against restored DB

[ ] monthly restore process defined

[ ] pre-migration backup procedure documented
```

---

# 227. Restore Definition of Done

```text id="k5d6gw"
[ ] snapshot selected

[ ] isolated target created

[ ] database restored

[ ] roles/grants recreated if required

[ ] files restored if applicable

[ ] application connects

[ ] Books validated

[ ] Accounts validated

[ ] Transactions validated

[ ] Refund relationships validated

[ ] Audit validated

[ ] Summary validated

[ ] evidence recorded

[ ] Production untouched during test
```

---

# 228. Critical blockers

Bloqueiam uso financeiro real:

```text id="ki85wl"
no off-site backup

unencrypted remote backup

backup procedure consistently failing

recovery password exists only on VPS

no restore runbook

no successful restore test

restore corrupts financial data

backup accidentally includes unrelated shared databases without control
```

---

# 229. Não blockers V0.1

Não impedem release inicial:

```text id="5ee6bh"
no continuous WAL archive

no multi-region replica

no instant failover

no enterprise backup dashboard

no immutable cloud vault
```

desde que baseline congelado esteja funcionando.

---

# 230. Principais consolidações desta v0.3

Esta versão congela:

```text id="jzeyg8"
Finance backup != postgres-products global backup

pg_dump finance_hub_prod

Finance storage backed up separately

official /opt/apps/backups/databases + /files structure

2–3 local dumps

Restic encrypted off-site repository

rclone + Google Drive transport

daily Production backup

RPO <=24h

same-day RTO target

14 daily / 8 weekly / 12 monthly retention

weekly Restic check

monthly isolated restore after go-live

one successful restore before real financial data

roles/grants recreated from versioned bootstrap

no plaintext DB dump on Drive

systemd timer preferred, cron acceptable

n8n not sole backup scheduler
```

---

# 231. Condição para Freeze

Este documento somente poderá mudar de:

```text id="sp5oly"
FREEZE CANDIDATE
```

para:

```text id="1hxtde"
FROZEN — Baseline for Implementation
```

quando a checagem mecânica contra:

```text id="wtv6ef"
FINAL-FREEZE-DECISIONS.md
```

resultar em:

```text id="t8zm2b"
PASS
```

---

# 232. Regra final

Não consideraremos o Finance Intelligence Hub pronto para dados financeiros reais porque:

```text id="1zq30j"
"o container está funcionando"
```

Ele estará pronto somente quando pudermos responder:

```text id="k7jvs4"
se a VPS desaparecer hoje,
conseguimos reconstruir o sistema
e recuperar os dados?
```

com:

```text id="sbr6ep"
SIM
```

baseado em um restore realmente executado.

---

# 233. Objetivo final

A estratégia deverá transformar:

```text id="arkz2t"
VPS perdida
```

de um evento potencialmente catastrófico em:

```text id="fh3awv"
procedimento operacional documentado
↓
restore
↓
validation
↓
Finance Hub available again
```

sem depender da memória humana ou de uma única ferramenta externa.