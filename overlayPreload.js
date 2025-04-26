// overlayPreload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[OverlayPreload] Loading script...');

try {
    contextBridge.exposeInMainWorld('overlayAPI', {
        // Listen for updates from the main process
        onUpdateBlocks: (callback) => {
            console.log('[OverlayPreload] Setting up onUpdateBlocks listener.'); // Log listener setup
            const listener = (_event, blocksData) => {
                console.log(`[OverlayPreload] Received 'update-blocks' event with ${blocksData?.length ?? 'no'} blocks.`); // Log data reception
                callback(blocksData);
            };
            ipcRenderer.on('update-blocks', listener);
            // Return a function to remove the listener for cleanup
            return () => {
                console.log('[OverlayPreload] Removing onUpdateBlocks listener.'); // Log listener removal
                ipcRenderer.removeListener('update-blocks', listener);
            };
        }
    });
    console.log('[OverlayPreload] contextBridge exposed.');
} catch (error) {
    console.error('[OverlayPreload] Error exposing context bridge:', error);
}
