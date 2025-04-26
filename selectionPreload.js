// selectionPreload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[SelectionPreload] Loading script...');

try {
    contextBridge.exposeInMainWorld('selectionAPI', {
        sendResult: (coordinates) => {
            console.log('[SelectionPreload] Sending result to main:', coordinates);
            // Send the result (or null for cancellation) to the main process
            ipcRenderer.send('selection-complete', coordinates);
        }
    });
    console.log('[SelectionPreload] contextBridge exposed.');
} catch (error) {
    console.error('[SelectionPreload] Error exposing context bridge:', error);
}
