# CLIENTES PRO – Gestión Comercial (República Dominicana) 🇩🇴

Sistema web empresarial y móvil para el registro de clientes en terreno por parte de vendedores, captura fotográfica de cédula con OCR, validación oficial de cédula dominicana (algoritmo Módulo 10 de la JCE), georreferenciación GPS satelital, sincronización offline (IndexedDB), mapa interactivo tipo radar, exportación a PDF y Excel, y panel central de métricas para supervisores y administradores.

---

## 🛠️ Tecnologías y Lenguajes Utilizados

Este proyecto está construido con estándares modernos de ingeniería de software:

| Tecnología / Lenguaje | Versión | Propósito en la Aplicación |
| :--- | :--- | :--- |
| **TypeScript** | v5+ / v7 | Tipado estricto para garantizar cero errores en tiempo de ejecución. |
| **React** | v19 | Arquitectura modular de componentes, hooks y estado reactivo. |
| **Tailwind CSS** | v4 | Sistema de diseño corporativo moderno y responsivo para móviles y PC. |
| **Vite** | v8 | Bundler ultrarrápido para desarrollo y compilación de producción. |
| **Firebase Firestore** | v12 | Base de datos NoSQL en la nube con reglas de seguridad ABAC. |
| **IndexedDB (`idb`)** | v8 | Almacenamiento local en el teléfono para registrar clientes sin conexión a internet. |
| **Leaflet** | v1.9 | Mapa satelital interactivo para visualizar clientes y rutas con Waze / Google Maps. |
| **jsPDF** | v4.2 | Generación de expedientes comerciales en formato PDF con fotos de cédula incrustadas. |
| **SheetJS (XLSX)** | v0.18 | Exportación de clientes y reportes en formato Excel `.xlsx`. |
| **WhatsApp API** | Nativa | Despacho automático de la **Planilla Comercial Oficial** en 1 toque. |
| **Service Worker & PWA** | W3C | Soporte para instalar la aplicación en teléfonos Android como app nativa. |

---

## 🚀 Cómo Ejecutar la Aplicación en tu Computadora

