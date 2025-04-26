// overlayRenderer.js - Script for the overlay.html window

const container = document.getElementById('block-container');
// Add logs inside the overlay's renderer process
console.log('[OverlayInternal] Script loaded.');

function renderBlocks(blocksData) {
    // *** Log block data received ***
    console.log('[OverlayInternal] renderBlocks called with:', blocksData);
    if (!Array.isArray(blocksData)) {
         console.error('[OverlayInternal] Invalid data received, expected array:', blocksData);
         blocksData = []; // Prevent errors
    }
    container.innerHTML = ''; // Clear previous blocks

    blocksData.forEach((block, index) => {
        // *** Log each block being rendered ***
        console.log(`[OverlayInternal] Rendering block ${index}:`, block);
        if (!block || !block.bbox || typeof block.translatedText === 'undefined') {
             console.warn(`[OverlayInternal] Skipping invalid block ${index}:`, block);
             return; // Skip invalid blocks
        }

        const div = document.createElement('div');
        div.className = 'text-block-overlay';
        // Display error message if translation failed
        div.textContent = block.error ? `[${block.error}]` : block.translatedText;
        if (block.error) {
            div.style.color = 'red'; // Indicate error visually
        }


        // Position and size based on relative bbox
        div.style.left = `${block.bbox.x}px`;
        div.style.top = `${block.bbox.y}px`;
        div.style.width = `${block.bbox.width}px`;
        div.style.height = `${block.bbox.height}px`;

        // Dynamic font size
        let fontSize = Math.max(6, Math.min(16, Math.round(block.bbox.height * 0.6)));
        if (block.bbox.width < fontSize * 3 && block.bbox.width > 0) { // Avoid division by zero
             fontSize = Math.max(6, Math.round(block.bbox.width / 2));
        }
        div.style.fontSize = `${fontSize}px`;

        container.appendChild(div);
    });
    console.log('[OverlayInternal] Finished rendering blocks.');
}

// Check if overlayAPI and onUpdateBlocks exist before calling
// Need to wait for the preload script to potentially finish loading
if (window.overlayAPI && typeof window.overlayAPI.onUpdateBlocks === 'function') {
    // Listen for updates via the preload API
    window.overlayAPI.onUpdateBlocks((blocksData) => {
        renderBlocks(blocksData);
    });
    console.log('[OverlayInternal] Listener attached via overlayAPI.');
} else {
     // This might happen if preload script hasn't run yet, maybe add a small delay/check?
     // Or rely on the fact that preload should run first.
     console.error('[OverlayInternal] FATAL: window.overlayAPI.onUpdateBlocks is not available. Preload script likely failed or context bridge issue.');
     // Display an error message in the overlay itself
     container.innerHTML = '<div style="color: red; background: black; padding: 5px;">Error: Overlay API no disponible.</div>';
}
