// Leitor do código de barras do DANFE pela câmera (celular/tablet).
// Uso: DanfeScanner.open(chave => { ... })  — chama de volta só com chave de 44 posições e dígito verificador válido.
// Android/Chrome: BarcodeDetector nativo. iPhone/iPad e outros: biblioteca ZXing servida em ./vendor/.
(function (root) {
  'use strict';
  var ZXING_SRC = './vendor/zxing-library-0.21.3/index.min.js';
  var ui = null, stream = null, timer = null, zx = null, ativo = false, callback = null;

  // Chave NF-e: DV módulo 11 sobre as 43 primeiras posições (aceita CNPJ alfanumérico: valor = código ASCII − 48).
  function chaveValida(c) {
    if (!/^[0-9A-Z]{44}$/.test(c)) return false;
    var soma = 0, peso = 2;
    for (var i = 42; i >= 0; i--) { soma += (c.charCodeAt(i) - 48) * peso; peso = peso === 9 ? 2 : peso + 1; }
    var r = soma % 11, dv = r < 2 ? 0 : 11 - r;
    return String(dv) === c[43];
  }

  function carregar(src) {
    return new Promise(function (ok, falha) {
      if (root.ZXing) return ok();
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { falha(new Error('zxing')); };
      document.head.appendChild(s);
    });
  }

  function montar() {
    if (ui) return ui;
    var wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Ler código de barras do DANFE');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#000;display:none;flex-direction:column;font-family:Inter,system-ui,sans-serif';
    wrap.innerHTML =
      '<video playsinline muted style="flex:1;width:100%;min-height:0;object-fit:cover"></video>' +
      '<div aria-hidden="true" style="position:absolute;left:6%;right:6%;top:40%;height:18%;border:3px solid rgba(255,255,255,.92);border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none"></div>' +
      '<div style="padding:14px 16px calc(16px + env(safe-area-inset-bottom,0px));background:#000;color:#fff;display:flex;flex-direction:column;gap:10px">' +
      '<p data-msg style="margin:0;font-size:15px;color:#d5dbe2;line-height:1.4"></p>' +
      '<button type="button" data-fechar style="min-height:52px;border-radius:12px;border:0;background:#fff;color:#111;font:700 16px Inter,system-ui,sans-serif">Cancelar</button>' +
      '</div>';
    document.body.appendChild(wrap);
    ui = { wrap: wrap, video: wrap.querySelector('video'), msg: wrap.querySelector('[data-msg]') };
    wrap.querySelector('[data-fechar]').addEventListener('click', fechar);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ativo) fechar(); });
    return ui;
  }

  function lido(texto) {
    var v = String(texto || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!ativo || v.length !== 44 || !chaveValida(v)) return;
    var cb = callback;
    try { if (navigator.vibrate) navigator.vibrate(80); } catch (_) {}
    fechar();
    if (cb) cb(v);
  }

  async function abrir(onChave) {
    callback = onChave; ativo = true;
    var u = montar();
    u.wrap.style.display = 'flex';
    u.msg.textContent = 'Deite o aparelho e encaixe o código de barras do DANFE no retângulo.';
    var restricoes = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
    try {
      if (!root.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('inseguro'), { name: 'Inseguro' });
      var nativo = false;
      if ('BarcodeDetector' in root) {
        try { nativo = (await root.BarcodeDetector.getSupportedFormats()).indexOf('code_128') >= 0; } catch (_) { nativo = false; }
      }
      if (nativo) {
        var det = new root.BarcodeDetector({ formats: ['code_128'] });
        stream = await navigator.mediaDevices.getUserMedia(restricoes);
        u.video.srcObject = stream; await u.video.play();
        timer = setInterval(async function () {
          if (!ativo) return;
          try { (await det.detect(u.video)).forEach(function (c) { lido(c.rawValue); }); } catch (_) {}
        }, 250);
        return;
      }
      await carregar(ZXING_SRC);
      var dicas = new Map();
      dicas.set(root.ZXing.DecodeHintType.POSSIBLE_FORMATS, [root.ZXing.BarcodeFormat.CODE_128]);
      dicas.set(root.ZXing.DecodeHintType.TRY_HARDER, true);
      zx = new root.ZXing.BrowserMultiFormatReader(dicas, 250);
      await zx.decodeFromConstraints(restricoes, u.video, function (res) { if (res) lido(res.getText()); });
    } catch (e) {
      if (!ativo) return;
      u.msg.textContent = e && e.name === 'NotAllowedError'
        ? 'A câmera foi bloqueada. Libere a câmera para este site nas configurações do navegador, ou digite a chave.'
        : e && e.name === 'Inseguro'
          ? 'A câmera só funciona com o site aberto pelo endereço https (GitHub Pages). Digite a chave.'
          : 'Não consegui usar a câmera neste aparelho. Digite a chave ou use o leitor USB.';
    }
  }

  function fechar() {
    ativo = false; callback = null;
    clearInterval(timer); timer = null;
    try { if (zx) zx.reset(); } catch (_) {}
    zx = null;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (ui) { ui.video.srcObject = null; ui.wrap.style.display = 'none'; }
  }

  root.DanfeScanner = { open: abrir, close: fechar, chaveValida: chaveValida };
})(window);
