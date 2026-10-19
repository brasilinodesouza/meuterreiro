# MeuTerreiro

Primeira etapa do sistema de gestão: Next.js, React, TypeScript e Supabase.

## O que funciona

- Interface responsiva e acesso exclusivo com conta autenticada.
- Login com login e senha, ambos com mínimo de 6 e máximo de 20 caracteres.
- Botão Cadastrar-se na tela inicial; cadastro somente com Nome, Login e Senha, sem confirmação por e-mail.
- Botão de tema claro/escuro disponível no acesso e no painel; preferência salva no dispositivo.
- Conta autenticada pelo Supabase e opção de sair da conta.
- Cadastrar e editar um terreiro por médium responsável.
- Cadastrar e editar médiuns, consultar perfil, buscar pelo nome e filtrar por situação.
- Cadastro de médiuns com nome, data de nascimento e telefone obrigatórios, escolha de sexo (Masculino/Feminino), situação e observações; e-mail, função e data de entrada foram retirados das telas. Informações antigas permanecem no banco.
- Soma dos dígitos da data de nascimento e correspondência de pai/mãe de cabeça conforme a tábua numerológica fornecida, atualizadas no formulário e exibidas no perfil. A soma 28 mostra os três Orixás da tabela e a observação específica para mulheres.
- Importar relatório de mensalidades em PDF com conferência dos nomes, competências, valores, situações e datas de pagamento antes de salvar.
- Mensalidades individuais ou para todos os médiuns ativos; referência, vencimento, isenção e recebimento.
- Caixa com entradas, saídas, saldo acumulado e filtro por mês.
- Gastos realizados com descrição, categoria, data e valor; cada gasto gera uma saída no caixa.
- Lembretes de compras: marcar a caixa abre a confirmação do valor e data. Confirmar conclui o lembrete, gera o gasto e a saída no caixa, e abre o menu Gastos. Cancelar mantém o lembrete pendente.
- Exportar todos os registros em JSON (cópia manual; sem restauração nesta etapa).
- Convites para vincular contas ao terreiro como médiuns; gerenciamento de médiuns administradores pelo médium responsável em Configurações.
- Consulta individual de cadastro e mensalidades, após associação da conta ao médium.
- Avisos individuais de mensalidade e resumo para responsáveis/administradores, com lista completa de médiuns com mensalidades vencidas ou vencendo no dia. O médium é inscrito automaticamente, com a permissão de notificações do aparelho; somente a administração tem o painel de configuração.
- Regras no banco para proteger cada casa e restringir os dados conforme o perfil.
- Próximos eventos na página inicial e no menu Eventos. Responsável e administradores cadastram, editam e excluem; médiuns consultam somente eventos de hoje em diante do mês atual, conforme o horário de Brasília.

Há instalação PWA com ícone e página de aviso sem conexão; ainda não há operação offline, perfil exclusivo de tesoureiro ou backup automático. O modo de demonstração foi removido, inclusive os cadastros fictícios e a persistência local de cadastros/financeiro. Dados antigos da demonstração não são lidos nem importados. Lembretes são uma lista de tarefas, sem notificações automáticas nesta etapa. Lançamentos confirmados não são editados nem excluídos nesta versão; estornos e correções com histórico serão uma próxima entrega.

O projeto Supabase `dwqdhuijokjokvhkbzck` está conectado neste ambiente. Em uma cópia nova do repositório, aplique as migrações e configure `.env.local` antes de entrar: sem as variáveis, o envio fica desabilitado. Não há cadastro local nem senha guardada pelo aplicativo.

## Eventos da casa

Em **Eventos > Cadastrar evento**, informe nome e data; horário, local e descrição são opcionais. Responsável e médiuns administradores podem preparar eventos de meses futuros. Os demais médiuns veem apenas os próximos eventos do mês corrente. A lista segue a data e o horário do encontro; eventos de dias anteriores deixam de aparecer. Eventos de hoje permanecem até o fim do dia, inclusive quando não têm horário definido.

A migração `20261019154338_house_events.sql` cria a agenda e restringe leitura e gravação no banco, inclusive por acesso direto à API. A virada do mês usa `America/Sao_Paulo`, independentemente do fuso do aparelho. A lista atualiza enquanto a tela está aberta e ao retornar ao aplicativo; também há o botão **Atualizar eventos**. Cadastros sem vínculo individual de médium ainda podem consultar a agenda da própria casa.

