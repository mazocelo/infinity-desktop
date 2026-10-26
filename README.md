# Infinity Desktop

App de desktop do [Infinity](https://infinity.voxcity.com.br) para Windows, macOS e Linux. Abre o Infinity numa janela própria e acrescenta o que o navegador não dá:

- ícone na bandeja com atender, rejeitar, silenciar e desligar chamada;
- notificações do sistema e contador de não lidas no ícone;
- abrir junto com o computador;
- links `infinity://` (por exemplo `infinity://chat/<id>` e `infinity://call/<número>`);
- página "sem conexão" que volta sozinha quando a internet volta.

As telas são as do site: toda melhoria do Infinity aparece no app no mesmo dia, sem reinstalar. O próprio app se atualiza quando sai versão nova da casca.

## Desenvolvimento

```bash
npm ci
npm run dev:frontend   # infinity-frontend em http://localhost:5173 (repo irmão)
npm run dev
```

`INFINITY_DESKTOP_URL=https://<outro-endereço>` aponta o app para outro ambiente.

Testes e checagem: `npm test` e `npm run typecheck`. Instalador: `npm run build:win` (também `build:mac` e `build:linux`).
