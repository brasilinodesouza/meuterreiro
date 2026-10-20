# Revisão de segurança e pendências — 20/10/2026

Repositório: MeuTerreiro, base `4352bdf`. Projeto Supabase consultado: `dwqdhuijokjokvhkbzck`.

Foram revisados código, testes, dependências instaladas, migrações, permissões do banco, funções publicadas e agendamentos. Após autorização, a função de troca de senha foi publicada como versão 2 e o histórico de migrações foi reconciliado. Não foram alteradas senhas, contas nem registros da casa. Os cabeçalhos foram publicados e conferidos por HTTP no domínio real. A proteção da tela foi registrada no commit `e7d26667` e a mensagem de autorização no commit `5eed1084`.

## Resultado prioritário

| Prioridade | Achado | Situação e ação necessária |
| --- | --- | --- |
| Alta | Administrador podia redefinir a senha do responsável, entrar nessa conta e obter permissões exclusivas dela. | Corrigido no serviço remoto: `change-user-password` versão 2 está ativa, com todos os arquivos conferidos contra o código testado. A tela e a mensagem de autorização também foram corrigidas e publicadas no repositório. |
| Alta | Next.js instalado e travado no lockfile em 16.4.0, anterior à correção de segurança 16.4.1 de 14/10/2026. | Atualização tentada, mas bloqueada por `ENOTFOUND registry.npmjs.org`. Atualizar com o npm, validar e publicar; não foi alterado manualmente o lockfile para simular uma instalação. |
| Média | Faltavam cabeçalhos para impedir enquadramento externo, restringir interpretação de conteúdo e envio de referência para outros sites. | Publicados em `next.config.ts` e confirmados na resposta HTTP 200 de produção. A CSP cobre `frame-ancestors`, `object-src`, `base-uri` e `form-action`; não é uma política completa de bloqueio de scripts/XSS. Exportações estáticas precisam dos mesmos cabeçalhos no serviço de hospedagem. |
| Operacional | Histórico remoto de migrações tinha versões diferentes dos arquivos locais e não registrava as quatro migrações iniciais. | Corrigido: 24 versões e hashes normalizados conferidos no banco real. Somente metadados foram ajustados; as migrações não foram reaplicadas. |
| Configuração | Proteção do Supabase contra senhas vazadas desativada. | O projeto está em organização Free; o recurso nativo exige Pro ou superior. Nenhuma mudança de plano foi feita. |

O aviso oficial do Next.js inclui execução remota em cenários específicos de Cache Components e otimização de SVG, além de negação de serviço em Server Actions. Não foram encontrados usos de `use cache`, Server Actions ou `next/image` no código atual; `sharp` instalado já é 0.35.5. Isso reduz a exposição aos caminhos descritos, mas não substitui a atualização recomendada pelo fornecedor.

## Correções realizadas

- Regra de redefinição compartilhada entre servidor e interface: administrador pode atender somente `usuario`; responsável pode atender `usuario` e `administrador`. Ninguém redefine a senha do responsável pela API administrativa do aplicativo. A troca da própria senha continua disponível pela sessão da própria conta.
- Papéis ausentes ou desconhecidos são recusados antes de usar a chave administrativa. Testes comprovam que tentativas de tomar a conta do responsável ou de outro administrador não chegam à chamada de alteração no Auth.
- Cabeçalhos `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` e CSP básica em todas as rotas. Removido `X-Powered-By`. Preservado `no-store` do service worker e do arquivo de versão.
- Requisito mínimo de Node.js corrigido para 22 em `package.json`, lockfile e README, compatível com `@supabase/supabase-js` 2.117.3. Ambiente de validação: Node.js 24.13.0.
- Documentação atualizada: convites e permissões já estão entregues; a auditoria antiga não pode atestar a segurança das dependências atuais; todas as funções com validação própria estão descritas corretamente.

## Banco e notificações

- Todas as 15 tabelas públicas consultadas têm RLS habilitado e negam leitura ao papel `anon`.
- As funções de resolução de login, limite de tentativas e configuração privada dos pushes não são executáveis por `anon` nem `authenticated`.
- As seis funções financeiras destacadas pelo Advisor são `SECURITY DEFINER` públicas, com `search_path` vazio, execução negada a visitantes e validação administrativa por casa via `_finance_lock_house`/`private_memberships.lock_house`. Não foi confirmado acesso indevido nessas funções. Permanecem como melhoria de arquitetura: mover a implementação privilegiada para schema privado com wrappers `SECURITY INVOKER`, seguindo o padrão das funções novas.
- Os seis avisos informativos de RLS sem políticas pertencem a tabelas privadas de convites/entregas, sem permissões de leitura para visitantes ou usuários. A ausência de políticas mantém acesso negado; não adicionar políticas permissivas para eliminar o aviso. `private_auth.login_limits` também não é legível pelos dois papéis, embora não tenha RLS.
- As seis Edge Functions esperadas estão ativas: login, troca de senha e notificações de aniversários, mensalidades, calendário e eventos. Os agendamentos dos quatro tipos de aviso estão ativos.
- Na janela consultada de dois dias, os registros de execução do cron retornaram sucesso. O histórico HTTP disponível tinha 126 respostas 200 e um 502 do gateway em 20/10/2026 às 08:22 de Brasília. Sucesso do cron ou HTTP não comprova recebimento no aparelho; não foram enviados avisos nem realizadas trocas reais de senha durante a revisão.
- As migrações recentes de eventos, presenças, calendário e notificações constam no histórico remoto pelos respectivos nomes. Diferença de versão de arquivo não foi tratada como ausência da funcionalidade.

