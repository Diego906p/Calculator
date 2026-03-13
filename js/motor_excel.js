let _baseData   = null;
let _francoData = null;

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MARCA_MAP = { 'W':1,'T':1,'TRABAJO':1,'R':1,'DESCANSO':1,'V':1,'VACACIONES':1,'F':1,'FALTA':1,'SU':1,'SUSPENSION':1,'MED':1,'MEDICO':1,'TL':1,'TELETRABAJO':1 };

function parseBase(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const workers = [];
  for (const row of rows) {
    const nombre = norm(row['APELLIDOS Y NOMBRES'] || row['NOMBRE'] || row['TRABAJADOR'] || '');
    if (!nombre) continue;
    const dni    = String(row['DNI'] || row['DOC'] || row['DOCUMENTO'] || '').trim();
    const cargo  = String(row['CARGO'] || row['PUESTO'] || row['OCUPACION'] || '').trim();
    const area   = String(row['AREA'] || row['CENTRO DE COSTO'] || row['CC'] || row['DEPARTAMENTO'] || '').trim();
    const sueldo = toNum(row['REMUNERACION'] || row['SUELDO'] || row['SUELDO BASE'] || 0);
    const afRaw  = String(row['ASIG. FAMILIAR'] || row['AF'] || '').trim().toUpperCase();
    const af     = (afRaw === 'SI' || afRaw === 'SÍ' || afRaw === 'S') ? 113 : toNum(afRaw) || 0;
    const regPension = String(row['REG PENSION'] || row['SISTEMA'] || row['AFP/ONP'] || row['SEGURO'] || '').toUpperCase();
    const seguro = regPension.includes('ONP') ? 'ONP' : 'AFP';
    const afpNombre = normalizeAFP(regPension || String(row['AFP'] || row['FONDO'] || 'Integra'));
    const epsCompania = String(row['COMPAÑIA EPS'] || row['EPS'] || '').trim().toUpperCase();
    const epsMode = epsCompania !== '' && epsCompania !== 'NINGUNA' && epsCompania !== 'NO' && epsCompania !== 'N';
    const epsMonto = toNum(row['MONTO EPS'] || row['COPAGO EPS'] || 0);
    const banco       = String(row['BANCO'] || row['ENTIDAD BANCARIA'] || '').trim();
    const cuenta      = String(row['CUENTA'] || row['NRO CUENTA'] || row['NUMERO CUENTA'] || '').trim();
    const cuentaCci   = String(row['CCI'] || row['CUENTA CCI'] || row['INTERBANCARIO'] || '').trim();
    const fechaIngreso = String(row['FECHA INGRESO'] || row['F. INGRESO'] || row['INICIO'] || '').trim();
    workers.push({ nombre, dni, cargo, area, sueldo, af, seguro, afpNombre, epsMode, epsMonto, banco, cuenta, cuentaCci, fechaIngreso, jornada: 'FORANEO' });
  }
  return workers;
}

function parseFranco(buffer, anio, mes) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const result = {};

  // ── 1. Detectar dataStartRow (fila tras la cabecera DNI/APELLIDOS) ──
  let dataStartRow = 4; // fallback
  for (let r = 0; r < Math.min(raw.length, 10); r++) {
    const c0 = String(raw[r][0] || '').toUpperCase().trim();
    const c1 = String(raw[r][1] || '').toUpperCase().trim();
    if (c0 === 'DNI' || c1.includes('APELLIDOS')) {
      dataStartRow = r + 1;
      break;
    }
  }

  // ── 2. Detectar startCol SOLO en filas de cabecera (antes de los datos) ──
  //    Primero: buscar nombre del mes ("marzo", "abril", etc.)
  //    Segundo: buscar la secuencia 1,2,3 en filas de cabecera
  //    NUNCA escanear filas de trabajadores (sus marcas numéricas rompen la detección)
  const mesLabel = MESES_ES[mes];
  let startCol = 9; // fallback
  let found = false;

  // Paso 1: nombre del mes
  for (let r = 0; r < dataStartRow && !found; r++) {
    const row = raw[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c]).toLowerCase().trim();
      if (cell.includes(mesLabel)) { startCol = c; found = true; break; }
    }
  }

  // Paso 2: secuencia "1","2","3" en filas de cabecera (si no se encontró por nombre)
  if (!found) {
    for (let r = 0; r < dataStartRow && !found; r++) {
      const row = raw[r] || [];
      for (let c = 0; c < row.length - 2; c++) {
        if (String(row[c]).trim()   === '1' &&
            String(row[c+1]).trim() === '2' &&
            String(row[c+2]).trim() === '3') {
          startCol = c; found = true; break;
        }
      }
    }
  }

  // ── 3. Leer marcas de cada trabajador ──
  for (let r = dataStartRow; r < raw.length; r++) {
    const nombre = norm(String(raw[r][1] || '')); // col 1 = APELLIDOS Y NOMBRES
    if (!nombre) continue;
    const jornada = String(raw[r][7] || '').toUpperCase().includes('LOCAL') ? 'LOCAL' : 'FORANEO';
    const marcas = [];
    for (let d = 0; d < totalDias; d++) {
      const cell = String(raw[r][startCol + d] || '').trim().toUpperCase();
      marcas.push(normalizeMarca(cell));
    }
    result[nombre] = { marcas, jornada };
  }

  return result;
}

