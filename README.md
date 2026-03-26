# MiNeto — Calculadora de Haberes Individual

**Versión:** Producción
**Stack:** HTML + CSS + JavaScript vanilla (SPA, sin frameworks, sin build)
**Empresa ficticia:** Consorcio Rovella-INMAC
**Propósito:** Calculadora de neto mensual para el trabajador individual peruano (régimen general). Gestión de perfiles, calendario de asistencia, flujo de efectivo anual y exportación de boleta PDF.

---

## Estructura de archivos

```
MiNeto/
├── index.html          ← Shell SPA única. Define todo el DOM.
├── styles.css          ← Estilos globales (tema dark/light, paleta IBM Plex)
└── js/
    ├── motor_calculo.js ← Motor puro de cálculo (sin DOM). Compartido con PagaPe.
    ├── exportador.js    ← Generador de boleta PDF con jsPDF.
    └── app.js           ← Controlador principal (UI, perfiles, calendario, flujo).
```

---

## Arquitectura y flujo de la app

### Pantallas (screens)
La app tiene 3 pantallas que se muestran/ocultan con `display`:

| ID | Pantalla | Descripción |
|---|---|---|
| `#screen-perfiles` | Selector de perfiles | Lista de perfiles guardados, botón crear nuevo, importar backup |
| `#screen-onboarding` | Onboarding / Editar perfil | Formulario de nombre, jornada, días hábiles, AFP/ONP |
| `#screen-app` | App principal | Tabs: Individual, Gastos, Flujo de efectivo |

### Navegación principal
- `showPerfilSelector()` → muestra `#screen-perfiles`
- `mostrarOnboarding()` → muestra `#screen-onboarding`
- `iniciarApp()` → captura onboarding, llama `arrancaApp()`
- `cargarPerfil(p)` → carga perfil guardado, llama `arrancaApp()`
- `arrancaApp()` → muestra `#screen-app`, inicializa calendario, cálculo, gastos, flujo
- `irInicio()` → guarda todo y vuelve a perfiles
- `editarPerfil()` → vuelve al onboarding con datos precargados

### Tabs del screen-app
- `Individual` → configuración del mes + calendario + resultado + detalle Renta 5ta
- `Gastos` → 3 categorías (Tarjetas, Servicios, Otros) + balance
- `Flujo de efectivo` → tabla anual 12 meses con ingresos, gastos, ahorrado, acumulado

---

## Persistencia (localStorage)

| Clave LS | Contenido |
|---|---|
| `mineto_session` | Sesión activa: `{ perfil, calState, gastos, flujo }` |
| `mineto_perfiles` | Array de hasta 20 perfiles guardados (histórico) |

### Estructura del objeto `perfil`
```javascript
{
  nombre:       string,       // "Juan Pérez García"
  sueldo:       number,       // 3500
  af:           number,       // 113 (con hijos) o 0
  seguro:       'AFP'|'ONP',
  afpNombre:    'Integra'|'Prima'|'Profuturo'|'Habitat',
  epsMode:      boolean,
  epsMonto:     number,       // copago mensual EPS
  jornada:      'FORANEO'|'LOCAL',
  semana:       string,       // "L,M,X,J,V,S" (LOCAL) o "L-S" legacy
  movilidadMes: number,       // monto fijo mensual de movilidad
}
```

### Estructura del objeto `calState`
```javascript
{
  anio:       number,       // 2026
  mes:        number,       // 0-11
  marcas:     Object,       // { "2026-2-15": "W", "2026-2-16": "R", ... }
  markActivo: string,       // "W" | "R" | "V" | "F" | "SU" | "MED" | "TL"
  painting:   boolean,      // true mientras se arrastra el mouse
}
```

### Estructura del objeto `gastos`
```javascript
{
  tarjetas:  [{ nombre: string, valor: string }, ...],
  servicios: [{ nombre: string, valor: string }, ...],
  otros:     [{ nombre: string, valor: string }, ...],
}
```