### Exemplos de divergências corrigidas no histórico

| Migração | Versão local | Versão remota |
| --- | --- | --- |
| medium_fields_dues_import | 005 | 20261012164851 |
| terreiro_memberships | 20261014113327 | 20261014115038 |
| orixa_calendar | 20261019195740 | 20261019200257 |
| orixa_push_notifications | 20261019195746 | 20261019200352 |
| event_push_notifications | 20261019205531 | 20261020105622 |
| event_push_schedule | 20261019205537 | 20261020105702 |

Na aplicação, todas as versões remotas acima passaram a corresponder às versões locais. A migração `dues_admin_summary` tinha delimitadores `$$` registrados como `$` no histórico; o texto armazenado foi corrigido, sem executar novamente seu SQL. A presença dos objetos das quatro migrações iniciais foi conferida antes de registrar essa baseline. O reparo usa trava, validação dos hashes de todo o lote e transação; registros desconhecidos ou conteúdo divergente abortam a operação. O gerador está em `scripts/reconcile-migration-history.mjs`, com o snapshot usado na conferência e testes de reversão e idempotência.

O GitHub teve o grafo de dependências e os alertas do Dependabot habilitados. Atualizações automáticas de código não foram habilitadas. A configuração foi conferida pela sessão web existente.

## Validação

| Verificação | Resultado |
| --- | --- |
| Suíte inicial | 155 testes aprovados |
| Suíte após as correções e o reparo de histórico | 162 testes aprovados, zero falhas |
| Reparo do histórico de migrações | 4 testes aprovados, incluindo reversão integral e repetição sem alterações adicionais |
| Conferência após aplicação no Supabase | 24 versões e hashes correspondem aos arquivos locais; função de troca de senha v2 ativa e código publicado idêntico ao testado |
| ESLint | Aprovado |
| TypeScript | Aprovado |
| Build de produção | Aprovado com Next.js 16.4.0; não comprova correção das vulnerabilidades da dependência |
| Verificação HTTP | Teste local bloqueado por `EACCES`. Consulta pública à produção retornou HTTP 200, os cinco cabeçalhos esperados e ausência de `X-Powered-By` |
| Busca de padrões de chaves privadas, tokens administrativos GitHub e JWT `service_role` no código versionado | Nenhuma ocorrência encontrada; varredura limitada a padrões conhecidos |
| Variáveis públicas dos arquivos locais de ambiente | Nenhuma chave `sb_secret_` ou JWT `service_role` identificada |
| `npm audit` atual | Inconclusivo: registro npm indisponível por DNS |
| Instalação do Next.js 16.4.1 | Bloqueada pelo mesmo problema de rede; dependências permanecem em 16.4.0 |

Testes de autorização e transações SQL usam PostgreSQL local via PGlite. Chamadas de alteração de senha são simuladas para não modificar contas reais. A revisão não incluiu teste autenticado de ponta a ponta em produção nem auditoria de todas as versões históricas do Git.

## Pendências funcionais já documentadas

- Backup automático e restauração. A exportação JSON existente é manual; não equivale a um procedimento de recuperação testado. O estado dos backups gerenciados do provedor não foi verificado nesta revisão.
- Estornos e correções com trilha de auditoria; as mensalidades já permitem ajustes pelo responsável, mas não há histórico completo de alterações.
- Notificações dos lembretes de compras.
- Operação offline e papel exclusivo de tesoureiro.

## Próxima publicação

1. Com acesso ao registro npm, executar `npm install next@16.4.1 eslint-config-next@16.4.1 --save-exact`, revisar o lockfile e executar `npm audit`, lint, typecheck, testes e build.
2. A função `change-user-password` já foi publicada como versão 2 incluindo `_shared/credentials.ts`, `_shared/change-user-password.ts` e `_shared/password-permissions.ts`. A correção está ativa no servidor.
3. Os cabeçalhos já estão publicados e conferidos no domínio real; as alterações da tela estão no repositório. A proteção de autorização também está ativa na função remota, independentemente da versão da tela em cache.
4. O histórico das migrações já foi reconciliado e validado. Não reaplicar os scripts existentes; as 24 migrações locais já constam no histórico remoto.

## Referências

- [Next.js: atualização de segurança de 14/10/2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
- [Supabase: proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Supabase: funções SECURITY DEFINER acessíveis a usuários](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Supabase: RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase: funções de banco e permissões](https://supabase.com/docs/guides/database/functions)
