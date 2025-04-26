// main.js
const { app, BrowserWindow, ipcMain, screen, desktopCapturer, net } = require('electron');
const path = require('path');
const { createSelectionWindow, closeSelectionWindow } = require('./screenSelector');
const { createManagedOverlayWindow, updateOverlayBlocks, closeOverlayWindow } = require('./overlay');

// --- Image Processing Dependency ---
let sharp;
try {
    sharp = require('sharp');
    console.log("[Main] Successfully required 'sharp'.");
} catch (error) {
    console.error("[Main] FATAL ERROR: Failed to require 'sharp'. Image preprocessing will not work.", error);
    sharp = null; // Ensure sharp is null if require failed
}

// --- Configuration ---
// *** PON TU CORREO ELECTRÓNICO AQUÍ para aumentar el límite de MyMemory (opcional) ***
// Si lo dejas como null o "", se usará la API de forma anónima.
const MYMEMORY_EMAIL = "batdavid2015@gmail.com"; // <-- REEMPLAZA ESTO

// --- Preprocessing Configuration ---
const PREPROCESSING_OPTIONS = {
    grayscale: true,       // Convertir a escala de grises
    normalize: true,       // Mejorar contraste (normalizar)
    sharpen: true,         // Enfocar la imagen
    denoiseMedian: true,   // Eliminar ruido (usando filtro de mediana)
    upscaleFactor: 2,      // Factor de escalado (1 = sin escalar, 2 = duplicar tamaño, etc.)
    binarizeThreshold: 140 // Umbral para binarizar (0-255), null para desactivar
                           // Prueba valores entre 100 y 180.
};
// ----------------------------------


// --- Tesseract moved to Main Process ---
let Tesseract;
let tesseractWorker = null;
let currentOcrLangWorker = null; // Track the language of the current worker
try {
    Tesseract = require('tesseract.js');
    console.log("[Main] Successfully required 'tesseract.js'.");
} catch (error) {
    console.error("[Main] FATAL ERROR: Failed to require 'tesseract.js'. OCR will not work.", error);
    Tesseract = null; // Ensure it's null if require failed
}
// -------------------------------------

let mainWindow = null;
let ocrLang = 'eng'; // Default OCR language (Tesseract format)
let targetLang = 'es'; // Default translation language (ISO 639-1 format)

// --- Continuous Mode State ---
let isContinuousModeActive = false;
let continuousIntervalId = null;
let lastSelectedBounds = null; // Store the coordinates {x, y, width, height} of the main area
const CONTINUOUS_INTERVAL_MS = 2000; // Interval in milliseconds (e.g., 2 seconds)
const TRANSLATION_DELAY_MS = 200; // Slightly increased delay for MyMemory API
// ---------------------------

// --- Language Code Mapping ---
function mapLangCode(tesseractCode) { /* ... (as before) ... */
    const map = { eng: 'en', spa: 'es', fra: 'fr', deu: 'de', ita: 'it', por: 'pt', jpn: 'ja', chi_sim: 'zh-CN' };
    return map[tesseractCode] || tesseractCode;
}


