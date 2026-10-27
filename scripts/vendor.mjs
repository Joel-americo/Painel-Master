// Garante que todas as bibliotecas usadas pelo painel estejam em site/vendor/,
// servidas pelo próprio GitHub Pages (sem depender de CDN na rede da fábrica).
//
// - Arquivos já presentes em site/vendor/ não são baixados de novo; os que têm
//   sha256 registrado abaixo são conferidos.
// - Os que faltam são baixados em versão FIXA (npm pack) e o sha256 é mostrado no log.
//   Para não depender mais de download, rode `npm run vendor` uma vez e faça commit
//   da pasta site/vendor/ e dos hashes impressos.
//
// Para atualizar uma biblioteca: mude a versão aqui e nos <script> do index.html.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, copyFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';

const VENDOR = [
  {to: 'chart.js-4.6.1/chart.umd.js', spec: 'chart.js@4.6.1',
   from: ['package/dist/chart.umd.min.js', 'package/dist/chart.umd.js']},
  {to: 'chartjs-adapter-date-fns-3.0.0/chartjs-adapter-date-fns.bundle.min.js', spec: 'chartjs-adapter-date-fns@3.0.0',
   from: ['package/dist/chartjs-adapter-date-fns.bundle.min.js']},
  {to: 'chartjs-chart-matrix-3.1.0/chartjs-chart-matrix.min.js', spec: 'chartjs-chart-matrix@3.1.0',
   from: ['package/dist/chartjs-chart-matrix.min.js', 'package/dist/chartjs-chart-matrix.js']},
  // SheetJS saiu do npm; o pacote oficial fica no CDN da própria SheetJS.
  {to: 'xlsx-0.20.3/xlsx.full.min.js', spec: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
   from: ['package/dist/xlsx.full.min.js']},
  // Já incluídos no repositório (baixados dos releases oficiais no GitHub).
  {to: 'html2canvas-1.4.1/html2canvas.min.js', sha256: 'e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb'},
  {to: 'sortablejs-1.15.2/Sortable.min.js', sha256: 'ca68430703c4f5960e90735867c6e94d29b5a3de37107d8100e5a301007e9e6e'},
  {to: 'inter-4.1/InterVariable.woff2', sha256: '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3'},
];

const ROOT = 'site/vendor';
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {cwd, encoding: 'utf8'});
  if (r.status !== 0) throw Error(`${cmd} ${args.join(' ')} falhou:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function fetchFromPackage(item, dest) {
  const temp = mkdtempSync(join(tmpdir(), 'heilog-vendor-'));
  try {
    const tgz = run('npm', ['pack', item.spec, '--silent', '--pack-destination', temp], temp).split('\n').pop();
    run('tar', ['-xzf', join(temp, tgz)], temp);
    const found = item.from.map(p => join(temp, p)).find(existsSync);
    if (!found) throw Error(`${item.spec}: nenhum destes arquivos existe no pacote: ${item.from.join(', ')}`);
    mkdirSync(dirname(dest), {recursive: true});
    copyFileSync(found, dest);
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
}

let failed = false;
for (const item of VENDOR) {
  const dest = join(ROOT, item.to);
  try {
    if (!existsSync(dest)) {
      if (!item.spec) throw Error('arquivo ausente e sem origem para download');
      fetchFromPackage(item, dest);
      console.log(`baixado  ${item.to}  sha256=${sha256(dest)}`);
    } else if (item.sha256 && sha256(dest) !== item.sha256) {
      throw Error('sha256 diferente do registrado');
    } else {
      console.log(`ok       ${item.to}`);
    }
  } catch (error) {
    failed = true;
    console.error(`ERRO     ${item.to}: ${error.message}`);
  }
}
if (failed) process.exit(1);
