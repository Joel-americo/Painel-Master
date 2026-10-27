# HEILOG — edição para GitHub Pages

Preparado a partir da v135 do Painel do Analista (commit de origem `816f0186cd6f1e20418ef8bb0d30e9f96bd674c7`). Layout, telas e Firebase existentes preservados. Esta é uma cópia independente: não altera o site oficial e não foi publicada.

## Publicar

1. Crie um repositório no GitHub. Extraia o ZIP e envie **o conteúdo da pasta `heilog-github-pages`**, incluindo `.github`, `site`, `scripts`, `package.json` e este README, para a raiz do repositório. Não envie apenas o ZIP.
2. Use a branch `main`.
3. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
4. Em **Actions**, execute **Publicar HEILOG no GitHub Pages** (ou envie um novo commit para `main`). O fluxo testa, gera `_site` e publica apenas essa pasta.
5. Use o endereço mostrado pelo GitHub. Caminhos relativos atendem tanto `https://USUARIO.github.io/REPOSITORIO/` quanto um site na raiz.
6. No Firebase Authentication → Settings → Authorized domains, cadastre o hostname `USUARIO.github.io` se necessário; não coloque o caminho `/REPOSITORIO/` nesse campo. Valide login e autorização com contas reais de teste. Esta preparação não mudou o Firebase.

GitHub Pages em repositórios privados depende do plano da conta. Não publique dados privados no repositório. Este pacote não contém o diretório nominal privado do servidor, contas de serviço, tokens de acesso ou backup dos dados do Firebase. A configuração web do Firebase continua pública, como no painel atual; a proteção dos dados depende das regras publicadas e da autenticação.

## O que funciona e o que depende de configuração

- Pátio, Histórico, Ocorrências, dashboards, motoristas, relatórios/importações locais, redirecionamentos HEILO e demais telas usam os mesmos componentes e caminhos Firebase existentes. Os acessos continuam sujeitos às regras reais do Firebase. Não foram testados com login real nesta nova origem.
- A exibição do código no card usa o código da marcação ou do cadastro carregado; não precisa da API de consulta de nomes.
- **Lusitana automática e verificação de nomes únicos do cadastro privado precisam de backend externo.** O Pages não executa as duas APIs do site original. Essas integrações ficam sem requisições automáticas até configurar `site/pages-config.js`.
- Sem a consulta privada, as pendências de código podem incluir nomes que o catálogo do servidor antigo reconheceria. O cadastro e a exibição de códigos existentes continuam disponíveis.
- PDFs/planilhas e demais bibliotecas remotas continuam usando os CDNs já presentes. A rede precisa permitir esses recursos e o Firebase.
- O aplicativo instalável usa manifesto no escopo do repositório. Esta edição não oferece fallback offline com HTML antigo nem cache próprio dos dados operacionais.

## Conectar as APIs

Consulte `API_EXTERNA.md`. Configure a origem HTTPS da API em `site/pages-config.js`, por exemplo `https://api.suaempresa.com`. Não coloque `/api` no final e não coloque segredos nesse arquivo. Depois envie o commit.

Não aponte diretamente para a hospedagem atual sem configurar CORS nela: o endpoint protegido original rejeita outras origens. Nenhuma alteração foi feita no servidor oficial.

## Testar localmente

Requer Node 22 ou superior. Não há dependências para instalar:

```sh
npm test
npm run build
python -m http.server 8080 --directory _site
```

Acesse `http://localhost:8080/`. Não abra o HTML por `file://`. Para conferir caminho de projeto, sirva a pasta acima de `_site` e abra `http://localhost:8080/_site/`.

## Limites desta entrega

Testes automatizados validam caminhos locais, subdiretório, manifesto, sintaxe, configuração das APIs e ausência do catálogo privado. Nenhuma gravação operacional ou alteração de regras foi realizada. Login real, arquivos de importação, impressão e sincronização precisam de teste integrado no endereço final antes da migração. Mudar de hospedagem não garante corrigir a rejeição observada em alguns PCs.

Documentação GitHub: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
