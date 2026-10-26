# infinity-desktop

Casca Electron do Infinity. A janela abre o **próprio site** (`https://infinity.voxcity.com.br`) e a casca só soma o que é nativo: bandeja com atender/rejeitar/silenciar/desligar, notificação do sistema, contador no ícone, auto-start, diálogo de salvar arquivo e links `infinity://`. Nenhuma tela mora aqui: tela nova é no `infinity-frontend` e chega ao desktop no deploy do front, sem instalador novo.

Até a 1.0.0 (19/02/2026) o instalador levava uma cópia do `infinity-frontend/dist` servida por `app://`, com reescrita de CORS e um desvio para o login Microsoft. Saiu na 1.1.0 (decision board "Infinity Desktop no padrão do Infinity", 26/10/2026): a cópia congelava o desktop no dia do instalador.

## Mapa

| Arquivo | O que faz |
|---|---|
| `src/main/index.ts` | Janela, contenção de navegação, permissões, deep link, página "sem conexão" |
| `src/main/navegacao.ts` | Regras puras (testadas): endereço do app, onde a janela pode ir, o que abre fora, parser de `infinity://` |
| `src/main/origem.ts` | `soDoApp`: todo handler de IPC que age só atende o site do app |
| `src/main/ipc-handlers.ts`, `startup.ts`, `updater.ts`, `tray.ts` | Os canais da ponte e a bandeja |
| `src/preload/index.ts` | `window.electronAPI` (contextBridge). Sai em `.cjs` porque a janela roda com `sandbox: true` |
| `src/renderer/index.html` | A página "sem conexão" (Vox Midnight); volta sozinha ao site |

O consumidor da ponte é `infinity-frontend/src/shared/utils/electron.utils.ts` (tipo `ElectronAPI`) e `src/shared/hooks/useElectronIntegration.ts`. Canal novo → skill `electron-ipc-bridge`; mudança do front que pode precisar de adaptação aqui → agente `desktop-sync-watcher`.

## Regras

- **A ponte só serve ao site.** Handler novo de IPC que age (escreve arquivo, mostra algo, muda configuração) vai embrulhado em `soDoApp(enderecoDoApp, …)`. O preload expõe a ponte em qualquer página da janela; quem recusa é o main.
- **Navegação é lista de permissão** (`decidirNavegacao`, `navegacao.ts`), só no quadro principal. A janela anda pelo site, pelo `api-gateway` e pelos hosts de login da Microsoft. Depois de entrar na Microsoft fica em "modo login": qualquer https passa até voltar ao site, porque a empresa pode federar num ADFS próprio. Não volte ao sufixo `*.voxcity.com.br`: o bucket serve arquivo enviado por usuário. Login do Google não roda em navegador embutido (o Google recusa o user-agent) e vai para o navegador do sistema. Popup dentro do app só para o Facebook (`OAUTH_POPUP_HOSTS`, Embedded Signup do WhatsApp Oficial). O resto vai ao navegador do sistema, e só `http`, `https` e `mailto`.
- **Permissões** (microfone, câmera, notificação, área de transferência) só para a origem do site.
- `INFINITY_DESKTOP_URL` aponta a casca para a homolog ou um preview (só https, ou http em localhost). Em dev o padrão é o Vite do front em `:5173`.

## Comandos

```bash
npm ci
npm run typecheck
npm test                      # vitest — navegação, deep link e a guarda soDoApp de cada canal
npm run dev                   # precisa do front em :5173 (npm run dev:frontend)
npm run build:win             # instalador NSIS em release/
```

Na VPS (sem GTK do sistema), a janela abre sob `xvfb-run` com a GTK extraída numa pasta local (`apt-get download libgtk-3-0t64 …` + `dpkg-deb -x`, `LD_LIBRARY_PATH`). O QA da casca usa o `_electron` do Playwright do `infinity-frontend`.

## Release

Branch: este repo não tem `homolog`; a task-branch nasce da `main` e integra nela. Release = tag `vX.Y.Z` + `electron-builder --win --publish always` no repo `Voxcity-Dev/infinity-desktop` (o `electron-updater` dos instalados lê as releases de lá). Publicar release atinge todo mundo que tem o app instalado: só com GO nomeando a versão.

Ainda sem assinatura de código: o Windows mostra o aviso do SmartScreen na instalação.
