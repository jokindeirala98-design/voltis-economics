# Bases del Proyecto: Voltis Anual Economics

Este documento sirve como la única fuente de la verdad para el núcleo, la misión y las funcionalidades de la aplicación, creado para mantener el rumbo a medida que el proyecto escala.

## 1. Misión
Proporcionar una herramienta visual y extremadamente premium (estética futurista, *Dark Mode*, *Glassmorphism*) para analizar facturas eléctricas anuales, permitiendo extraer automáticamente datos con IA, unificar conceptos, y generar un análisis de optimización o exportar los reportes a Excel.

## 2. Tecnologías y Arquitectura
- **Stack**: Next.js (React 19), Tailwind CSS, TypeScript.
- **Gráficos y UI**: Recharts para visualización de datos de la energía, Framer Motion para micro-animaciones, Lucide React para iconos.
- **IA**: Google Gemini AI (`gemini-flash-latest`) usando Prompts robustos con instrucciones de extraer JSON con estructura fina.
- **Persistencia**: `localStorage` (para proyectos y configuraciones locales).

## 3. Funcionalidades Core
1. **Autenticación Maestra**: Pantalla de login inicial con contraseña única (`voltis2026` por defecto) para proteger la info.
2. **Gestión de Proyectos**: Creación de múltiples proyectos o "workspaces" independientes donde se agrupan las facturas analizadas.
3. **Subida y Procesamiento (Drag & Drop)**:
   - **PDFs**: Se envían a la IA Gemini, la cual extrae periodos de consumo (P1-P6) en kWh y Euros, periodos de potencia (P1-P6), y *Otros Conceptos*.
   - **Excel (.xlsx)**: Sistema de sincronización bidireccional que inyecta manualmente facturas previas usando una plantilla específica.
4. **Tabla de Auditoría Visual (Matrix Editor)**:
   - Visualiza en formato vertical los conceptos por factura (columnas).
   - Permite **Fusionar** "Otros Conceptos" mediante Drag & Drop (arrastrar y soltar) para limpieza visual de la tabla.
   - Edición manual "click-to-edit" de cualquier celda calculada.
5. **Reporte Anual Inteligente (Printable/PDF)**:
   - Dashboard de KPIs, Gráficas de barras de evolución mensual, gráfico de donut de distribución y matriz técnica imprimible.
6. **Exportación (XLSX)**:
   - Vuelca todos los datos limpios y organizados a un archivo Excel transpuesta.

## 4. Reglas de Negocio Vitales (Extracción IA)
Todo cambio a la IA o cálculos debe someterse a estas leyes irrevocables:
- **Cuadre Matemático Exacto**: (Total Energía + Total Potencia + Suma Otros Conceptos) DEDBE == Total Factura. 
- **Extracción de EUROS en Potencia**: Se extraen los kW, pero visualmente y para los cálculos importan los Euros (€) cobrados de esa potencia.
- **Unificación de OCs Automática**: El "Bono Social", "Alquiler de Equipos" e "Impuesto Eléctrico" no deben duplicarse, todas sus pequeñas líneas se agrupan en una familia madre. 

## 5. Diseño y Estética
- Fondo base: `#020617` (Deep Slate).
- Acentos: Gradientes de azules, índigos y esmeraldas (`bg-blue-600/5` difuminados).
- Sin modales invasivos; preferible usar paneles *glass* con animaciones fluidas y notificaciones (Sonner).
- Tipografía limpia (Inter) sin florituras, en negritas pesadas (Black/Bold) para títulos y tracking espaciado (`tracking-widest`) en subtítulos.

---
*(Nota: Este documento debe ser actualizado o consultado antes de realizar transformaciones grandes que puedan desviar el rumbo del proyecto).*