// --- Tesseract Initialization (Main Process) ---
async function initializeTesseractWorker(lang) { /* ... (as before, including PSM 11 setting) ... */
    if (!Tesseract) throw new Error("La librería Tesseract.js no se pudo cargar.");
    if (tesseractWorker && currentOcrLangWorker === lang) return tesseractWorker;

    if (tesseractWorker) {
        console.log(`[Main] Terminating existing Tesseract worker (Lang: ${currentOcrLangWorker})...`);
        mainWindow?.webContents.send('update-status', `Terminando OCR (${currentOcrLangWorker})...`);
        try { await tesseractWorker.terminate(); } catch (e) { console.error("Err term worker", e); }
        tesseractWorker = null;
        currentOcrLangWorker = null;
    }

    console.log(`[Main] Initializing Tesseract worker for language: ${lang}`);
    mainWindow?.webContents.send('update-status', `Inicializando OCR (${lang})...`);
    try {
        let psmMode;
        try {
             // Use Tesseract.PSM.SPARSE_TEXT if available, otherwise fallback to 11
             psmMode = (Tesseract && Tesseract.PSM && Tesseract.PSM.SPARSE_TEXT) ? Tesseract.PSM.SPARSE_TEXT : 11;
             console.log(`[Main] Using Tesseract PSM Mode: ${psmMode} (SPARSE_TEXT)`);
        } catch(e) {
             console.warn("[Main] Error accessing Tesseract.PSM constants, using PSM number 11 directly.", e);
             psmMode = 11;
        }


        const worker = await Tesseract.createWorker(lang, 1, { // OEM mode 1 (LSTM)
            logger: m => { /* ... (logging as before) ... */
                 if (mainWindow && !mainWindow.isDestroyed()) {
                    if (m.status === 'recognizing text') {
                        const progress = (m.progress * 100).toFixed(0);
                        if (isContinuousModeActive) console.log(`[Main:Tesseract] Recognizing text (${progress}%)...`);
                        else mainWindow.webContents.send('update-status', `Reconociendo texto (${progress}%)...`);
                    } else if (m.status.includes('loading') || m.status.includes('downloading')) {
                        const progress = (m.progress * 100).toFixed(0);
                         mainWindow.webContents.send('update-status', `Cargando datos ${lang} (${progress}%)...`);
                    } else { console.log('[Main:Tesseract] status:', m.status); }
                 }
            }
        });

        console.log(`[Main] Setting Tesseract PSM to ${psmMode}`);
        await worker.setParameters({
             tessedit_pageseg_mode: psmMode,
        });

        tesseractWorker = worker;
        currentOcrLangWorker = lang;
        console.log('[Main] Tesseract worker initialized and PSM set.');
        mainWindow?.webContents.send('update-status', `OCR (${lang}) listo.`);
        return worker;
    } catch (error) {
        console.error(`[Main] Error initializing Tesseract worker for ${lang}:`, error);
        mainWindow?.webContents.send('update-status', `Error al inicializar OCR (${lang}): ${error.message}`);
        throw error;
    }
}

// --- Main Window Creation ---
function createMainWindow() { /* ... (as before) ... */
    mainWindow = new BrowserWindow({
        width: 450, height: 400, resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false,
            devTools: !app.isPackaged
        },
        // icon: path.join(__dirname, 'assets', 'icon.png') // Optional
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => { /* ... (cleanup as before) ... */
        console.log("[Main] Main window closed.");
        stopContinuousCapture();
        mainWindow = null;
        closeOverlayWindow(); // Close the managed overlay
        closeSelectionWindow();
        if (tesseractWorker) {
            tesseractWorker.terminate().catch(err => console.error("[Main] Error terminating worker on close:", err));
            tesseractWorker = null; currentOcrLangWorker = null;
        }
    });
}

// --- App Lifecycle ---
app.whenReady().then(() => { createMainWindow(); /* ... */ });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => { stopContinuousCapture(); /* ... (terminate worker) ... */ });