### Estructura de `flujoData`
```javascript
{
  "2026-2": {
    anio: 2026, mes: 2,
    neto: 4850.00,
    ingresos: 5500.00,
    dias: 22,
    sueldo: 3500,
    af: 113,
    alimentacion: 800,
    gastos: 1200.00,
    saldo: 3650.00,
  },
  // Una entrada por cada mes calculado
}
```

---

## Motor de cálculo (`motor_calculo.js`)

### Constantes clave
```javascript
UIT = { 2024: 5150, 2025: 5350, 2026: 5500 }
AFP_SEGURO_PCT = 0.0137  // 1.37% — aplica a todas las AFP
ALIM_DIA = 39            // S/ 39/día de alimentación (FORÁNEO)
ALOJ_DIA = 65            // S/ 65/día de alojamiento (FORÁNEO)
```

### Función principal
```javascript
calcularPlanilla(params) → result
```
Delega a `calcularForaneo(params)` o `calcularLocal(params)` según `params.jornada`.

### Parámetros de entrada
```javascript
params = {
  sueldo, af, afpNombre, epsMode, epsMonto, seguro,
  marcas,         // array de strings con marca por día del mes
  anio, mes,      // para UIT y feriados
  jornada,        // 'FORANEO' | 'LOCAL'
  periodoProvis,  // resultado de getPeriodoProvis(mes)
  movilidadMes,   // monto mensual de movilidad
  ingAnt,         // ingresos afectos de meses anteriores (para Renta 5ta)
}
```

### Objeto de resultado
```javascript
result = {
  diasSueldo, diasViat, diasW, diasR, diasV, diasF, diasSU, diasMED, diasTL,
  diasFeriado,
  valorDia, feriadoProp,
  sueldoProp, afProp,
  alimentacion, alojamiento, movilidad,
  totalIngresos,
  afpFondo, afpSeguro, onp, r5Prop, epsDesc,
  totalDesc, neto,
  essalud, vidaLey,
  ctsMens, gratiMes,
  r5Mensual,
}
```

### Lógica FORÁNEO
- `diasSueldo = min(W + R + V + MED + TL, 30)` — máximo 30 días
- `diasViat = W + MED` — solo días de trabajo activo en campo generan viáticos
- Viáticos: alimentación = 39×diasViat, alojamiento = 65×diasViat
- Feriados trabajados (W en día feriado): ingreso extra = valorDia × diasFeriado
- Movilidad: monto fijo mensual, solo si diasViat > 0
- Base AFP/ONP = sueldoProp + afProp + feriadoProp (excluye viáticos)

### Lógica LOCAL
- `diasSueldo = ((habiles - faltas - suspensiones) / habiles) × 30`
- Sin viáticos, sin feriados con pago doble
- Base AFP/ONP = sueldoProp + afProp

### Fórmulas de descuentos
| Concepto | Fórmula |
|---|---|
| AFP Fondo | base × 10% |
| AFP Seguro | base × 1.37% |
| ONP | base × 13% |
| EPS copago | monto fijo si epsMode y diasSueldo > 0 |
| Renta 5ta | `calcR5Full(...)` — fórmula SUNAT progresiva |

### Fórmulas empleador / provisiones
| Concepto | Fórmula |
|---|---|
| EsSalud | sueldoProp × 9% (o 6.75% si EPS) |
| Vida Ley | sueldoProp × 1.22% |
| CTS mensual | (S+AF) × 7/72 |
| Gratificación mensual | (S+AF)/6 × (1 + 9% o 6.75%) |

### Renta 5ta Categoría (`calcR5Full`)
Fórmula SUNAT progresiva. Verificada con boleta real Enero 2026 → S/179.42.

```
ingAnual = (S+AF) × mult + alimGrav + (S+AF)×2×(1+essPct) + ingAnterior
rNeta    = ingAnual − 7 UIT
impuesto = escalaR5Anio(rNeta) / div
r5Prop   = impuesto × (diasSueldo / 30)
```

- `mult` y `div` varían por mes (arrays `R5_MULT` y `R5_DIV`, índices 0-11)
- `alimGrav = min(alimentación_del_mes, sueldo × 20%)` — solo FORÁNEO
- Tramos: 8% (≤5 UIT), 14% (≤20 UIT), 17% (≤35 UIT), 20% (≤45 UIT), 30% (resto)

