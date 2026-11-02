# Raindrop Bar Sync

**A barra de favoritos do seu navegador, idêntica em todos os navegadores, pelo Raindrop.io.**

[English](README.md) · [Türkçe](README.tr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · **Português (BR)**

Uma extensão que mantém a **barra de favoritos nativa** do Chrome, Edge, Brave, Vivaldi, Helium e
Firefox sincronizada nos dois sentidos com uma coleção do Raindrop.io. Adicione um favorito no
Firefox e, um minuto depois, ele aparece na barra do Chrome, na mesma pasta e na mesma posição.
O Raindrop é o servidor; não há mais nada para hospedar.

<p align="center">
  <img src="docs/images/popup.png" width="320" alt="Pop-up da barra de ferramentas">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="320" alt="Pop-up da barra de ferramentas, tema escuro">
</p>

## Por quê

- O Chrome Sync e o Firefox Sync só sincronizam dentro da própria família de navegadores.
- A extensão oficial do Raindrop salva favoritos no Raindrop, mas não mexe na barra do navegador.
- Ferramentas de sincronização entre navegadores precisam de um armazenamento separado que você
  configura (Nextcloud, WebDAV, Google Drive…). Se você já usa o Raindrop, esta extensão o usa
  como esse armazenamento.

## Recursos

- **Sincronização nos dois sentidos** da barra de favoritos e suas subpastas: adicionar,
  renomear, editar links, mover e excluir de qualquer lado.
- **Ordem exata**, inclusive como pastas e favoritos se intercalam. O Raindrop não consegue
  guardar isso sozinho, então a ordem fica em pequenas notas ocultas na coleção.
- **A última alteração vence**, por favorito e por campo, pelo momento em que você realmente fez
  a alteração, mesmo que um navegador tenha ficado dias offline.
- **Nada se perde por acidente**: a primeira sincronização só adiciona, uma pasta excluída de um
  lado enquanto algo foi adicionado nela do outro volta, e exclusões em massa param e perguntam.
- **Backups** da barra deste navegador antes de cada alteração, restauráveis com um clique.
- **Registro de atividades** com cada alteração e de onde ela veio (“de Firefox”).
- **Lista de dispositivos** com todos os navegadores que sincronizam com a coleção.
- **Funciona offline**: alterações feitas sem conexão são mantidas e enviadas quando ela volta.
- Pop-up e configurações em **16 idiomas**, tema claro e escuro.
- Sem servidores, sem analytics, sem permissões além de `bookmarks`, `storage`, `alarms` e
  `api.raindrop.io`.

![Página de configurações](docs/images/options.png)

## Instalação

A extensão ainda não está na Chrome Web Store nem no addons.mozilla.org; compile a partir do
código-fonte. É preciso o [Node.js](https://nodejs.org) 20 ou mais recente.

```sh
git clone https://github.com/ozardali/raindrop-bar-sync.git
cd raindrop-bar-sync
npm install
npm run build            # Chrome, Edge, Brave, Vivaldi, Helium…
npm run build:firefox    # Firefox
```

**Navegadores Chromium**: abra `chrome://extensions`, ative o **Modo do desenvolvedor**, clique
em **Carregar sem compactação** e escolha `.output/chrome-mv3`.

**Firefox**: abra `about:debugging#/runtime/this-firefox`, clique em **Carregar extensão
temporária…** e escolha `.output/firefox-mv3/manifest.json`. Extensões temporárias são
removidas quando o Firefox fecha; para uma instalação permanente, rode `npm run zip:firefox` e
assine o zip como extensão não listada no
[addons.mozilla.org](https://addons.mozilla.org/developers/).

## Configuração

1. **Faça backup dos seus favoritos primeiro** (gerenciador de favoritos → Exportar). A
   sincronização trabalha com dados reais.
2. Desative a sincronização de favoritos embutida (Chrome Sync / Firefox Sync) nos navegadores
   onde usar a extensão. Dois sistemas na mesma barra entram em conflito e criam duplicados.
3. Clique no ícone da extensão → **Configurações**.
4. **Conta do Raindrop**: cole um token de teste. A página mostra o passo a passo: Raindrop →
   Configurações → Integrações → *Criar novo aplicativo* → *Criar token de teste*. O token só dá
   acesso à sua própria conta e não expira.
5. **Coleção**: escolha a coleção que vai espelhar sua barra ou crie uma nova. Use **a mesma
   coleção em todos os navegadores**.
6. Pronto. A primeira sincronização junta os dois lados: adiciona o que falta nas duas direções
   e não exclui nada.

Daí em diante, as alterações no navegador vão para o Raindrop em segundos, e as de outros
navegadores chegam em até um minuto (configurável).

## Como funciona

Cada sincronização compara três árvores: a barra agora, a coleção agora e o estado em que os dois
lados concordaram na última sincronização. O que mudou só de um lado é copiado para o outro; se
os dois lados mudaram a mesma coisa, vence a alteração mais recente. A mesclagem é uma função
pura com testes unitários, de propriedades e de fuzzing: centenas de históricos de edição
aleatórios, cada um verificado para terminar com os dois lados idênticos e nada novo perdido.

Detalhes: [docs/architecture.md](docs/architecture.md). O comportamento da API do Raindrop em
que o design se apoia, verificado na API real: [docs/raindrop-api.md](docs/raindrop-api.md)
(em inglês).

## Limitações

- Só a barra de favoritos (e suas pastas) é sincronizada, não “Outros favoritos” nem “Celular”.
- Separadores (Firefox) não são sincronizados; o Raindrop não tem equivalente.
- Links que o Raindrop não aceita (bookmarklets `javascript:`, `file:`, `about:`) ficam no
  navegador onde estão e nunca são excluídos.
- Firefox para Android e Safari não são suportados.
- Vivaldi e Brave devem funcionar como o Chrome, mas ainda não foram testados.
- O acesso é por token de teste; “Entrar com o Raindrop” (OAuth) exige um segredo no servidor e
  não está implementado.

## Aviso

**Este é um projeto não oficial, sem vínculo com o Raindrop.io e não endossado por ele.**

**A sincronização altera dados reais em dois lugares.** As proteções (nada é excluído na
primeira sincronização, pausa antes de exclusões em massa, backups locais, a lixeira do Raindrop)
tornam improvável perder favoritos, não impossível. Guarde uma exportação dos seus favoritos
para a qual possa voltar.

**Sem garantia.** O software é fornecido como está, sob a [licença MIT](LICENSE).

## Privacidade

A extensão conversa com um único servidor: `api.raindrop.io`, com o seu token. Sem analytics,
sem terceiros. O que é guardado e onde, exatamente: [PRIVACY.md](PRIVACY.md) (em inglês).

## Traduções

A interface da extensão está disponível nos 16 idiomas que o aplicativo do Raindrop suporta.
Este README está disponível nos idiomas com link no topo. Para os dois, **o inglês é a
referência**; se uma tradução divergir, vale o texto em inglês. Como corrigir ou adicionar uma
tradução: [CONTRIBUTING.md](CONTRIBUTING.md#translations).

## Contribuindo

Relatos de bugs e pull requests são bem-vindos. Ambiente de desenvolvimento, testes e estrutura
do projeto estão no [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE) © Goksel Ozardali
