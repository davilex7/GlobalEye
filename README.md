# GlobalEye

## Descripción
GlobalEye es una aplicación de escritorio construida con Electron que permite al usuario seleccionar un área de su pantalla, realizar un Reconocimiento Óptico de Caracteres (OCR) sobre el texto en esa área, y traducir dicho texto al idioma deseado. La traducción se muestra en una ventana de superposición (overlay) cerca del área seleccionada.

## Características
* Selección de área de pantalla interactiva.
* OCR utilizando Tesseract.js.
* Traducción mediante la API gratuita de [MyMemory](https://mymemory.translated.net/), sin necesidad de clave.
* Selección de idioma para OCR y traducción.
* Visualización de la traducción en una ventana de superposición no intrusiva y movible.
* Interfaz de usuario simple para controlar la aplicación.

## Requisitos Previos
* [Node.js](https://nodejs.org/) (incluye npm)

## Instalación
1.  **Clona el repositorio (o descarga y descomprime el código):**
    ```bash
    git clone https://github.com/davilex7/GlobalEye.git
    cd GlobalEye
    ```
2.  **Instala las dependencias:**
    Abre una terminal o línea de comandos en el directorio del proyecto y ejecuta:
    ```bash
    npm install
    ```
    Esto descargará Electron, Tesseract.js y el resto de dependencias. Puede tardar un poco, especialmente Tesseract.js que descarga los datos de idioma.

## Uso
1.  **Inicia la aplicación:**
    Desde la terminal en el directorio del proyecto, ejecuta:
    ```bash
    npm start
    ```
2.  **Selecciona los idiomas:**
    * Usa los menús desplegables para elegir el idioma del texto original (Idioma OCR) y el idioma al que quieres traducir (Traducir a).
3.  **Captura y traduce:**
    * Haz clic en el botón "Seleccionar Área y Traducir".
    * La pantalla se atenuará ligeramente y aparecerá un cursor en forma de cruz.
    * Haz clic y arrastra el ratón para dibujar un rectángulo sobre el área de la pantalla que contiene el texto que deseas traducir.
    * Suelta el botón del ratón.
4.  **Visualiza el resultado:**
    * La aplicación realizará el OCR y la traducción. El estado se mostrará en la ventana principal.
    * Si se detecta y traduce texto, aparecerá una pequeña ventana de superposición (overlay) debajo del área que seleccionaste, mostrando la traducción.
    * Puedes hacer clic y arrastrar la ventana de superposición para moverla.
    * Puedes cerrar la superposición haciendo clic en el botón "Cerrar Superposición" en la ventana principal.

## Construcción de Ejecutables (Opcional)
Si deseas crear un ejecutable independiente para tu sistema operativo (Windows, macOS, Linux), puedes usar `electron-builder`:

1.  Asegúrate de que las dependencias de desarrollo estén instaladas (`npm install` debería haberlo hecho).
2.  Ejecuta el comando de construcción:
    * Para tu plataforma actual: `npm run dist` (puede requerir configuración adicional en `package.json` o dependencias específicas de la plataforma).
    * Para Windows: `npm run dist -- --win`
    * Para macOS: `npm run dist -- --mac`
    * Para Linux: `npm run dist -- --linux`

    Los ejecutables se encontrarán en el directorio `dist/`.

## Notas
* La precisión del OCR depende de la calidad de la imagen (resolución, claridad, fuente) y del idioma seleccionado.
* La traducción utiliza un servicio externo (MyMemory) y requiere conexión a internet. Su plan gratuito tiene un límite diario de caracteres.
* Los datos de idioma de Tesseract (`.traineddata`) se descargan automáticamente la primera vez que se necesita un idioma específico.

## Licencia
MIT
