const LS_KEY      = 'haber_v15';
const LS_PERFILES = 'haber_v15_perfiles';
const LS_MASIVO   = 'haber_v15_masivo';

let perfil = {
  nombre: '', sueldo: 0, af: 0,
  seguro: 'AFP', afpNombre: 'Integra',
  epsMode: false, epsMonto: 0,
  jornada: 'FORANEO',
  semana:  'L-S',
  movilidadMes: 0,
};

// ── NAVEGACIÓN MASIVO ─────────────────────────────────────────────────────────

function irMasivo() {
  ['screen-app', 'screen-onboarding', 'screen-perfiles'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('screen-masivo').style.display = 'block';
  updateTopNav('masivo');
  renderMasivoHistorial();
}

function mostrarOnboarding() {
  document.getElementById('screen-perfiles').style.display   = 'none';
  document.getElementById('screen-onboarding').style.display = '';
}

// ── PERFIL / HISTORIAL ───────────────────────────────────────────────────────

function loadPerfiles() {
  try { return JSON.parse(localStorage.getItem(LS_PERFILES) || '[]'); }
  catch(e) { return []; }
}

function saveProfile(nombre, anio) {
  const perfiles = loadPerfiles();
  const key      = nombre + '|' + anio;
  const idx      = perfiles.findIndex(p => p.key === key);
  const entry    = {
    key, nombre, anio,
    perfil:    { ...perfil },
    gastos:    JSON.parse(JSON.stringify(gastos)),
    flujo:     JSON.parse(JSON.stringify(flujoData)),
    ts:        Date.now(),
  };
  if (idx >= 0) perfiles[idx] = entry;
  else          perfiles.unshift(entry);
  try { localStorage.setItem(LS_PERFILES, JSON.stringify(perfiles.slice(0, 20))); } catch(e) {}
}

function showPerfilSelector() {
  const perfiles = loadPerfiles();
  const lista    = document.getElementById('perfiles-lista');
  lista.innerHTML = '';
  perfiles.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:stretch';

    const btn = document.createElement('button');
    btn.className = 'perfil-item';
    btn.style.flex = '1';
    btn.innerHTML = `
      <div class="pi-name">${p.nombre}</div>
      <div class="pi-meta">Año ${p.anio} · ${new Date(p.ts).toLocaleDateString('es-PE')}</div>
    `;
    btn.onclick = () => cargarPerfil(p);

    const exp = document.createElement('button');
    exp.className = 'btn btn-ghost btn-sm';
    exp.title     = 'Exportar este perfil';
    exp.textContent = '⬇';
    exp.style.cssText = 'padding:0 10px;flex-shrink:0;font-size:13px';
    exp.onclick = (e) => {
      e.stopPropagation();
      exportarPerfil(p);
    };

    const del = document.createElement('button');
    del.className = 'btn btn-danger btn-sm';
    del.title     = 'Eliminar perfil';
    del.textContent = '✕';
    del.style.cssText = 'padding:0 10px;flex-shrink:0;font-size:12px';
    del.onclick = (e) => {
      e.stopPropagation();
      eliminarPerfil(p.nombre, p.anio);
    };

    row.appendChild(btn);
    row.appendChild(exp);
    row.appendChild(del);
    lista.appendChild(row);
  });
  document.getElementById('screen-perfiles').style.display = 'flex';
  updateTopNav('perfiles');
}

function eliminarPerfil(nombre, anio) {
  if (!confirm('¿Eliminar el perfil "' + nombre + ' · ' + anio + '"?')) return;
  const perfiles = loadPerfiles().filter(p => !(p.nombre === nombre && p.anio === anio));
  try { localStorage.setItem(LS_PERFILES, JSON.stringify(perfiles)); } catch(e) {}
  showToast('Perfil eliminado ✓');
  showPerfilSelector();
}

/** Vuelve a la pantalla principal de perfiles desde cualquier pantalla */
function irInicio() {
  saveAll();
  ['screen-app', 'screen-masivo', 'screen-onboarding'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  showPerfilSelector();
}

function cargarPerfil(p) {
  perfil    = Object.assign({ movilidadMes: 0 }, perfil, p.perfil);
  gastos    = p.gastos   || gastos;
  flujoData = p.flujo    || flujoData;
  document.getElementById('screen-perfiles').style.display = 'none';
  arrancaApp();
}

// ── MASIVO: ESTADO ───────────────────────────────────────────────────────────
let _masDatos     = [];
// _baseData y _francoData ya declarados en motor_excel.js
let _baseLoaded   = false;
let _francoLoaded = false;
let _francoAnio   = null;   // año del francoplan cargado
let _francoMes    = null;   // mes  del francoplan cargado

function checkGenerarBtn() {
  const btn = document.getElementById('btn-generar');
  if (btn) btn.disabled = !(_baseLoaded && _francoLoaded);
}

// Drag & drop
function dragOver(e, boxId) {
  e.preventDefault();
  document.getElementById(boxId)?.classList.add('drag-over');
}
function dragLeave(e, boxId) {
  document.getElementById(boxId)?.classList.remove('drag-over');
}
async function dropFile(e, tipo) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const boxId = tipo === 'base' ? 'box-base-s' : 'box-franco-s';
  document.getElementById(boxId)?.classList.remove('drag-over');
  if (tipo === 'base') await _processBaseFile(file);
  else                 await _processFrancoFile(file);
}

// File loaders
async function loadBaseSc(input) {
  const file = input.files[0]; if (!file) return;
  await _processBaseFile(file);
}
async function loadFrancoSc(input) {
  const file = input.files[0]; if (!file) return;
  await _processFrancoFile(file);
}

async function _processBaseFile(file) {
  const buf   = await readFileBuffer(file);
  _baseData   = parseBase(buf);
  _baseLoaded = true;
  document.getElementById('box-base-s')?.classList.add('loaded');
  const fnEl = document.getElementById('base-s-fname');
  const stEl = document.getElementById('base-s-status');
  if (fnEl) fnEl.textContent = file.name;
  if (stEl) stEl.textContent = '✓ ' + _baseData.length + ' trabajadores';
  showToast(_baseData.length + ' trabajadores cargados');
  checkGenerarBtn();
}

async function _processFrancoFile(file) {
  const anio   = parseInt(document.getElementById('mas-anio')?.value || new Date().getFullYear());
  const mes    = parseInt(document.getElementById('mas-mes')?.value  || new Date().getMonth());
  const buf    = await readFileBuffer(file);
  _francoData  = parseFranco(buf, anio, mes);
  _francoLoaded = true;
  _francoAnio   = anio;     // guardar para validación posterior
  _francoMes    = mes;
  document.getElementById('box-franco-s')?.classList.add('loaded');
  const fnEl = document.getElementById('franco-s-fname');
  const stEl = document.getElementById('franco-s-status');
  if (fnEl) fnEl.textContent = file.name;
  if (stEl) stEl.textContent = '✓ ' + Object.keys(_francoData).length + ' registros';
  showToast(Object.keys(_francoData).length + ' registros de francoplan cargados');
  checkGenerarBtn();
}

