// renderer.js

// --- DOM Elements ---
const selectAreaButton = document.getElementById('select-area-button');
const ocrLangSelect = document.getElementById('ocr-lang');
const targetLangSelect = document.getElementById('target-lang');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result'); // Keep for potential single-shot display
const closeOverlayButton = document.getElementById('close-overlay-button');
const startContinuousButton = document.getElementById('start-continuous-button');
const stopContinuousButton = document.getElementById('stop-continuous-button');


// --- State ---
let currentOcrLang = 'eng';
let currentTargetLang = 'es';
let lastValidBoundsForContinuous = null; // Store the actual bounds object {x, y, width, height}
let isContinuousModeActive = false;

// --- Utility Functions ---
function updateStatus(message) {
    console.log("[Renderer] Status Update:", message);
    statusDiv.textContent = message;
}

// Optional: Display combined results in main window for single shot
function displaySingleShotResult(ocrBlocks, translatedBlocks) {
    let html = '<h4>Resultado Disparo Único:</h4>';
    // Simple combined view - could be improved
    translatedBlocks.forEach((block, index) => {
        const original = ocrBlocks.find(o => o.bbox === block.bbox)?.text || '[Original no encontrado]';
        html += `<pre><strong>Original:</strong> ${original}\n<strong>Traducción:</strong> ${block.translatedText}</pre><hr>`;
    });
    resultDiv.innerHTML = html;
    closeOverlayButton.style.display = translatedBlocks.length > 0 ? 'inline-block' : 'none';
}

// Enable/disable continuous mode buttons
function updateContinuousButtons(canStart = false) {
    // Enable start only if not active AND main process confirmed it's possible (bounds exist)
    startContinuousButton.disabled = isContinuousModeActive || !canStart;
    stopContinuousButton.disabled = !isContinuousModeActive;
}

// --- Event Listeners ---

// Button to start area selection (single shot)
selectAreaButton.addEventListener('click', () => {
    console.log("[Renderer] Select Area button clicked!");
    updateStatus('Iniciando selección de área...');
    resultDiv.innerHTML = ''; // Clear previous results
    closeOverlayButton.style.display = 'none';
    startContinuousButton.disabled = true; // Disable while selecting
    stopContinuousButton.disabled = true;
    if (isContinuousModeActive) { // Stop continuous mode if running
        window.electronAPI.stopContinuousCapture();
        isContinuousModeActive = false;
    }
    lastValidBoundsForContinuous = null; // Reset valid bounds
    try {
        window.electronAPI.startSelection();
        console.log("[Renderer] window.electronAPI.startSelection() called.");
    } catch (error) {
        console.error("[Renderer] Error calling window.electronAPI.startSelection():", error);
        updateStatus(`Error al iniciar selección: ${error.message}`);
        updateContinuousButtons(false); // Ensure buttons are disabled on error
    }
});

// Close overlay button
closeOverlayButton.addEventListener('click', () => {
    console.log("[Renderer] Close Overlay button clicked.");
    window.electronAPI.closeOverlay(); // Ask main to close the managed overlay
    closeOverlayButton.style.display = 'none';
    updateStatus('Superposición cerrada.');
});

// --- Continuous Mode Button Listeners ---
startContinuousButton.addEventListener('click', () => {
    // *** FIX: Check if lastValidBoundsForContinuous is an object with coordinates ***
    if (lastValidBoundsForContinuous && typeof lastValidBoundsForContinuous === 'object') {
        console.log("[Renderer] Start Continuous button clicked with bounds:", lastValidBoundsForContinuous);
        updateStatus('Iniciando captura continua...');
        isContinuousModeActive = true;
        updateContinuousButtons(false); // Disable start, enable stop
        // *** FIX: Pass the actual bounds object ***
        window.electronAPI.startContinuousCapture(lastValidBoundsForContinuous);
    } else {
        console.warn("[Renderer] Start continuous clicked but no valid bounds available.", lastValidBoundsForContinuous);
        updateStatus('Error: Realiza una selección válida primero.');
    }
});

stopContinuousButton.addEventListener('click', () => {
    console.log("[Renderer] Stop Continuous button clicked.");
    updateStatus('Deteniendo captura continua...');
    isContinuousModeActive = false;
    // Re-enable start button only if bounds are still considered valid
    updateContinuousButtons(!!lastValidBoundsForContinuous); // Pass boolean based on existence
    window.electronAPI.stopContinuousCapture();
});


