# M06 — Evidências de verificação real do laboratório (2026-10-29)

**Estado desta evidência:** ACCEPTED FOR LAB by project owner on 2026-10-29 — os resultados foram reportados pelo operador e confrontados com saídas de terminal e capturas fornecidas na conversa. O aceite é técnico/funcional da M06 no Lab, **não** aprovação formal do Gate 0, homologação de Produção ou garantia de entrega exatamente uma vez. Nenhum segredo, JID, número de telefone ou payload sensível deve ser anexado ao Git.

## Escopo, versões e controle

- Repositório: `oleoceo/finance-intelligence-hub`; baseline código `main` `e43d63cfda4d6e0685dc0260c0ac419a3304909b` após PR #40.
- CI pós-merge PR #40: run `40931394789` — SUCCESS. Correção LID foi revisada e integrada; suíte CI do head passou 1.023 unitários, 453 integrações PostgreSQL e regressões M06/n8n.
- Laboratório em VPS compartilhada: Evolution API 2.3.7 (imagem corrigida contra logging pelo PR #39), n8n 2.23.3 com extensão privada Finance Lab Transport atualizada para PR #40, Finance API e PostgreSQL `finance_hub_lab`. Instância Baileys dedicada `finance-hub-lab`.
- Operações foram limitadas à instância e dados de laboratório; serviços compartilhados não foram recriados durante a bateria final. As evidências derivam dos resultados apresentados pelo operador, **não** de execução remota independente pelo autor deste registro.
- Credenciais distintas para origem `x-finance-webhook`, `finance:ingest` e token da instância. A investigação encontrou divergência entre valores Evolution/n8n; valores foram sincronizados; teste posterior autenticado retornou HTTP 200, enquanto ausente/incorreto retornou 403.
- Backup pós-migração existente foi restaurado num banco isolado temporário: `M06 RESTORE PASS`. Cinco migrações e cinco tabelas essenciais verificadas; banco de produção do Lab preservado. Não houve novo backup criado para essa verificação.
- Patch de logging no bundle Evolution instalado: `M06 PATCH DE LOGGING CONFIRMADO`. O canário textual de teste não foi localizado nos logs consultados da Evolution. **Limite:** busca de um texto nos logs e verificação estática não demonstram ausência total de vazamentos em todos os sinks e rotas.

## Prova funcional real — Evolution → n8n → Finance → PostgreSQL → WhatsApp

Remetente de teste autorizado com defaults **Empresa / Nubank**, verificado por comparação com JID telefônico alternativo de evento LID. O primeiro diagnóstico de cadastro "NAO" foi um falso negativo do script; a conferência posterior comprovou cadastro existente e ativo (`M06 REMETENTE AUTORIZADO PASS`).

| Mensagem enviada pelo WhatsApp de teste | Efeito comprovado no PostgreSQL | Resposta no WhatsApp |
| --- | --- | --- |
| `35 almoço nubank` | `processed`, despesa `35.00` BRL, Empresa/Nubank, `posted` | Confirmação e referência correspondente |
| `empresa 327,40 google ads inter` | `processed`, despesa `327.40` BRL, Empresa/Nubank, `posted` | Confirmação e referência correspondente |
| `recebi 2500 cliente empresa inter` | `processed`, receita `2500.00` BRL, Empresa/Nubank, `posted` | Confirmação e referência correspondente |
| `transferi 500 nubank para inter` | `processed`, transferência `500.00` BRL, Empresa/Nubank → Empresa/Inter, `posted` | Confirmação e referência correspondente |
| `último` | `processed`, nenhuma transação adicional | Retornou a última transferência de `500.00` e a mesma referência |

**Observado:** exatamente cinco InboxMessages `processed` e quatro Transactions `posted`. As quatro referências no WhatsApp coincidiram com as persistidas no banco. Os textos finais "nubank"/"inter" em despesas/receitas foram tratados como descrição e as contas vieram dos defaults; o transporte não classificou valores ou contas. Nenhum lançamento adicional foi criado por `último`.

**LID real:** a primeira mensagem chegou à Evolution como `remoteJid=@lid`, `addressingMode=lid`, com `remoteJidAlt` telefônico. Após PR #40, `mapEvolution` aceitou a identidade normalizada; o fluxo real gerou a despesa e a confirmação. Isso demonstra compatibilidade com a variante observada, não valida genericamente todas as variantes de LID.

## Segurança/idempotência — evidências em ambiente ativo

Resultados fornecidos pelo operador:

- `M06 AUTH PASS`: webhook rejeitou cabeçalhos ausente e incorreto (403); credencial correta foi aceita (200); mesmo credential ID usado pelos dois nós; segredo da Evolution sincronizado ao efetivamente armazenado no n8n.
- Evento JSON vazio autenticado: HTTP 200 com `stage=rejected`, sem criação financeira.
- `M06 SEGURANCA E IDEMPOTENCIA BASICA PASS`: replay à Finance API da identidade previamente processada retornou `duplicate_message`, `reply.should_send=false`; nenhuma nova Inbox ou Transaction.
- `M06 NEGATIVOS LIVE PASS`: replay sintético autenticado via webhook n8n/Finance com a identidade da primeira mensagem processada retornou `accepted_no_reply` (sem segundo envio). Outra instância, UUID divergente, remetente externo divergente, `fromMe`, grupo, JID LID alternativo conflitante e metadado de identidade inesperado retornaram `stage=rejected`. A API Finance rejeitou remetente sintético não autorizado com HTTP 403.
- Pós-bateria: contagem inalterada de **5 InboxMessages e 4 Transactions**. As verificações negativas exercitaram o webhook HTTP ativo com eventos **sintéticos**; não foram tentativas de manipulação do tráfego real do WhatsApp.
- A identidade considerada autenticada permanece dependente da segurança da credencial de origem e dos metadados reportados pela Evolution/Baileys. A igualdade entre JIDs após normalização não é verificação independente de propriedade do número.

## Itens não demonstrados ao vivo / decisão de aceite

- **Somente em suíte automatizada/simulação:** perda da resposta HTTP da Finance após commit; falhas `500/503/429` e timeouts; indisponibilidade/timeout de envio pela Evolution; entrega ambígua de resposta; ausência de duplicação financeira sob essas falhas. Não provocar falhas em serviços compartilhados apenas para produzir evidência.
- **Sem execução real nesta rodada:** fluxos de esclarecimento/seleção Book/Account e consulta `último` para livro vazio; têm cobertura no P05 local. Tampouco há teste real de redelivery espontâneo do provedor; o replay via webhook foi sintético.
- **Gate 0:** existe evidência operacional de isolamento, redes, papéis, restauração, autenticação, versão e rollout, porém a decisão formal `Gate 0 PASS` ainda não foi registrada no ledger. Esta documentação não altera retroativamente permissões de implantação.
- **Gate B/C:** não pertencem ao encerramento da M06; permanecem nas dependências futuras do roadmap.
- **Formalização:** o proprietário expressou aceite técnico do Lab e autorização para fechar a M06 em 2026-10-29; a documentação e as tasks são encerradas neste PR. **Gate 0 segue sem PASS formal** e permanece um bloqueio explícito para alegar prontidão de produção ou liberar novas mudanças operacionais fora do escopo autorizado. **Não** marcar lacunas simuladas como `LIVE PASS` ou prometer notificação exatamente uma vez.

## Segurança operacional após testes

A instância `finance-hub-lab` e o workflow podem continuar disponíveis para testes autorizados; fora de uma janela de teste, a recomendação é desabilitar `Operational Release` e publicar, além de desativar apenas o webhook da instância Lab, sem tocar nos serviços compartilhados. Não apagar mensagens, sessões ou histórico financeiro.

**Conclusão técnica:** os cinco casos funcionais e os negativos listados passam no Lab real. **Estado de governança:** `M06 DONE — TECHNICAL LAB ACCEPTED (2026-10-29); GATE 0 FORMAL PASS PENDING; NOT PRODUCTION ACCEPTED`. Falhas e ambiguidades reais de transporte, fluxos de esclarecimento e Last vazio permanecem apenas simulados. Não extrapolar essa evidência para prontidão de Produção.
