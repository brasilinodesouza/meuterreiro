# MeuTerreiro

Primeira etapa do sistema de gestão: Next.js, React, TypeScript e Supabase.

## O que funciona

- Interface responsiva, demonstração com dados fictícios e persistência local separada.
- Com Supabase configurado: criar conta, confirmar e-mail, entrar, sair e recuperar senha.
- Cadastrar e editar um terreiro por responsável.
- Cadastrar e editar médiuns, consultar perfil, buscar pelo nome e filtrar por situação.
- Mensalidades individuais ou para todos os médiuns ativos; referência, vencimento, isenção e recebimento.
- Caixa com entradas, saídas, saldo acumulado e filtro por mês.
- Gastos realizados com descrição, categoria, data e valor; cada gasto gera uma saída no caixa.
- Lembretes de compras: marcar a caixa abre a confirmação do valor e data. Confirmar conclui o lembrete, gera o gasto e a saída no caixa, e abre o menu Gastos. Cancelar mantém o lembrete pendente.
- Exportar todos os registros em JSON (cópia manual; sem restauração nesta etapa).
- Regras no banco para cada responsável acessar apenas sua casa.

Há instalação PWA com ícone e página de aviso sem conexão; ainda não há operação offline, convites, contas de tesoureiros ou backup automático. A demonstração não sincroniza dados e não deve receber dados reais. Lembretes são uma lista de tarefas, sem notificações automáticas nesta etapa. Lançamentos confirmados não são editados nem excluídos nesta versão; estornos e correções com histórico serão uma próxima entrega.

## Instalar no celular

Prévia privada publicada: https://meuterreiro-teste.mighty-oak-6255.chatgpt.site

Abra a prévia HTTPS no Chrome do Android. Entre com a mesma conta ChatGPT se a prévia privada pedir acesso, explore a demonstração e toque em “Instalar MeuTerreiro”. Também pode usar o menu do Chrome > Instalar aplicativo / Adicionar à tela inicial. No iPhone, use Safari > Compartilhar > Adicionar à Tela de Início.

HTTP por IP da rede local permite visualizar o site, mas não é suficiente para a instalação PWA completa. A instalação depende de HTTPS confiável. O ícone não torna o aplicativo offline: o service worker só guarda a página de aviso sem conexão, sem cadastros ou respostas do banco. Cada navegador mantém sua própria demonstração.

A exportação estática para teste é gerada com `MEUTERREIRO_STATIC_PREVIEW=1 npm run build`. A prévia hospedada fica em `sites/meuterreiro-preview`, separada do projeto principal. Ela contém somente o aplicativo demonstrativo e não usa credenciais do banco.

## Executar

Requer Node.js 20.9 ou superior.

```powershell
npm install
npm run dev
```

Abra http://localhost:3000. A demonstração funciona sem conta Supabase.

## Conectar o banco e o acesso

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/001_initial.sql` e depois `002_finance.sql` no SQL Editor do projeto novo. Se a migração 001 já foi aplicada, execute apenas 002.
3. Copie `.env.example` para `.env.local` e preencha a URL e a chave **publishable** do projeto. Não use `service_role` nem secret key no navegador.
4. Em Authentication > URL Configuration, defina Site URL como `http://localhost:3000` e permita esse endereço em Redirect URLs. Na publicação, substitua pelo domínio real e adicione-o aos redirecionamentos.
5. Mantenha o provedor Email habilitado. Configure confirmação de e-mail e SMTP para uso real.
6. Reinicie `npm run dev`, crie sua conta e confirme o e-mail. Depois cadastre sua casa.

A autenticação desta etapa acontece no navegador, sem dados privados renderizados no servidor. A autorização efetiva acontece no Supabase por RLS, não apenas pela interface. As políticas não concedem exclusão de cadastros. Use a situação “Desligado” para manter o histórico. Financeiro usa funções de banco que verificam a casa e registram gasto/recebimento/caixa em uma única transação. A repetição de um pagamento ou da conclusão de um lembrete não duplica o caixa. O administrador da infraestrutura Supabase continua tendo acesso administrativo ao banco; isso é diferente do administrador de um terreiro.

## Verificações

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

As duas migrações foram verificadas em PostgreSQL local de teste com PGlite, incluindo isolamento entre casas, prevenção de duplicação e reversão de toda a operação quando o caixa falha. Antes de usar dados reais, valide também no seu projeto Supabase: crie duas contas e duas casas; confirme que cada conta só lista, cria e edita dados da própria casa. A migração não foi executada no seu Supabase: falta conectar o projeto.

A auditoria inicial apontou zero vulnerabilidades nas dependências de produção. Há um alerta em `braces`, trazido pelo verificador de código do Next.js, sem versão corrigida publicada na verificação inicial. Reavalie `npm audit` antes de publicar. Não foi aplicado o downgrade automático sugerido para uma versão antiga do Next.js.

## Próximas entregas

Estornos e correções com histórico; backups e restauração; convites com papéis por casa; lembretes com notificações.

Referências: [Next.js](https://nextjs.org/docs), [Supabase](https://supabase.com/docs).
