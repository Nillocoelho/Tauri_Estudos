# Projeto Aprovação

Aplicativo desktop pessoal para estudar para concursos com constância. React + TypeScript strict + Tauri 2 + SQLite local. Não requer conta, servidor ou internet para registrar e consultar estudos.

## Executar no Windows

Instale o arquivo `src-tauri/target/release/bundle/nsis/Projeto Aprovação_0.1.0_x64-setup.exe`, quando gerado pelo build. O instalador é por usuário e a interface está em português. O Windows precisa do Microsoft Edge WebView2 Runtime. A configuração padrão do Tauri baixa o runtime durante a instalação se ele estiver ausente; esse primeiro provisionamento exige conexão. O aplicativo instalado funciona offline, exceto para abrir links de materiais no navegador.

Na primeira execução, escolha criar o **Projeto Aprovação 2030** ou um plano vazio. O plano sugerido tem oito disciplinas editáveis, meta de 600 minutos por semana, sessões de 60 minutos e horário habitual às 19h. É uma sugestão organizacional, sem validação do edital do TJ-PB. Não há histórico ou desempenho fictício.

## Desenvolvimento

Requisitos: Windows 10/11 x64, Node.js 24 LTS, Rust estável (mínimo 1.90), Visual Studio Build Tools com Desktop development with C++, Windows SDK e WebView2 Runtime.

```powershell
npm.cmd ci
npm.cmd run desktop:dev
```

Se Rust acabou de ser instalado, reabra o terminal para atualizar o PATH. No PowerShell, use `npm.cmd` se a política de execução bloquear `npm.ps1`.

```powershell
npm.cmd run build          # TypeScript strict + bundle web
npm.cmd test               # Vitest: regras, serviços com SQLite real e estado de erro
cargo test --manifest-path src-tauri/Cargo.toml
npx.cmd playwright test   # interface em Edge headless + IPC de teste + SQLite isolado
npm.cmd run test:desktop # WebView2 real oculto, identificador e dados separados
npm.cmd run desktop:build # executável release e instalador NSIS x64
```

`npm.cmd run dev` abre somente o servidor da interface. No navegador comum, o aplicativo informa que o banco exige a versão desktop; não substitui o SQLite por localStorage. O teste Playwright fornece uma ponte IPC exclusivamente no processo de teste, sem acesso aos dados pessoais. Ele não valida os diálogos nativos nem os avisos visuais do Windows.

`test:desktop` compila uma versão debug com janela oculta e identificador `br.com.projetoaprovacao.smoketest`. Usa o WebView2 e o IPC reais, grava apenas no banco desse identificador e habilita temporariamente a porta local 9223 para automação. Verifica pausa, retomada, encerramento inesperado e recuperação. Encerra os processos que criou ao finalizar. O build release e seu identificador de dados permanecem separados. Os dados de teste ficam no diretório de configuração desse identificador e podem ser preservados para diagnóstico.

## Fluxo de uso

1. Cadastre disciplinas e assuntos. Adicione links HTTP/HTTPS de aulas, PDFs e questões.
2. Organize o ciclo, ajustando ordem, duração e pausas. Prioridade é informativa; a ordem manual determina a sequência.
3. No Dashboard, abra a próxima sessão. O assunto sugerido é o primeiro da disciplina cujo status ainda não seja “Estudado”. O status é controlado manualmente.
4. Inicie, pause, retome e finalize em Estudar. `Ctrl + Espaço` pausa ou retoma nessa tela.
5. Registre questões e dificuldades. Agende revisões dos assuntos que escolher.
6. Consulte os indicadores e guarde backups regularmente.

## Cronômetro e recuperação

O cronômetro grava sessões e intervalos UTC no SQLite. Um worker Rust executado independentemente da renderização atualiza checkpoints aproximadamente a cada dois segundos. A interface usa um timer apenas para desenhar o tempo; as horas vêm dos intervalos persistidos.

Pausar/finalizar fecha o intervalo no último checkpoint comprovado. Essa política conservadora pode deixar de contar até aproximadamente dois segundos por pausa; não inventa tempo após uma interrupção. Observações são salvas após 700 ms sem digitação e também ao finalizar.

Ao reabrir depois de um encerramento, sessões em execução entram em recuperação. Suspensão, grandes atrasos no worker (mais de 15 s) ou discrepâncias entre relógio civil e monotônico também interrompem a contagem no checkpoint. O período incerto é excluído até confirmação. Você pode manter apenas o tempo comprovado ou informar até 480 minutos adicionais, limitados ao período não contabilizado. A sessão fica pausada após confirmar. Alterações pequenas de relógio dentro da tolerância de 3 s e suspensões muito breves não são identificadas individualmente.

A duração planejada emite um aviso e mantém a sessão ativa até sua confirmação. O menu da bandeja permite abrir a sessão e pausar/retomar; uma sessão em recuperação precisa ser confirmada na janela.

## Dados, migrations e backups

O plugin SQL oficial do Tauri cria `aprovacao.db` em `%APPDATA%/br.com.projetoaprovacao.desktop/` (`app_config_dir`). O SQLite tem chaves estrangeiras, constraints, índices, exclusividade de sessão ativa e triggers para integridade e avanço do ciclo. Escritas relacionadas usam uma transação nativa no mesmo pool do plugin; não há `BEGIN`/`COMMIT` distribuídos entre conexões do pool.

As migrations ordenadas estão em `src-tauri/migrations`, registradas no Rust e controladas pelo migrador SQLx do plugin. Nunca altere uma migration que já foi distribuída: acrescente outra. Identificador do aplicativo e caminho do banco devem permanecer estáveis nas atualizações. Desinstalar/reinstalar não é um procedimento de migração; faça backup antes.