function resetMasivoImport() {
  _francoLoaded = false;
  _francoData   = {};
  _francoAnio   = null;
  _francoMes    = null;
  const box = document.getElementById('box-franco-s');
  const st  = document.getElementById('franco-s-status');
  const fn  = document.getElementById('franco-s-fname');
  if (box) box.classList.remove('loaded');
  if (st)  { st.textContent = ''; st.style.color = ''; }
  if (fn)  fn.textContent = 'tareo_francoplan.xlsx';
  checkGenerarBtn();
}

function ejecutarMasivo() {
  if (!_baseData || !_baseData.length)                  { showToast('Carga la base de trabajadores'); return; }
  if (!_francoData || !Object.keys(_francoData).length) { showToast('Carga el francoplan'); return; }

  const anio  = parseInt(document.getElementById('mas-anio').value) || 2026;
  const mes   = parseInt(document.getElementById('mas-mes').value);

  // ── Validar que el francoplan corresponda al período seleccionado ──
  if (_francoAnio !== null && (_francoAnio !== anio || _francoMes !== mes)) {
    const MESES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const cargado  = MESES_LABEL[_francoMes]  + ' ' + _francoAnio;
    const elegido  = MESES_LABEL[mes]         + ' ' + anio;
    showToast(`⚠ Francoplan cargado: ${cargado}. Período elegido: ${elegido}. Recarga el francoplan o cambia el período.`);
    // Mostrar mensaje más visible en pantalla
    const stEl = document.getElementById('franco-s-status');
    if (stEl) stEl.textContent = `⚠ Período incorrecto (${cargado})`;
    stEl?.style && (stEl.style.color = 'var(--danger, #e74c3c)');
    return;
  }
  const { periodo: periodoProvis } = getPeriodoProvis(mes);

  document.getElementById('mas-loading-wrap').style.display  = '';
  document.getElementById('mas-table-el').style.display      = 'none';
  document.getElementById('mas-empty').style.display         = 'none';
  document.getElementById('mas-export-bar').style.display    = 'none';
  document.getElementById('mas-loading-txt').textContent     = 'Calculando ' + _baseData.length + ' trabajadores...';

  setTimeout(() => {
    const results = [];
    for (const worker of _baseData) {
      const francoMatch = matchWorker(worker.nombre, _francoData);
      if (!francoMatch) {
        results.push({ worker, result: null, estado: 'sin-tareo' });
        continue;
      }
      try {
        const workerData = { ...worker, jornada: francoMatch.jornada, marcas: francoMatch.marcas };
        const result = calcularPlanilla({
          sueldo:      workerData.sueldo,
          af:          workerData.af,
          afpNombre:   workerData.afpNombre,
          epsMode:     workerData.epsMode,
          epsMonto:    workerData.epsMonto,
          seguro:      workerData.seguro,
          marcas:      francoMatch.marcas,
          anio, mes,
          jornada:     workerData.jornada,
          periodoProvis,
          movilidadMes: 0, // masivo usa 0 por defecto (sin campo individual)
        });
        results.push({ worker: workerData, result, estado: 'ok' });
      } catch(e) {
        results.push({ worker, result: null, estado: 'error' });
      }
    }

    window._masResults = results;
    _masDatos = results;
    saveMasivoHistorial(anio, mes, results);
    renderMasivoHistorial();
    renderMasivo(results, anio, mes);
    document.getElementById('mas-loading-wrap').style.display = 'none';

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const ok    = results.filter(r => r.estado === 'ok').length;
    const err   = results.filter(r => r.estado === 'error').length;
    const pend  = results.filter(r => r.estado === 'sin-tareo').length;
    document.getElementById('mas-cnt-ok').textContent   = ok;
    document.getElementById('mas-cnt-err').textContent  = err;
    document.getElementById('mas-cnt-pend').textContent = pend;
    document.getElementById('mas-sub').textContent      = _baseData.length + ' trabajadores · ' + meses[mes] + ' ' + anio;

    if (ok > 0) {
      document.getElementById('mas-export-bar').style.display = 'flex';
    }
  }, 80);
}