// --- Helper: Preprocess Image using Sharp ---
async function preprocessImage(imageDataUrl, options) { /* ... (as before) ... */
    if (!sharp) {
        console.warn("[Main] Sharp library not available, skipping preprocessing.");
        return imageDataUrl; // Return original if sharp failed to load
    }
    if (!imageDataUrl) {
        console.warn("[Main] No image data URL provided for preprocessing.");
        return null;
    }

    console.log("[Main] Starting image preprocessing with options:", options);
    mainWindow?.webContents.send('update-status', `Preprocesando imagen...`);

    try {
        // Extract base64 data from Data URL
        const base64Data = imageDataUrl.split(';base64,').pop();
        if (!base64Data) {
            throw new Error("Invalid Data URL format.");
        }
        const imageBuffer = Buffer.from(base64Data, 'base64');

        let sharpInstance = sharp(imageBuffer);

        // Apply selected preprocessing steps
        if (options.grayscale) {
            console.log("[Main] Applying grayscale...");
            sharpInstance = sharpInstance.grayscale();
        }
        if (options.normalize) {
            console.log("[Main] Applying normalize...");
            sharpInstance = sharpInstance.normalize();
        }
         if (options.denoiseMedian) {
             console.log("[Main] Applying median filter (denoise)...");
             sharpInstance = sharpInstance.median(3);
         }
        if (options.sharpen) {
             console.log("[Main] Applying sharpen...");
             sharpInstance = sharpInstance.sharpen();
        }
        if (options.upscaleFactor && options.upscaleFactor > 1) {
            const metadata = await sharp(imageBuffer).metadata(); // Get original dimensions
            const newWidth = Math.round(metadata.width * options.upscaleFactor);
            const newHeight = Math.round(metadata.height * options.upscaleFactor);
            console.log(`[Main] Upscaling image by ${options.upscaleFactor}x to ${newWidth}x${newHeight}...`);
            sharpInstance = sharpInstance.resize(newWidth, newHeight, {
                 kernel: sharp.kernel.lanczos3 // Good quality resizing kernel
            });
        }
        if (options.binarizeThreshold !== null && options.binarizeThreshold >= 0 && options.binarizeThreshold <= 255) {
            console.log(`[Main] Applying binarization with threshold ${options.binarizeThreshold}...`);
            if (!options.grayscale) { // Ensure grayscale before thresholding
                 sharpInstance = sharpInstance.grayscale();
            }
            sharpInstance = sharpInstance.threshold(options.binarizeThreshold);
        }

        // Get the processed image buffer
        const processedBuffer = await sharpInstance.toBuffer();
        console.log("[Main] Image preprocessing finished.");
        mainWindow?.webContents.send('update-status', `Preprocesamiento completado.`);

        // Return buffer (Tesseract.js can handle buffers)
        return processedBuffer;

    } catch (error) {
        console.error("[Main] Error during image preprocessing:", error);
        mainWindow?.webContents.send('update-status', `Error de preprocesamiento: ${error.message}`);
        // Return original data URL on error to allow OCR attempt anyway
        return imageDataUrl;
    }
}


// --- Helper: Perform OCR and return detailed blocks ---
async function performDetailedOcr(imageInput, areaBounds, lang) { /* ... (as before, including confidence threshold and scope fix) ... */
    if (!Tesseract) throw new Error("La librería Tesseract.js no se pudo cargar.");
    if (!imageInput || !areaBounds) throw new Error("Datos de imagen o límites inválidos para OCR.");

    // --- Preprocess the image ---
    const processedImageInput = await preprocessImage(imageInput, PREPROCESSING_OPTIONS);
    // --------------------------

    const worker = await initializeTesseractWorker(lang); // Ensures worker is ready with correct PSM
    console.log(`[Main] Performing Detailed OCR in area: ${areaBounds.width}x${areaBounds.height}`);
    mainWindow?.webContents.send('update-status', `Realizando OCR (${lang})...`);

    // Recognize text using the (potentially preprocessed) image input
    const { data } = await worker.recognize(processedImageInput, {
        // Rectangle coordinates must be relative to the *image being processed*
        rectangle: {
             left: Math.round(areaBounds.x * (PREPROCESSING_OPTIONS.upscaleFactor || 1)),
             top: Math.round(areaBounds.y * (PREPROCESSING_OPTIONS.upscaleFactor || 1)),
             width: Math.round(areaBounds.width * (PREPROCESSING_OPTIONS.upscaleFactor || 1)),
             height: Math.round(areaBounds.height * (PREPROCESSING_OPTIONS.upscaleFactor || 1))
         }
    });

    const blocks = [];
    const elements = data.lines;
    const confidenceThreshold = 60; // Define threshold outside loop
    const scaleFactor = PREPROCESSING_OPTIONS.upscaleFactor || 1;

    console.log(`[Main] OCR found ${elements.length} lines.`);

    elements.forEach(element => {
        // Bbox coordinates are relative to the processed image.
        // Scale back and make relative to the original areaBounds for the overlay.
        const bbox = {
            x: (element.bbox.x0 / scaleFactor) - areaBounds.x,
            y: (element.bbox.y0 / scaleFactor) - areaBounds.y,
            width: (element.bbox.x1 - element.bbox.x0) / scaleFactor,
            height: (element.bbox.y1 - element.bbox.y0) / scaleFactor
        };

        if (element.confidence >= confidenceThreshold && bbox.width > 3 && bbox.height > 3 && bbox.x >= -5 && bbox.y >= -5 && bbox.x < areaBounds.width && bbox.y < areaBounds.height) {
             const cleanedText = element.text.replace(/(\r\n|\n|\r)/gm, " ").trim();
             if (cleanedText) {
                 blocks.push({
                     text: cleanedText,
                     confidence: element.confidence,
                     bbox: bbox
                 });
             }
        }
    });

    console.log(`[Main] Extracted ${blocks.length} valid text blocks (lines) relative to area (Confidence >= ${confidenceThreshold}%).`);
    return blocks;
}

