# Ativar as contas do MeuTerreiro

O aplicativo usa Supabase Auth para as senhas e sessões, PostgreSQL com RLS para os dados e uma Edge Function para o login por nome de usuário. Configure o projeto [MeuTerreiro](https://supabase.com/dashboard/project/dwqdhuijokjokvhkbzck) antes de usar contas reais.

## Banco e Auth

1. Execute as migrações na ordem: `001_initial.sql`, `002_finance.sql`, `003_username_auth.sql`, `004_names_registration.sql`, `005_medium_fields_dues_import.sql`, `20261013111959_medium_birth_date.sql`, `20261013112855_medium_sex.sql`. Em um projeto existente, execute somente as ainda não aplicadas.
2. Habilite o provedor Email. Não é preciso desabilitar globalmente a confirmação: o novo cadastro é criado no servidor com identificador interno, sem envio de e-mail ou dependência de SMTP.
3. Em Authentication > configurações de senha, selecione mínimo 6 e nenhuma composição obrigatória. A interface aplica máximo 20 no cadastro, login e redefinição. Supabase Auth tem suas próprias regras para solicitações feitas diretamente à API fora do aplicativo.
4. Configure Site URL e Redirect URLs com os endereços reais do app e `http://localhost:3000` para desenvolvimento. O domínio de produção é `https://meuterreiro.vercel.app`; mantenha também o endereço anterior `https://meuterreiro-teste.mighty-oak-6255.chatgpt.site` enquanto ele estiver em uso.
5. Preencha `.env.local` a partir de `.env.example` com URL e chave pública. Reinicie o servidor local e gere novamente a publicação para incorporar as variáveis `NEXT_PUBLIC_`.

No cadastro, a função recebe somente `name`, `username` e `password`, valida os campos e cria a conta pelo Auth Admin no servidor. O identificador técnico é um UUID aleatório em `@accounts.meuterreiro.invalid`, sem vínculo com o login e sem caixa de e-mail. O nome é gravado em `user_metadata.full_name` e `account_usernames.full_name`. O login é validado por um trigger, convertido para minúsculas e reservado de forma única. Um erro reverte a criação da conta. Não use `user_metadata` para autorizar acesso: as políticas continuam baseadas em `auth.uid()` e no responsável da casa. Os identificadores persistidos não podem ser alterados diretamente por visitantes.

Esta migração é para o projeto novo. Contas que já existirem sem usuário precisam receber um identificador válido e único em `account_usernames`, por intervenção administrativa, antes de usar o login por usuário. Nome e login não são alterados pela interface; as permissões e o vínculo com médium são gerenciados em Configurações após a migração de vínculos.

## Publicar a função de login

Na raiz do repositório, com a CLI oficial do Supabase autenticada na conta do projeto:

```powershell
npx supabase functions deploy username-login --project-ref dwqdhuijokjokvhkbzck
npx supabase secrets set --project-ref dwqdhuijokjokvhkbzck APP_ALLOWED_ORIGINS="http://localhost:3000,https://meuterreiro-teste.mighty-oak-6255.chatgpt.site,https://meuterreiro.vercel.app"
```

A função usa as variáveis automáticas `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, disponíveis no servidor das Edge Functions. A chave administrativa nunca deve ir para `.env.local` com prefixo `NEXT_PUBLIC_`, para o GitHub ou para o navegador.

Para publicar pelo painel, execute `node scripts/bundle-login-function.mjs`, copie `outputs/username-login.index.ts` para o editor da função `username-login` e use a mesma configuração de origens. Os arquivos originais compartilhados continuam sendo a fonte do código. O arquivo gerado fica fora do Git.

O projeto indicado usa as migrações acima, a função de acesso e os dois endereços de retorno. O provedor Email e a confirmação global continuam habilitados; o mínimo já estava em 6. Novos cadastros não recebem e-mail de confirmação. Contas antigas permanecem com o identificador e a senha originais; a migração completa o nome do perfil com o login quando não há nome anterior.

A migração 005 permite omitir função e data de entrada no cadastro, preservando valores antigos. A função `finance_import_dues` só pode ser executada por contas autenticadas e verifica o responsável da casa, a correspondência única dos nomes, valores, situações, datas e duplicações. O lote e as entradas correspondentes no caixa são gravados em uma única transação. Uma mensalidade igual já existente é preservada; divergências interrompem todo o lote.

A migração de nascimento adiciona `mediuns.birth_date` como `date` opcional, sem preencher datas nos cadastros existentes. A restrição recusa datas futuras considerando o dia em São Paulo. As políticas de acesso da casa continuam protegendo a leitura e a edição dessa informação.

A migração de sexo adiciona `mediuns.sex`, aceitando somente `masculino`, `feminino` ou ausência de valor em cadastros antigos/importados. O formulário exige nascimento, telefone e escolha de sexo ao cadastrar ou salvar alterações; dados antigos precisam ser completados na edição.

O `config.toml` define `verify_jwt = false` somente para `username-login`, pois o visitante ainda não possui sessão. O handler aceita POST de origens explicitamente autorizadas, valida os campos, limita o tamanho do corpo e aplica limites no banco. Com `action: "register"`, cria a conta e retorna `{registered: true}`. No login, verifica a senha no Supabase Auth e retorna somente os tokens da sessão. Nunca retorna identificador interno, senha ou chave administrativa. As funções SQL de consulta do identificador e limite só são executáveis por `service_role`.

O limite principal é 12 tentativas por usuário em uma janela de 15 minutos. Há um limite adicional de 60 por IP quando o gateway fornece `x-forwarded-for`. O cadastro tem também um limite global de 60 tentativas por janela, mesmo sem IP, e um bucket separado do login por usuário. As entradas guardam hashes e são removidas quando ficam antigas. A segurança não depende somente de CORS: chamadas diretas também passam pelos limites e pela verificação da senha.

## Conferir depois da configuração

- Cadastre usuário com 6 e com 20 caracteres; 5 e 21 devem ser recusados. Repita para senha.
- Cadastre Nome/Login/Senha sem qualquer e-mail; depois entre pelo login, inclusive com maiúsculas.
- Teste logout; após sair, a casa não deve aparecer.
- Tente repetir um usuário, inclusive variando maiúsculas. Não deve criar duas contas com o mesmo identificador.
- Use duas contas para confirmar que cada uma acessa somente seu terreiro.
- Repetir credenciais erradas deve retornar o mesmo erro para usuário existente ou ausente; exceder o limite deve bloquear novas tentativas temporariamente.

O modo de demonstração foi removido. Seus dados antigos não são lidos, enviados ao banco ou usados para autenticação.

Como os novos cadastros não têm contato de recuperação, redefinições de senha precisam ser realizadas pela administração do projeto após verificar a pessoa. O fluxo legado de um link de recuperação já emitido continua compatível.
## Vínculos e permissões

A migração `20261014113327_terreiro_memberships.sql` adiciona `terreiro_members` com perfil padrão `usuario`, associação opcional a médium e uma casa por conta. O responsável permanece em `terreiros.owner_id`. As RPCs públicas de convites, adesão, listagem, perfil e associação são `SECURITY INVOKER`, com validações em funções do schema privado `private_memberships`. Não há grants de gravação direta nos vínculos, nem acesso público aos convites.

Somente o responsável gera convites e altera perfis. Administradores podem alterar cadastros, financeiro e nome/cidade/estado da casa. O acesso de usuários se limita à casa, ao próprio vínculo, ao médium associado e às mensalidades dele. Os lembretes existentes são internos à gestão, portanto permanecem acessíveis somente a administradores e ao responsável. O helper financeiro verifica o perfil atual no banco e serializa operações com alterações de permissão. O `owner_id` não pode ser atualizado pelo cliente.

O convite usa um token aleatório no fragmento da URL e expira em 7 dias. O cadastro existente continua recebendo somente nome, login e senha; o vínculo é concluído pelo usuário autenticado, sempre como `usuario`. Aceitar o mesmo convite novamente preserva o perfil já atribuído. Gerar novo convite revoga o anterior. A criação de um terreiro próprio é uma escolha separada de uma conta ainda sem vínculo.

### Exclusão definitiva de usuários

A migração `20261014135336_delete_terreiro_user.sql` acrescenta a RPC `terreiro_delete_user`. O wrapper público é `SECURITY INVOKER`; o helper privado valida uma sessão ativa em `auth.sessions`, exige o responsável atual da casa, bloqueia contas de responsáveis e confirma o vínculo e o login do alvo. O bloqueio da casa serializa a exclusão com mudanças de perfil e associação. Nenhuma chave administrativa vai para o navegador.

A exclusão de sessões e de `auth.users` é atômica. As referências com `ON DELETE CASCADE` removem login, vínculo, identidades, tokens de atualização e inscrições de notificações. Médiuns, mensalidades e financeiro são preservados. Mesmo antes de um JWT antigo expirar, as políticas perdem o vínculo que autorizava o acesso; uma nova conta precisa de novo convite. Se uma referência impedir a exclusão, toda a operação é revertida.