Cada conta pode usar **Confirmar presença** no evento e **Cancelar confirmação** se mudar de ideia. A confirmação fica salva na conta e conta uma única vez, inclusive em vários aparelhos. Responsável e administradores veem o total em cada evento e abrem **Ver quem confirmou** para consultar os nomes e logins. Os demais veem somente a própria confirmação; não acessam o total nem os nomes de outras pessoas. A lista e a contagem se atualizam com a tela aberta.

A migração `20261019161559_event_attendance.sql` habilita as confirmações. O banco impede confirmar por outra pessoa, acessar eventos fora do próprio acesso e confirmar eventos de dias anteriores. Apagar um evento ou uma conta também remove suas confirmações. A consulta administrativa de nomes reutiliza as permissões já existentes do terreiro.

## Importar mensalidades

Em **Mensalidades > Importar PDF**, selecione o relatório com as colunas Nome, Valor, Mês Ref., Data Pag. e Status (Pago/Pendente). O arquivo é lido no dispositivo; o banco recebe somente as linhas conferidas. Limites: 10 MB, 50 páginas e 2.000 mensalidades. PDFs digitalizados como imagem precisam ser convertidos para texto antes da importação.

O vencimento usado é o dia 10. O mês de referência é preservado mesmo quando o pagamento ocorreu em outro mês. Os nomes devem corresponder a um único cadastro da casa; espaços e maiúsculas são normalizados. Cadastros ausentes, homônimos, linhas repetidas e divergências em mensalidades existentes bloqueiam a importação. Registros iguais já existentes são preservados. A gravação é feita em uma única transação: pagamentos criam entradas no caixa nas datas do relatório, pendências não geram entradas, e qualquer falha reverte o lote inteiro.

A migração `005_medium_fields_dues_import.sql` habilita a importação e permite cadastrar médiuns sem os campos retirados. Execute-a depois das migrações anteriores. As informações antigas não são apagadas.

A migração `20261013111959_medium_birth_date.sql` adiciona data de nascimento ao cadastro e ao perfil. Os formulários exigem nascimento e telefone para cadastrar ou salvar alterações. Cadastros antigos ou importados podem estar incompletos; os campos precisam ser preenchidos na edição antes de salvar. Datas inválidas e futuras são recusadas na interface e no banco; a data é armazenada sem horário ou conversão de fuso.

A migração `20261013112855_medium_sex.sql` adiciona o campo sexo, com as opções Masculino e Feminino. Cadastros antigos ficam sem valor definido; a escolha deve ser preenchida no formulário antes de salvar. A informação também aparece no perfil.

## Instalar no celular

Endereço de produção na Vercel: https://meuterreiro.vercel.app

A publicação anterior continua disponível em https://meuterreiro-teste.mighty-oak-6255.chatgpt.site.

No Android/Chrome, o botão “Instalar MeuTerreiro” aparece somente quando o navegador oferece a instalação. O clique abre imediatamente a confirmação nativa, sem instruções de menus. O evento é capturado antes da hidratação e consumido uma única vez; fechar a confirmação não instala nada. O navegador decide quando liberar a oferta e pode exigir interação e tempo de uso. O site deve ter seus arquivos de instalação acessíveis por HTTPS, sem uma barreira de autenticação externa. A autenticação das contas e a proteção dos dados continuam no Supabase.

O iPhone não oferece a API de confirmação de instalação por botão a partir de um site. Por isso, não mostramos um botão de instalação sem ação disponível. O sistema continua funcionando no navegador. Para o mesmo fluxo direto nos dois sistemas, será necessário distribuir um aplicativo também pela App Store. A barreira externa do ChatGPT foi retirada com autorização do médium responsável; os arquivos públicos de instalação não exigem login, enquanto os dados de cada conta permanecem protegidos pelo Supabase.

HTTP por IP da rede local permite visualizar o site, mas não é suficiente para a instalação PWA completa. A instalação depende de HTTPS confiável. O ícone não torna o aplicativo offline: o service worker só guarda a página de aviso sem conexão, sem cadastros ou respostas do banco.

A exportação estática é gerada com `MEUTERREIRO_STATIC_PREVIEW=1 npm run build`. No PowerShell, defina `$env:MEUTERREIRO_STATIC_PREVIEW='1'` antes de `npm run build`. A prévia hospedada fica em `sites/meuterreiro-preview`, separada do projeto principal. A chave administrativa só existe na Edge Function do Supabase; nunca entra na exportação estática.

## Publicação na Vercel

### Avisos de aniversário