// --- Helper: Translate an array of text blocks using MyMemory API ---
async function translateBlocks(blocks) {
    const translatedBlocks = [];
    const sourceLangMapped = mapLangCode(ocrLang); // Map Tesseract code to ISO code
    const langPair = `${sourceLangMapped}|${targetLang}`; // Format for MyMemory API

    console.log(`[Main] Translating ${blocks.length} blocks using MyMemory (LangPair: ${langPair})...`);

    for (const block of blocks) {
        if (block.text && block.text.trim() !== '') {
            try {
                // Add delay before each translation call
                await new Promise(resolve => setTimeout(resolve, TRANSLATION_DELAY_MS));
                // console.log(`[Main] Translating block: "${block.text.substring(0, 20)}..."`); // Less verbose log

                // Construct the MyMemory API URL
                let apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(block.text)}&langpair=${langPair}`;
                // *** Add email parameter if provided ***
                if (MYMEMORY_EMAIL && MYMEMORY_EMAIL !== "TU_CORREO_AQUI@ejemplo.com" && MYMEMORY_EMAIL.includes('@')) {
                    apiUrl += `&de=${encodeURIComponent(MYMEMORY_EMAIL)}`;
                }

                // Use Electron's net module for the request
                const responseText = await new Promise((resolve, reject) => {
                    const request = net.request(apiUrl);
                    let body = '';
                    request.on('response', (response) => {
                        if (response.statusCode < 200 || response.statusCode >= 300) {
                             reject(new Error(`HTTP Error: ${response.statusCode} ${response.statusMessage}`));
                             return;
                        }
                        response.on('data', (chunk) => { body += chunk.toString(); });
                        response.on('end', () => { resolve(body); });
                        response.on('error', (err) => { reject(err); });
                    });
                    request.on('error', (err) => { reject(err); });
                    request.end();
                });

                // Parse the JSON response
                const responseData = JSON.parse(responseText);

                // Check MyMemory response status
                if (responseData.responseStatus === 200 && responseData.responseData) {
                    translatedBlocks.push({
                        translatedText: responseData.responseData.translatedText,
                        bbox: block.bbox // Keep the original relative bbox
                    });
                } else {
                     const errorMessage = responseData.responseDetails || `MyMemory API error (Status: ${responseData.responseStatus})`;
                     console.error(`[Main:MyMemory] Translation failed for block: ${errorMessage}`);
                     translatedBlocks.push({ translatedText: "[Error API]", error: errorMessage, bbox: block.bbox });
                }

            } catch (error) {
                console.error(`[Main] Network/Fetch Error for block "${block.text.substring(0, 20)}...":`, error.message);
                translatedBlocks.push({ translatedText: "[Error Red]", error: error.message, bbox: block.bbox });
            }
        }
    }
    console.log(`[Main] Finished translating blocks.`);
    return translatedBlocks;
}


// --- Continuous Capture Loop ---
async function runContinuousCapture() { /* ... (as before) ... */
    if (!isContinuousModeActive || !lastSelectedBounds) { stopContinuousCapture(); return; }
    console.log("[Main] Continuous loop tick: Capturing screen...");
    let screenshotDataUrl;
    try {
        // 1. Capture the primary screen
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
        const primarySource = sources.find(source => source.display_id === String(primaryDisplay.id) || sources.length === 1);
        if (!primarySource) throw new Error("Primary display source not found.");
        screenshotDataUrl = primarySource.thumbnail.toDataURL();

        // 2. Perform Detailed OCR (includes preprocessing) using the stored bounds
        const ocrBlocks = await performDetailedOcr(screenshotDataUrl, lastSelectedBounds, ocrLang);

        if (ocrBlocks.length > 0) {
            // 3. Translate Blocks using MyMemory
            const translatedBlocks = await translateBlocks(ocrBlocks);
            // 4. Update Overlay
            updateOverlayBlocks(translatedBlocks);
        } else {
            console.log("[Main:Continuous] No text blocks detected in area.");
            updateOverlayBlocks([]); // Clear overlay
        }
    } catch (error) {
        console.error('[Main:Continuous] Error during capture loop:', error);
        mainWindow?.webContents.send('update-status', `Error en bucle continuo: ${error.message}`);
        updateOverlayBlocks([]); // Clear overlay on error
    } finally {
         screenshotDataUrl = null; // Allow garbage collection
    }
}

function startContinuousCapture(bounds) { /* ... (as before) ... */
    if (isContinuousModeActive) return;
    if (!bounds || typeof bounds !== 'object' || !bounds.width || !bounds.height) {
         console.error("[Main] Start continuous capture called with invalid bounds:", bounds);
         mainWindow?.webContents.send('update-status', 'Error: No hay área válida para captura continua.');
         return;
    }
    console.log("[Main] Starting continuous capture for bounds:", bounds);
    stopContinuousCapture(); // Clear previous interval

    lastSelectedBounds = bounds; // Store the bounds of the main selected area
    isContinuousModeActive = true;
    mainWindow?.webContents.send('update-status', `Captura continua iniciada.`);

    // Create the single managed overlay window using the main bounds
    createManagedOverlayWindow(lastSelectedBounds);

    // Run immediately once, then start interval
    runContinuousCapture();
    continuousIntervalId = setInterval(runContinuousCapture, CONTINUOUS_INTERVAL_MS);
}
function stopContinuousCapture() { /* ... (as before) ... */
    if (continuousIntervalId) {
        console.log("[Main] Stopping continuous capture loop.");
        clearInterval(continuousIntervalId);
        continuousIntervalId = null;
        isContinuousModeActive = false;
        mainWindow?.webContents.send('update-status', 'Captura continua detenida.');
        closeOverlayWindow(); // Close the managed overlay when stopping
    } else {
        isContinuousModeActive = false; // Ensure state is consistent
    }
}


// --- IPC Handlers ---

// Handle request to start screen area selection (Single Shot)
ipcMain.on('start-selection', async (event) => { /* ... (as before) ... */
    console.log('[Main] Received start-selection request');
    stopContinuousCapture(); // Stop continuous mode if running
    mainWindow?.webContents.send('update-status', 'Capturando pantalla para selección...');
    closeOverlayWindow(); // Close any existing overlay

    let screenshotDataUrl; // Local scope
    try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
        const primarySource = sources.find(source => source.display_id === String(primaryDisplay.id) || sources.length === 1);
        if (!primarySource) throw new Error("Primary display source not found.");
        screenshotDataUrl = primarySource.thumbnail.toDataURL(); // Assign local

        console.log('[Main] Screenshot captured (Data URL length:', screenshotDataUrl.length, ')');
        mainWindow?.webContents.send('update-status', 'Abriendo ventana de selección...');
        createSelectionWindow(screenshotDataUrl); // Pass data URL
        console.log('[Main] Selection window creation initiated.');
    } catch (error) {
        console.error('[Main] Error during start-selection process:', error);
        mainWindow?.webContents.send('update-status', `Error al iniciar selección: ${error.message}`);
    }
});
console.log("[Main] 'start-selection' listener registered.");

// Listen for the result from the selection window (Single Shot)
ipcMain.on('selection-complete', async (event, coordinates) => { /* ... (as before) ... */
    console.log('[Main] Received selection-complete event.');
    // Re-capturing is simpler as implemented.

    if (mainWindow) {
        if (coordinates) {
            console.log('[Main] Selection successful. Coordinates:', coordinates.x, coordinates.y, coordinates.width, coordinates.height);
            // Store coordinates for potential continuous start
            lastSelectedBounds = coordinates;

            // --- Single Shot OCR/Translate Flow ---
            mainWindow.webContents.send('update-status', 'Procesando área seleccionada...');
            let singleShotScreenshotUrl;
            try {
                 // 1. Re-capture the *entire* screen for single-shot
                 console.log("[Main] Re-capturing screen for single shot...");
                 const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: screen.getPrimaryDisplay().size });
                 const primarySource = sources.find(source => source.display_id === String(screen.getPrimaryDisplay().id) || sources.length === 1);
                 if (!primarySource) throw new Error("Primary display source not found for re-capture.");
                 singleShotScreenshotUrl = primarySource.thumbnail.toDataURL();

                 // 2. Perform Detailed OCR (includes preprocessing)
                 const ocrBlocks = await performDetailedOcr(singleShotScreenshotUrl, coordinates, ocrLang);

                 if (ocrBlocks.length > 0) {
                     // 3. Translate Blocks using MyMemory
                     const translatedBlocks = await translateBlocks(ocrBlocks);

                     // 4. Create/Update Overlay Window
                     if (translatedBlocks.length > 0) {
                         createManagedOverlayWindow(coordinates); // Create the main overlay frame
                         updateOverlayBlocks(translatedBlocks); // Populate with blocks
                         mainWindow.webContents.send('update-status', 'Traducción completada. Puedes iniciar captura continua.');
                     } else {
                         mainWindow.webContents.send('update-status', 'Error de traducción o sin texto traducible.');
                         closeOverlayWindow();
                     }
                 } else {
                     mainWindow.webContents.send('update-status', 'No se detectó texto en el área seleccionada.');
                     closeOverlayWindow();
                     lastSelectedBounds = null; // Clear if no text found
                 }
                 mainWindow.webContents.send('enable-continuous-start', lastSelectedBounds); // Send bounds or null

            } catch (error) {
                 console.error('[Main] Error during single-shot processing:', error);
                 mainWindow.webContents.send('update-status', `Error al procesar: ${error.message}`);
                 closeOverlayWindow();
                 lastSelectedBounds = null; // Clear bounds on error
                 mainWindow.webContents.send('enable-continuous-start', null); // Send null on error
            } finally {
                 singleShotScreenshotUrl = null; // Cleanup
            }
            // ------------------------------------

        } else { /* ... (selection cancelled handling as before) ... */
            console.log('[Main] Selection cancelled or failed.');
            mainWindow.webContents.send('update-status', 'Selección cancelada o fallida.');
            lastSelectedBounds = null; // Clear bounds
            mainWindow.webContents.send('enable-continuous-start', null); // Send null on cancel
        }
    } else { /* ... (main window closed handling as before) ... */
        console.log('[Main] Main window closed before selection result could be processed.');
        lastSelectedBounds = null; // Clear bounds
    }
});
console.log("[Main] 'selection-complete' listener registered.");


// Remove the direct 'perform-ocr' and 'perform-translation' handlers from preload/renderer call
// ipcMain.handle('perform-ocr', ...);
// ipcMain.handle('perform-translation', ...);

// Keep overlay control handlers
ipcMain.on('close-overlay', () => { closeOverlayWindow(); });

// Continuous Mode IPC Handlers
ipcMain.on('start-continuous-capture', (event, bounds) => { startContinuousCapture(bounds); });
ipcMain.on('stop-continuous-capture', () => { stopContinuousCapture(); });

// Language settings update
ipcMain.on('set-languages', (event, languages) => { /* ... (as before) ... */
    console.log('[Main] Updating languages:', languages);
    let ocrChanged = false;
    let targetChanged = false;
    if (languages.ocrLang && languages.ocrLang !== ocrLang) {
        ocrLang = languages.ocrLang;
        ocrChanged = true;
        if (tesseractWorker) {
             console.log("[Main] OCR language changed, terminating current worker.");
             tesseractWorker.terminate().catch(e=>console.error("Err term worker on lang change", e));
             tesseractWorker = null;
             currentOcrLangWorker = null;
        }
    }
    if (languages.targetLang && languages.targetLang !== targetLang) {
        targetLang = languages.targetLang;
        targetChanged = true;
    }
    if ((ocrChanged || targetChanged) && mainWindow) {
        mainWindow.webContents.send('update-status', `Idiomas actualizados: OCR=${ocrLang}, Traducción=${targetLang}`);
    }
});
ipcMain.handle('get-initial-languages', async () => { /* ... (as before) ... */
    console.log('[Main] Providing initial languages:', { ocrLang, targetLang });
    return { ocrLang, targetLang };
});

// Register listeners log (for verification)
console.log("[Main] All required IPC listeners registered.");

