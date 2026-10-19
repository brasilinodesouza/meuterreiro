# Ativar as contas do MeuTerreiro

O aplicativo usa Supabase Auth para as senhas e sessões, PostgreSQL com RLS para os dados e uma Edge Function para o login por login. Configure o projeto [MeuTerreiro](https://supabase.com/dashboard/project/dwqdhuijokjokvhkbzck) antes de usar contas reais.

## Banco e Auth

1. Execute as migrações na ordem: `001_initial.sql`, `002_finance.sql`, `003_username_auth.sql`, `004_names_registration.sql`, `005_medium_fields_dues_import.sql`, `20261013111959_medium_birth_date.sql`, `20261013112855_medium_sex.sql`. Em um projeto existente, execute somente as ainda não aplicadas.
2. Habilite o provedor Email. Não é preciso desabilitar globalmente a confirmação: o novo cadastro é criado no servidor com identificador interno, sem envio de e-mail ou dependência de SMTP.
3. Em Authentication > configurações de senha, selecione mínimo 6 e nenhuma composição obrigatória. A interface aplica máximo 20 no cadastro, login e redefinição. Supabase Auth tem suas próprias regras para solicitações feitas diretamente à API fora do aplicativo.
4. Configure Site URL e Redirect URLs com os endereços reais do app e `http://localhost:3000` para desenvolvimento. O domínio de produção é `https://meuterreiro.vercel.app`; mantenha também o endereço anterior `https://meuterreiro-teste.mighty-oak-6255.chatgpt.site` enquanto ele estiver em uso.
5. Preencha `.env.local` a partir de `.env.example` com URL e chave pública. Reinicie o servidor local e gere novamente a publicação para incorporar as variáveis `NEXT_PUBLIC_`.

No cadastro, a função recebe somente `name`, `username` e `password`, valida os campos e cria a conta pelo Auth Admin no servidor. O identificador técnico é um UUID aleatório em `@accounts.meuterreiro.invalid`, sem vínculo com o login e sem caixa de e-mail. O nome é gravado em `user_metadata.full_name` e `account_usernames.full_name`. O login é validado por um trigger, convertido para minúsculas e reservado de forma única. Um erro reverte a criação da conta. Não use `user_metadata` para autorizar acesso: as políticas continuam baseadas em `auth.uid()` e no médium responsável da casa. Os identificadores persistidos não podem ser alterados diretamente por visitantes.

Esta migração é para o projeto novo. Contas que já existirem sem login precisam receber um identificador válido e único em `account_usernames`, por intervenção administrativa, antes de usar o login por identificador. Nome e login não são alterados pela interface; as permissões e o vínculo com médium são gerenciados em Configurações após a migração de vínculos.

## Publicar a função de login

Na raiz do repositório, com a CLI oficial do Supabase autenticada na conta do projeto:

```powershell
npx supabase functions deploy username-login --project-ref dwqdhuijokjokvhkbzck
npx supabase secrets set --project-ref dwqdhuijokjokvhkbzck APP_ALLOWED_ORIGINS="http://localhost:3000,https://meuterreiro-teste.mighty-oak-6255.chatgpt.site,https://meuterreiro.vercel.app"
```

A função usa as variáveis automáticas `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, disponíveis no servidor das Edge Functions. A chave administrativa nunca deve ir para `.env.local` com prefixo `NEXT_PUBLIC_`, para o GitHub ou para o navegador.

Para publicar pelo painel, execute `node scripts/bundle-login-function.mjs`, copie `outputs/username-login.index.ts` para o editor da função `username-login` e use a mesma configuração de origens. Os arquivos originais compartilhados continuam sendo a fonte do código. O arquivo gerado fica fora do Git.

O projeto indicado usa as migrações acima, a função de acesso e os dois endereços de retorno. O provedor Email e a confirmação global continuam habilitados; o mínimo já estava em 6. Novos cadastros não recebem e-mail de confirmação. Contas antigas permanecem com o identificador e a senha originais; a migração completa o nome do perfil com o login quando não há nome anterior.

A migração 005 permite omitir função e data de entrada no cadastro, preservando valores antigos. A função `finance_import_dues` só pode ser executada por contas autenticadas e verifica o médium responsável da casa, a correspondência única dos nomes, valores, situações, datas e duplicações. O lote e as entradas correspondentes no caixa são gravados em uma única transação. Uma mensalidade igual já existente é preservada; divergências interrompem todo o lote.

A migração de nascimento adiciona `mediuns.birth_date` como `date` opcional, sem preencher datas nos cadastros existentes. A restrição recusa datas futuras considerando o dia em São Paulo. As políticas de acesso da casa continuam protegendo a leitura e a edição dessa informação.

A migração de sexo adiciona `mediuns.sex`, aceitando somente `masculino`, `feminino` ou ausência de valor em cadastros antigos/importados. O formulário exige nascimento, telefone e escolha de sexo ao cadastrar ou salvar alterações; dados antigos precisam ser completados na edição.

O `config.toml` define `verify_jwt = false` somente para `username-login`, pois o visitante ainda não possui sessão. O handler aceita POST de origens explicitamente autorizadas, valida os campos, limita o tamanho do corpo e aplica limites no banco. Com `action: "register"`, cria a conta e retorna `{registered: true}`. No login, verifica a senha no Supabase Auth e retorna somente os tokens da sessão. Nunca retorna identificador interno, senha ou chave administrativa. As funções SQL de consulta do identificador e limite só são executáveis por `service_role`.

O limite principal é 12 tentativas por login em uma janela de 15 minutos. Há um limite adicional de 60 por IP quando o gateway fornece `x-forwarded-for`. O cadastro tem também um limite global de 60 tentativas por janela, mesmo sem IP, e um bucket separado do login por identificador. As entradas guardam hashes e são removidas quando ficam antigas. A segurança não depende somente de CORS: chamadas diretas também passam pelos limites e pela verificação da senha.

## Alteração de senha em Configurações

Todos os usuários podem alterar a própria senha em Configurações, com nova senha e confirmação (6 a 20 caracteres). A operação usa `auth.updateUser` da própria sessão.

Administradores e responsáveis também encontram **Alterar senha** em cada linha da lista de médiuns do terreiro, incluindo contas de outros administradores e do responsável. Publique a Edge Function `change-user-password` com os arquivos de `supabase/functions/change-user-password` e suas dependências em `_shared`. Ela reutiliza `APP_ALLOWED_ORIGINS` e as variáveis automáticas do Supabase. Não exige nova migração.

O handler valida o JWT no Auth, consulta `terreiro_list_users` com o token do solicitante e exige papel atual de administrador/responsável e conta de destino na mesma casa. Só depois aplica limite por solicitante e altera a senha pela API administrativa do Auth. O cliente recebe apenas confirmação, sem senha, dados da conta ou chave administrativa. `verify_jwt = false` permite a validação própria no handler, como nas demais funções; solicitações sem sessão válida são recusadas.

## Conferir depois da configuração

- Cadastre login com 6 e com 20 caracteres; 5 e 21 devem ser recusados. Repita para senha.
- Cadastre Nome/Login/Senha sem qualquer e-mail; depois entre pelo login, inclusive com maiúsculas.
- Teste logout; após sair, a casa não deve aparecer.
- Tente repetir um login, inclusive variando maiúsculas. Não deve criar duas contas com o mesmo identificador.
- Use duas contas para confirmar que cada uma acessa somente seu terreiro.
- Repetir credenciais erradas deve retornar o mesmo erro para login existente ou ausente; exceder o limite deve bloquear novas tentativas temporariamente.

O modo de demonstração foi removido. Seus dados antigos não são lidos, enviados ao banco ou usados para autenticação.

Como os novos cadastros não têm contato de recuperação, redefinições de senha precisam ser realizadas pela administração do projeto após verificar a pessoa. O fluxo legado de um link de recuperação já emitido continua compatível.
## Vínculos e permissões

A migração `20261014113327_terreiro_memberships.sql` adiciona `terreiro_members` com perfil padrão `usuario`, associação opcional a médium e uma casa por conta. O médium responsável permanece em `terreiros.owner_id`. As RPCs públicas de convites, adesão, listagem, perfil e associação são `SECURITY INVOKER`, com validações em funções do schema privado `private_memberships`. Não há grants de gravação direta nos vínculos, nem acesso público aos convites.

Somente o médium responsável gera convites e altera perfis. Médiuns administradores podem alterar cadastros, financeiro e nome/cidade/estado da casa. O acesso de médiuns se limita à casa, ao próprio vínculo, ao médium associado e às mensalidades dele. Os lembretes existentes são internos à gestão, portanto permanecem acessíveis somente a médiuns administradores e ao médium responsável. O helper financeiro verifica o perfil atual no banco e serializa operações com alterações de permissão. O `owner_id` não pode ser atualizado pelo cliente.

O convite usa um token aleatório no fragmento da URL e expira em 7 dias. O cadastro existente continua recebendo somente nome, login e senha; o vínculo é concluído pelo médium autenticado, sempre como `usuario`. Aceitar o mesmo convite novamente preserva o perfil já atribuído. Gerar novo convite revoga o anterior. A criação de um terreiro próprio é uma escolha separada de uma conta ainda sem vínculo.

### Exclusão definitiva de médiuns

A migração `20261014135336_delete_terreiro_user.sql` acrescenta a RPC `terreiro_delete_user`. O wrapper público é `SECURITY INVOKER`; o helper privado valida uma sessão ativa em `auth.sessions`, exige o médium responsável atual da casa, bloqueia contas de médiuns responsáveis e confirma o vínculo e o login do alvo. O bloqueio da casa serializa a exclusão com mudanças de perfil e associação. Nenhuma chave administrativa vai para o navegador.

A exclusão de sessões e de `auth.users` é atômica. As referências com `ON DELETE CASCADE` removem login, vínculo, identidades, tokens de atualização e inscrições de notificações. Médiuns, mensalidades e financeiro são preservados. Mesmo antes de um JWT antigo expirar, as políticas perdem o vínculo que autorizava o acesso; uma nova conta precisa de novo convite. Se uma referência impedir a exclusão, toda a operação é revertida.

### Edição de mensalidades e forma de pagamento

A migração `20261014142853_due_edit_payment_method.sql` adiciona `mensalidades.payment_method` (`pix`, `dinheiro` ou `null` em pagamentos antigos/importados). Novas confirmações pela interface usam `finance_pay_due_with_method`; a RPC antiga continua compatível com os relatórios sem forma de pagamento. A repetição mantém data/forma originais e não duplica entradas.

As RPCs `finance_update_due` e `finance_delete_due` exigem o médium responsável atual da casa e a correspondência do estado original enviado pelo cliente. Os wrappers públicos são `SECURITY INVOKER`; os helpers ficam em `private_memberships`, com `search_path` vazio e grants restritos. Médiuns administradores podem registrar pagamentos, mas não editar/apagar mensalidades. A trava da casa precede a mensalidade, serializando com pagamentos e alterações de permissão. Edição, transições de situação, exclusão e ajuste da entrada de caixa ocorrem na mesma transação, preservando a consistência mesmo se uma etapa falhar.

### Gerar mensalidades até dezembro

Aplique `20261015105659_dues_until_december.sql`. Em **Gerar mensalidades**, a opção padrão **Até o final do ano** cria mensalidades do mês inicial escolhido até dezembro do mesmo ano. O próximo ano exige uma nova geração explícita; **Somente este mês** mantém a criação avulsa.

O vencimento repete o dia informado para o primeiro mês. Se o dia não existir em algum mês, usa o último dia desse mês, inclusive fevereiro bissexto. A referência e o primeiro vencimento devem pertencer ao mesmo mês na geração anual.

A RPC `finance_create_dues_until_december` é `SECURITY INVOKER`, restrita a `authenticated`, e reutiliza `finance_create_dues`, que verifica a administração atual da casa e trava as gravações. Todos os meses são gerados em uma transação. A restrição única por casa/médium/referência impede duplicatas; registros existentes, pagamentos e caixa são preservados. A resposta informa quantas mensalidades foram criadas e quantas já existiam. Os testes cobrem repetição, isolamento, permissões, fim do ano, vencimentos e reversão integral em caso de falha.

### Avisos automáticos de mensalidade

Após as migrações de aniversários e vínculos, aplique `20261014175430_dues_push_notifications.sql`, publique a Edge Function `dues-notifications` e aplique `20261014175930_dues_push_schedule.sql`. O handler valida o segredo do agendador e, para testes pessoais, o JWT com Supabase Auth; `verify_jwt = false` permite essa autenticação própria. Reutiliza as chaves VAPID e o segredo já mantidos no Vault para os avisos de aniversário, sem expô-los ao cliente.

A configuração começa desativada. Somente administradores e o responsável pela casa têm o painel e podem alterá-la pela RPC `set_dues_notifications`, com verificação e trava da casa no banco. Médiuns não possuem controles de recebimento no aplicativo: o registro pela RPC existente é automático quando há permissão do aparelho. Não podem escrever diretamente na configuração, nem consultar inscrições de outros usuários.

O agendamento envia às 8h de Brasília no vencimento e seis dias depois (vence dia 10 → atraso dia 16), somente para mensalidades pendentes da pessoa associada à conta. Não dispara diariamente nem recupera avisos de dias anteriores. Pagamento, isenção, vínculo, configuração e sessão ativa são rechecados antes de cada envio. Entregas são controladas por inscrição/mensalidade/tipo, com trava de dois minutos e até três tentativas; 8h05 e 8h10 repetem somente falhas. Os testes em `tests/dues-notifications.test.ts` exercitam as permissões, isolamento, datas e cancelamento por pagamento.

O mesmo aparelho pode receber aniversário e mensalidade. Desativar um tipo remove somente sua inscrição no banco. Sair da conta remove os dois tipos nesse aparelho; sessões revogadas também deixam de receber envios. Ao tocar no aviso, o aplicativo abre a lista de mensalidades. Notificações dependem da permissão do aparelho, da conta associada e da entrega do provedor de push.

### Resumo de mensalidades para a administração

Aplique `20261016160751_dues_admin_summary.sql` e publique novamente a função `dues-notifications` junto com os arquivos compartilhados e o frontend. O agendamento existente é mantido. Além dos avisos individuais, responsáveis e administradores que permitirem avisos de mensalidade no aparelho recebem um resumo por casa/dia, às 8h de Brasília, nos dias em que há uma mensalidade pendente vencendo ou completando seis dias de atraso.

O resumo reúne todas as mensalidades pendentes com vencimento até o dia do envio, inclusive de meses anteriores e de médiuns sem conta vinculada. Pagas, isentas e vencimentos futuros ficam fora. O push mostra até cinco nomes, o número de outros médiuns, a quantidade de mensalidades e o total. O clique abre `/?mensalidades=pendentes`, com a lista completa agrupada por médium e os lançamentos detalhados abaixo. A lista consulta a situação atual; pagamentos posteriores ao aviso podem alterar os valores exibidos.

A inscrição é a mesma dos avisos individuais. O painel aparece somente para administradores/responsáveis. Na área do médium, a inscrição é automática; quando necessária, a permissão do navegador é solicitada após uma interação real. Bloqueios do aparelho são respeitados e falhas de conexão podem ser repetidas ao voltar para o aplicativo ou recuperar a rede. A inscrição pendente é cancelada ao desmontar a área do médium ou trocar de conta. A administração recebe o resumo mesmo sem associação a um cadastro de médium. Usuários comuns continuam recebendo somente os próprios avisos.

As RPCs do resumo são invoker e acessíveis somente a `service_role`; os helpers definer ficam no schema privado com `search_path` vazio. Antes do envio são rechecados perfil, casa, configuração, sessão e pendências. O controle de entrega usa aparelho/casa/dia, trava de dois minutos e até três tentativas; os registros antigos são removidos depois de 35 dias. Os testes em `tests/dues-summary.test.ts` verificam permissões, isolamento, resumo atualizado, pagamentos, isenções, vencimentos futuros, cadastros sem conta, repetição, falhas e sessões revogadas.