function renderMasivo(results, anio, mes) {
  const tbody = document.getElementById('mas-tbody');
  const table = document.getElementById('mas-table-el');
  const empty = document.getElementById('mas-empty');
  if (!results || results.length === 0) {
    empty.style.display = '';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = '';
  tbody.innerHTML = '';
  results.forEach((item, i) => {
    const tr = document.createElement('tr');
    const w  = item.worker;
    if (item.estado === 'ok') {
      const r = item.result;
      tr.innerHTML = `
        <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${w.dni || '—'}</td>
        <td>
          <div class="w-name">${w.nombre}</div>
          <div class="w-sub">${(w.cargo || '—')} · ${w.jornada}</div>
        </td>
        <td style="font-size:10px;color:var(--muted)">${w.area || '—'}</td>
        <td><span class="tb-badge">${w.jornada}</span></td>
        <td style="font-size:10px">${w.seguro === 'AFP' ? 'AFP ' + w.afpNombre : 'ONP'}</td>
        <td class="w-money">${fmt(r.diasSueldo)}</td>
        <td class="w-money pos">${fmtS(r.totalIngresos)}</td>
        <td class="w-money neg">−${fmtS(r.totalDesc)}</td>
        <td class="w-money" style="font-size:13px;font-weight:700">${fmtS(r.neto)}</td>
        <td><span class="status-pill sp-ok"><span class="sp-dot"></span>OK</span></td>
        <td style="display:flex;gap:4px">
          <button class="mas-btn" onclick="verTrabajador(${i})" title="Ver desglose">👁 Ver</button>
          <button class="mas-btn" onclick="exportarPDFSingle(${i})" title="Descargar PDF">⬇ PDF</button>
        </td>
      `;
    } else {
      const badge = item.estado === 'sin-tareo'
        ? '<span class="status-pill sp-pend"><span class="sp-dot"></span>Sin tareo</span>'
        : '<span class="status-pill sp-err"><span class="sp-dot"></span>Error</span>';
      tr.innerHTML = `
        <td style="color:var(--muted);font-size:10px">${w.dni || '—'}</td>
        <td class="w-name" colspan="8">${w.nombre}</td>
        <td>${badge}</td>
        <td></td>
      `;
    }
    tbody.appendChild(tr);
  });
}

// ── MODAL VER TRABAJADOR ─────────────────────────────────────────────────────

function verTrabajador(idx) {
  const item = (window._masResults || [])[idx];
  if (!item || item.estado !== 'ok') return;
  const w = item.worker;
  const r = item.result;

  const fS = v => 'S/ ' + (v || 0).toFixed(2);

  const filas = (label, val, cls = '') =>
    `<div class="mvc-row"><span class="mvc-label">${label}</span><span class="mvc-val ${cls}">${val}</span></div>`;

  document.getElementById('mvc-body').innerHTML = `
    <div class="mvc-nombre">${w.nombre}</div>
    <div class="mvc-meta">${w.cargo || '—'} · ${w.area || '—'} · ${w.jornada} · ${w.seguro === 'AFP' ? 'AFP ' + w.afpNombre : 'ONP'}</div>

    <div class="mvc-section">Ingresos</div>
    ${filas('Días trabajados', r.diasSueldo !== undefined ? r.diasSueldo : '—')}
    ${filas('Sueldo del período', fS(r.sueldoPeriodo ?? r.totalIngresos), 'pos')}
    ${r.af > 0 ? filas('Asignación familiar', fS(r.af), 'pos') : ''}
    ${r.alimentacion > 0 ? filas('Alimentación', fS(r.alimentacion), 'pos') : ''}
    ${r.movilidad > 0 ? filas('Movilidad', fS(r.movilidad), 'pos') : ''}
    ${r.gratiProvis > 0 ? filas('Grati. provisional', fS(r.gratiProvis), 'pos') : ''}
    ${r.ctsProvis > 0 ? filas('CTS provisional', fS(r.ctsProvis), 'pos') : ''}
    ${filas('Total ingresos', fS(r.totalIngresos), 'pos')}

    <div class="mvc-section">Descuentos</div>
    ${r.afpAporte > 0 ? filas('AFP – Aporte', fS(r.afpAporte), 'neg') : ''}
    ${r.afpComision > 0 ? filas('AFP – Comisión', fS(r.afpComision), 'neg') : ''}
    ${r.afpSeguro > 0 ? filas('AFP – Seguro', fS(r.afpSeguro), 'neg') : ''}
    ${r.onp > 0 ? filas('ONP', fS(r.onp), 'neg') : ''}
    ${r.eps > 0 ? filas('EPS', fS(r.eps), 'neg') : ''}
    ${r.rentaQta > 0 ? filas('Renta 5ta', fS(r.rentaQta), 'neg') : ''}
    ${filas('Total descuentos', '−' + fS(r.totalDesc), 'neg')}

    <div class="mvc-neto">${fS(r.neto)}</div>
  `;

  document.getElementById('modal-ver-overlay').style.display = 'flex';
}

function cerrarModalVer() {
  document.getElementById('modal-ver-overlay').style.display = 'none';
}

/** Guarda la planilla actual en el historial (también ocurre automáticamente al generar) */
function guardarPlanillaManual() {
  const results = window._masResults || [];
  if (!results.length) { showToast('No hay planilla generada aún'); return; }
  const anio = parseInt(document.getElementById('mas-anio').value) || new Date().getFullYear();
  const mes  = parseInt(document.getElementById('mas-mes').value);
  saveMasivoHistorial(anio, mes, results);
  renderMasivoHistorial();
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  showToast('Planilla de ' + MESES[mes] + ' ' + anio + ' guardada ✓');
}

// ── AÑOS DINÁMICOS (flujo-anio y mas-anio) ────────────────────────────────────

/**
 * Rellena un <select> de años con rango [now-2 … now+2].
 * @param {string} selectId
 * @param {number} [selected]  año pre-seleccionado (default: año actual)
 */
function buildAnioOptions(selectId, selected) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const now  = new Date().getFullYear();
  const pick = selected || now;
  sel.innerHTML = '';
  for (let y = now - 2; y <= now + 2; y++) {
    const opt       = document.createElement('option');
    opt.value       = y;
    opt.textContent = y;
    if (y === pick) opt.selected = true;
    sel.appendChild(opt);
  }
}

function initMasivoAnios() {
  buildAnioOptions('mas-anio');
  buildAnioOptions('flujo-anio');
}

// ── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let calState = {
  anio:       new Date().getFullYear(),
  mes:        new Date().getMonth(),
  marcas:     {},
  markActivo: 'W',
  painting:   false,
};

let gastos    = { tarjetas: [], servicios: [], otros: [] };
let flujoData = {};
window._masResults = [];

function loadLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}
function saveLS(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e) {}
}
function loadAll() {
  const d = loadLS();
  if (!d) return;
  if (d.perfil)   perfil    = Object.assign({ movilidadMes: 0 }, perfil, d.perfil);
  if (d.calState) calState  = Object.assign({}, calState, d.calState);
  if (d.gastos)   gastos    = d.gastos;
  if (d.flujo)    flujoData = d.flujo;
}
function saveAll() {
  saveLS({ perfil, calState, gastos, flujo: flujoData });
}

// ── INICIAR APP ──────────────────────────────────────────────────────────────

function iniciarApp() {
  const nombre = document.getElementById('ob-nombre').value.trim();
  if (!nombre) { alert('Ingresa tu nombre'); return; }

  perfil.nombre      = nombre;
  perfil.jornada     = document.querySelector('.jornada-opt.selected')?.dataset.j  || 'FORANEO';
  perfil.semana      = leerDiasPicker() || 'L,M,X,J,V,S';
  perfil.seguro      = document.querySelector('.seg-opt.selected[data-seg]')?.dataset.seg || 'AFP';
  perfil.afpNombre   = document.querySelector('.seg-opt.selected[data-afp]')?.dataset.afp || 'Integra';
  perfil.epsMode     = false;
  perfil.epsMonto    = 0;
  perfil.sueldo      = 0;
  perfil.af          = 0;
  perfil.movilidadMes = 0;

  arrancaApp();
}

function arrancaApp() {
  document.getElementById('screen-onboarding').style.display = 'none';
  document.getElementById('screen-perfiles').style.display   = 'none';
  document.getElementById('screen-app').style.display        = 'block';
  document.getElementById('hdr-nombre').textContent          = perfil.nombre;

  sincronizarUI();
  buildCal();
  recalcular();
  initGastos();
  renderFlujo();
  updateTopNav('individual');
}

function editarPerfil() {
  document.getElementById('screen-app').style.display        = 'none';
  document.getElementById('screen-onboarding').style.display = '';

  document.getElementById('ob-nombre').value = perfil.nombre;

  document.querySelectorAll('.seg-opt[data-seg]').forEach(el => {
    el.classList.toggle('selected', el.dataset.seg === perfil.seguro);
  });
  document.querySelectorAll('.seg-opt[data-afp]').forEach(el => {
    el.classList.toggle('selected', el.dataset.afp === perfil.afpNombre);
  });
  document.getElementById('ob-afp-wrap').style.display = perfil.seguro === 'ONP' ? 'none' : '';

  document.querySelectorAll('.jornada-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.j === perfil.jornada);
  });
  restaurarDiasPicker(perfil.semana);
  const semWrap = document.getElementById('ob-semana-wrap');
  if (semWrap) semWrap.style.display = perfil.jornada === 'LOCAL' ? '' : 'none';
}

function sincronizarUI() {
  document.getElementById('ind-sueldo').value     = perfil.sueldo      || '';
  document.getElementById('ind-af').value         = perfil.af          || '';
  document.getElementById('ind-movil').value      = perfil.movilidadMes || '';
  document.getElementById('chk-hijos').checked    = perfil.af === 113;
  document.getElementById('chk-eps').checked      = perfil.epsMode;
  const epsD = document.getElementById('ind-eps-detail');
  if (perfil.epsMode) {
    epsD.classList.add('open');
    document.getElementById('ind-eps-monto').value = perfil.epsMonto || '';
  } else {
    epsD.classList.remove('open');
  }
  const now = new Date();
  document.getElementById('ind-anio').value = now.getFullYear();
  document.getElementById('ind-mes').value  = now.getMonth();
  calState.anio = now.getFullYear();
  calState.mes  = now.getMonth();
}