function normalizeMarca(raw) {
  if (!raw) return 'SU';
  const r = raw.toUpperCase().trim();
  if (/^\d+$/.test(r)) return 'W';             // 1, 2, ... 21 = día de trabajo
  if (/^S\d+$/.test(r)) return 'R';            // S1, S2, ... S7 = descanso
  if (/^V\d+$/.test(r)) return 'V';            // V1, V2, ... V7 = vacaciones
  if (r === 'W' || r === 'T' || r === 'TRABAJO') return 'W';
  if (r === 'R' || r === 'DESCANSO' || r === 'D') return 'R';
  if (r === 'V' || r === 'VAC' || r === 'VACACIONES') return 'V';
  if (r === 'F' || r === 'FALTA') return 'F';
  if (r === 'SU' || r === 'SUSP' || r === 'SUSPENSION' || r === 'SUSPENSIÓN') return 'SU';
  if (r === 'M' || r === 'MED' || r === 'MEDICO' || r === 'MÉDICO' || r === 'DM') return 'MED';
  if (r === 'TL' || r === 'TELE' || r === 'TELETRABAJO') return 'TL';
  return 'SU';
}

function normalizeAFP(s) {
  const u = s.toUpperCase().trim();
  if (u.includes('INTEGRA')) return 'Integra';
  if (u.includes('PRIMA'))   return 'Prima';
  if (u.includes('PROFUTURO')) return 'Profuturo';
  if (u.includes('HABITAT') || u.includes('HÁBITAT')) return 'Habitat';
  return 'Integra';
}

function norm(s) {
  return String(s).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function toNum(v) {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g,''));
  return isNaN(n) ? 0 : n;
}

function readFileBuffer(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(new Uint8Array(e.target.result));
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

async function loadBase(input) {
  const file = input.files[0];
  if (!file) return;
  const el = document.getElementById('fname-base');
  if (el) el.textContent = file.name;
  const buf = await readFileBuffer(file);
  _baseData = parseBase(buf);
  showToast(_baseData.length + ' trabajadores cargados');
}

async function loadFranco(input) {
  const file = input.files[0];
  if (!file) return;
  const el = document.getElementById('fname-franco');
  if (el) el.textContent = file.name;
  const anio = parseInt(document.getElementById('mas-anio').value) || new Date().getFullYear();
  const mes  = parseInt(document.getElementById('mas-mes').value);
  const buf  = await readFileBuffer(file);
  _francoData = parseFranco(buf, anio, mes);
  showToast(Object.keys(_francoData).length + ' registros de francoplan cargados');
}

function dragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('drag');
}

function dragLeave(e, zoneId) {
  document.getElementById(zoneId).classList.remove('drag');
}

function dropFile(e, tipo) {
  e.preventDefault();
  const zoneId = tipo === 'base' ? 'zone-base' : 'zone-franco';
  document.getElementById(zoneId).classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const fakeInput = { files: [file] };
  if (tipo === 'base') loadBase(fakeInput);
  else loadFranco(fakeInput);
}

function matchWorker(nombre, francoMap) {
  const n = norm(nombre);
  if (francoMap[n]) return francoMap[n];
  for (const key of Object.keys(francoMap)) {
    if (key.includes(n) || n.includes(key)) return francoMap[key];
  }
  return null;
}
