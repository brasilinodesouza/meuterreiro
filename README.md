# MeuTerreiro

Primeira etapa do sistema de gestão: Next.js, React, TypeScript e Supabase.

## O que funciona

- Interface responsiva e acesso exclusivo com conta autenticada.
- Login com usuário e senha, ambos com mínimo de 6 e máximo de 20 caracteres.
- Botão Cadastrar-se na tela inicial; cadastro somente com Nome, Login e Senha, sem confirmação por e-mail.
- Botão de tema claro/escuro disponível no acesso e no painel; preferência salva no dispositivo.
- Conta autenticada pelo Supabase e opção de sair da conta.
- Cadastrar e editar um terreiro por responsável.
- Cadastrar e editar médiuns, consultar perfil, buscar pelo nome e filtrar por situação.
- Cadastro de médiuns com nome, telefone opcional, situação e observações; e-mail, função e data de entrada foram retirados das telas. Informações antigas permanecem no banco.
- Importar relatório de mensalidades em PDF com conferência dos nomes, competências, valores, situações e datas de pagamento antes de salvar.
- Mensalidades individuais ou para todos os médiuns ativos; referência, vencimento, isenção e recebimento.
- Caixa com entradas, saídas, saldo acumulado e filtro por mês.
- Gastos realizados com descrição, categoria, data e valor; cada gasto gera uma saída no caixa.
- Lembretes de compras: marcar a caixa abre a confirmação do valor e data. Confirmar conclui o lembrete, gera o gasto e a saída no caixa, e abre o menu Gastos. Cancelar mantém o lembrete pendente.
- Exportar todos os registros em JSON (cópia manual; sem restauração nesta etapa).
- Regras no banco para cada responsável acessar apenas sua casa.

Há instalação PWA com ícone e página de aviso sem conexão; ainda não há operação offline, convites, contas de tesoureiros ou backup automático. O modo de demonstração foi removido, inclusive os cadastros fictícios e a persistência local de cadastros/financeiro. Dados antigos da demonstração não são lidos nem importados. Lembretes são uma lista de tarefas, sem notificações automáticas nesta etapa. Lançamentos confirmados não são editados nem excluídos nesta versão; estornos e correções com histórico serão uma próxima entrega.

O projeto Supabase `dwqdhuijokjokvhkbzck` está conectado neste ambiente; as cinco migrações e a Edge Function foram aplicadas. Em uma cópia nova do repositório, configure `.env.local` antes de entrar: sem as variáveis, o envio fica desabilitado. Não há cadastro local nem senha guardada pelo aplicativo.

## Importar mensalidades

Em **Mensalidades > Importar PDF**, selecione o relatório com as colunas Nome, Valor, Mês Ref., Data Pag. e Status (Pago/Pendente). O arquivo é lido no dispositivo; o banco recebe somente as linhas conferidas. Limites: 10 MB, 50 páginas e 2.000 mensalidades. PDFs digitalizados como imagem precisam ser convertidos para texto antes da importação.

O vencimento usado é o dia 10. O mês de referência é preservado mesmo quando o pagamento ocorreu em outro mês. Os nomes devem corresponder a um único cadastro da casa; espaços e maiúsculas são normalizados. Cadastros ausentes, homônimos, linhas repetidas e divergências em mensalidades existentes bloqueiam a importação. Registros iguais já existentes são preservados. A gravação é feita em uma única transação: pagamentos criam entradas no caixa nas datas do relatório, pendências não geram entradas, e qualquer falha reverte o lote inteiro.

A migração `005_medium_fields_dues_import.sql` habilita a importação e permite cadastrar médiuns sem os campos retirados. Execute-a depois das migrações anteriores. As informações antigas não são apagadas.

## Instalar no celular

Endereço de produção na Vercel: https://meuterreiro.vercel.app

A publicação anterior continua disponível em https://meuterreiro-teste.mighty-oak-6255.chatgpt.site.

No Android/Chrome, o botão “Instalar MeuTerreiro” aparece somente quando o navegador oferece a instalação. O clique abre imediatamente a confirmação nativa, sem instruções de menus. O evento é capturado antes da hidratação e consumido uma única vez; fechar a confirmação não instala nada. O navegador decide quando liberar a oferta e pode exigir interação e tempo de uso. O site deve ter seus arquivos de instalação acessíveis por HTTPS, sem uma barreira de autenticação externa. A autenticação das contas e a proteção dos dados continuam no Supabase.

O iPhone não oferece a API de confirmação de instalação por botão a partir de um site. Por isso, não mostramos um botão de instalação sem ação disponível. O sistema continua funcionando no navegador. Para o mesmo fluxo direto nos dois sistemas, será necessário distribuir um aplicativo também pela App Store. A barreira externa do ChatGPT foi retirada com autorização do responsável; os arquivos públicos de instalação não exigem login, enquanto os dados de cada conta permanecem protegidos pelo Supabase.

HTTP por IP da rede local permite visualizar o site, mas não é suficiente para a instalação PWA completa. A instalação depende de HTTPS confiável. O ícone não torna o aplicativo offline: o service worker só guarda a página de aviso sem conexão, sem cadastros ou respostas do banco.

