// Sem fallback de HTML antigo: rede é a fonte das páginas nesta edição.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Não intercepta fetch nem armazena respostas/autenticação/dados operacionais.
