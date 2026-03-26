# MiNeto — Contexto para Claude Code

## ¿Qué es este proyecto?
SPA de calculadora de haberes individual para trabajadores peruanos (régimen general).
Sin frameworks, sin build, sin backend. Solo HTML + CSS + JS vanilla.
Empresa ficticia: Consorcio Rovella-INMAC.

**Estado: TERMINADO.** Funciona correctamente. No hay bugs conocidos.

## Archivos y responsabilidades

| Archivo | Rol | Líneas |
|---|---|---|
| `index.html` | Shell SPA + DOM completo | ~380 |
| `styles.css` | Estilos dark/light, paleta IBM Plex | ~1080 |
| `js/motor_calculo.js` | Motor de cálculo puro (sin DOM) | 391 |
| `js/exportador.js` | Boleta PDF con jsPDF | 296 |
| `js/app.js` | Controlador UI completo | 1087 |

## localStorage
- `mineto_session` → sesión activa: `{ perfil, calState, gastos, flujo }`
- `mineto_perfiles` → array de hasta 20 perfiles históricos

## Objeto `perfil` (campos clave)
```javascript
{ nombre, sueldo, af, seguro:'AFP'|'ONP', afpNombre, epsMode, epsMonto,
  jornada:'FORANEO'|'LOCAL', semana:'L,M,X,J,V,S', movilidadMes }
```

## Marcas del calendario
`W`=trabajo, `R`=descanso, `V`=vacaciones, `F`=falta, `SU`=suspensión, `MED`=médico, `TL`=teletrabajo
- Almacenadas en `calState.marcas` como `{ "2026-2-15": "W" }`

## Motor de cálculo — fórmulas clave
- **FORÁNEO:** `diasSueldo = min(W+R+V+MED+TL, 30)` | viáticos = 39/día alim + 65/día aloj (solo días W+MED)
- **LOCAL:** `diasSueldo = ((habiles - F - SU) / habiles) × 30`
- **AFP Fondo:** base × 10% | **AFP Seguro:** base × 1.37% | **ONP:** base × 13%
- **EsSalud:** sueldoProp × 9% (o 6.75% si tiene EPS)
- **CTS:** (S+AF) × 7/72 | **Grati:** (S+AF)/6 × 1.09
- **Renta 5ta:** fórmula SUNAT progresiva con mult/div por mes (verificada con boleta real)
- **UIT 2026 = S/ 5,500** | tramos 8%, 14%, 17%, 20%, 30%

## Exportación
- `imprimirBoleta()` → PDF A4 con jsPDF
- `exportarPerfiles()` / `importarPerfiles()` → backup JSON
- `exportarFlujoCSV()` → CSV anual del flujo

## CDN (orden obligatorio en index.html)
```
xlsx.full.min.js v0.18.5 → jspdf.umd.min.js v2.5.1 → motor_calculo.js → exportador.js → app.js
```

## Convenciones del código
- Sin frameworks, sin TypeScript, sin módulos ES6
- `fmt(n)` → número con 2 decimales | `fmtS(n)` → "S/ x.xx"
- `norm(s)` → mayúsculas + sin tildes (para comparaciones)
- `showToast(msg)` → notificación flotante 2.5s
- Auto-save en tiempo real: `saveAll()` se llama en cada `recalcular()` y `updColTots()`
- AbortController en calendario para evitar acumulación de listeners

## Variables globales del motor en app.js
- `window._lastResult` → último resultado de `calcularPlanilla()`
- `window._lastParams` → últimos params usados en el cálculo

## Cómo ejecutar
Cualquier servidor HTTP local. Ejemplo:
```bash
python -m http.server 7890
# Abrir: http://localhost:7890
```
O directamente abrir `index.html` en el navegador (file://).

## Lo que NO tiene MiNeto (por diseño)
- No importa Excel
- No hace planilla masiva (eso es PagaPe)
- No tiene backend
- No tiene autenticación