A exportação estática é gerada com `MEUTERREIRO_STATIC_PREVIEW=1 npm run build`. No PowerShell, defina `$env:MEUTERREIRO_STATIC_PREVIEW='1'` antes de `npm run build`. A prévia hospedada fica em `sites/meuterreiro-preview`, separada do projeto principal. A chave administrativa só existe na Edge Function do Supabase; nunca entra na exportação estática.

## Publicação na Vercel

O projeto `brasilino/meuterreiro` acompanha a branch `main` de `brasilinodesouza/meuterreiro`. Use o preset Next.js, raiz `./`, comando `npm run build` e diretório de saída padrão. Não defina `MEUTERREIRO_STATIC_PREVIEW` na Vercel.

Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente Production antes da publicação. São os dados públicos do projeto Supabase; nenhuma chave administrativa deve ser enviada ao frontend. Autorize `https://meuterreiro.vercel.app` em `APP_ALLOWED_ORIGINS` da função `username-login` e nos endereços de retorno do Auth.

Novos commits na branch `main` geram publicações automáticas no mesmo endereço. O autor do commit precisa ser identificado pela conta GitHub conectada à Vercel; use o e-mail verificado ou o endereço `noreply` da própria conta. A configuração de e-mail deste repositório foi ajustada, sem reescrever os commits anteriores.

## Executar

Requer Node.js 20.9 ou superior.

```powershell
npm install
npm run dev
```

Abra http://localhost:3000. Sem Supabase configurado, apenas as telas de acesso ficam disponíveis.

## Conectar o banco e o acesso

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/001_initial.sql`, `002_finance.sql`, `003_username_auth.sql` e `004_names_registration.sql`, nessa ordem. Execute somente as migrações ainda não aplicadas.
3. Copie `.env.example` para `.env.local` e preencha a URL e a chave **publishable** do projeto. Não use `service_role` nem secret key no navegador.
4. Em Authentication > URL Configuration, defina Site URL como `http://localhost:3000` e permita esse endereço em Redirect URLs. Na publicação, substitua pelo domínio real e adicione-o aos redirecionamentos.
5. Mantenha o provedor Email habilitado para o Supabase Auth. Configure o mínimo da senha como 6, sem exigências adicionais de composição, para aceitar a regra solicitada. Novos cadastros do aplicativo não dependem de SMTP ou confirmação por e-mail.
6. Publique a Edge Function `username-login` e configure `APP_ALLOWED_ORIGINS`. Veja os passos em [supabase/README.md](supabase/README.md).
7. Reinicie `npm run dev` (ou gere uma nova publicação após definir as variáveis públicas), cadastre Nome/Login/Senha e entre com login/senha. Depois cadastre sua casa.

O cadastro e o login são resolvidos na Edge Function. O cadastro cria uma conta com identificador técnico interno aleatório, sem pedir ou enviar e-mail. O Supabase Auth verifica a senha e gerencia a sessão. Logins são únicos e não diferenciam maiúsculas de minúsculas; senhas preservam maiúsculas e espaços. Limites de 6–20 são validados na interface e no servidor. O serviço mantém limites de tentativas e de criação de contas no banco. Contas antigas são preservadas. Sem e-mail de recuperação no novo cadastro, redefinições de senha dependem da administração do projeto; não há botão de recuperação por e-mail na tela inicial.

A autorização efetiva acontece no Supabase por RLS, não apenas pela interface. As políticas não concedem exclusão de cadastros. Use a situação “Desligado” para manter o histórico. Financeiro usa funções de banco que verificam a casa e registram gasto/recebimento/caixa em uma única transação. A repetição de um pagamento ou da conclusão de um lembrete não duplica o caixa. O administrador da infraestrutura Supabase continua tendo acesso administrativo ao banco; isso é diferente do administrador de um terreiro.

## Verificações

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

As quatro migrações foram verificadas em PostgreSQL local de teste com PGlite, incluindo isolamento entre casas, prevenção de duplicação, reversão da operação quando o caixa falha, unicidade, nomes, preservação de contas antigas e limites do acesso. Cadastro sem e-mail foi testado com o Auth simulado, incluindo identificação interna e concorrência por um mesmo login. As migrações foram aplicadas no Supabase real e a função foi publicada. Temas claro/escuro e persistência após recarregar foram conferidos no navegador. Nenhuma nova conta de teste foi criada no projeto nesta alteração; o login válido após o novo cadastro aguarda uso pela pessoa que cadastrar sua conta.

A auditoria inicial apontou zero vulnerabilidades nas dependências de produção. Há um alerta em `braces`, trazido pelo verificador de código do Next.js, sem versão corrigida publicada na verificação inicial. Reavalie `npm audit` antes de publicar. Não foi aplicado o downgrade automático sugerido para uma versão antiga do Next.js.

## Próximas entregas

Estornos e correções com histórico; backups e restauração; convites com papéis por casa; lembretes com notificações.

Referências: [Next.js](https://nextjs.org/docs), [Supabase: dados de usuários](https://supabase.com/docs/guides/auth/managing-user-data), [Supabase: autenticação de funções](https://supabase.com/docs/guides/functions/auth), [Supabase: segurança de senhas](https://supabase.com/docs/guides/auth/password-security).
