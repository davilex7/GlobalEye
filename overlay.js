// overlay.js (Managed Single Window for Blocks)
const { BrowserWindow } = require('electron');
const path = require('path');

let managedOverlayWindow = null;

// Function to create the single, managed overlay window
function createManagedOverlayWindow(mainAreaBounds) {
    if (managedOverlayWindow && !managedOverlayWindow.isDestroyed()) {
        console.log("[OverlayManager] Window already exists. Updating bounds.");
        managedOverlayWindow.setBounds({
            x: Math.round(mainAreaBounds.x), y: Math.round(mainAreaBounds.y),
            width: Math.round(mainAreaBounds.width), height: Math.round(mainAreaBounds.height)
        });
        if (!managedOverlayWindow.isVisible()) managedOverlayWindow.show();
        managedOverlayWindow.setAlwaysOnTop(true);
        // Ensure click-through is set
        managedOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
        return; // Window already exists
    }

    console.log("[OverlayManager] Creating new managed overlay window for area:", mainAreaBounds);
    managedOverlayWindow = new BrowserWindow({
        x: Math.round(mainAreaBounds.x), y: Math.round(mainAreaBounds.y),
        width: Math.round(mainAreaBounds.width), height: Math.round(mainAreaBounds.height),
        frame: false,
        // *** Restore transparency and remove background color ***
        transparent: true,
        // backgroundColor: '#FF000033', // Remove this
        alwaysOnTop: true, skipTaskbar: true, resizable: false,
        movable: false, focusable: false, show: false,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true,
            preload: path.join(__dirname, 'overlayPreload.js') // Use the specific preload
        }
    });

    // *** Load the overlay.html file ***
    const overlayHtmlPath = path.join(__dirname, 'overlay.html');
    managedOverlayWindow.loadFile(overlayHtmlPath)
        .then(() => console.log("[OverlayManager] overlay.html loaded successfully."))
        .catch(err => console.error("[OverlayManager] Failed to load overlay.html:", err));


    managedOverlayWindow.once('ready-to-show', () => {
        console.log("[OverlayManager] Window ready-to-show.");
        managedOverlayWindow.show();
        // *** Restore click-through ***
        managedOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
        console.log("[OverlayManager] Set ignore mouse events.");

        // *** Remove automatic DevTools opening ***
        // managedOverlayWindow.webContents.openDevTools({ mode: 'detach' });
        // console.log("[OverlayManager] Opened DevTools for overlay window.");
    });

    managedOverlayWindow.on('closed', () => {
        console.log("[OverlayManager] Managed overlay window closed event.");
        managedOverlayWindow = null;
    });
}

// Function called by main process to send data to the overlay window
function updateOverlayBlocks(blocksData) {
    if (managedOverlayWindow && !managedOverlayWindow.isDestroyed() && managedOverlayWindow.webContents) {
        console.log(`[OverlayManager] Sending ${blocksData?.length ?? 'invalid'} blocks to overlay window.`);
        // Ensure blocksData is always an array before sending
        managedOverlayWindow.webContents.send('update-blocks', Array.isArray(blocksData) ? blocksData : []);
    } else {
        console.log("[OverlayManager] Cannot update blocks, window not available or webContents missing.");
    }
}

// Function to close the managed overlay window
function closeOverlayWindow() {
    if (managedOverlayWindow && !managedOverlayWindow.isDestroyed()) {
        console.log("[OverlayManager] Closing managed overlay window.");
        managedOverlayWindow.close();
        managedOverlayWindow = null;
    }
}

module.exports = { createManagedOverlayWindow, updateOverlayBlocks, closeOverlayWindow };
