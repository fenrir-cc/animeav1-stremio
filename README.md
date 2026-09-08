# AnimeAV1 Stremio Addon

Addon completo y autónomo de **Stremio** en Node.js para buscar y reproducir anime en Sub Español y HD desde [AnimeAV1](https://animeav1.com/).

![AnimeAV1 Addon](https://animeav1.com/img/logo.svg)

---

## 🚀 Características

- 🍿 **Últimos Episodios:** Catálogo en tiempo real con los lanzamientos y episodios recién agregados.
- 🔍 **Buscador y Catálogo Completo:** Busca cualquier anime por su nombre directamente dentro de la interfaz de Stremio.
- 📺 **Detalles y Episodios Completos:** Soporte completo de metadatos, pósters, sinopsis y lista de todos los episodios disponibles.
- ⚡ **Integración de Video:** Extrae servidores de video de AnimeAV1 (Zilla Networks, Voe, HLS y reproductores embebidos).
- 🌐 **Página de Instalación 1-Click:** Landing page interactiva con botón de instalación directa para Stremio App y Stremio Web.

---

## 🛠️ Requisitos e Instalación

### Opción 1: Ejecutar Localmente con Node.js

1. Clona o abre este directorio en tu terminal.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor del addon:
   ```bash
   npm start
   ```
4. Abre tu navegador en `http://localhost:7000` o copia la URL de manifest:
   ```text
   http://localhost:7000/manifest.json
   ```

### Opción 2: Despliegue con Docker

```bash
# Construir la imagen Docker
docker build -t animeav1-stremio-addon .

# Ejecutar el contenedor en el puerto 7000
docker run -d -p 7000:7000 --name animeav1-addon animeav1-stremio-addon
```

---

## 📱 Cómo Instalar en Stremio

1. Abre **Stremio** (Desktop, Android, Android TV o Web).
2. Ve a la sección de **Addons / Complementos** (icono de pieza de rompecabezas).
3. En la barra de búsqueda de addons, pega la URL del manifiesto:
   ```text
   http://localhost:7000/manifest.json
   ```
   *(Si estás desplegando en un servidor VPS o servicio en la nube como Render/Railway, usa tu dominio público: `https://tu-dominio.com/manifest.json`)*
4. Haz clic en **Instalar** (o **Install**).
5. ¡Listo! Ya podrás navegar y buscar animes de AnimeAV1 en Stremio.

---

## 🧪 Pruebas Automatizadas

Para verificar el funcionamiento del scraper y los servidores:
```bash
npm test
```

---

## 📁 Estructura del Proyecto

```text
├── src/
│   ├── addon.js        # Manejadores de Catálogo, Metadatos y Streams de Stremio
│   ├── extractors.js   # Extractores de enlaces directos (Zilla, Voe, HLS)
│   ├── manifest.js     # Definición del manifiesto Stremio v3
│   ├── scraper.js      # Scraper web de AnimeAV1
│   └── server.js       # Servidor HTTP Express y Landing Page
├── Dockerfile          # Configuración para despliegue en contenedores
├── package.json        # Configuración y dependencias del proyecto Node.js
├── README.md           # Documentación del proyecto
└── test-scraper.js     # Script de pruebas e integración
```

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia MIT. Desarrollado por fans para fans.
