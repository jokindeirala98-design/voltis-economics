# Bases del Proyecto: Voltis Anual Economics

Este documento sirve como la única fuente de la verdad para el núcleo, la misión y las funcionalidades de la aplicación, creado para mantener el rumbo a medida que el proyecto escala.

## 1. Misión
Proporcionar una herramienta visual y extremadamente premium (estética futurista, *Dark Mode*, *Glassmorphism*) para analizar facturas eléctricas anuales, permitiendo extraer automáticamente datos con IA, unificar conceptos, y generar un análisis de optimización o exportar los reportes a Excel.

## 2. Tecnologías y Arquitectura
- **Stack**: Next.js (React 19), Tailwind CSS 4, TypeScript.
- **Gráficos y UI**: Recharts para visualización, Framer Motion y GSAP para micro-animaciones cinematicas.
- **IA**: Groq Cloud utilizando el modelo `llama-3.3-70b-versatile` (ultra-rápido) para extracción JSON estructurada.
- **Persistencia**: Supabase (PostgreSQL Cloud) con sincronización en tiempo real. Se abandonó `localStorage` por Supabase Cloud Storage.
- **Seguridad**: Autenticación maestra y variables de entorno seguras en Vercel.

## 3. Funcionalidades Core
1. **Autenticación Maestra**: Pantalla de login inicial con contraseña única (`voltis2026` por defecto) para proteger la info.
2. **Gestión de Proyectos**: Creación de múltiples proyectos o "workspaces" independientes donde se agrupan las facturas analizadas.
33. **Subida y Procesamiento (Drag & Drop)**:
   - **PDFs**: Se envían a la IA de Groq (Llama 3.3), la cual extrae periodos de consumo (P1-P6) en kWh y Euros, periodos de potencia (P1-P6), y *Otros Conceptos*.
   - **Excel (.xlsx)**: Sistema de importación que inyecta datos previos siguiendo la estructura técnica.
4. **Tabla de Auditoría Visual (Matrix Editor)**:
   - Visualiza en formato vertical los conceptos por factura (columnas).
   - Permite edición manual y gestión de proyectos con guardado automático en la nube (Supabase).
5. **Reporte Anual IA (Visual Report)**:
   - Pantallas cinematicas con GSAP: Portada con mascota, Dashboard KPIs, Evolución con Recharts, Matriz de Auditoría y cierre con envío de email.
6. **Sincronización Cloud**:
   - Todo cambio en local se empuja a GitHub y se despliega automáticamente en Vercel (CI/CD).
   - Los datos son persistentes entre dispositivos gracias a Supabase.

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
