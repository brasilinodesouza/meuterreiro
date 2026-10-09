# MeuTerreiro

Primeira etapa do sistema de gestão: Next.js, React, TypeScript e Supabase.

## O que funciona

- Interface responsiva e acesso exclusivo com conta autenticada.
- Login com usuário e senha, ambos com mínimo de 6 e máximo de 20 caracteres.
- Botão Cadastrar-se na tela inicial; cadastro com usuário, e-mail, senha e confirmação.
- Com Supabase configurado: confirmação de e-mail, sair da conta e recuperação de senha.
- Cadastrar e editar um terreiro por responsável.
- Cadastrar e editar médiuns, consultar perfil, buscar pelo nome e filtrar por situação.
- Mensalidades individuais ou para todos os médiuns ativos; referência, vencimento, isenção e recebimento.
- Caixa com entradas, saídas, saldo acumulado e filtro por mês.
- Gastos realizados com descrição, categoria, data e valor; cada gasto gera uma saída no caixa.
- Lembretes de compras: marcar a caixa abre a confirmação do valor e data. Confirmar conclui o lembrete, gera o gasto e a saída no caixa, e abre o menu Gastos. Cancelar mantém o lembrete pendente.
- Exportar todos os registros em JSON (cópia manual; sem restauração nesta etapa).
- Regras no banco para cada responsável acessar apenas sua casa.

Há instalação PWA com ícone e página de aviso sem conexão; ainda não há operação offline, convites, contas de tesoureiros ou backup automático. O modo de demonstração foi removido, inclusive os cadastros fictícios e a persistência local de cadastros/financeiro. Dados antigos da demonstração não são lidos nem importados. Lembretes são uma lista de tarefas, sem notificações automáticas nesta etapa. Lançamentos confirmados não são editados nem excluídos nesta versão; estornos e correções com histórico serão uma próxima entrega.

O projeto Supabase `dwqdhuijokjokvhkbzck` está conectado neste ambiente; as três migrações e a Edge Function foram aplicadas. Em uma cópia nova do repositório, configure `.env.local` antes de entrar: sem as variáveis, o envio fica desabilitado. Não há cadastro local nem senha guardada pelo aplicativo.

## Instalar no celular

Prévia privada publicada: https://meuterreiro-teste.mighty-oak-6255.chatgpt.site

Abra a prévia HTTPS no Chrome do Android. Entre com a mesma conta ChatGPT se a prévia privada pedir acesso e toque em “Instalar MeuTerreiro”. O acesso privado do site é separado da conta do MeuTerreiro. Também pode usar o menu do Chrome > Instalar aplicativo / Adicionar à tela inicial. No iPhone, use Safari > Compartilhar > Adicionar à Tela de Início.

HTTP por IP da rede local permite visualizar o site, mas não é suficiente para a instalação PWA completa. A instalação depende de HTTPS confiável. O ícone não torna o aplicativo offline: o service worker só guarda a página de aviso sem conexão, sem cadastros ou respostas do banco.

A exportação estática é gerada com `MEUTERREIRO_STATIC_PREVIEW=1 npm run build`. No PowerShell, defina `$env:MEUTERREIRO_STATIC_PREVIEW='1'` antes de `npm run build`. A prévia hospedada fica em `sites/meuterreiro-preview`, separada do projeto principal. A chave administrativa só existe na Edge Function do Supabase; nunca entra na exportação estática.

## Executar

Requer Node.js 20.9 ou superior.

```powershell
npm install
npm run dev
```

Abra http://localhost:3000. Sem Supabase configurado, apenas as telas de acesso ficam disponíveis.

## Conectar o banco e o acesso

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/001_initial.sql`, `002_finance.sql` e `003_username_auth.sql`, nessa ordem. Execute somente as migrações ainda não aplicadas.
3. Copie `.env.example` para `.env.local` e preencha a URL e a chave **publishable** do projeto. Não use `service_role` nem secret key no navegador.
4. Em Authentication > URL Configuration, defina Site URL como `http://localhost:3000` e permita esse endereço em Redirect URLs. Na publicação, substitua pelo domínio real e adicione-o aos redirecionamentos.
5. Mantenha o provedor Email e a confirmação de e-mail habilitados. Configure o mínimo da senha como 6, sem exigências adicionais de composição, para aceitar a regra solicitada. Configure SMTP para uso real.
6. Publique a Edge Function `username-login` e configure `APP_ALLOWED_ORIGINS`. Veja os passos em [supabase/README.md](supabase/README.md).
7. Reinicie `npm run dev` (ou gere uma nova publicação após definir as variáveis públicas), cadastre a conta, confirme o e-mail e entre com usuário/senha. Depois cadastre sua casa.

O login por usuário é resolvido na Edge Function, sem expor a lista de usuários ou seus e-mails ao navegador. O Supabase Auth verifica a senha e gerencia a sessão. Usuários são únicos e não diferenciam maiúsculas de minúsculas; senhas preservam maiúsculas e espaços. Limites de 6–20 são validados na interface e no handler de login. O cadastro e a redefinição também validam esses limites antes de chamar o Auth. O serviço mantém limites de tentativas de login no banco.

A autorização efetiva acontece no Supabase por RLS, não apenas pela interface. As políticas não concedem exclusão de cadastros. Use a situação “Desligado” para manter o histórico. Financeiro usa funções de banco que verificam a casa e registram gasto/recebimento/caixa em uma única transação. A repetição de um pagamento ou da conclusão de um lembrete não duplica o caixa. O administrador da infraestrutura Supabase continua tendo acesso administrativo ao banco; isso é diferente do administrador de um terreiro.

## Verificações

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

As três migrações foram verificadas em PostgreSQL local de teste com PGlite, incluindo isolamento entre casas, prevenção de duplicação, reversão da operação quando o caixa falha, unicidade e privacidade de usuários e limites do login. O handler de login foi testado com serviços simulados, incluindo resposta sem e-mails/chaves e erros sem revelar se a conta existe. As migrações foram aplicadas no Supabase real, a função foi publicada e seu retorno de credenciais inválidas foi verificado. A criação da primeira conta e do identificador de usuário foi confirmada no banco. Confirmação por e-mail, login válido e recuperação ainda aguardam validação pela pessoa que cadastrou sua conta; nenhuma conta de teste foi criada no projeto.

A auditoria inicial apontou zero vulnerabilidades nas dependências de produção. Há um alerta em `braces`, trazido pelo verificador de código do Next.js, sem versão corrigida publicada na verificação inicial. Reavalie `npm audit` antes de publicar. Não foi aplicado o downgrade automático sugerido para uma versão antiga do Next.js.

## Próximas entregas

Estornos e correções com histórico; backups e restauração; convites com papéis por casa; lembretes com notificações.

Referências: [Next.js](https://nextjs.org/docs), [Supabase: dados de usuários](https://supabase.com/docs/guides/auth/managing-user-data), [Supabase: autenticação de funções](https://supabase.com/docs/guides/functions/auth), [Supabase: segurança de senhas](https://supabase.com/docs/guides/auth/password-security).