Em **Configurações > Avisos de aniversário**, ative as notificações em cada aparelho e aceite a permissão do navegador. O botão **Enviar teste** confirma a entrega. O agendamento fica no Supabase e envia às 8h de Brasília mesmo com o app fechado; a entrega depende da conexão e das permissões do aparelho. Médiuns ativos e afastados são incluídos; desligados e cadastros sem nascimento não recebem aviso. Em anos não bissextos, 29/02 é tratado em 28/02. Um aviso agrupa os aniversariantes da casa no dia, com um registro por aparelho/dia para evitar repetição. A página inicial também mostra os aniversariantes de hoje.

As migrações `20261013153636_birthday_push_notifications.sql` e `20261013154851_birthday_push_schedule.sql` criam assinaturas privadas por médium responsável/sessão, controle de entregas e o job. Médiuns só leem e alteram as próprias assinaturas. O servidor consulta sessões válidas, portanto sair da conta interrompe os envios; o app também tenta remover a inscrição do aparelho. A sessão que ativou os avisos precisa continuar válida. Inscrições expiradas (HTTP 404/410) são removidas. Falhas têm novas tentativas às 8h05 e 8h10; requisições simultâneas usam uma reserva temporária.

`birthday-notifications` aceita exclusivamente o segredo do agendador ou um JWT verificado pelo Auth para enviar teste à inscrição da própria conta. A validação de gateway está desativada porque o cron usa um segredo próprio; a autorização acontece no handler. As chaves VAPID e o segredo estão no Supabase Vault, acessíveis apenas pela função `birthday_push_server_config` com papel service_role. Só a chave pública fica em `public/push-config.json`. `scripts/prepare-push-keys.mjs` prepara o primeiro par em `outputs/birthday-push.env`, fora do Git, e recusa substituir uma chave pública existente sem recuperar os segredos originais. Nunca publique esse arquivo de segredos nem gere novas chaves a cada build. O envio usa Web Push com aes128gcm e VAPID, não mensagens de WhatsApp/SMS. O job foi ativado em produção; não foram criados médiuns ou inscrições fictícias no banco real.

O projeto `brasilino/meuterreiro` acompanha a branch `main` de `brasilinodesouza/meuterreiro`. Use o preset Next.js, raiz `./`, comando `npm run build` e diretório de saída padrão. Não defina `MEUTERREIRO_STATIC_PREVIEW` na Vercel.

Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente Production antes da publicação. São os dados públicos do projeto Supabase; nenhuma chave administrativa deve ser enviada ao frontend. Autorize `https://meuterreiro.vercel.app` em `APP_ALLOWED_ORIGINS` da função `username-login` e nos endereços de retorno do Auth.

Novos commits na branch `main` geram publicações automáticas no mesmo endereço. O autor do commit precisa ser identificado pela conta GitHub conectada à Vercel; use o e-mail verificado ou o endereço `noreply` da própria conta. A configuração de e-mail deste repositório foi ajustada, sem reescrever os commits anteriores.

O app instalado verifica a versão ao abrir, voltar para primeiro plano, recuperar a conexão e a cada minuto enquanto estiver visível. Depois que a Vercel termina o deploy, uma versão diferente recarrega o app automaticamente. Formulários alterados, campos em foco, gravações visíveis e janelas de cadastro/importação adiam a recarga até sair dessa tela ou fechar a janela; o monitor reaplica a atualização quando essa condição muda. A sessão de login permanece no dispositivo. Não há verificação enquanto o sistema suspende ou fecha o app; ela acontece ao retornar, com internet. O rodapé mostra a data/identificador da versão carregada, o resultado da consulta e o botão “Verificar atualização”. Bloqueios por preenchimento e falhas de conexão são informados, em vez de permanecerem silenciosos. O timeout usa AbortController para funcionar também onde AbortSignal.timeout não está disponível.

`npm run dev/build` prepara `public/app-version.json` com um identificador exclusivo e horário, também incorporados ao JavaScript por `next.config.ts`. O arquivo é gerado e não deve ser commitado. A versão e o service worker têm cabeçalhos sem cache; documentos são buscados pela rede. Uma sessão carregada antes da primeira publicação do monitor ainda não tem esse código: precisa de uma recarga real uma única vez. Apenas retornar a um app que ficou suspenso pode preservar a sessão antiga. Nos próximos deploys, a atualização é automática se o monitor estiver ativo, o app visível, com internet e sem edição pendente. Um app instalado no domínio antigo chatgpt.site não acompanha os deploys da Vercel.

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

A autorização efetiva acontece no Supabase por RLS, não apenas pela interface. As políticas não concedem exclusão de cadastros. Use a situação “Desligado” para manter o histórico. Financeiro usa funções de banco que verificam a casa e registram gasto/recebimento/caixa em uma única transação. A repetição de um pagamento ou da conclusão de um lembrete não duplica o caixa. O administrador da infraestrutura Supabase continua tendo acesso administrativo ao banco; isso é diferente do médium administrador de um terreiro.

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

