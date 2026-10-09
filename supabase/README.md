# Ativar as contas do MeuTerreiro

O aplicativo usa Supabase Auth para as senhas e sessões, PostgreSQL com RLS para os dados e uma Edge Function para o login por nome de usuário. Configure o projeto [MeuTerreiro](https://supabase.com/dashboard/project/dwqdhuijokjokvhkbzck) antes de usar contas reais.

## Banco e Auth

1. Execute as quatro migrações na ordem: `001_initial.sql`, `002_finance.sql`, `003_username_auth.sql`, `004_names_registration.sql`.
2. Habilite o provedor Email. Não é preciso desabilitar globalmente a confirmação: o novo cadastro é criado no servidor com identificador interno, sem envio de e-mail ou dependência de SMTP.
3. Em Authentication > configurações de senha, selecione mínimo 6 e nenhuma composição obrigatória. A interface aplica máximo 20 no cadastro, login e redefinição. Supabase Auth tem suas próprias regras para solicitações feitas diretamente à API fora do aplicativo.
4. Configure Site URL e Redirect URLs com os endereços reais do app e `http://localhost:3000` para desenvolvimento. O domínio de produção é `https://meuterreiro.vercel.app`; mantenha também o endereço anterior `https://meuterreiro-teste.mighty-oak-6255.chatgpt.site` enquanto ele estiver em uso.
5. Preencha `.env.local` a partir de `.env.example` com URL e chave pública. Reinicie o servidor local e gere novamente a publicação para incorporar as variáveis `NEXT_PUBLIC_`.

No cadastro, a função recebe somente `name`, `username` e `password`, valida os campos e cria a conta pelo Auth Admin no servidor. O identificador técnico é um UUID aleatório em `@accounts.meuterreiro.invalid`, sem vínculo com o login e sem caixa de e-mail. O nome é gravado em `user_metadata.full_name` e `account_usernames.full_name`. O login é validado por um trigger, convertido para minúsculas e reservado de forma única. Um erro reverte a criação da conta. Não use `user_metadata` para autorizar acesso: as políticas continuam baseadas em `auth.uid()` e no responsável da casa. Os identificadores persistidos não podem ser alterados diretamente por visitantes.

Esta migração é para o projeto novo. Contas que já existirem sem usuário precisam receber um identificador válido e único em `account_usernames`, por intervenção administrativa, antes de usar o login por usuário. Não há alteração de usuários pela interface nesta etapa.

## Publicar a função de login

Na raiz do repositório, com a CLI oficial do Supabase autenticada na conta do projeto:

```powershell
npx supabase functions deploy username-login --project-ref dwqdhuijokjokvhkbzck
npx supabase secrets set --project-ref dwqdhuijokjokvhkbzck APP_ALLOWED_ORIGINS="http://localhost:3000,https://meuterreiro-teste.mighty-oak-6255.chatgpt.site,https://meuterreiro.vercel.app"
```

A função usa as variáveis automáticas `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, disponíveis no servidor das Edge Functions. A chave administrativa nunca deve ir para `.env.local` com prefixo `NEXT_PUBLIC_`, para o GitHub ou para o navegador.

Para publicar pelo painel, execute `node scripts/bundle-login-function.mjs`, copie `outputs/username-login.index.ts` para o editor da função `username-login` e use a mesma configuração de origens. Os arquivos originais compartilhados continuam sendo a fonte do código. O arquivo gerado fica fora do Git.

O projeto indicado já recebeu as quatro migrações, a função de acesso e os dois endereços de retorno. O provedor Email e a confirmação global continuam habilitados; o mínimo já estava em 6. Novos cadastros não recebem e-mail de confirmação. Contas antigas permanecem com o identificador e a senha originais; a migração completa o nome do perfil com o login quando não há nome anterior.

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