Em **Configurações → Criar backup**, escolha um nome novo. `VACUUM INTO` produz uma cópia consistente do SQLite, incluindo sessões ativas e o estado das migrations. Não copie manualmente somente o `.db` durante o uso: o SQLite pode possuir arquivos auxiliares.

Em **Restaurar**, finalize ou descarte a sessão ativa, confirme a substituição e escolha um backup `.sqlite`. A restauração verifica `application_id`, versão do esquema, `integrity_check`, relacionamentos e colunas conhecidas. Copia valores em uma transação para o esquema atual; nunca importa triggers ou código SQL do arquivo escolhido. Falhas revertem a substituição. Um snapshot anterior fica no diretório de dados, com prefixo `antes-restauracao-`. Sessões em execução no backup retornam em recuperação.

Esta versão aceita backups do esquema **2**. Backups de versões diferentes são rejeitados explicitamente. Futuras versões devem acrescentar conversões de backup junto às migrations. Não há criptografia do banco ou backups; eles contêm suas informações locais de estudo.

## Indicadores e revisões

Semana: **segunda-feira a domingo no horário local**. Timestamps são UTC; datas de listas de questões são datas civis locais. Horas de sessões concluídas são recortadas por intervalo, inclusive em sessões que atravessam dias ou semanas. O histórico lista sessões que cruzam o período e mostra o tempo total da sessão na linha, enquanto o indicador de horas considera somente o trecho dentro do filtro.

Percentuais são calculados pela soma de acertos dividida pela soma de questões. Nenhum acerto é presumido para períodos sem registros. O resumo aponta disciplinas abaixo de 60% apenas como indicação descritiva dos registros da semana.

Revisões são optativas, com uma pendência por assunto. Padrão: 1, 7 e 30 dias. A primeira é contada desde o agendamento; as seguintes usam as diferenças entre os intervalos, contadas da conclusão efetiva anterior. Atrasar uma revisão desloca as seguintes sem criar um acúmulo de pendências. Alterar intervalos afeta novos agendamentos e as próximas etapas; datas já agendadas são preservadas. Concluir revisão não gera sessão nem horas.

## Desktop e permissões

Fechar a janela encerra o aplicativo por padrão. Nas Configurações, escolha explicitamente **minimizar para a bandeja** se preferir. “Encerrar aplicativo” na bandeja sempre encerra.

Lembretes de horário e o aviso de duração rodam no Rust e funcionam com a janela minimizada. Solicite permissão nas Configurações e habilite os lembretes que desejar. O Windows controla a apresentação e pode suprimir avisos por suas próprias configurações. Notificações devem ser verificadas na versão instalada.

**Não há lembretes com o aplicativo encerrado**, inicialização automática, agendador de tarefas ou serviço residente. Ao acordar o computador depois do horário do lembrete, não há notificação retroativa.

Links são validados com Zod e abertos pelo plugin Opener oficial, limitado a HTTP/HTTPS. Não há credenciais, scraping, comandos de shell ou APIs de rede no aplicativo. A janela principal não possui permissão de filesystem amplo. Backup/restauração usam seletores nativos de arquivo. O CSP bloqueia scripts e frames remotos. Dependências e ferramentas de build precisam de internet no desenvolvimento.

## Organização

- `src/app`: layout, navegação, estado e tema.
- `src/features`: oito áreas da interface.
- `src/components/ui`: componentes locais no padrão shadcn/ui (Radix, CVA e Tailwind).
- `src/lib/domain.ts`: validação, tempo, semana, ciclo e revisões.
- `src/services`: repositório, plugin SQL e abertura de materiais.
- `src-tauri/src`: transações, backups, worker, bandeja e notificações.
- `tests`: regras, SQLite e interface; `artifacts`: capturas geradas pelos testes.

## Limitações conhecidas

- Um plano ativo por banco nesta versão. Nome, área e disciplinas são editáveis para concursos administrativos; múltiplos planos simultâneos ficam para uma evolução do modelo.
- Revisões não usam repetição espaçada adaptativa. Não há inferência de domínio do assunto.
- Sem sincronização, backup automático, exportação de relatórios ou criptografia.
- Histórico completo é carregado ao abrir/alterar os dados; checkpoints atualizam somente o intervalo ativo. Para volumes muito grandes, adicionar paginação e agregações SQL.
- O instalador não tem assinatura digital comercial. O Windows pode solicitar confirmação de procedência.
- Testes de interface usam Edge com IPC de teste; entrega de notificações, comportamento da bandeja em suspensão real e instalação gráfica precisam de validação no Windows de uso.

## Validação executada neste ambiente

- Build TypeScript strict e Vite: aprovado.
- Vitest: **18 testes aprovados**, incluindo SQLite real, estados vazios, falhas do banco e regras de domínio.
- Rust: **4 testes aprovados**, cobrindo migrations, detecção de suspensão/relógio, rollback, backup e restauração com relacionamentos e recuperação de sessão ativa.
- Playwright/Edge: **1 fluxo completo aprovado**, com cadastro de disciplina e assunto, sessão, questões, histórico após recarregar, layout com 800 px e modo claro.
- WebView2 + IPC nativo: cronômetro, pausa/retomada, encerramento forçado, recuperação e histórico aprovados; evidência em `artifacts/native-smoke.json`.
- Instalador NSIS Windows x64 gerado. A instalação gráfica e a apresentação visual das notificações não foram automatizadas.
- `npm audit` reportou zero vulnerabilidades conhecidas depois da atualização do Vitest.

As APIs nativas seguem as documentações oficiais: [SQL](https://v2.tauri.app/plugin/sql/), [bandeja](https://v2.tauri.app/learn/system-tray/) e [notificações](https://v2.tauri.app/plugin/notification/).