// ── UI HELPERS ───────────────────────────────────────────────────────────────

function switchTab(btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
}

function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const label  = isDark ? '☾ Dark' : '☀ Light';
  const t1 = document.getElementById('btn-theme');
  const t2 = document.getElementById('btn-theme-nav');
  if (t1) t1.textContent = label;
  if (t2) t2.textContent = label;
}

function selSeg(el) {
  document.querySelectorAll('.seg-opt[data-seg]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('ob-afp-wrap').style.display = el.dataset.seg === 'AFP' ? '' : 'none';
}

function selAFP(el) {
  document.querySelectorAll('.seg-opt[data-afp]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

function selJornada(el) {
  document.querySelectorAll('.jornada-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  const isLocal = el.dataset.j === 'LOCAL';
  const semWrap = document.getElementById('ob-semana-wrap');
  if (semWrap) semWrap.style.display = isLocal ? '' : 'none';
}

// ── SELECTOR DE DÍAS SUELTOS ──────────────────────────────────────────────────
/** Mapa de código día → número JS (getDay()) */
const DIA_MAP = { L:1, M:2, X:3, J:4, V:5, S:6, D:0 };
const DIA_ORDER = ['L','M','X','J','V','S','D'];

/**
 * Devuelve un Set con los números JS (0=Dom…6=Sáb) de días hábiles según perfil.semana.
 * Compatible con formato antiguo ('L-S','L-V') y nuevo ('L,M,X,J,V').
 */
function getDiasHab(semana) {
  const s = semana || perfil.semana || 'L-S';
  if (s === 'L-S') return new Set([1,2,3,4,5,6]);
  if (s === 'L-V') return new Set([1,2,3,4,5]);
  // Formato nuevo: "L,M,X,J,V,S"
  return new Set(s.split(',').map(c => DIA_MAP[c]).filter(v => v !== undefined));
}

/** Lee los días seleccionados del picker y devuelve el string "L,M,X,J,V" */
function leerDiasPicker() {
  const activos = [];
  document.querySelectorAll('#ob-dias-picker .dsp-cell.selected').forEach(c => {
    activos.push(c.dataset.dia);
  });
  // Mantener el orden canónico L M X J V S D
  return DIA_ORDER.filter(d => activos.includes(d)).join(',');
}

/** Toggle individual de celda día */
function toggleDia(el) {
  el.classList.toggle('selected');
}

/** Restaura el picker con los días de perfil.semana */
function restaurarDiasPicker(semana) {
  const hab = getDiasHab(semana);
  document.querySelectorAll('#ob-dias-picker .dsp-cell').forEach(c => {
    c.classList.toggle('selected', hab.has(DIA_MAP[c.dataset.dia]));
  });
}

function selPeriodo(el) {
  document.querySelectorAll('.seg-opt[data-p]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  recalcular();
}

function toggleHijosApp() {
  const checked = document.getElementById('chk-hijos').checked;
  if (checked) document.getElementById('ind-af').value = '113';
  else if (document.getElementById('ind-af').value === '113') document.getElementById('ind-af').value = '';
  recalcular();
}

function toggleEpsApp() {
  const checked = document.getElementById('chk-eps').checked;
  const det     = document.getElementById('ind-eps-detail');
  if (checked) det.classList.add('open');
  else         det.classList.remove('open');
  recalcular();
}

// ── CALENDARIO ───────────────────────────────────────────────────────────────
// AbortController para gestionar listeners del calendario sin acumulación
let _calAbortCtrl = null;

function buildCal() {
  const { anio, mes } = calState;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-label').textContent = meses[mes] + ' ' + anio;

  const isLocal  = perfil.jornada === 'LOCAL';
  const diasHab  = getDiasHab(perfil.semana);

  // LOCAL: si no hay marcas en el mes, pre-rellenar días hábiles como W
  if (isLocal) {
    const totalD    = new Date(anio, mes + 1, 0).getDate();
    const hayMarcas = Object.keys(calState.marcas).some(k => k.startsWith(anio + '-' + mes + '-'));
    if (!hayMarcas) {
      for (let d = 1; d <= totalD; d++) {
        const dow = new Date(anio, mes, d).getDay();
        if (diasHab.has(dow)) {
          calState.marcas[anio + '-' + mes + '-' + d] = 'W';
        }
      }
    }
  }

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Cabeceras
  for (const d of ['L','M','X','J','V','S','D']) {
    const hdr = document.createElement('div');
    hdr.className   = 'day-hdr';
    hdr.textContent = d;
    grid.appendChild(hdr);
  }

  const firstDow  = new Date(anio, mes, 1).getDay();
  const offset    = firstDow === 0 ? 6 : firstDow - 1;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  // Feriados del mes para mostrar estrella
  const feriadosDia = (typeof getFeriadosMes === 'function') ? getFeriadosMes(anio, mes) : [];

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div');
    e.className = 'day empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= totalDias; d++) {
    const dow       = new Date(anio, mes, d).getDay();
    const key       = anio + '-' + mes + '-' + d;
    const mark      = calState.marcas[key] || '';
    const esFeriado = feriadosDia.includes(d);
    const isDOM     = dow === 0;
    const blocked   = isLocal && !diasHab.has(dow);

    const el = document.createElement('div');
    el.dataset.day  = String(d); // ← clave para event delegation

    // Número del día como texto base
    el.textContent = d;

    let cls = 'day';
    if (mark)      cls += ' ' + mark;
    if (isDOM)     cls += ' dom';
    if (blocked)   cls += ' blocked';
    if (esFeriado) cls += ' feriado';
    el.className = cls;

    // Etiqueta de marca
    if (mark) {
      const lbl = document.createElement('div');
      lbl.className   = 'day-mark';
      lbl.textContent = mark;
      el.appendChild(lbl);
    }

    // Estrella de feriado (esquina superior derecha)
    if (esFeriado) {
      const star = document.createElement('div');
      star.className   = 'day-star';
      star.textContent = '★';
      el.appendChild(star);
    }

    grid.appendChild(el);
  }

  // Configurar event delegation (un solo juego de listeners por buildCal)
  _setupCalListeners(grid, anio, mes);
  updateCounters();
}

/** Configura listeners de pintado con AbortController (evita acumulación). */
function _setupCalListeners(grid, anio, mes) {
  if (_calAbortCtrl) _calAbortCtrl.abort();
  _calAbortCtrl = new AbortController();
  const sig = _calAbortCtrl.signal;

  function getCell(e) {
    return e.target.closest('[data-day]');
  }

  grid.addEventListener('mousedown', (e) => {
    const cell = getCell(e);
    if (!cell || cell.classList.contains('empty') || cell.classList.contains('blocked')) return;
    calState.painting = true;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig });

  // mouseover (no mouseenter) para capturar el arrastre sobre celdas hijas
  grid.addEventListener('mouseover', (e) => {
    if (!calState.painting) return;
    const cell = getCell(e);
    if (!cell || cell.classList.contains('empty') || cell.classList.contains('blocked')) return;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig });

  grid.addEventListener('touchstart', (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell || cell.classList.contains('blocked')) return;
    e.preventDefault();
    calState.painting = true;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig, passive: false });

  grid.addEventListener('touchmove', (e) => {
    if (!calState.painting) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    const cell = el.closest('[data-day]');
    if (!cell || cell.classList.contains('blocked')) return;
    paintDay(parseInt(cell.dataset.day));
  }, { signal: sig, passive: false });

  document.addEventListener('mouseup',  () => { calState.painting = false; }, { signal: sig });
  document.addEventListener('touchend', () => { calState.painting = false; }, { signal: sig });
}

/**
 * Pinta/despinta un día sin reconstruir el calendario completo.
 * Actualiza sólo la celda afectada, los contadores y el resultado.
 */
function paintDay(d) {
  const { anio, mes } = calState;
  const key  = anio + '-' + mes + '-' + d;
  const mark = calState.markActivo;
  const cur  = calState.marcas[key];

  // Toggle: si ya tiene la misma marca, se borra
  if (cur === mark) delete calState.marcas[key];
  else              calState.marcas[key] = mark;

  // ── Actualizar sólo esta celda (no rebuildar todo el calendario) ──
  const el = document.querySelector(`#cal-grid [data-day="${d}"]`);
  if (el) {
    const dow       = new Date(anio, mes, d).getDay();
    const isDOM     = dow === 0;
    const isLocal   = perfil.jornada === 'LOCAL';
    const blocked   = isLocal && !getDiasHab(perfil.semana).has(dow);
    const esFeriado = (typeof getFeriadosMes === 'function') && getFeriadosMes(anio, mes).includes(d);
    const newMark   = calState.marcas[key] || '';

    let cls = 'day';
    if (newMark)   cls += ' ' + newMark;
    if (isDOM)     cls += ' dom';
    if (blocked)   cls += ' blocked';
    if (esFeriado) cls += ' feriado';
    el.className  = cls;
    el.dataset.day = String(d);

    // Reconstruir contenido de la celda (número + mark + star)
    el.textContent = d; // limpia todo y pone el número
    if (newMark) {
      const lbl = document.createElement('div');
      lbl.className   = 'day-mark';
      lbl.textContent = newMark;
      el.appendChild(lbl);
    }
    if (esFeriado) {
      const star = document.createElement('div');
      star.className   = 'day-star';
      star.textContent = '★';
      el.appendChild(star);
    }
  }

  updateCounters();
  recalcular();
  saveAll();
}

function calPrev() {
  if (calState.mes === 0) { calState.mes = 11; calState.anio--; }
  else calState.mes--;
  syncCalMes();
}
function calNext() {
  if (calState.mes === 11) { calState.mes = 0; calState.anio++; }
  else calState.mes++;
  syncCalMes();
}
function syncCalMes() {
  document.getElementById('ind-anio').value = calState.anio;
  document.getElementById('ind-mes').value  = calState.mes;
  buildCal();
  recalcular();
}
function calClear() {
  const { anio, mes } = calState;
  for (const key of Object.keys(calState.marcas)) {
    if (key.startsWith(anio + '-' + mes + '-')) delete calState.marcas[key];
  }
  buildCal();
  recalcular();
  saveAll();
}

function selMark(btn) {
  document.querySelectorAll('.paint-btn').forEach(b =>
    b.classList.remove('sel-W','sel-R','sel-V','sel-F','sel-SU','sel-MED','sel-TL')
  );
  btn.classList.add('sel-' + btn.dataset.mark);
  calState.markActivo = btn.dataset.mark;
}

function updateCounters() {
  const { anio, mes } = calState;
  const counts = { W:0, R:0, V:0, F:0, SU:0, MED:0, TL:0 };
  for (const [key, val] of Object.entries(calState.marcas)) {
    if (key.startsWith(anio + '-' + mes + '-')) counts[val] = (counts[val]||0) + 1;
  }
  document.getElementById('cnt-W').textContent = counts.W;
  document.getElementById('cnt-R').textContent = counts.R;
  document.getElementById('cnt-V').textContent = counts.V;
  document.getElementById('cnt-F').textContent = counts.F + counts.SU;
}

function getMarcasDelMes() {
  const { anio, mes } = calState;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const arr = [];
  for (let d = 1; d <= totalDias; d++) {
    const key = anio + '-' + mes + '-' + d;
    arr.push(calState.marcas[key] || '');
  }
  return arr;
}

// ── CÁLCULO ──────────────────────────────────────────────────────────────────

/**
 * Suma ingresos afectos de meses anteriores guardados en flujoData.
 * Necesario para la fórmula progresiva de Renta 5ta (ingAnt en calcR5Full).
 * Sólo toma meses del mismo año con datos grabados (sueldo+af+alimGravable).
 */
function computeIngAnt(anio, mes) {
  let total = 0;
  for (let p = 0; p < mes; p++) {
    const dp = flujoData[anio + '-' + p];
    if (!dp) continue;
    const sp  = dp.sueldo  || 0;
    const ap  = dp.af      || 0;
    const alp = dp.alimentacion || 0;
    total += sp + ap + Math.min(alp, sp * 0.20);
  }
  return total;
}

function recalcular() {
  const anio        = parseInt(document.getElementById('ind-anio').value) || new Date().getFullYear();
  const mes         = parseInt(document.getElementById('ind-mes').value);
  const sueldo      = parseFloat(document.getElementById('ind-sueldo').value)    || 0;
  const af          = parseFloat(document.getElementById('ind-af').value)         || 0;
  const epsMode     = document.getElementById('chk-eps').checked;
  const epsMonto    = parseFloat(document.getElementById('ind-eps-monto').value)  || 0;
  const movilidadMes = parseFloat(document.getElementById('ind-movil')?.value)    || 0;
  const { periodo: periodoProvis, mesEnPeriodo } = getPeriodoProvis(mes);

  // Mantener perfil sincronizado con la pantalla
  perfil.sueldo      = sueldo;
  perfil.af          = af;
  perfil.epsMode     = epsMode;
  perfil.epsMonto    = epsMonto;
  perfil.movilidadMes = movilidadMes;

  calState.anio = anio;
  calState.mes  = mes;

  const marcas = getMarcasDelMes();
  const params = {
    sueldo, af, afpNombre: perfil.afpNombre,
    epsMode, epsMonto, seguro: perfil.seguro,
    marcas, anio, mes,
    jornada: perfil.jornada,
    periodoProvis,
    movilidadMes,
    ingAnt: computeIngAnt(anio, mes),
  };

  const r = calcularPlanilla(params);
  window._lastResult = r;
  window._lastParams = params;

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('res-neto').textContent    = fmtS(r.neto);
  document.getElementById('res-periodo').textContent = meses[mes] + ' ' + anio + ' · ' + perfil.jornada;
  document.getElementById('res-dias-s').textContent  = fmt(r.diasSueldo);
  document.getElementById('res-dias-v').textContent  = r.diasViat;
  document.getElementById('res-vdia').textContent    = fmtS(r.valorDia);

  document.getElementById('r-sueldo-prop').textContent = fmt(r.sueldoProp);
  document.getElementById('r-af-prop').textContent     = fmt(r.afProp);
  document.getElementById('r-alim').textContent        = fmt(r.alimentacion);
  document.getElementById('r-aloj').textContent        = fmt(r.alojamiento);
  document.getElementById('r-movil').textContent       = fmt(r.movilidad);
  document.getElementById('r-tot-ing').textContent     = fmt(r.totalIngresos);

  // Feriados: mostrar línea si hay alguno
  const feriadoEl = document.getElementById('r-feriado');
  if (feriadoEl) feriadoEl.textContent = fmt(r.feriadoProp || 0);

  document.getElementById('r-afp-fondo').textContent   = fmt(r.afpFondo);
  document.getElementById('r-afp-seguro').textContent  = fmt(r.afpSeguro);
  document.getElementById('r-onp').textContent         = fmt(r.onp);
  document.getElementById('r-r5').textContent          = fmt(r.r5Prop);
  document.getElementById('r-eps').textContent         = fmt(r.epsDesc);
  document.getElementById('r-tot-desc').textContent    = fmt(r.totalDesc);

  document.getElementById('r-essalud').textContent     = fmt(r.essalud);
  document.getElementById('r-vidaley').textContent     = fmt(r.vidaLey);
  document.getElementById('r-tot-emp').textContent     = fmt(r.essalud + r.vidaLey);

  document.getElementById('r-cts').textContent         = fmt(r.ctsMens);
  document.getElementById('r-grati').textContent       = fmt(r.gratiMes);
  document.getElementById('r-tot-prov').textContent    = fmt(r.ctsMens + r.gratiMes);

  updateRentaSteps(sueldo, af, epsMode, anio, r.diasSueldo, mes, r.alimentacion, params.ingAnt);
  updateBalanceGastos(r.neto);

  // ── Auto-save ingresos al flujoData (tiempo real) ──────────────────────────
  const fkey       = anio + '-' + mes;
  const prevGastos = (flujoData[fkey] || {}).gastos || 0;
  flujoData[fkey]  = Object.assign(flujoData[fkey] || {}, {
    anio, mes,
    neto:         r.neto,
    ingresos:     r.totalIngresos,
    dias:         r.diasSueldo,
    sueldo,
    af,
    alimentacion: r.alimentacion,
    gastos:       prevGastos,
    saldo:        r.neto - prevGastos,
  });
  saveAll();
  saveProfile(perfil.nombre, anio);
  renderFlujo();
}

function updateRentaSteps(sueldo, af, epsMode, anio, diasSueldo, mes, alimMes, ingAnt) {
  const steps     = buildRentaSteps(sueldo, af, epsMode, anio, diasSueldo, mes, alimMes, ingAnt);
  const mesNombre = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][steps.mes] || '';
  const bonifLbl  = epsMode ? '6.75% EPS' : '9% EsSalud';
  const cont      = document.getElementById('renta-steps');
  const ingAntRow = steps.ingAntAdj > 0
    ? `<div class="rs"><span class="rl">+ Ingresos anteriores (Ene–${mesNombre} acum.)</span><span class="rv">${fmtS(steps.ingAntAdj)}</span></div>`
    : '';
  const alimRow = steps.alimGrav > 0
    ? `<div class="rs"><span class="rl">+ Alimentación gravable (límite 20%)</span><span class="rv">${fmtS(steps.alimGrav)}</span></div>`
    : '';
  cont.innerHTML = `
    <div class="rs"><span class="rl">Proyección rem. restante (S+AF)×${steps.mult}</span><span class="rv">${fmtS(steps.proyMens - steps.alimGrav)}</span></div>
    ${alimRow}
    <div class="rs"><span class="rl">+ Gratificaciones (S+AF)×2 + bonif. ${bonifLbl}</span><span class="rv">${fmtS(steps.proyGrats)}</span></div>
    ${ingAntRow}
    <div class="rs"><span class="rl">= Ingresos anuales proyectados</span><span class="rv">${fmtS(steps.ingAnual)}</span></div>
    <div class="rs"><span class="rl">− 7 UIT (S/ ${steps.uit.toLocaleString('es-PE')} c/u)</span><span class="rv">−${fmtS(steps.uit7)}</span></div>
    <div class="rs highlight"><span class="rl">= Renta neta imponible</span><span class="rv">${fmtS(steps.rNeta)}</span></div>
    <div class="rs"><span class="rl">Tramo aplicable</span><span class="rv">${steps.tramo}</span></div>
    <div class="rs highlight"><span class="rl">Impuesto anual</span><span class="rv">${fmtS(steps.anual)}</span></div>
    <div class="rs"><span class="rl">÷ ${steps.div} = Mensual base (${mesNombre})</span><span class="rv">${fmtS(steps.mensual)}</span></div>
    <div class="rs highlight"><span class="rl">Proporcional (${fmt(diasSueldo)} días)</span><span class="rv">${fmtS(steps.proporcional)}</span></div>
  `;
}

function toggleRenta() {
  const body = document.getElementById('renta-body');
  const btn  = document.getElementById('renta-toggle-btn');
  body.classList.toggle('open');
  btn.classList.toggle('open');
}

// ── GASTOS ───────────────────────────────────────────────────────────────────

function initGastos() {
  const defaults = {
    tarjetas:  [['Ripley',''],['Oh!',''],['Extras','']],
    servicios: [['Entel',''],['Win',''],['Calidda',''],['YouTube',''],['Google One','']],
    otros:     [['Limpieza',''],['Salud',''],['Otros','']],
  };
  for (const cat of ['tarjetas','servicios','otros']) {
    if (!gastos[cat] || gastos[cat].length === 0) {
      gastos[cat] = defaults[cat].map(([n,v]) => ({ nombre: n, valor: v }));
    }
    renderGastos(cat);
  }
}

function renderGastos(cat) {
  const tbody = document.getElementById('tbody-' + cat);
  tbody.innerHTML = '';
  for (let i = 0; i < gastos[cat].length; i++) {
    const row = gastos[cat][i];
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${row.nombre||''}" oninput="gastos['${cat}'][${i}].nombre=this.value;saveAll()" placeholder="Concepto" style="width:100%"></td>
      <td><input type="number" value="${row.valor||''}" oninput="gastos['${cat}'][${i}].valor=this.value;updColTots();saveAll()" placeholder="0.00" style="width:80px;text-align:right"></td>
    `;
    tbody.appendChild(tr);
  }
  updColTots();
}

function addGastoRow(cat) {
  gastos[cat].push({ nombre: '', valor: '' });
  renderGastos(cat);
  saveAll();
}

function updColTots() {
  for (const cat of ['tarjetas','servicios','otros']) {
    const total = gastos[cat].reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
    document.getElementById('tot-' + cat).textContent = fmt(total);
  }
  const neto = window._lastResult?.neto || 0;
  updateBalanceGastos(neto);
  // Auto-save gastos al flujoData (tiempo real)
  const p = window._lastParams;
  if (p) {
    const key  = p.anio + '-' + p.mes;
    const totG = _totalGastos();
    flujoData[key] = Object.assign(flujoData[key] || { anio: p.anio, mes: p.mes }, {
      gastos: totG,
      saldo:  (flujoData[key]?.neto || neto) - totG,
    });
    saveAll();
    renderFlujo();
  }
}

function updateBalanceGastos(neto) {
  const totG = _totalGastos();
  document.getElementById('bal-ing').textContent = fmtS(neto);
  document.getElementById('bal-gas').textContent = fmtS(totG);
  document.getElementById('bal-sal').textContent = fmtS(neto - totG);
}

function _totalGastos() {
  return ['tarjetas','servicios','otros'].reduce((s, cat) => {
    return s + gastos[cat].reduce((a, r) => a + (parseFloat(r.valor) || 0), 0);
  }, 0);
}

// ── GUARDAR (auto-save — el guardado ocurre en tiempo real en recalcular/updColTots) ──

// Mantenidos por compatibilidad, ya no se usan como botones
function grabarIngresos() { showToast('Los ingresos se guardan automáticamente ✓'); }
function grabarGastos()   { showToast('Los gastos se guardan automáticamente ✓');   }
function grabarFlujo()    { showToast('El flujo se guarda automáticamente ✓');      }

// ── EXPORTAR / IMPORTAR PERFILES ────────────────────────────────────────────

/**
 * Descarga un JSON con todos los perfiles guardados en localStorage.
 * Los datos viven en localStorage['haber_v15_perfiles'] del navegador.
 * Para ver el almacenamiento: F12 > Application > Local Storage > http://127.0.0.1:5173
 */
function exportarPerfiles() {
  const perfiles = loadPerfiles();
  const current  = loadLS();
  const blob = new Blob([JSON.stringify({ perfiles, current, ts: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'haberes_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup descargado ✓');
}

/**
 * Importa un backup JSON generado por exportarPerfiles().
 * Fusiona los perfiles importados con los existentes (no borra los actuales).
 */
function importarPerfiles() {
  const inp = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data     = JSON.parse(ev.target.result);
        const imported = data.perfiles || [];
        if (!Array.isArray(imported) || imported.length === 0) {
          showToast('El archivo no contiene perfiles válidos');
          return;
        }
        const existing = loadPerfiles();
        const merged   = [...existing];
        let added = 0;
        for (const p of imported) {
          const key = p.nombre + '|' + p.anio;
          if (!merged.find(x => x.nombre + '|' + x.anio === key)) {
            merged.push(p);
            added++;
          }
        }
        localStorage.setItem(LS_PERFILES, JSON.stringify(merged.slice(-20)));
        showToast(added + ' perfil(es) importado(s) ✓');
        showPerfilSelector();
      } catch (err) {
        showToast('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}

// ── EXPORTAR PERFIL INDIVIDUAL ───────────────────────────────────────────────

/**
 * Descarga el JSON de un único perfil.
 * @param {Object} p  — entrada del array de perfiles
 */
function exportarPerfil(p) {
  const blob = new Blob([JSON.stringify({ perfiles: [p], ts: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'perfil_' + (p.nombre || 'sin_nombre').replace(/\s+/g, '_') + '_' + p.anio + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Perfil exportado ✓');
}

// ── FLUJO RESET ───────────────────────────────────────────────────────────────

/**
 * Borra el flujo del año seleccionado, previa verificación de contraseña (año actual).
 */
function resetFlujoAnio() {
  const anio  = parseInt(document.getElementById('flujo-anio').value);
  const pass  = prompt('🔒 Clave para borrar el flujo de ' + anio + ':');
  if (pass === null) return;
  const claveCorrecta = new Date().getFullYear().toString();
  if (pass !== claveCorrecta) {
    showToast('Clave incorrecta ✗');
    return;
  }
  for (let m = 0; m < 12; m++) delete flujoData[anio + '-' + m];
  saveAll();
  saveProfile(perfil.nombre, anio);
  renderFlujo();
  showToast('Flujo de ' + anio + ' borrado ✓');
}

// ── MASIVO HISTORIAL ──────────────────────────────────────────────────────────

/**
 * Guarda los resultados de una planilla en localStorage, clave YYYY-MM.
 * Conserva los últimos 24 meses.
 */
function saveMasivoHistorial(anio, mes, results) {
  try {
    const key  = anio + '-' + String(mes + 1).padStart(2, '0');
    const data = JSON.parse(localStorage.getItem(LS_MASIVO) || '{}');
    data[key]  = {
      anio, mes, ts: Date.now(),
      totalTrabajadores: results.length,
      ok:    results.filter(r => r.estado === 'ok').length,
      error: results.filter(r => r.estado === 'error').length,
      pend:  results.filter(r => r.estado === 'sin-tareo').length,
      results,
    };
    // Mantener solo los últimos 24 meses
    const keys = Object.keys(data).sort();
    if (keys.length > 24) keys.slice(0, keys.length - 24).forEach(k => delete data[k]);
    localStorage.setItem(LS_MASIVO, JSON.stringify(data));
  } catch(e) { console.error('saveMasivoHistorial:', e); }
}

function loadMasivoHistorial() {
  try { return JSON.parse(localStorage.getItem(LS_MASIVO) || '{}'); }
  catch(e) { return {}; }
}

/**
 * Renderiza los chips del historial de planillas en la pantalla masivo.
 */
function renderMasivoHistorial() {
  const wrap = document.getElementById('mas-historial-wrap');
  if (!wrap) return;
  const data = loadMasivoHistorial();
  const keys = Object.keys(data).sort().reverse();
  if (keys.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const list = wrap.querySelector('.mas-hist-list');
  if (!list) return;
  list.innerHTML = '';
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  keys.forEach(k => {
    const h    = data[k];
    const item = document.createElement('div');
    item.className = 'mas-hist-item';
    item.innerHTML = `
      <span>${MESES[h.mes]} ${h.anio}</span>
      <span style="color:var(--muted);font-size:10px">✓${h.ok} ✗${h.error}</span>
      <button onclick="cargarPlanillaHistorial('${k}')" title="Volver a mostrar esta planilla">↩ Ver</button>
    `;
    list.appendChild(item);
  });
}

/**
 * Recarga una planilla histórica y la muestra en pantalla.
 */
function cargarPlanillaHistorial(key) {
  const data = loadMasivoHistorial();
  const h    = data[key];
  if (!h || !h.results) { showToast('Historial no disponible'); return; }
  window._masResults = h.results;
  _masDatos          = h.results;
  // Actualizar selectores de período
  const anioEl = document.getElementById('mas-anio');
  const mesEl  = document.getElementById('mas-mes');
  if (anioEl) anioEl.value = h.anio;
  if (mesEl)  mesEl.value  = h.mes;
  renderMasivo(h.results, h.anio, h.mes);
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const ok    = h.results.filter(r => r.estado === 'ok').length;
  document.getElementById('mas-cnt-ok').textContent   = ok;
  document.getElementById('mas-cnt-err').textContent  = h.error || 0;
  document.getElementById('mas-cnt-pend').textContent = h.pend  || 0;
  document.getElementById('mas-sub').textContent      = (h.totalTrabajadores || h.results.length) + ' trabajadores · ' + MESES[h.mes] + ' ' + h.anio + ' (historial)';
  if (ok > 0) document.getElementById('mas-export-bar').style.display = 'flex';
  showToast('Planilla de ' + MESES[h.mes] + ' ' + h.anio + ' cargada ✓');
}

// ── TOP NAV ───────────────────────────────────────────────────────────────────

/**
 * Actualiza el estado visual del nav bar permanente.
 * @param {'perfiles'|'individual'|'masivo'} screen
 */
function updateTopNav(screen) {
  const nav = document.getElementById('top-nav');
  if (!nav) return;
  const tnNombre = document.getElementById('tn-nombre');
  const tnHome   = document.getElementById('tn-home');
  const tnMasivo = document.getElementById('tn-masivo');
  if (tnNombre) tnNombre.textContent = perfil.nombre ? '👤 ' + perfil.nombre : '';
  if (tnHome)   tnHome.classList.toggle('active',   screen === 'perfiles');
  if (tnMasivo) tnMasivo.classList.toggle('active', screen === 'masivo');
}

// ── FLUJO ────────────────────────────────────────────────────────────────────

function renderFlujo() {
  const anio   = parseInt(document.getElementById('flujo-anio')?.value || new Date().getFullYear());
  const ahora  = new Date();
  const mesHoy = ahora.getMonth();
  const anioHoy = ahora.getFullYear();
  const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const tbody  = document.getElementById('flujo-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totIng = 0, totGas = 0, totAho = 0;
  let mesesConDatos = 0;
  let acum = 0;

  for (let m = 0; m < 12; m++) {
    const key  = anio + '-' + m;
    const d    = flujoData[key];
    const tr   = document.createElement('tr');
    const esMesActual = (anio === anioHoy && m === mesHoy);
    if (esMesActual) tr.classList.add('ft-current');

    if (d) {
      const ing = d.ingresos || d.neto || 0;
      const gas = d.gastos   || 0;
      const aho = ing - gas;
      acum += aho;
      totIng += ing; totGas += gas; totAho += aho;
      mesesConDatos++;
      tr.innerHTML = `
        <td class="ft-mes">${MESES[m]}</td>
        <td class="ft-pos">${fmtS(ing)}</td>
        <td class="ft-neg">${gas > 0 ? fmtS(gas) : '—'}</td>
        <td class="${aho >= 0 ? 'ft-pos' : 'ft-neg'}">${fmtS(aho)}</td>
        <td class="ft-acum">${fmtS(acum)}</td>
      `;
    } else {
      tr.innerHTML = `
        <td class="ft-mes" style="color:var(--muted)">${MESES[m]}</td>
        <td style="color:var(--muted)">—</td>
        <td style="color:var(--muted)">—</td>
        <td style="color:var(--muted)">—</td>
        <td class="ft-acum" style="opacity:.45">${acum > 0 ? fmtS(acum) : '—'}</td>
      `;
    }
    tbody.appendChild(tr);
  }

  if (totIng <= 0 && totGas <= 0) return;

  // ── Fila TOTAL ──
  const tTotal = document.createElement('tr');
  tTotal.style.fontWeight = '700';
  tTotal.style.borderTop  = '2px solid var(--border)';
  tTotal.innerHTML = `
    <td class="ft-mes" style="color:var(--text)">TOTAL</td>
    <td class="ft-pos">${fmtS(totIng)}</td>
    <td class="ft-neg">${fmtS(totGas)}</td>
    <td class="${totAho >= 0 ? 'ft-pos' : 'ft-neg'}">${fmtS(totAho)}</td>
    <td class="ft-acum">${fmtS(acum)}</td>
  `;
  tbody.appendChild(tTotal);

  // ── Fila PROMEDIO ──
  if (mesesConDatos > 1) {
    const avgIng = totIng / mesesConDatos;
    const avgGas = totGas / mesesConDatos;
    const avgAho = totAho / mesesConDatos;
    const tProm  = document.createElement('tr');
    tProm.className = 'ft-summary';
    tProm.innerHTML = `
      <td class="ft-mes">Promedio / mes</td>
      <td class="ft-pos">${fmtS(avgIng)}</td>
      <td class="ft-neg">${avgGas > 0 ? fmtS(avgGas) : '—'}</td>
      <td class="${avgAho >= 0 ? 'ft-pos' : 'ft-neg'}">${fmtS(avgAho)}</td>
      <td style="color:var(--muted)">—</td>
    `;
    tbody.appendChild(tProm);
  }

  // ── Fila TASA DE AHORRO ──
  if (totIng > 0) {
    const tasa   = (totAho / totIng * 100).toFixed(1);
    const color  = totAho >= 0 ? 'var(--green)' : 'var(--red)';
    const tRate  = document.createElement('tr');
    tRate.className = 'ft-summary';
    tRate.innerHTML = `
      <td class="ft-mes" colspan="3" style="color:var(--muted)">Tasa de ahorro del período</td>
      <td colspan="2" style="font-weight:700;color:${color};font-size:13px">${tasa}%</td>
    `;
    tbody.appendChild(tRate);
  }
}

/**
 * Exporta el flujo del año seleccionado como CSV (Mes, Ingresos, Gastos, Ahorrado, Acumulado).
 */
function exportarFlujoCSV() {
  const anio  = parseInt(document.getElementById('flujo-anio')?.value || new Date().getFullYear());
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  let csv  = 'Mes,Ingresos,Gastos,Ahorrado,Acumulado\n';
  let acum = 0;
  for (let m = 0; m < 12; m++) {
    const d   = flujoData[anio + '-' + m];
    const ing = d ? (d.ingresos || d.neto || 0) : 0;
    const gas = d ? (d.gastos || 0) : 0;
    const aho = ing - gas;
    if (d) acum += aho;
    csv += `${MESES[m]},${ing.toFixed(2)},${gas.toFixed(2)},${aho.toFixed(2)},${acum.toFixed(2)}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'flujo_' + (perfil.nombre || 'perfil').replace(/\s+/g, '_') + '_' + anio + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Flujo ' + anio + ' exportado como CSV ✓');
}

// ── TOAST ────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  loadAll();
  initMasivoAnios();
  // Siempre mostrar selector de perfiles al inicio
  showPerfilSelector();
  renderMasivoHistorial();

  document.getElementById('ind-anio').addEventListener('change', () => {
    calState.anio = parseInt(document.getElementById('ind-anio').value);
    buildCal();
    recalcular();
  });
  document.getElementById('ind-mes').addEventListener('change', () => {
    calState.mes = parseInt(document.getElementById('ind-mes').value);
    buildCal();
    recalcular();
  });
});
