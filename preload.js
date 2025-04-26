// preload.js (Simplified for New Overlay Logic)
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Loading script for main window...');

try {
    contextBridge.exposeInMainWorld('electronAPI', {
        // --- IPC Communication ---
        startSelection: () => {
            console.log("[Preload] electronAPI.startSelection called. Sending 'start-selection' to main...");
            ipcRenderer.send('start-selection');
        },
        // --- Continuous Mode IPC ---
        startContinuousCapture: (bounds) => {
            console.log("[Preload] Sending 'start-continuous-capture' to main with bounds:", bounds);
            ipcRenderer.send('start-continuous-capture', bounds);
        },
        stopContinuousCapture: () => {
            console.log("[Preload] Sending 'stop-continuous-capture' to main.");
            ipcRenderer.send('stop-continuous-capture');
        },
        // --- Overlay Control ---
        // Note: showOverlay is now implicitly handled by main process after OCR/Translate
        closeOverlay: () => {
            console.log("[Preload] Sending 'close-overlay' to main.");
            ipcRenderer.send('close-overlay'); // Asks main to close the managed overlay
        },
        // --- Language/Config ---
        setLanguages: (languages) => {
            console.log("[Preload] Sending 'set-languages' to main:", languages);
            ipcRenderer.send('set-languages', languages);
        },
        getInitialLanguages: () => {
             console.log("[Preload] Invoking 'get-initial-languages' in main...");
             return ipcRenderer.invoke('get-initial-languages');
        },

        // --- Listen for Updates from Main ---
        onStatusUpdate: (callback) => ipcRenderer.on('update-status', (_event, value) => callback(value)),
        // Renderer no longer needs 'area-selected' as main handles the single-shot flow
        // onAreaSelected: (callback) => ipcRenderer.on('area-selected', (_event, value) => callback(value)),
        // Listen for signal to enable continuous start button
         onEnableContinuousStart: (callback) => ipcRenderer.on('enable-continuous-start', (_event, value) => callback(value)),


        // --- Cleanup ---
        removeListener: (channel) => {
            console.log(`[Preload] Removing all listeners for channel: ${channel}`);
            ipcRenderer.removeAllListeners(channel);
        },
    });

    console.log('[Preload] Script loaded and context bridge exposed.');

} catch (bridgeError) {
    console.error('[Preload] FATAL ERROR during contextBridge setup:', bridgeError);
}