### Feriados peruanos
`getFeriadosMes(anio, mes)` devuelve array de días feriados. Incluye Semana Santa con cálculo dinámico de Pascua (algoritmo Meeus/Jones/Butcher).

Feriados fijos: 1 ene, 1 may, 29 jun, 28-29 jul, 30 ago, 8 oct, 1 nov, 8-25 dic.

---

## Marcas del calendario

| Marca | Significado | Efecto en cálculo |
|---|---|---|
| `W` | Trabajo | Cuenta para sueldo y viáticos |
| `R` | Descanso | Solo cuenta para sueldo (FORÁNEO) |
| `V` | Vacaciones | Cuenta para sueldo |
| `F` | Falta | Descuenta sueldo (LOCAL) |
| `SU` | Suspensión | Descuenta sueldo (LOCAL) |
| `MED` | Médico | Cuenta sueldo, genera viáticos (FORÁNEO) |
| `TL` | Teletrabajo | Cuenta para sueldo, sin viáticos |

### Pintado del calendario
- `buildCal()` — construye el grid completo del mes
- `paintDay(d)` — toggle de marca en un día sin reconstruir el grid
- AbortController en `_setupCalListeners()` evita acumulación de event listeners
- LOCAL: pre-rellena días hábiles como W si el mes no tiene marcas
- Touch soportado: touchstart + touchmove para dispositivos móviles

---

## Exportador (`exportador.js`)

### `buildBoletaPDF(worker, result, anio, mes)` → doc jsPDF
Genera boleta A4 en portrait con:
1. Header: nombre empresa + período
2. Bloque de datos del empleado (3 columnas)
3. Tabla 3 columnas: Ingresos | Descuentos | Aportes Empleador
4. Barra de totales: Monto Afecto + Total Descuentos + Total Aportes
5. Total Ingresos + NETO A PAGAR
6. Líneas de firma (empresa + empleado)

### `imprimirBoleta()` (modo individual)
Lee `window._lastResult` y `window._lastParams`, genera el PDF del mes activo.

### Exportación de perfiles
- `exportarPerfiles()` → descarga JSON con todos los perfiles
- `exportarPerfil(p)` → descarga JSON de un perfil específico
- `importarPerfiles()` → importa y fusiona un JSON backup (no reemplaza, fusiona)
- `exportarFlujoCSV()` → descarga CSV del flujo anual

---

## CDN externos (cargados en index.html)
```html
<!-- Orden de carga OBLIGATORIO -->
<script src="xlsx.full.min.js">    ← v0.18.5 (no usado activamente en MiNeto pero incluido)
<script src="jspdf.umd.min.js">   ← v2.5.1
<script src="js/motor_calculo.js">
<script src="js/exportador.js">
<script src="js/app.js">
```

---

## Diseño / CSS

**Fuentes:** IBM Plex Sans (body) + IBM Plex Mono (números, labels, código)
**Temas:** `[data-theme="dark"]` (default) / light mode via `toggleTheme()`
**Paleta:** Variables CSS en `:root`. Colores semánticos:
- `--blue` → ingresos
- `--red` → descuentos
- `--amber` → empleador
- `--purple` → provisiones
- `--green` → OK / ahorro
- `--cyan` → EPS

**Layout:** Max-width 960px centrado. Grid-2 (configuración + calendario), Grid-4 (bloques resultado).
**Responsive:** media queries en 640px y 480px.

---

## Estado actual

- **MiNeto está terminado y en producción.**
- Funciona abriendo `index.html` desde cualquier servidor local o directamente en el navegador.
- No requiere backend, base de datos, ni instalación de dependencias.
- Los datos persisten en localStorage del navegador donde se usa.

---

## Pendientes / posibles mejoras futuras

- Exportar boleta en Excel (actualmente solo PDF)
- Historial multi-año en el flujo más allá de 5 años
- Soporte offline completo con Service Worker
- Campo DNI en el onboarding (actualmente DNI es campo vacío en perfil)
