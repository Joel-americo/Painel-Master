# Contrato das APIs externas

Ainda não existe backend externo configurado nesta cópia. GitHub Pages publica somente arquivos estáticos. Não envie o catálogo privado de motoristas para `site/`, JavaScript público ou repositório público.

## Endpoints necessários

`POST /api/driver-code-check`
- Header `Authorization: Bearer <Firebase ID token>`, `Content-Type: application/json`.
- Entrada `{ "unitId": "jacarei", "names": ["NOME NORMALIZADO"] }`.
- Saída `{ "results": [{ "name": "NOME NORMALIZADO", "unique": true }] }`.
- Validar token no servidor, perfil ativo/aprovado, role admin/analista e acesso à unidade. Validar formatos, limitar nomes e corpo e aplicar limite de requisições. Retornar só flags dos nomes solicitados. O catálogo privado permanece exclusivamente no servidor.

`POST /api/lusitana`
- Header `Authorization: Bearer <Firebase ID token>`.
- Sem corpo. Saída `{ "fetchedAt": 1234567890000, "rows": [...] }`.
- Cada linha segue o formato de `site/lusitana-sync.js` (usar seu parser `parseSheet`), preservando a leitura das duas primeiras abas RITMO/JSL e os horários sem inventar datas.
- Validar token, perfil aprovado e acesso a Jacareí, autorização de analista/admin, timeout e cache curto no servidor. Somente o cliente aplica propostas no Firebase conforme as regras existentes.

## CORS e operação

- Permitir somente a origem exata do Pages, por exemplo `https://USUARIO.github.io`. O navegador não envia o nome do repositório no Origin.
- Responder a OPTIONS autorizado com `Access-Control-Allow-Origin` exato, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type` e `Vary: Origin`.
- Incluir `Access-Control-Allow-Origin` também nas respostas POST e de erro para a origem permitida. Não usar wildcard e não refletir qualquer Origin sem allowlist.
- O cliente não envia cookies. O Bearer é validado a cada requisição, independentemente do CORS.
- Usar HTTPS, erros genéricos, `Cache-Control: no-store, private`, sem redirecionamentos e sem tokens em logs. Não remover a validação de origem do endpoint antigo para aceitar qualquer site.
- Configurar a proteção de dados no servidor e no Firebase; permissões visuais não substituem autorização.

## Ordem de validação

1. Publicar o frontend em endereço de teste e validar login com usuário de teste.
2. Disponibilizar as APIs em serviço com execução de backend, mantendo o catálogo privado fora do pacote público.
3. Testar token inválido, operador, outra unidade, origem não autorizada e falha da planilha: nenhum deles deve liberar acesso ou modificar horários.
4. Configurar `apiBaseUrl` no frontend e validar uma sincronização controlada com DT de teste.
5. Somente após validação, decidir a migração do uso operacional. O site oficial permanece disponível.