### Requisitos Previos:
- Tener instalado **Node.js** (versión 18 o superior). Puedes descargarlo gratis en [nodejs.org](https://nodejs.org).

### Paso 1: Descomprimir el Proyecto
Extrae los archivos del archivo ZIP en una carpeta de tu computadora.

### Paso 2: Instalar las Dependencias
Abre una terminal o consola de comandos en la carpeta del proyecto y ejecuta:

```bash
npm install
```

### Paso 3: Iniciar el Servidor de Desarrollo
Una vez instaladas las dependencias, inicia el servidor local:

```bash
npm run dev
```

Verás un mensaje indicando que el servidor está corriendo en:
👉 **`http://localhost:3000`**

Abre esa dirección en tu navegador (Google Chrome, Edge, Safari, etc.) ¡y listo!

### Paso 4: Compilar para Producción
Cuando desees subir la aplicación a un servidor web público (como Vercel, Netlify, Firebase Hosting o Cloud Run):

```bash
npm run build
```
Esto generará la carpeta optimizada `dist/` lista para publicar en cualquier hosting web.

---

## 📁 Estructura del Código Fuente

```text
clientes-pro/
├── index.html                   # Punto de entrada HTML con fuentes Plus Jakarta Sans
├── package.json                 # Dependencias y scripts del proyecto
├── tsconfig.json                # Configuración de TypeScript
├── vite.config.ts               # Configuración del bundler Vite y Tailwind v4
├── firestore.rules              # Reglas de seguridad oficiales de Firebase Firestore
├── README.md                    # Esta guía completa
│
├── public/                      # Archivos estáticos y PWA
│   ├── manifest.webmanifest     # Manifiesto para instalación en celulares Android
│   ├── sw.js                    # Service Worker para funcionamiento offline
│   ├── icon.svg                 # Isotipo vectorial de CLIENTES PRO
│   ├── pwa-192x192.png          # Icono 192x192 para Android
│   ├── pwa-512x512.png          # Icono 512x512 para Android
│   └── clientes-pro-codigo-fuente.zip # Paquete descargable completo
│
└── src/                         # Código fuente principal
    ├── main.tsx                 # Entrada de React
    ├── App.tsx                  # Enrutador principal y control de vistas
    ├── index.css                # Estilos globales y utilidades de cristal
    │
    ├── types/
    │   └── index.ts             # Modelos de datos: ClientData, UserProfile, AuditLog
    │
    ├── context/
    │   ├── AuthContext.tsx      # Gestión de autenticación, usuarios y roles
    │   └── SyncContext.tsx      # Motor de sincronización online/offline con IndexedDB
    │
    ├── lib/
    │   ├── dominicanValidation.ts # Algoritmo Módulo 10 JCE de cédula y teléfonos RD
    │   ├── firebase.ts          # Inicialización del SDK de Firebase
    │   ├── idb.ts               # Base de datos local IndexedDB
    │   ├── ocr.ts               # Extracción de datos con Gemini OCR
    │   ├── pdfExport.ts         # Generador de dossiers en PDF
    │   ├── excelExport.ts       # Exportador de reportes a Excel
    │   ├── whatsappExport.ts    # Generador de Planilla Oficial de WhatsApp
    │   └── audit.ts             # Registro inmutable de auditoría
    │
    └── components/
        ├── Navbar.tsx           # Barra superior y dock móvil táctil
        ├── ClientForm.tsx       # Formulario con cámara, OCR, GPS y validación JCE
        ├── CameraCapture.tsx    # Captura fotográfica con visor y compresión
        ├── GPSCapture.tsx       # Georreferenciación física con medidor de precisión
        ├── ClientList.tsx       # Expedientes con filtros, búsqueda y Excel
        ├── ClientMapView.tsx    # Radar satelital interactivo en Leaflet con Waze/Maps
        ├── ClientDossierModal.tsx # Expediente individual con fotos y notas
        ├── AdminDashboard.tsx   # Panel de métricas, curva comercial y ranking
        ├── SellerManagement.tsx # Gestión de vendedores y supervisores
        ├── AuditLogView.tsx     # Registro de auditoría y papelera de reciclaje
        ├── OfflineSyncModal.tsx # Inspector de cola de sincronización
        └── AuthModal.tsx        # Pantalla de inicio de sesión empresarial
```

---

## 🔒 Roles y Permisos Implementados

1. **ADMINISTRADOR (`admin`)**:
   - Acceso total a todas las funciones.
   - Creación y administración de vendedores y supervisores.
   - Visualización de todos los clientes y estadísticas comerciales globales.
   - Acceso al registro de auditoría y restauración de clientes eliminados.
   - Descarga de reportes en Excel y PDF.

2. **SUPERVISOR (`supervisor`)**:
   - Visualización de clientes pertenecientes a los vendedores de su equipo.
   - Acceso al radar satelital, métricas del equipo y expedientes.
   - Exportación de reportes y envío de planillas.

3. **VENDEDOR (`seller`)**:
   - Registro de clientes con cámara fotográfica o manual.
   - Captura de coordenadas GPS en tiempo real.
   - Registro y guardado sin internet (modo fuera de línea).
   - Envío instantáneo de la Planilla Comercial por WhatsApp.
   - Consulta y edición de sus propios clientes registrados.

---

## 🇩🇴 Reglas de Negocio Específicas para República Dominicana
- **Cédula de Identidad y Electoral**: Validación estricta mediante el algoritmo oficial Módulo 10 de la JCE (`001-XXXXXXX-X`).
- **Números Telefónicos**: Formato compatible con los prefijos oficiales dominicanos (`+1 809`, `+1 829` y `+1 849`).
- **Direcciones**: Catálogo de sectores y municipios del Distrito Nacional, Santo Domingo, Santiago y provincias.
- **Rutas de Terreno**: Accesos directos para abrir la ubicación física del cliente en **Waze** o **Google Maps**.
