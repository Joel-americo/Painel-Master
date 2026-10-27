import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const html=readFileSync('site/index.html','utf8');
test('Pátio, Histórico, liberação HEILO e código do motorista preservados',()=>{
 for(const feature of ['tab-patio','tab-historico','redirects-toolbar','Código do motorista','heilog-logistica'])assert.ok(html.includes(feature),feature);
});
test('recursos locais resolvem na raiz e em subdiretório do repositório',()=>{
 const resources=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]).filter(x=>x.startsWith('./'));
 assert.ok(resources.length>10);
 for(const prefix of ['https://teste.github.io/','https://teste.github.io/heilog/']){
  for(const path of resources){const url=new URL(path,prefix);assert.ok(url.href.startsWith(prefix));assert.ok(existsSync('site/'+url.pathname.slice(new URL(prefix).pathname.length).split('?')[0]),path);}
 }
 assert.doesNotMatch(html,/(?:src|href)=["']\/(?!\/)/);
 assert.doesNotMatch(html,/import\(['"]\//);
});
test('manifesto e worker ficam no escopo do repositório, sem fallback de HTML antigo',()=>{
 const m=JSON.parse(readFileSync('site/manifest.webmanifest'));
 for(const k of ['id','start_url','scope'])assert.equal(m[k],'./');
 for(const icon of m.icons)assert.ok(existsSync('site/'+icon.src));
 const worker=readFileSync('site/pages-worker.js','utf8');assert.doesNotMatch(worker,/caches\.|respondWith\(/);
 assert.ok(html.includes('"./pages-worker.js"'));
});
function fixture(base=''){
 const calls=[];const window={HEILOG_PAGES_CONFIG:{apiBaseUrl:base},fetch:async(...args)=>{calls.push(args);return {ok:true};}};
 vm.runInNewContext(readFileSync('site/pages-runtime.js','utf8'),{window,URL,Set,Error});return {api:window.HeilogPages,calls};
}
test('API não configurada falha sem requisição e sem expor tokens',async()=>{
 const f=fixture();assert.equal(f.api.apiEnabled(),false);await assert.rejects(f.api.apiFetch('lusitana'));assert.equal(f.calls.length,0);
 assert.ok(html.includes('!window.HeilogPages.apiEnabled()'));
});
test('somente origem HTTPS configurada e rotas conhecidas recebem requisição',async()=>{
 for(const base of ['http://api.example.com','https://a:b@api.example.com','https://api.example.com/caminho'])assert.equal(fixture(base).api.apiEnabled(),false);
 const f=fixture('https://api.example.com');await f.api.apiFetch('lusitana',{method:'POST',headers:{Authorization:'Bearer TESTE'}});
 assert.equal(f.calls[0][0],'https://api.example.com/api/lusitana');assert.equal(f.calls[0][1].credentials,'omit');assert.equal(f.calls[0][1].redirect,'error');
 await assert.rejects(f.api.apiFetch('outra-rota'));assert.equal(f.calls.length,1);
});
test('sintaxe dos módulos e scripts do painel',()=>{
 const temp=mkdtempSync(join(tmpdir(),'heilog-pages-'));
 try{
  let i=0;
  for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
   if(!match[2].trim()||/application\/json/.test(match[1]))continue;
   const file=join(temp,String(i++)+(/type="module"/.test(match[1])?'.mjs':'.cjs'));writeFileSync(file,match[2]);
   const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  }
  for(const file of readdirSync('site').filter(x=>x.endsWith('.js'))){const result=spawnSync(process.execPath,['--check','site/'+file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('bibliotecas servidas pelo próprio site, com versões fixas',()=>{
 const external=[...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](https?:[^"']+)["']/g)].map(m=>m[1]);
 assert.deepEqual(external,['https://cdn.tailwindcss.com/3.4.17']);
 assert.doesNotMatch(html,/fonts\.googleapis\.com|cdn\.jsdelivr\.net|xlsx@0\.18/);
 for(const m of html.matchAll(/from "(https:\/\/www\.gstatic\.com[^"]+)"/g))assert.match(m[1],/firebasejs\/\d+\.\d+\.\d+\//);
 assert.ok(!existsSync('site/painel.html'),'painel.html é gerado no build');
 assert.match(readFileSync('scripts/build.mjs','utf8'),/painel\.html/);
});
test('publicação contém só site, sem diretório privado nem configurações de servidor',()=>{
 assert.ok(!existsSync('site/lib'));assert.ok(!existsSync('site/private'));assert.ok(!existsSync('site/_headers'));
 assert.ok(!html.includes('id="driver-code-known-names"'));
 const workflow=readFileSync('.github/workflows/pages.yml','utf8');assert.match(workflow,/path: _site/);
});