// Language selection changes
ocrLangSelect.addEventListener('change', (event) => {
    currentOcrLang = event.target.value;
    console.log(`[Renderer] OCR Language changed to: ${currentOcrLang}`);
    updateStatus(`Idioma OCR cambiado a: ${currentOcrLang}`);
    window.electronAPI.setLanguages({ ocrLang: currentOcrLang });
    if (isContinuousModeActive) {
        updateStatus(`Idioma OCR cambiado a ${currentOcrLang}. El cambio se aplicará en el siguiente ciclo.`);
    }
});

targetLangSelect.addEventListener('change', (event) => {
    currentTargetLang = event.target.value;
    console.log(`[Renderer] Target Language changed to: ${currentTargetLang}`);
    updateStatus(`Idioma de traducción cambiado a: ${currentTargetLang}`);
    window.electronAPI.setLanguages({ targetLang: currentTargetLang });
});

// --- IPC Event Handlers (from Main/Preload) ---

// Handle status updates from main/preload
window.electronAPI.onStatusUpdate((message) => {
    // Avoid flooding status in continuous mode
    if (!isContinuousModeActive || !message.startsWith('Reconociendo') && !message.startsWith('Cargando')) {
         updateStatus(message);
    } else {
         console.log("[Renderer] Continuous Status:", message); // Log background updates
    }
});

// Listen for signal from main process that continuous mode can be started
// *** FIX: Expect bounds object (or null) instead of boolean ***
window.electronAPI.onEnableContinuousStart((bounds) => {
     console.log(`[Renderer] Received enable-continuous-start with bounds:`, bounds);
     if (bounds && typeof bounds === 'object') {
         // Main process confirmed the last selection was valid and processed
         // *** FIX: Store the actual bounds object ***
         lastValidBoundsForContinuous = bounds;
         updateContinuousButtons(true); // Enable start button
     } else {
         lastValidBoundsForContinuous = null; // Reset if main says invalid or sends null
         updateContinuousButtons(false); // Disable start button
     }
});

// Removed onAreaSelected listener, main handles the flow now


// --- Initialization ---
async function initializeApp() {
    console.log("[Renderer] Initializing application...");
    updateStatus('Inicializando aplicación...');
    try {
        // Check if electronAPI exists before calling
        if (window.electronAPI && typeof window.electronAPI.getInitialLanguages === 'function') {
            const languages = await window.electronAPI.getInitialLanguages();
            console.log("[Renderer] Received initial languages:", languages);

            // *** FIX: Check if languages object is valid before accessing properties ***
            if (languages && typeof languages === 'object' && languages.ocrLang && languages.targetLang) {
                currentOcrLang = languages.ocrLang;
                currentTargetLang = languages.targetLang;
                ocrLangSelect.value = currentOcrLang;
                targetLangSelect.value = currentTargetLang;
                updateStatus(`Listo. OCR: ${currentOcrLang}, Traducción: ${currentTargetLang}`);
            } else {
                 console.error("[Renderer] Invalid languages object received from main process:", languages);
                 updateStatus('Error al obtener idiomas iniciales.');
                 // Set defaults manually if fetch failed
                 currentOcrLang = ocrLangSelect.value;
                 currentTargetLang = targetLangSelect.value;
            }
        } else {
             console.error("[Renderer] electronAPI or getInitialLanguages not available at initialization.");
             updateStatus('Error: No se pudo comunicar con el proceso principal.');
             // Set defaults manually
             currentOcrLang = ocrLangSelect.value;
             currentTargetLang = targetLangSelect.value;
        }
    } catch (error) {
         // Catch errors during the async call itself
         updateStatus(`Error al inicializar: ${error.message}`);
         console.error("[Renderer] Initialization error during API call:", error);
         // Set defaults manually
         currentOcrLang = ocrLangSelect.value;
         currentTargetLang = targetLangSelect.value;
    }
     closeOverlayButton.style.display = 'none';
     updateContinuousButtons(false); // Initialize button states (disabled)
}

// Run initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// --- Cleanup ---
window.addEventListener('unload', () => {
    console.log("[Renderer] Unloading window, removing listeners.");
    // Check if API exists before removing listeners
    if (window.electronAPI) {
        window.electronAPI.removeListener('update-status');
        window.electronAPI.removeListener('enable-continuous-start');
        // Stop continuous capture if window is closed while running
        window.electronAPI.stopContinuousCapture();
    }
});
