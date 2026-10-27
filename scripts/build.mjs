import {cp,rm,mkdir,copyFile} from 'node:fs/promises';
await rm('_site',{recursive:true,force:true});await mkdir('_site');
await cp('site','_site',{recursive:true});
// painel.html continua existindo para quem tem o endereço antigo salvo; é gerado aqui
// em vez de ficar duplicado (1,7 MB) no repositório.
await copyFile('_site/index.html','_site/painel.html');
console.log('HEILOG estático preparado em _site/');