Referências: [Next.js](https://nextjs.org/docs), [Supabase: gerenciamento de contas](https://supabase.com/docs/guides/auth/managing-user-data), [Supabase: autenticação de funções](https://supabase.com/docs/guides/functions/auth), [Supabase: segurança de senhas](https://supabase.com/docs/guides/auth/password-security).
## Médiuns vinculados ao terreiro

Em **Configurações → Médiuns do terreiro**, o médium responsável gera um link de convite, válido por 7 dias e reutilizável por várias pessoas. Um novo link invalida o anterior. O convidado cadastra Nome/Login/Senha, entra na conta e aceita o convite. Contas existentes também podem aceitar convites. Sem o link aberto, é possível colá-lo na tela inicial depois de entrar.

Todo vínculo nasce como **Médium**. Somente o médium responsável pode promover alguém a **Médium médium administrador** ou retirar essa permissão; seu próprio acesso permanece protegido. Médiuns administradores gerenciam médiuns, financeiro e dados da casa, mas não atribuem permissões nem geram convites.

Em **Configurações → Médiuns do terreiro**, o médium responsável pode apagar definitivamente a conta de um médium ou administrador da sua casa. A confirmação exige digitar o login. A conta do médium responsável é protegida, e o cadastro de médium e o histórico financeiro são preservados.

Na lista de mensalidades, somente o médium responsável pode editar ou apagar registros. A edição permite corrigir médium, referência, vencimento, valor, situação, data e forma de pagamento. Mensalidades pagas ajustam a entrada correspondente no caixa; mudar para pendente/isenta ou apagar a mensalidade remove essa entrada. A exclusão exige confirmação. Se outra pessoa alterar o registro durante a edição, é necessário atualizar a lista antes de salvar ou apagar.

Ao registrar um pagamento, médiuns administradores e o médium responsável escolhem **Pix** ou **Dinheiro**. A forma aparece na listagem administrativa e em **Minhas mensalidades** do médium. Pagamentos antigos e importados de relatórios que não informam a forma aparecem como **Não informado**. A área do médium também oferece filtros de mensalidades pagas, pendentes e isentas.

Na lista de médiuns, o médium responsável ou um médium administrador pode associar cada conta a um cadastro de médium. O médium consulta somente esse cadastro e suas mensalidades, sem acesso ao caixa, gastos ou registros de outras pessoas. Sem associação, a conta continua vinculada ao terreiro e aguarda o vínculo com o médium. Cada conta pertence a uma única casa; o médium responsável já existente é preservado.

A área do médium consulta novas mensalidades e mudanças de pagamento a cada 15 segundos enquanto estiver visível e conectada. Também consulta ao voltar para a tela ou recuperar a conexão, preservando o menu e o filtro selecionados. O vínculo da conta é verificado antes da consulta; associação, promoção ou exclusão de conta recarregam o acesso. Falhas temporárias mantêm os dados anteriores e geram uma nova tentativa automática. As consultas continuam limitadas ao cadastro associado e às políticas do banco.

As regras são verificadas no banco, independentemente da tela ou do `user_metadata`. A revogação de administração bloqueia novas operações imediatamente. A interface verifica alterações ao voltar para primeiro plano; o médium também pode atualizar a página. Execute a migração `20261014113327_terreiro_memberships.sql` após as migrações existentes. Os testes de permissões estão em `tests/memberships.test.ts`.

## Avisos de mensalidade no celular

Em **Configurações → Avisos de mensalidade**, administradores e o responsável pela casa podem ativar/desativar o envio automático para a casa. A função começa desativada. Os avisos são enviados às **8h de Brasília**, no vencimento e **seis dias depois** se a mensalidade continuar pendente: vence dia 10 → aviso de atraso dia 16. Pagas e isentas não recebem avisos; não há cobrança diária após o segundo aviso.

O médium não vê o painel nem possui opção de ativar/desativar avisos no aplicativo. O aparelho é inscrito automaticamente ao entrar com a permissão de notificações concedida. Se a permissão ainda não foi solicitada, o navegador a solicita no primeiro toque dentro do aplicativo; dispensar ou negar não causa pedidos repetidos na mesma sessão. Uma permissão negada precisa ser liberada nas configurações do próprio aparelho/navegador. A conta precisa estar associada ao seu cadastro de médium, e o envio depende da ativação pela administração. Cada pessoa recebe somente suas mensalidades. O clique no aviso abre a lista de mensalidades. Para instalação em outro ambiente, consulte `supabase/README.md`.
