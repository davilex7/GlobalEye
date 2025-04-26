// screenSelector.js
const { BrowserWindow, screen } = require('electron');
const path = require('path'); // Required for preload path

let selectionWindow = null;
// Remove the callback logic, we'll use IPC now
// let callback = null;
let screenshotDataUrl = null; // Store the screenshot data

// Pass the original screenshot URL to the main process via IPC later
// function createSelectionWindow(dataUrl, cb) {
function createSelectionWindow(dataUrl) { // Remove cb parameter
    console.log("[ScreenSelector] Creating window...");
    if (selectionWindow) {
        try {
            selectionWindow.close();
        } catch (e) {
            console.warn("[ScreenSelector] Error closing existing window:", e.message);
        }
        selectionWindow = null;
    }
    // callback = cb; // No longer needed
    screenshotDataUrl = dataUrl; // Store the screenshot locally in this module scope

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    selectionWindow = new BrowserWindow({
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        width: width,
        height: height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // *** Use the new preload script ***
            preload: path.join(__dirname, 'selectionPreload.js')
        },
        show: false
    });

    // Load an HTML string directly into the window
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
            <title>Select Area</title>
            <style>
                html, body { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; cursor: crosshair; background-color: rgba(0,0,0,0.3); /* Slight dim */ }
                #screenshot { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; opacity: 0.7; /* Make screenshot slightly transparent */ }
                #selection-box { position: absolute; border: 2px dashed #fff; background-color: rgba(255, 255, 255, 0.1); z-index: 2; pointer-events: none; box-sizing: border-box; }
                #instructions { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); background-color: rgba(0,0,0,0.7); color: white; padding: 10px 20px; border-radius: 5px; font-family: sans-serif; z-index: 3; pointer-events: none; }
            </style>
        </head>
        <body>
            <style> body { background-image: url(${screenshotDataUrl}); background-size: cover; } </style>
            <div id="selection-box" style="display: none;"></div>
            <div id="instructions">Haz clic y arrastra para seleccionar un área. Presiona Esc para cancelar.</div>

            <script>
                const selectionBox = document.getElementById('selection-box');
                let startX, startY, isSelecting = false;
                const log = console.log; // Use console.log defined in preload if needed

                log('Selection script loaded.');

                document.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    isSelecting = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    log('Mouse Down:', startX, startY);
                    selectionBox.style.left = startX + 'px';
                    selectionBox.style.top = startY + 'px';
                    selectionBox.style.width = '0px';
                    selectionBox.style.height = '0px';
                    selectionBox.style.display = 'block';
                    document.getElementById('instructions').style.display = 'none';
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isSelecting) return;
                    const currentX = e.clientX;
                    const currentY = e.clientY;

                    const width = Math.abs(currentX - startX);
                    const height = Math.abs(currentY - startY);
                    const left = Math.min(startX, currentX);
                    const top = Math.min(startY, currentY);

                    selectionBox.style.left = left + 'px';
                    selectionBox.style.top = top + 'px';
                    selectionBox.style.width = width + 'px';
                    selectionBox.style.height = height + 'px';
                });

                document.addEventListener('mouseup', (e) => {
                    if (!isSelecting) return;
                    isSelecting = false;
                    const endX = e.clientX;
                    const endY = e.clientY;

                    const width = Math.abs(endX - startX);
                    const height = Math.abs(endY - startY);
                    const x = Math.min(startX, endX);
                    const y = Math.min(startY, endY);

                    log('Mouse Up:', endX, endY, 'Calculated bounds:', x, y, width, height);
                    selectionBox.style.display = 'none';

                    if (width > 5 && height > 5) {
                        const coordinates = { x, y, width, height };
                        log('Selection valid. Sending result via IPC:', coordinates);
                        // *** Send result via preload API ***
                        window.selectionAPI.sendResult(coordinates);
                        window.close(); // Close after sending
                    } else {
                         log('Selection invalid (too small). Sending null via IPC.');
                         // *** Send null via preload API for cancellation ***
                         window.selectionAPI.sendResult(null);
                         window.close(); // Close after sending
                    }
                });

                 document.addEventListener('keydown', (e) => {
                    log('Key Down:', e.key);
                    if (e.key === 'Escape') {
                        log('Escape pressed. Sending null via IPC.');
                         // *** Send null via preload API for cancellation ***
                        window.selectionAPI.sendResult(null);
                        window.close(); // Close after sending
                    }
                 });
            </script>
        </body>
        </html>
    `;

    selectionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    selectionWindow.once('ready-to-show', () => {
        console.log("[ScreenSelector] Window ready to show.");
        selectionWindow.show();
    });

    // Remove the complex 'closed' event handler logic
    selectionWindow.on('closed', () => {
        console.log("[ScreenSelector] Window closed event triggered.");
        selectionWindow = null;
        // Don't clear screenshotDataUrl here, main process needs it
    });

    selectionWindow.on('unresponsive', () => {
        console.error("[ScreenSelector] Window became unresponsive.");
    });
    selectionWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
         console.error(`[ScreenSelector] Failed to load content: ${errorDescription} (Code: ${errorCode})`);
         // Maybe send cancellation back to main process here too?
         closeSelectionWindow(); // Close if content fails
    });

    console.log("[ScreenSelector] Window setup complete.");
}

function closeSelectionWindow() {
    if (selectionWindow) {
        console.log("[ScreenSelector] Closing window externally.");
        try {
            selectionWindow.close();
        } catch (e) {
             console.warn("[ScreenSelector] Error closing window externally:", e.message);
        }
        selectionWindow = null;
    }
    // Clear screenshot data when closed externally or finished
    screenshotDataUrl = null;
}

// Expose the stored screenshot URL if needed (though main has it too)
// function getStoredScreenshotUrl() {
//     return screenshotDataUrl;
// }

module.exports = { createSelectionWindow, closeSelectionWindow };
