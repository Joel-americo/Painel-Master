import {cp,rm,mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await rm('_site',{recursive:true,force:true});await mkdir('_site');
await cp('site','_site',{recursive:true});

// Versão automática nos arquivos .js/.css locais (?v=<hash do conteúdo>): quando um
// arquivo muda, o navegador baixa o novo; quando não muda, usa o que já tem em cache.
// Assim não é preciso trocar "?v=11" à mão a cada alteração.
let html=await readFile('_site/index.html','utf8');
const hashes=new Map();
for(const [,path] of html.matchAll(/(?:src|href)="\.\/([^"?]+\.(?:js|css))(?:\?[^"]*)?"/g)){
  if(!hashes.has(path))hashes.set(path,createHash('sha256').update(await readFile('_site/'+path)).digest('hex').slice(0,10));
}
html=html.replace(/((?:src|href)="\.\/)([^"?]+\.(?:js|css))(?:\?[^"]*)?"/g,(_,pre,path)=>`${pre}${path}?v=${hashes.get(path)}"`);
await writeFile('_site/index.html',html);

// painel.html continua existindo para quem tem o endereço antigo salvo; é gerado aqui
// em vez de ficar duplicado no repositório.
await copyFile('_site/index.html','_site/painel.html');
console.log(`HEILOG estático preparado em _site/ (${hashes.size} arquivos versionados)`);
