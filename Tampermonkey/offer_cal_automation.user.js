// ==UserScript==
// @name         Uber Eats - Get Offer Data (v7 - Patient Scroll & Fetch)
// @namespace    http://tampermonkey.net/
// @version      9.4
// @description  Fetches order history, analyzes discounts, supports ResAI sync, fixes UI DOM extraction, calculates non-combo items, and captures dynamic financial fields.
// @author       Luke
// @match        https://merchants.ubereats.com/manager/*
// @updateURL    https://raw.githubusercontent.com/lukez42/Ubereats_Offer_Cal_Automation/main/Tampermonkey/offer_cal_automation.user.js
// @downloadURL  https://raw.githubusercontent.com/lukez42/Ubereats_Offer_Cal_Automation/main/Tampermonkey/offer_cal_automation.user.js
// @grant        GM_addStyle
// @grant        window.fetch
// @grant        GM_xmlhttpRequest
// @connect      pdcpyuyzerrgixhjnspe.supabase.co
// ==/UserScript==

/* --- This is the CSS that styles the new button and offer text --- */
GM_addStyle(`
    #fetch-offer-data-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        margin-left: 0;
        padding: 12px 20px;
        background-color: #06C167; /* Uber's green */
        color: white;
        border: none;
        border-radius: 50px; /* Pillow shape */
        cursor: pointer;
        font-size: 16px;
        font-weight: 500;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        transition: transform 0.3s ease, background-color 0.2s, opacity 0.3s ease;
        opacity: 1;
        overflow: hidden; /* For fill animation */
        /* Performance: Isolate from page layout/paint recalculations */
        contain: layout style paint;
    }
    #fetch-offer-data-btn.hidden {
        transform: translateY(100px);
        opacity: 0;
        pointer-events: none;
    }
    #fetch-offer-data-btn:hover {
        background-color: #059c52;
        transform: scale(1.05);
    }
    #fetch-offer-data-btn.hidden:hover {
        transform: translateY(100px); /* Keep hidden even on hover */
    }
    #fetch-offer-data-btn:active {
        transform: scale(0.95);
    }
    
    /* Loading state with fill animation (non-overlay mode) */
    #fetch-offer-data-btn.loading {
        background-color: #3a3a3a;
        cursor: not-allowed;
    }
    #fetch-offer-data-btn.loading.with-progress {
        background-color: #2a2a2a; /* Darker base for contrast */
    }
    
    /* Water-fill progress animation using pseudo-element */
    #fetch-offer-data-btn .progress-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #06C167 0%, #08d975 50%, #06C167 100%);
        transform: scaleX(0);
        transform-origin: left center;
        transition: transform 0.3s ease-out;
        z-index: -1;
        border-radius: 50px;
    }
    
    /* Button text stays above the fill */
    #fetch-offer-data-btn .btn-text {
        position: relative;
        z-index: 1;
    }
    .th-offer, .th-issue, .th-items-detected {
        display: table-cell !important;
        text-align: left;
        padding: 16px 16px 16px 0;
        vertical-align: middle;
    }
    .td-offer-value {
        font-family: UberMoveText, system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        color: #DE1135;
        padding: 16px 16px 16px 0;
        vertical-align: top;
    }
    .td-no-offer {
        padding: 16px 16px 16px 0;
        vertical-align: top;
        color: #A6A6A6;
    }
    
    /* Active Row Highlight - Performance optimized */
    tr.processing-active-row {
        position: relative;
        background-color: rgba(6, 193, 103, 0.08) !important; /* Subtle highlight */
        box-shadow: inset 4px 0 0 #06C167 !important; /* Left green accent */
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
        will-change: background-color, box-shadow;
        z-index: 10;
    }

    /* === Processing Mode Overlay (GPU-Optimized) === */
    #processing-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 99999;
        pointer-events: all;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease, visibility 0.4s ease;
        /* Force GPU layer for smooth transitions */
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        /* Performance: Complete isolation from page layout */
        contain: strict;
    }
    #processing-overlay.active {
        opacity: 1;
        visibility: visible;
    }
    
    /* Green glow border - static box-shadow, animated with opacity for performance */
    #processing-overlay .glow-border {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        /* Static box-shadow - no animation on this property */
        box-shadow: 
            inset 0 0 80px rgba(6, 193, 103, 0.5),
            inset 0 0 150px rgba(6, 193, 103, 0.25),
            inset 0 0 200px rgba(6, 193, 103, 0.1);
        /* GPU acceleration */
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        will-change: opacity;
    }
    
    /* Pulse layer - animates opacity instead of box-shadow for performance */
    #processing-overlay .glow-pulse {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        box-shadow: 
            inset 0 0 100px rgba(6, 193, 103, 0.3),
            inset 0 0 180px rgba(6, 193, 103, 0.15);
        animation: glowPulseOptimized 2.5s ease-in-out infinite;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        will-change: opacity;
    }
    
    @keyframes glowPulseOptimized {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.8; }
    }
    
    /* Click-blocking transparent center */
    #processing-overlay .click-blocker {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        cursor: not-allowed;
    }
    
    /* Status message at bottom - Responsive positioning */
    #processing-overlay .status-message {
        position: absolute;
        bottom: 15vh; /* Use viewport height instead of fixed pixels */
        left: 50%;
        transform: translateX(-50%) translateZ(0);
        -webkit-transform: translateX(-50%) translateZ(0);
        background: rgba(6, 193, 103, 0.95);
        color: white;
        padding: 12px 24px;
        border-radius: 50px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(6, 193, 103, 0.4);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 100000; /* Ensure text is above everything */
    }
    
    /* Tablet/Landscape optimizations */
    @media (max-height: 600px) and (orientation: landscape) {
        #processing-overlay .status-message {
            bottom: 20vh; /* Raise it higher on short screens */
            padding: 8px 16px; /* Slightly smaller padding */
            font-size: 13px;
        }
    }

    /* Dark Mode Enhancements for Glow */
    @media (prefers-color-scheme: dark) {
        #processing-overlay .glow-border {
            box-shadow: 
                inset 0 0 80px rgba(6, 193, 103, 0.8),  /* Increased opacity */
                inset 0 0 150px rgba(6, 193, 103, 0.5), /* Increased opacity */
                inset 0 0 200px rgba(6, 193, 103, 0.3); /* Increased opacity */
            mix-blend-mode: screen; /* Helps glow pop on dark backgrounds */
        }
        #processing-overlay .glow-pulse {
            box-shadow: 
                inset 0 0 100px rgba(6, 193, 103, 0.6),
                inset 0 0 180px rgba(6, 193, 103, 0.4);
            mix-blend-mode: screen;
        }
    }
    
    /* Animated cycling dots for "Loading more" text */
    .animated-dots:after {
        content: '.';
        animation: dots 1.5s steps(5, end) infinite;
        display: inline-block;
        width: 1.5em; /* Reserve space to prevent layout shift */
        text-align: left;
    }
    
    @keyframes dots {
        0%, 20% { content: '.'; }
        40% { content: '..'; }
        60% { content: '...'; }
        80%, 100% { content: ''; }
    }
    
    /* SVG Progress Ring - shows actual percentage */
    #processing-overlay .progress-ring {
        width: 24px;
        height: 24px;
        transform: rotate(-90deg) translateZ(0);
        -webkit-transform: rotate(-90deg) translateZ(0);
    }
    
    #processing-overlay .progress-ring-bg {
        fill: none;
        stroke: rgba(255, 255, 255, 0.3);
        stroke-width: 3;
    }
    
    #processing-overlay .progress-ring-fill {
        fill: none;
        stroke: white;
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.3s ease;
    }
    
    /* Low-Power Mode / Reduced Motion Optimizations */
    @media (prefers-reduced-motion: reduce) {
        #fetch-offer-data-btn,
        #fetch-offer-data-btn .progress-fill,
        #processing-overlay .glow-pulse,
        #processing-overlay .progress-ring-fill,
        tr.processing-active-row {
            animation: none !important;
            transition: none !important;
        }
        
        #processing-overlay .glow-pulse {
            opacity: 0.5 !important;
        }
        
        .animated-dots:after {
            animation: none !important;
            content: '...' !important;
        }
    }
`);

(function () {
    'use strict';

    // Native modal system — replaces SweetAlert2 to avoid Uber Eats CSP blocking external scripts
    async function loadSweetAlert() { /* no-op: using native modal */ }

    const Swal = {
        fire(options) {
            // Support simple (title, text, icon) shorthand
            if (typeof options === 'string') {
                options = { title: arguments[0], html: arguments[1], icon: arguments[2] };
            }

            return new Promise((resolve) => {
                // Remove any existing modal
                const existing = document.getElementById('resai-native-modal');
                if (existing) existing.remove();

                const isPrompt = !!options.input;
                const iconColor = options.icon === 'error' ? '#DE1135' : options.icon === 'warning' ? '#f0a500' : '#06C167';
                const iconChar = options.icon === 'error' ? '✕' : options.icon === 'warning' ? '⚠' : '✓';

                const overlay = document.createElement('div');
                overlay.id = 'resai-native-modal';
                overlay.style.cssText = `
                    position:fixed;inset:0;z-index:2147483647;
                    background:rgba(0,0,0,0.6);display:flex;
                    align-items:flex-start;justify-content:center;
                    padding:40px 20px;overflow-y:auto;
                `;

                const box = document.createElement('div');
                box.style.cssText = `
                    background:#fff;border-radius:16px;padding:28px 32px;
                    max-width:${options.width || '520px'};width:100%;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:sans-serif;
                    position:relative;
                `;

                let inputHTML = '';
                if (isPrompt) {
                    inputHTML = `
                        <div style="margin:12px 0 4px;font-size:13px;color:#555;">${options.inputLabel || ''}</div>
                        <input id="resai-modal-input" type="text" placeholder="${options.inputPlaceholder || ''}"
                            style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;
                                   border-radius:8px;font-size:14px;margin-bottom:8px;"/>
                    `;
                }

                box.innerHTML = `
                    <div style="text-align:center;margin-bottom:16px;">
                        <div style="width:52px;height:52px;border-radius:50%;background:${iconColor};
                                    color:#fff;font-size:24px;font-weight:bold;display:inline-flex;
                                    align-items:center;justify-content:center;margin-bottom:12px;">${iconChar}</div>
                        <div style="font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">${options.title || ''}</div>
                    </div>
                    <div style="font-size:14px;color:#333;max-height:65vh;overflow-y:auto;">${options.html || options.text || ''}</div>
                    ${inputHTML}
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
                        ${options.showCancelButton ? `<button id="resai-modal-cancel" style="padding:10px 24px;border:1px solid #ddd;background:#f5f5f5;border-radius:8px;cursor:pointer;font-size:14px;">Cancel</button>` : ''}
                        <button id="resai-modal-confirm" style="padding:10px 28px;border:none;background:${iconColor};color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">${options.confirmButtonText || 'OK'}</button>
                    </div>
                `;

                overlay.appendChild(box);
                document.body.appendChild(overlay);

                // Focus input if prompt
                if (isPrompt) {
                    setTimeout(() => document.getElementById('resai-modal-input')?.focus(), 50);
                }

                const close = (value) => {
                    overlay.remove();
                    resolve({ value, isConfirmed: value !== undefined && value !== false });
                };

                document.getElementById('resai-modal-confirm').onclick = () => {
                    if (isPrompt) {
                        const val = document.getElementById('resai-modal-input')?.value?.trim();
                        close(val || undefined);
                    } else {
                        close(true);
                    }
                };

                const cancelBtn = document.getElementById('resai-modal-cancel');
                if (cancelBtn) cancelBtn.onclick = () => close(undefined);

                // Allow Enter key to confirm
                overlay.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') document.getElementById('resai-modal-confirm')?.click();
                    if (e.key === 'Escape' && options.showCancelButton) close(undefined);
                });
            });
        }
    };
    window.Swal = Swal;

    // *** CONFIGURATION ***
    const DEBUG = true; // Set to true to enable verbose console logging

    /**
     * Normalizes a raw Uber Eats bundle item name into a stable DB key.
     * Strips decorators that may change without notice:
     *   - (N) numbered prefix  e.g. "(3) "
     *   - ▪️  bullet separator
     *   - ✔️  checkmark confirmation
     * The semantic core — "{Main Dish} Meal with {Side}" — stays intact.
     * If Uber Eats renames decorators in future, the DB key won't change.
     */
    function normalizeItemKey(rawName) {
        return rawName
            .replace(/^[\(（]\d+[\)）]\s*/, '')   // remove (N) or （N） prefix
            .replace(/▪️/g, '')           // remove bullet
            .replace(/✔️/g, '')           // remove checkmark
            .replace(/\s+/g, ' ')         // collapse multiple spaces
            .trim();
    }
    const SHOW_DEBUG_COLUMNS = false; // Set to true to show debug columns (Offer, Issue, Items, Tofu#, Pork#, Beef#)
    const SHOW_PROCESSING_OVERLAY = true; // Set to false to disable green glow overlay during processing

    // Helper function for debug logging - only outputs when DEBUG is true
    function log(...args) {
        if (DEBUG) console.log('[UberEats Script]', ...args);
    }
    function logDebug(...args) {
        if (DEBUG) console.log('[DEBUG]', ...args);
    }
    function warn(...args) {
        console.warn('[UberEats Script]', ...args);
    }
    function error(...args) {
        console.error('[UberEats Script]', ...args);
    }

    // Startup log (always shown - minimal output for production)
    const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : 'unknown';
    console.log(`[UberEats Script] v${scriptVersion} loaded`);

    // --- 1. A global store to hold the data we intercept ---
    window.orderOfferData = {};
    window.orderIssueData = {};
    window.orderItemsData = {}; // Store items data for each order
    window.orderDateData = {}; // Store date for each order
    window.orderShopData = {}; // Store shop details
    window.orderTimeData = {}; // Store time
    window.orderCustomerData = {}; // Store customer name
    window.orderFulfilmentData = {}; // Store fulfilment type
    window.orderCourierData = {}; // Store courier name
    window.processedOrderIds = new Set(); // Keep track of processed orders

    // Detect if running on mobile device (for Kiwi Browser on Android)
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobileDevice) {
        log(' Mobile device detected - touch events will be used');
    }

    // === PROCESSING OVERLAY FUNCTIONS ===
    let processingOverlay = null;

    function createProcessingOverlay() {
        if (document.getElementById('processing-overlay')) {
            return document.getElementById('processing-overlay');
        }

        const overlay = document.createElement('div');
        overlay.id = 'processing-overlay';
        overlay.innerHTML = `
            <div class="glow-border"></div>
            <div class="glow-pulse"></div>
            <div class="click-blocker"></div>
            <div class="status-message">
                <svg class="progress-ring" viewBox="0 0 24 24">
                    <circle class="progress-ring-bg" cx="12" cy="12" r="10"></circle>
                    <circle class="progress-ring-fill" cx="12" cy="12" r="10" 
                            stroke-dasharray="62.83" stroke-dashoffset="62.83"></circle>
                </svg>
                <span class="status-text">Initializing...</span>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    function showProcessingOverlay(statusText = 'Processing...') {
        if (!SHOW_PROCESSING_OVERLAY) return;
        processingOverlay = createProcessingOverlay();
        updateProcessingStatus(statusText, 0, 1);
        processingOverlay.classList.add('active');

        // Hide the button for cleaner UI (overlay shows status instead)
        const button = document.getElementById('fetch-offer-data-btn');
        if (button) button.classList.add('hidden');
    }

    function updateProcessingStatus(statusText, current = 0, total = 1) {
        if (!SHOW_PROCESSING_OVERLAY || !processingOverlay) return;

        const textEl = processingOverlay.querySelector('.status-text');
        if (textEl) {
            textEl.innerHTML = statusText;
        }

        const progressRing = processingOverlay.querySelector('.progress-ring circle:last-child');
        if (progressRing) {
            const radius = progressRing.r.baseVal.value;
            const circumference = 2 * Math.PI * radius;
            const progress = Math.min(current / total, 1);
            const offset = circumference - (progress * circumference);
            progressRing.style.strokeDashoffset = offset;
        }

        // Clean log for console (remove HTML tags)
        const cleanText = statusText.replace(/<[^>]*>/g, '');
        // Only log significantly different status updates to avoid spam
        // log(` [UI] ${cleanText}`);
    }

    // Update button progress (for non-overlay mode)
    function updateButtonProgress(current, total, statusText) {
        const button = document.getElementById('fetch-offer-data-btn');
        if (!button) return;

        const btnText = button.querySelector('.btn-text');
        const progressFill = button.querySelector('.progress-fill');

        if (btnText) {
            // Use innerHTML to support animated dots span
            btnText.innerHTML = statusText || `Processing... (${current}/${total})`;
        }

        if (progressFill) {
            const progress = Math.min(current / total, 1);
            progressFill.style.transform = `scaleX(${progress})`;
        }

        // Add class for styling
        button.classList.add('with-progress');
    }

    // Reset button to original state
    function resetButtonProgress() {
        const button = document.getElementById('fetch-offer-data-btn');
        if (!button) return;

        const btnText = button.querySelector('.btn-text');
        const progressFill = button.querySelector('.progress-fill');

        if (btnText) {
            btnText.textContent = 'Fetch Offer Data';
        }

        if (progressFill) {
            progressFill.style.transform = 'scaleX(0)';
        }

        button.classList.remove('with-progress');
    }

    function hideProcessingOverlay() {
        if (processingOverlay) {
            processingOverlay.classList.remove('active');
        }

        // Cleanup row highlight
        const activeRow = document.querySelector('tr.processing-active-row');
        if (activeRow) activeRow.classList.remove('processing-active-row');

        // Show the button again and reset its state
        const button = document.getElementById('fetch-offer-data-btn');
        if (button) {
            button.classList.remove('hidden');
            resetButtonProgress();
        }
    }
    // *** INDEXEDDB RECOVERY FUNCTIONS ***
    const DB_NAME = 'UberEatsScraperDB';
    const STORE_NAME = 'recoveryState';

    function initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    }

    async function saveStateToIndexedDB() {
        try {
            const state = {
                processedOrderIds: Array.from(window.processedOrderIds),
                orderOfferData: window.orderOfferData || {},
                orderSubtotalData: window.orderSubtotalData || {},
                orderFinancialsData: window.orderFinancialsData || {},
                orderItemsData: window.orderItemsData || {},
                orderDateData: window.orderDateData || {},
                orderShopData: window.orderShopData || {},
                orderTimeData: window.orderTimeData || {},
                orderCustomerData: window.orderCustomerData || {},
                orderFulfilmentData: window.orderFulfilmentData || {},
                orderCourierData: window.orderCourierData || {},
                orderCancelledData: window.orderCancelledData || {},
                timestamp: Date.now()
            };
            
            const db = await initIndexedDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put(state, 'currentState');
                tx.oncomplete = () => {
                    log(` Saved recovery state to IndexedDB: ${state.processedOrderIds.length} orders processed`);
                    console.log('%c[DB] Successfully saved recovery state to IndexedDB!', 'background: #06C167; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;', `${state.processedOrderIds.length} orders processed`);
                    resolve();
                };
                tx.onerror = (e) => reject(e);
            });
        } catch (e) {
            console.warn('[UberEats Script] Failed to save recovery state to IndexedDB:', e);
        }
    }

    async function loadStateFromIndexedDB() {
        try {
            const db = await initIndexedDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get('currentState');
                
                request.onsuccess = () => {
                    const state = request.result;
                    if (!state) return resolve(null);

                    // Only use recovery state if it's less than 60 minutes old
                    const ageMinutes = (Date.now() - state.timestamp) / 1000 / 60;
                    if (ageMinutes > 60) {
                        log(' Recovery state is too old, discarding');
                        clearRecoveryState();
                        return resolve(null);
                    }
                    resolve(state);
                };
                request.onerror = (e) => reject(e);
            });
        } catch (e) {
            console.warn('[UberEats Script] Failed to load recovery state from IndexedDB:', e);
            return null;
        }
    }

    function clearRecoveryState() {
        localStorage.removeItem('ubereats_reload_recovery');
        localStorage.removeItem('ubereats_last_order_index');
        localStorage.removeItem('ubereats_active_processing_order');
        initIndexedDB().then(db => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete('currentState');
            } catch (e) {}
        }).catch(() => {});
    }

    function isRecoveryMode() {
        return localStorage.getItem('ubereats_reload_recovery') === 'true';
    }

    // --- 2. Helper functions ---

    // Finds an element by selector and partial text match
    function findElementByText(selector, ...text) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            const content = el.textContent.toLowerCase();
            if (text.every(t => content.includes(t.toLowerCase()))) {
                return el;
            }
        }
        return null;
    }

    // Helper to wait for an element to disappear
    function waitForElementToDisappear(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const intervalTime = 100;
            let totalTime = 0;
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (!element) {
                    clearInterval(interval);
                    resolve(true); // Found
                }
                totalTime += intervalTime;
                if (totalTime >= timeout) {
                    clearInterval(interval);
                    resolve(false); // Timed out
                }
            }, intervalTime);
        });
    }

    function waitForDrawerOpen(timeout = 10000) {
        return new Promise((resolve) => {
            const intervalTime = 50;
            let totalTime = 0;
            const interval = setInterval(() => {
                // Look for the Close button with aria-label="Close" - this is the most reliable indicator
                const closeButtons = document.querySelectorAll('button[aria-label="Close"]');
                log(` waitForDrawerOpen: Found ${closeButtons.length} Close buttons`);

                for (const closeBtn of closeButtons) {
                    // Check if the close button is actually visible
                    if (closeBtn.offsetParent !== null) {
                        log(` waitForDrawerOpen: Found visible Close button`);
                        // Find the drawer container - it's the ancestor with data-baseweb="drawer"
                        const drawer = closeBtn.closest('div[data-baseweb="drawer"]');
                        if (drawer) {
                            log(` waitForDrawerOpen: Found drawer element via Close button`, drawer.className);
                            clearInterval(interval);
                            resolve(drawer);
                            return;
                        } else {
                            // If no data-baseweb="drawer", just use a parent container
                            const drawerContainer = closeBtn.closest('div[class*="_ap"]') || closeBtn.parentElement.parentElement;
                            log(` waitForDrawerOpen: Found drawer container (no data-baseweb)`, drawerContainer ? drawerContainer.className : 'null');
                            clearInterval(interval);
                            resolve(drawerContainer);
                            return;
                        }
                    }
                }

                totalTime += intervalTime;
                if (totalTime >= timeout) {
                    log(` waitForDrawerOpen: Timeout after ${timeout}ms`);
                    // Log all elements to debug
                    log(` All elements with data-baseweb="drawer":`, document.querySelectorAll('div[data-baseweb="drawer"]'));
                    clearInterval(interval);
                    resolve(null);
                }
            }, intervalTime);
        });
    }

    async function waitForDrawerContent(drawer, timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!drawer.isConnected || drawer.getAttribute('aria-hidden') === 'true') {
                return false;
            }
            const hasContent = drawer.querySelector('p, span, div');
            if (hasContent && /Net payout|Sales \(incl\. VAT\)|Offers on items/i.test(drawer.textContent || '')) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return false;
    }

    function simulateClick(element, useTouchEvents = false) {
        if (!element) return false;

        // Ensure element is in viewport (do this once, not per-attempt)
        try {
            element.scrollIntoView({ behavior: 'instant', block: 'center' });
        } catch (e) { }

        // Focus the element
        try {
            if (element.focus) element.focus({ preventScroll: true });
        } catch (e) { }

        // *** PRIMARY: Native .click() - Most reliable ***
        try {
            if (typeof element.click === 'function') {
                element.click();
                return true; // Success - no need for backup strategies on desktop
            }
        } catch (err) {
            console.warn('[UberEats Script] simulateClick: native click failed', err);
        }

        // *** BACKUP: Only used if native click unavailable or on mobile ***
        // For mobile (Kiwi Browser), also dispatch touch/pointer events
        if (useTouchEvents) {
            try {
                // Touch events for mobile
                if (typeof TouchEvent !== 'undefined') {
                    const touch = new Touch({
                        identifier: Date.now(),
                        target: element,
                        clientX: 0,
                        clientY: 0
                    });
                    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch] }));
                    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
                }
            } catch (e) { }

            try {
                // Pointer events (React UIs)
                if (typeof PointerEvent !== 'undefined') {
                    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
                    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
                }
            } catch (e) { }
        }

        // Final fallback: MouseEvent dispatch
        try {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
            return true;
        } catch (e) {
            return false;
        }
    }

    // Close any existing drawer before opening a new one
    async function closeExistingDrawer() {
        const closeBtn = document.querySelector('button[aria-label="Close"]');
        if (closeBtn && closeBtn.offsetParent !== null) {
            log(' closeExistingDrawer: Found existing drawer, closing it...');
            closeBtn.click();
            await waitForElementToDisappear('button[aria-label="Close"]', 3000);
            await new Promise(r => setTimeout(r, 50));
            return true;
        }
        return false;
    }

    // *** URL CORRUPTION DETECTION AND RECOVERY ***
    // The Uber Eats site pushes order UUIDs to the URL when clicking rows.
    // If we click too fast or retry clicks, UUIDs accumulate and corrupt the URL.

    function getCleanBaseUrl() {
        const url = new URL(window.location.href);
        // Only reset the pathname to prevent UUID stacking, but preserve all query parameters
        // to prevent breaking Uber Eats pagination or API requests.
        return `${url.origin}/manager/orders${url.search}`;
    }

    function isUrlCorrupted() {
        const path = window.location.pathname;

        // Check 1: Path is too long (indicates UUID stacking)
        if (path.length > 200) {
            console.warn(`[UberEats Script] URL corruption detected: path length ${path.length} > 200`);
            return true;
        }

        // Check 2: Double slashes in path
        if (path.includes('//')) {
            console.warn('[UberEats Script] URL corruption detected: double slashes in path');
            return true;
        }

        // Check 3: Count UUIDs in path - if more than 2, it's corrupted
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
        const matches = path.match(uuidPattern);
        if (matches && matches.length > 2) {
            console.warn(`[UberEats Script] URL corruption detected: ${matches.length} UUIDs in path`);
            return true;
        }

        return false;
    }

    async function resetCorruptedUrl() {
        if (!isUrlCorrupted()) {
            return false;
        }

        log(' Resetting corrupted URL...');
        const cleanUrl = getCleanBaseUrl();
        log(` Navigating to clean URL: ${cleanUrl}`);

        try {
            window.history.replaceState({}, '', cleanUrl);
            log(' URL reset via replaceState');
            await new Promise(r => setTimeout(r, 50));
            await closeExistingDrawer();
            return true;
        } catch (e) {
            console.error('[UberEats Script] Failed to reset URL via replaceState, trying reload...', e);
            window.location.href = cleanUrl;
            return true;
        }
    }

    async function cleanupAfterOrder() {
        // Always reset URL to clean list view to prevent UUID accumulation
        const path = window.location.pathname;

        // If we're on an order detail URL (has UUID in path), reset to clean list
        if (path.includes('/orders/') && path !== '/manager/orders') {
            const cleanUrl = getCleanBaseUrl();
            log(` cleanupAfterOrder: Resetting URL to: ${cleanUrl}`);
            try {
                window.history.replaceState({}, '', cleanUrl);
                await new Promise(r => setTimeout(r, 50));
            } catch (e) {
                console.warn('[UberEats Script] cleanupAfterOrder: replaceState failed', e);
            }
        }

        // Also check for corruption as a safety net
        if (isUrlCorrupted()) {
            console.warn('[UberEats Script] cleanupAfterOrder: URL still corrupted, forcing reset...');
            await resetCorruptedUrl();
            await new Promise(r => setTimeout(r, 50));
        }
    }

    async function openDrawerForRow(row, attempts = 5) {
        if (!row) return null;

        // *** PRE-CLICK PREPARATION ***
        // 1. Close any existing drawer first
        await closeExistingDrawer();

        // 2. Get clean URL that we'll reset to after each failed attempt
        const cleanUrl = getCleanBaseUrl();

        // 3. Ensure the row is visible
        row.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise(r => setTimeout(r, 50));

        // Identify click targets with priority order
        const orderIdBtn = row.querySelector('div[role="button"]');
        const firstCell = row.querySelector('td:first-child');
        const firstCellDiv = firstCell ? firstCell.querySelector('div') : null;
        const targets = [orderIdBtn, firstCellDiv, firstCell, row].filter(Boolean);

        let consecutiveEmptyDrawerCount = 0;
        const MAX_EMPTY_BEFORE_RELOAD = 3;

        for (let i = 0; i < attempts; i++) {
            // *** ALWAYS reset URL to clean state before EVERY click ***
            if (i > 0) {
                try {
                    window.history.replaceState({}, '', cleanUrl);
                    log(` openDrawerForRow: Reset URL before attempt ${i + 1}`);
                    await new Promise(r => setTimeout(r, 50));
                } catch (e) { }
            }

            // *** DEAD STATE DETECTION ***
            // If we've had multiple attempts with no drawer at all, React is broken
            if (consecutiveEmptyDrawerCount >= MAX_EMPTY_BEFORE_RELOAD) {
                console.warn(`[UberEats Script] openDrawerForRow: ${MAX_EMPTY_BEFORE_RELOAD} consecutive empty drawers - React Router is broken. Forcing page reload...`);

                // Save current state before reload so we can resume
                await saveStateToIndexedDB();
                localStorage.setItem('ubereats_reload_recovery', 'true');

                // Force full page reload to reset React state
                log(` Reloading to URL: ${cleanUrl}`);
                window.location.href = cleanUrl;

                // Wait for reload (this won't execute after reload)
                await new Promise(r => setTimeout(r, 10000));
                return null;
            }

            const target = targets[i % targets.length];
            log(` openDrawerForRow attempt ${i + 1}/${attempts}: clicking <${target.tagName}>`);

            simulateClick(target, isMobileDevice);

            // Wait for drawer to appear
            const drawer = await waitForDrawerOpen(4000);

            if (drawer) {
                log(` openDrawerForRow attempt ${i + 1}/${attempts}: drawer opened!`);
                consecutiveEmptyDrawerCount = 0; // Reset counter on success
                return drawer;
            }

            // Check if we got ANY close buttons (drawer attempted to open but failed)
            const closeButtons = document.querySelectorAll('button[aria-label="Close"]');
            if (closeButtons.length === 0) {
                consecutiveEmptyDrawerCount++;
                log(` openDrawerForRow: Empty drawer count: ${consecutiveEmptyDrawerCount}/${MAX_EMPTY_BEFORE_RELOAD}`);
            } else {
                consecutiveEmptyDrawerCount = 0; // Reset if drawer attempted to show
            }

            log(` openDrawerForRow attempt ${i + 1}/${attempts}: no drawer`);

            // After a failed click, IMMEDIATELY reset URL
            try {
                window.history.replaceState({}, '', cleanUrl);
            } catch (e) { }

            await new Promise(r => setTimeout(r, 50));
        }

        console.error(`[UberEats Script] openDrawerForRow: Failed after ${attempts} attempts`);
        // Final cleanup - ensure URL is clean
        try {
            window.history.replaceState({}, '', cleanUrl);
        } catch (e) { }
        return null;
    }

    function sanitizeOfferValue(text) {
        if (!text) {
            return { text: "—", value: 0 };
        }
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        const numeric = parseFloat(cleanedText.replace(/[^\d.\-]/g, ''));
        return {
            text: cleanedText || "—",
            value: isNaN(numeric) ? 0 : Math.abs(numeric)
        };
    }

    function extractOfferDataFromDrawer(drawer) {
        if (!drawer) {
            log(` extractOfferDataFromDrawer: No drawer provided`);
            return { text: "—", value: 0 };
        }

        // Method 1: Look for the div structure with "Offers on items" text
        const allParagraphs = drawer.querySelectorAll('p');
        log(` extractOfferDataFromDrawer: Found ${allParagraphs.length} paragraphs in drawer`);

        // Log first 10 paragraph texts for debugging
        const paragraphTexts = Array.from(allParagraphs).slice(0, 15).map(p => p.textContent.trim());
        log(` extractOfferDataFromDrawer: First 15 paragraph texts:`, paragraphTexts);

        for (const paragraph of allParagraphs) {
            const label = paragraph.textContent ? paragraph.textContent.trim() : "";
            if (!label) continue;

            // Look for "Offers on items" (with or without VAT text), Promotion, or Discount
            if (/Offers on items|Promotion|Discount/i.test(label)) {
                log(` extractOfferDataFromDrawer: Found offer label in paragraph: "${label}"`);

                // The value is in a sibling element. Walk up to find the parent container
                const parentBlock = paragraph.closest('div[data-baseweb="block"]');
                if (parentBlock) {
                    log(` extractOfferDataFromDrawer: Found parent block`);
                    // Look for the sibling block that contains the value
                    const valueBlock = parentBlock.nextElementSibling;
                    if (valueBlock) {
                        const valueText = valueBlock.textContent;
                        log(` extractOfferDataFromDrawer: Found value in next sibling: "${valueText}"`);
                        return sanitizeOfferValue(valueText);
                    }
                }

                // Fallback: look for any paragraph or monoparagraph near this one
                const nearbyMonoParagraphs = paragraph.parentElement.parentElement.querySelectorAll('p[data-baseweb="typo-monoparagraphmedium"]');
                for (const monoPara of nearbyMonoParagraphs) {
                    const text = monoPara.textContent.trim();
                    if (text.includes('-') || text.includes('£')) {
                        log(` extractOfferDataFromDrawer: Found value in nearby monoparagraph: "${text}"`);
                        return sanitizeOfferValue(text);
                    }
                }
            }
        }

        log(` extractOfferDataFromDrawer: No "Offers on items" found, returning default`);
        return { text: "—", value: 0 };
    }

    function extractSubtotalFromDrawer(drawer) {
        if (!drawer) return { text: "—", value: 0 };

        // Look for "Sales (incl. VAT)" or "Subtotal"
        const allParagraphs = drawer.querySelectorAll('p');
        for (const paragraph of allParagraphs) {
            const label = paragraph.textContent ? paragraph.textContent.trim() : "";
            if (!label) continue;

            if (/Sales \(incl\. VAT\)|Subtotal/i.test(label)) {
                // The value is in a sibling element. Walk up to find the parent container
                const parentBlock = paragraph.closest('div[data-baseweb="block"]');
                if (parentBlock) {
                    // Look for the sibling block that contains the value
                    const valueBlock = parentBlock.nextElementSibling;
                    if (valueBlock) {
                        const valueText = valueBlock.textContent;
                        return sanitizeOfferValue(valueText);
                    }
                }
            }
        }
        return { text: "—", value: 0 };
    }

    function extractIssueDataFromDrawer(drawer) {
        if (!drawer) return "—";

        const highPriority = drawer.querySelector('[role="alert"] span, div[style*="253,242,220"] span');
        if (highPriority && highPriority.textContent) {
            return highPriority.textContent.trim();
        }

        const candidate = Array.from(drawer.querySelectorAll('span, p'))
            .map(el => el.textContent ? el.textContent.trim() : "")
            .filter(text => text.length > 0)
            .find(text => /(issue|missing|damaged|incorrect|charged|refunded)/i.test(text));

        return candidate || "—";
    }

    function extractDynamicMetadataFromDrawer(drawer) {
        if (!drawer) return {};

        let metadata = {};
        
        // Find all labels that might match
        const labels = drawer.querySelectorAll('p, div[data-baseweb="typo-labellarge"], div[data-baseweb="typo-labelsmall"]');
        for (const labelEl of labels) {
            const label = labelEl.textContent ? labelEl.textContent.trim() : "";
            // Skip empty labels, extremely long labels, and prices disguised as labels
            if (!label || label.length > 40 || label.includes('£')) continue;
            
            const parentBlock = labelEl.closest('div[data-baseweb="block"]');
            if (parentBlock) {
                const valueBlock = parentBlock.nextElementSibling;
                if (valueBlock && valueBlock.textContent) {
                    const valStr = valueBlock.textContent.trim();
                    if (valStr.length > 0 && valStr.length < 50) {
                        // STRICT FILTERING: Prevent item modifiers (e.g. "Choice of Noodles") from being mistakenly extracted as metadata
                        const isFinancialLabel = /Sales|Marketplace|Payout|Tax|Fee|Promotion|Refund|Subtotal|Offer|Tip|Total|Adjustment|Delivery|Service|VAT|Paid|Gross|Amount/i.test(label);
                        
                        if (!isFinancialLabel) continue;

                        // If it contains a negative sign and digits, parse as float
                        let num = parseFloat(valStr.replace(/[^\d.-]/g, ''));
                        if (!isNaN(num) && valStr.match(/\d/)) {
                            metadata[label] = num;
                        } else {
                            metadata[label] = valStr;
                        }
                        log(`  extractDynamicMetadata: Found financial "${label}" = ${metadata[label]}`);
                    }
                }
            }
        }
        return metadata;
    }

    // Detect if an order was cancelled (should be excluded from counting)
    function isCancelledOrder(drawer) {
        if (!drawer) return false;

        // Look for cancellation indicators in the drawer
        const drawerText = drawer.textContent || '';

        // Check for common cancellation patterns
        const cancellationPatterns = [
            /customer\s+cancelled/i,
            /order\s+(was\s+)?cancelled/i,
            /cancelled\s+by\s+(the\s+)?customer/i,
            /you\s+won't\s+be\s+paid/i  // This appears on cancelled orders
        ];

        for (const pattern of cancellationPatterns) {
            if (pattern.test(drawerText)) {
                return true;
            }
        }

        return false;
    }

    function extractItemsFromDrawer(drawer) {
        if (!drawer) return [];

        const items = [];
        let itemsContainer = null;
        
        // Strategy 1: Use progress-steps
        const progressSteps = drawer.querySelector('ol[data-baseweb="progress-steps"]');
        if (progressSteps && progressSteps.nextElementSibling && progressSteps.nextElementSibling.classList.contains('fs-mask')) {
            itemsContainer = progressSteps.nextElementSibling;
            logDebug(`[Items] Found itemsContainer via progressSteps. Element tagName: ${itemsContainer.tagName}`);
        } else {
            // Strategy 2: Find first price and trace up to fs-mask
            const firstPrice = drawer.querySelector('p[data-baseweb="typo-monoparagraphmedium"]');
            if (firstPrice) {
                let parent = firstPrice.parentElement;
                while (parent && parent !== drawer) {
                    if (parent.classList.contains('fs-mask')) {
                        itemsContainer = parent;
                        logDebug(`[Items] Found itemsContainer via firstPrice fallback. Element tagName: ${itemsContainer.tagName}`);
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
        }

        if (!itemsContainer) {
            log('Could not find items container');
            return [];
        }

        logDebug(`[Items] itemsContainer has ${itemsContainer.children.length} children`);
        logDebug(`[Items] Children tags: ${Array.from(itemsContainer.children).map(c => c.tagName).join(', ')}`);

        const itemElements = [];
        for (const child of itemsContainer.children) {
            if (child.tagName === 'UL') {
                logDebug(`[Items] Processing UL with ${child.children.length} children`);
                for (const li of child.children) {
                    if (li.tagName === 'LI') {
                        // Search the entire LI for the item data, not just a narrow header
                        itemElements.push({ container: li });
                    }
                }
            } else if (child.tagName === 'DIV') {
                itemElements.push({ container: child });
            } else {
                logDebug(`[Items] Skipping child due to unknown tagName: ${child.tagName}`);
            }
        }

        logDebug(`[Items] Found ${itemElements.length} potential items to extract`);

        for (let idx = 0; idx < itemElements.length; idx++) {
            const container = itemElements[idx].container;

            if (!container) continue;

            // Search the ENTIRE container for quantity, name, price - not just a narrow header
            // For items with accordions, the button contains the summary. For items without, the data is directly in the LI/DIV.
            const searchRoot = container;

            // Strategy 1: Find quantity via data-baseweb="typo-labelsmall"
            let quantityLabel = null;
            const allLabelSmalls = searchRoot.querySelectorAll('div[data-baseweb="typo-labelsmall"], span[data-baseweb="typo-labelsmall"]');
            for (const el of allLabelSmalls) {
                const txt = el.textContent.trim();
                // The quantity label should be a pure number, not a modifier quantity inside a nested category
                // Check that this element is NOT inside a modifier section (which has typo-paragraphsmall category headers)
                const isInsideModifierSection = el.closest('div._qw') || false;
                if (/^\d+$/.test(txt) && !isInsideModifierSection) {
                    quantityLabel = el;
                    break;
                }
            }

            if (!quantityLabel) {
                logDebug(`[Items][${idx}] Skipping: no quantityLabel found. LabelSmall candidates: ${allLabelSmalls.length}`);
                if (allLabelSmalls.length > 0) {
                    logDebug(`[Items][${idx}]   Candidate texts: ${Array.from(allLabelSmalls).map(e => `"${e.textContent.trim()}"`).join(', ')}`);
                }
                continue;
            }

            const quantity = parseInt(quantityLabel.textContent.trim());
            if (isNaN(quantity)) {
                logDebug(`[Items][${idx}] Skipping: quantity is NaN from "${quantityLabel.textContent.trim()}"`);
                continue;
            }

            // Strategy 2: Find item name via data-baseweb="typo-labelmedium"
            // The item name is at the TOP level of the item, not inside modifier sections
            let itemNameEl = null;
            const allLabelMediums = searchRoot.querySelectorAll('div[data-baseweb="typo-labelmedium"], span[data-baseweb="typo-labelmedium"]');
            for (const el of allLabelMediums) {
                // Skip elements that are inside modifier option sections
                const isInsideModifierSection = el.closest('div._qw') || false;
                if (!isInsideModifierSection) {
                    itemNameEl = el;
                    break;
                }
            }

            if (!itemNameEl) {
                logDebug(`[Items][${idx}] Skipping: no itemNameEl found. LabelMedium candidates: ${allLabelMediums.length}`);
                if (allLabelMediums.length > 0) {
                    logDebug(`[Items][${idx}]   Candidate texts: ${Array.from(allLabelMediums).map(e => `"${e.textContent.trim()}"`).join(', ')}`);
                }
                continue;
            }

            const itemName = itemNameEl.textContent.trim();

            // Strategy 3: Find price - look near the quantity/name, not deep in modifier sections
            // The item-level price element should be a sibling/ancestor of the name, not inside a modifier block
            let priceEl = null;
            const allPrices = searchRoot.querySelectorAll('[data-baseweb="typo-monoparagraphmedium"]');
            for (const el of allPrices) {
                const isInsideModifierSection = el.closest('div._qw') || false;
                if (!isInsideModifierSection) {
                    priceEl = el;
                    break;
                }
            }
            
            const priceText = priceEl ? priceEl.textContent.trim() : "";
            const priceValue = parseFloat(priceText.replace(/[^\d.-]/g, ''));

            logDebug(`[Items][${idx}] Successfully parsed item: Qty=${quantity}, Name="${itemName}", Price=${priceValue}`);

            if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(itemName)) {
                logDebug(`[Items][${idx}] Skipping: itemName matched timestamp pattern`);
                continue;
            }

            const modifiers = [];
            // Look for modifier sections within this container
            const categoryTitles = container.querySelectorAll('p[data-baseweb="typo-paragraphsmall"]');
            categoryTitles.forEach(catTitleEl => {
                const categoryName = catTitleEl.textContent.trim();
                const categoryBlock = catTitleEl.closest('div._qw') || catTitleEl.parentElement.parentElement;
                if (!categoryBlock) return;
                
                const optionNameEls = categoryBlock.querySelectorAll('div[data-baseweb="typo-labelmedium"]');
                optionNameEls.forEach(optNameEl => {
                    const optName = optNameEl.textContent.trim();
                    const optContainer = optNameEl.closest('div._af') || optNameEl.parentElement;
                    
                    const optQtyEl = optContainer.querySelector('div[data-baseweb="typo-labelsmall"]');
                    const optQty = optQtyEl ? parseInt(optQtyEl.textContent.trim()) || 1 : 1;
                    
                    const optRow = optContainer.parentElement;
                    const optPriceEl = optRow.querySelector('[data-baseweb="typo-monoparagraphmedium"]');
                    const optPrice = optPriceEl ? parseFloat(optPriceEl.textContent.replace(/[^\d.-]/g, '')) : 0;
                    
                    modifiers.push({
                        category: categoryName,
                        name: optName,
                        quantity: optQty,
                        priceValue: isNaN(optPrice) ? 0 : optPrice
                    });
                });
            });

            items.push({
                name: itemName,
                quantity: quantity,
                price: priceText,
                priceValue: isNaN(priceValue) ? 0 : priceValue,
                modifiers: modifiers
            });
        }

        return items;
    }

    function extractSubtotalFromDrawer(drawer) {
        if (!drawer) return { text: "—", value: 0 };

        // DEBUG: Log all text content in the drawer to see what we are working with
        const allElements = drawer.querySelectorAll('*');
        let foundSubtotalLabel = false;

        // 1. Try finding by specific text content in any element
        // We look for elements that *only* contain the label or start with it
        for (const el of allElements) {
            // Skip script/style tags
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

            // Get direct text content (ignoring children) if possible, or just textContent
            const text = el.textContent ? el.textContent.trim() : "";

            if (!text) continue;

            if (/^(Subtotal|Item total)/i.test(text)) {
                log(` extractSubtotalFromDrawer: Found potential label: "${text}" in <${el.tagName}>`);
                foundSubtotalLabel = true;

                // Strategy A: Look for the value in the next sibling element
                let sibling = el.nextElementSibling;
                if (sibling) {
                    const val = sibling.textContent.trim();
                    if (/£|[\d.]+/.test(val)) {
                        log(` extractSubtotalFromDrawer: Found value in next sibling: "${val}"`);
                        return { text: val, value: parseFloat(val.replace(/[^\d.-]/g, '')) };
                    }
                }

                // Strategy B: Look for value in the parent's next sibling (common in flex/grid layouts)
                const parent = el.parentElement;
                if (parent) {
                    const parentSibling = parent.nextElementSibling;
                    if (parentSibling) {
                        const val = parentSibling.textContent.trim();
                        if (/£|[\d.]+/.test(val)) {
                            log(` extractSubtotalFromDrawer: Found value in parent's sibling: "${val}"`);
                            return { text: val, value: parseFloat(val.replace(/[^\d.-]/g, '')) };
                        }
                    }
                    // Strategy C: Look for value in the parent's children (if label and value are in same container)
                    const children = parent.children;
                    for (const child of children) {
                        if (child === el) continue;
                        const val = child.textContent.trim();
                        if (/£|[\d.]+/.test(val) && val.length < 20) { // Value shouldn't be too long
                            log(` extractSubtotalFromDrawer: Found value in parent's other child: "${val}"`);
                            return { text: val, value: parseFloat(val.replace(/[^\d.-]/g, '')) };
                        }
                    }
                }
            }
        }

        if (!foundSubtotalLabel) {
            // Log the first 50 text nodes to help debug
            const debugTexts = [];
            drawer.querySelectorAll('div, p, span').forEach(el => {
                if (el.children.length === 0 && el.textContent.trim()) {
                    debugTexts.push(el.textContent.trim());
                }
            });
            log(` extractSubtotalFromDrawer: Subtotal label NOT found. Content dump (first 50 leaf nodes):`, debugTexts.slice(0, 50));
        }

        return { text: "—", value: 0 };
    }

    function extractDateFromDrawer(drawer, orderId = null) {
        if (!drawer) {
            console.warn(`[UberEats Script] extractDateFromDrawer: No drawer provided`);
            return getDateFromURLFallback();
        }

        // Date patterns to match
        const datePatterns = [
            /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i, // "Nov 13, 2025"
            /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i,   // "13 Nov 2025"
            /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,  // "13/11/2025"
            /\b\d{4}-\d{2}-\d{2}\b/         // "2025-11-13"
        ];

        // Strategy 1: Look for date near the Order ID element in the drawer
        const orderIdElement = drawer.querySelector('[class*="_fk"][class*="_nu"]');
        if (orderIdElement) {
            const parent = orderIdElement.closest('[data-baseweb="block"]');
            if (parent) {
                const siblingDivs = parent.querySelectorAll('[data-baseweb="block"] [class*="_c1"]');
                for (const el of siblingDivs) {
                    const text = el.textContent.trim();
                    for (const pattern of datePatterns) {
                        const match = text.match(pattern);
                        if (match) {
                            logDebug(` Date found via Strategy 1 (near Order ID): "${match[0]}"`);
                            return match[0];
                        }
                    }
                }
            }
        }

        // Strategy 2: Broad search in all block elements
        const allBlocks = drawer.querySelectorAll('div[data-baseweb="block"] p, div[data-baseweb="block"] div[class*="_c1"], div[data-baseweb="block"] span');
        for (const el of allBlocks) {
            const text = el.textContent.trim();
            for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                    logDebug(` Date found via Strategy 2 (broad search): "${match[0]}"`);
                    return match[0];
                }
            }
        }

        // Strategy 3: Search entire drawer innerHTML for date pattern
        const drawerText = drawer.innerText || drawer.textContent || "";
        for (const pattern of datePatterns) {
            const match = drawerText.match(pattern);
            if (match) {
                logDebug(` Date found via Strategy 3 (full text scan): "${match[0]}"`);
                return match[0];
            }
        }

        // Strategy 4: Fallback to URL date range
        console.warn(`[UberEats Script] extractDateFromDrawer: Could not find date in drawer for order ${orderId || 'unknown'}, using URL fallback`);
        return getDateFromURLFallback();
    }

    // Helper function to get a date from URL parameters as last resort fallback
    function getDateFromURLFallback() {
        try {
            const url = new URL(window.location.href);
            const startParam = url.searchParams.get('start');
            const endParam = url.searchParams.get('end');

            if (startParam) {
                // startParam is usually a timestamp in milliseconds
                const startDate = new Date(parseInt(startParam));
                if (!isNaN(startDate.getTime())) {
                    const formattedDate = startDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    logDebug(` Using URL start date as fallback: "${formattedDate}"`);
                    return formattedDate;
                }
            }

            // If no valid start date, return current date with a warning marker
            console.warn('[UberEats Script] getDateFromURLFallback: No valid date in URL params');
            return `Extracted: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        } catch (e) {
            console.error('[UberEats Script] getDateFromURLFallback error:', e);
            return "";
        }
    }

    // Adds the "Offer" and "Issue" columns if they don't exist
    function setupTableColumns() {
        const headerRow = document.querySelector('table > tbody > tr:has(th)');
        if (!headerRow) return false; // Table not ready

        const subtotalHeader = headerRow.lastElementChild;
        if (!subtotalHeader) return false; // Table row is empty

        // DEBUG COLUMNS - Only added if SHOW_DEBUG_COLUMNS is true
        if (SHOW_DEBUG_COLUMNS) {
            // Add "Offer" Header
            if (!headerRow.querySelector('.th-offer')) {
                const newHeader = document.createElement('th');
                newHeader.className = "_c1 _ez _c2 _f0 _nf _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _jz _ng _kc _nh th-offer";
                newHeader.innerHTML = `<div class="_af _ag _h4"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm">Offer</div></div>`;
                headerRow.insertBefore(newHeader, subtotalHeader);
            }

            // Add "Issue (Scraped)" Header
            if (!headerRow.querySelector('.th-issue')) {
                const newIssueHeader = document.createElement('th');
                newIssueHeader.className = "_c1 _ez _c2 _f0 _nf _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _jz _ng _kc _nh th-issue";
                newIssueHeader.innerHTML = `<div class="_af _ag _h4"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm">Issue (Scraped)</div></div>`;
                headerRow.insertBefore(newIssueHeader, subtotalHeader);
            }

            // Add "Items Detected" Header
            if (!headerRow.querySelector('.th-items-detected')) {
                const itemsDetectedHeader = document.createElement('th');
                itemsDetectedHeader.className = "_c1 _ez _c2 _f0 _nf _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _jz _ng _kc _nh th-items-detected";
                itemsDetectedHeader.innerHTML = `<div class="_af _ag _h4"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm">Items Detected</div></div>`;
                headerRow.insertBefore(itemsDetectedHeader, subtotalHeader);
            }


            // Add "Tofu #" Header
            if (!headerRow.querySelector('.th-tofu-count')) {
                const tofuCountHeader = document.createElement('th');
                tofuCountHeader.className = "_c1 _ez _c2 _f0 _nf _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _jz _ng _kc _nh th-tofu-count";
                tofuCountHeader.innerHTML = `<div class="_af _ag _h4"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm" style="color: #2E7D32;">Tofu #</div></div>`;
                headerRow.insertBefore(tofuCountHeader, subtotalHeader);
            }

            // Add "Pork #" Header
            if (!headerRow.querySelector('.th-pork-count')) {
                const porkCountHeader = document.createElement('th');
                porkCountHeader.className = "_c1 _ez _c2 _f0 _nf _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _jz _ng _kc _nh th-pork-count";
                porkCountHeader.innerHTML = `<div class="_af _ag _h4"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm" style="color: #E65100;">Pork #</div></div>`;
                headerRow.insertBefore(porkCountHeader, subtotalHeader);
            }

            // Add "Beef #" Header
            if (!headerRow.querySelector('.th-beef-count')) {
                const beefCountHeader = document.createElement('th');
                beefCountHeader.className = "_c1 _ez _c2 _f0 _nf _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _jz _ng _kc _nh th-beef-count";
                beefCountHeader.innerHTML = `<div class="_af _ag _h4"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm" style="color: #B71C1C;">Beef #</div></div>`;
                headerRow.insertBefore(beefCountHeader, subtotalHeader);
            }
        }
        return true; // Columns are set up
    }

    // Helper to get total expected orders from "Showing X results"
    function getTotalOrderCount() {
        const totalCountEl = findElementByText('div', 'Showing', 'results');
        if (!totalCountEl) return null;
        try {
            // Handle formats like "Showing 1,234 results" or "Showing 1,234,567 results"
            const match = totalCountEl.textContent.match(/Showing ([\d,]+) results/);
            if (!match) return null;
            const count = parseInt(match[1].replace(/,/g, ''), 10);
            return isNaN(count) ? null : count;
        } catch (e) {
            return null;
        }
    }

    // Helper to add placeholder cells to newly loaded rows
    function updateNewRows() {
        // Only add cells if debug columns are enabled and headers exist
        if (!SHOW_DEBUG_COLUMNS) return;
        if (!document.querySelector('.th-offer')) return;

        const orderRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');
        orderRows.forEach(row => {
            const subtotalCell = row.lastElementChild;
            if (!subtotalCell) return;

            if (!row.querySelector('.td-offer')) {
                const offerCell = document.createElement('td');
                offerCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-no-offer td-offer';
                row.insertBefore(offerCell, subtotalCell);
            }
            if (!row.querySelector('.td-issue')) {
                const issueCell = document.createElement('td');
                issueCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-no-offer td-issue';
                row.insertBefore(issueCell, subtotalCell);
            }
            if (!row.querySelector('.td-items-detected')) {
                const itemsDetectedCell = document.createElement('td');
                itemsDetectedCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-no-offer td-items-detected';
                row.insertBefore(itemsDetectedCell, subtotalCell);
            }
            if (!row.querySelector('.td-tofu-count')) {
                const tofuCell = document.createElement('td');
                tofuCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-tofu-count';
                tofuCell.style.color = '#2E7D32';
                tofuCell.style.fontWeight = '500';
                row.insertBefore(tofuCell, subtotalCell);
            }
            if (!row.querySelector('.td-pork-count')) {
                const porkCell = document.createElement('td');
                porkCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-pork-count';
                porkCell.style.color = '#E65100';
                porkCell.style.fontWeight = '500';
                row.insertBefore(porkCell, subtotalCell);
            }
            if (!row.querySelector('.td-beef-count')) {
                const beefCell = document.createElement('td');
                beefCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-beef-count';
                beefCell.style.color = '#B71C1C';
                beefCell.style.fontWeight = '500';
                row.insertBefore(beefCell, subtotalCell);
            }
        });
    }

    async function waitForOrderToLoadInDrawer(drawer, expectedOrderId, timeout = 6000) {
        const start = Date.now();
        log(` Validating drawer content for Order ID: "${expectedOrderId}"...`);
        while (Date.now() - start < timeout) {
            const text = drawer.textContent || '';
            // Case-insensitive check for safety
            if (text.toLowerCase().includes(expectedOrderId.toLowerCase())) {
                log(` Drawer validation successful: Found "${expectedOrderId}"`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const snippet = (drawer.textContent || '').substring(0, 100).replace(/\s+/g, ' ');
        console.warn(`[UberEats Script] Drawer validation FAILED: Did not find "${expectedOrderId}" after ${timeout}ms. Content dump: "${snippet}..."`);
        return false;
    }

    // --- 4. Main function to process the orders ---
    async function processOrders() {
        const button = document.getElementById('fetch-offer-data-btn');
        if (button.classList.contains('loading')) return;
        button.classList.add('loading');

        // Show processing overlay with green glow
        showProcessingOverlay('Initializing...');

        // Request Wake Lock to prevent screen from sleeping during scraping
        let wakeLock = null;
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('[UberEats Script] Wake Lock activated - screen will stay on');
                wakeLock.addEventListener('release', () => {
                    console.log('[UberEats Script] Wake Lock released');
                });
            }
        } catch (err) {
            console.warn('[UberEats Script] Wake Lock not supported or failed:', err);
        }

        // Always reset all state at the start of a new run.
        // Crash/page-reload recovery is handled separately above via isRecoveryMode() + sessionStorage.
        // The previous check (window.processedOrderIds.size > 0) was a bug: it would treat
        // leftover state from the last run as a "resume" signal, causing stale results when
        // the user changes the date range and clicks Fetch again in the same session.
        window.orderOfferData = {};
        window.orderIssueData = {};
        window.orderItemsData = {};
        window.orderDateData = {};
        window.orderShopData = {};
        window.orderTimeData = {};
        window.orderCustomerData = {};
        window.orderFulfilmentData = {};
        window.orderCourierData = {};
        window.orderSubtotalData = {};
        window.orderFinancialsData = {};
        window.orderCancelledData = {};
        window.orderItemsDetected = {};
        window.processedOrderIds = new Set();
        log(' State reset — starting fresh run.');
        let totalOfferSum = 0;
        let totalSubtotalSum = 0;
        let ordersWithOffers = 0;

        // Running counts for debugging item tracking
        let runningTofuCount = 0;
        let runningPorkCount = 0;
        let runningBeefCount = 0;

        // 1. Get total count
        const totalOrderCount = getTotalOrderCount();
        if (totalOrderCount === null) {
            await loadSweetAlert();
            Swal.fire('Error', 'Could not find total order count (e.g., "Showing 76 results"). Make sure it is visible on the page.', 'error');
            button.classList.remove('loading');
            hideProcessingOverlay();
            if (wakeLock) await wakeLock.release();
            return;
        }

        // 2. Setup columns
        if (!setupTableColumns()) {
            await loadSweetAlert();
            Swal.fire('Error', 'Could not find the orders table.', 'error');
            button.classList.remove('loading');
            hideProcessingOverlay();
            if (wakeLock) await wakeLock.release();
            return;
        }

        // 3. Scroll to load all rows
        const scrollableElement = document.querySelector('.infinite-scroll-component');
        if (!scrollableElement) {
            await loadSweetAlert();
            Swal.fire('Error', 'Could not find the scrollable order list.', 'error');
            button.classList.remove('loading');
            hideProcessingOverlay();
            if (wakeLock) await wakeLock.release();
            return;
        }

        log(` Starting streaming processing for ${totalOrderCount} orders...`);
        log(` Scrollable element:`, scrollableElement);

        // --- STREAMING APPROACH: Process visible rows, then scroll for more ---
        let stuckCount = 0;
        const maxStuckAttempts = 10;
        let lastProcessedCount = 0;
        let lastActiveRow = null;

        while (window.processedOrderIds.size < totalOrderCount && stuckCount < maxStuckAttempts) {
            // 1. Get currently visible rows
            updateNewRows(); // Ensure new rows have proper cells
            const visibleRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');

            let processedThisRound = 0;

            // 2. Process any unprocessed rows
            for (const row of visibleRows) {
                const orderIdEl = row.querySelector('td:first-child div[role="button"]');
                if (!orderIdEl) continue;

                const orderId = (orderIdEl.textContent || '').trim();
                if (!orderId || window.processedOrderIds.has(orderId)) continue;

                // Check for crash loop BEFORE processing
                const cachedCrashOrderId = localStorage.getItem('ubereats_active_processing_order');
                if (cachedCrashOrderId === orderId) {
                    console.error(`[UberEats Script] CRASH LOOP DETECTED: Script crashed previously on order ${orderId}. Marking as permanent failure to prevent loop.`);
                    window.processedOrderIds.add(orderId);
                    window.orderIssueData[orderId] = "Permanent Crash Failure";
                    localStorage.removeItem('ubereats_active_processing_order');
                    continue;
                }

                // Update progress display based on mode
                const currentCount = window.processedOrderIds.size;
                const statusText = `Processing order ${currentCount + 1} of ${totalOrderCount}`;

                if (SHOW_PROCESSING_OVERLAY) {
                    // Overlay mode: update overlay status
                    updateProcessingStatus(statusText, currentCount + 1, totalOrderCount);
                } else {
                    // Button mode: update button with water-fill progress
                    updateButtonProgress(currentCount + 1, totalOrderCount, statusText);
                }

                // --- ROW HIGHLIGHT LOGIC ---
                // Remove highlight from previous row (using variable is faster than DOM query)
                if (lastActiveRow && lastActiveRow !== row) {
                    lastActiveRow.classList.remove('processing-active-row');
                }

                // Add highlight to current row
                row.classList.add('processing-active-row');
                lastActiveRow = row; // Track for next iteration

                // Scroll into view comfortably if needed (center align)
                // ONE scroll is enough - removed redundant scroll below
                row.scrollIntoView({ block: 'center', behavior: 'smooth' });

                log(` Order ${orderId}: Starting processing (${currentCount + 1}/${totalOrderCount})`);

                // Mark order as active to prevent crash loops
                localStorage.setItem('ubereats_active_processing_order', orderId);

                // Extract metadata from the TABLE ROW BEFORE opening drawer
                const shopCell = row.querySelector('td:nth-child(2)');
                const dateCell = row.querySelector('td:nth-child(3)');
                const timeCell = row.querySelector('td:nth-child(4)');
                const customerCell = row.querySelector('td:nth-child(5)');
                const fulfilmentCell = row.querySelector('td:nth-child(6)');
                const courierCell = row.querySelector('td:nth-child(7)');

                if (shopCell) window.orderShopData[orderId] = shopCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');
                if (dateCell) window.orderDateData[orderId] = dateCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');
                if (timeCell) window.orderTimeData[orderId] = timeCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');
                if (customerCell) window.orderCustomerData[orderId] = customerCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');
                if (fulfilmentCell) window.orderFulfilmentData[orderId] = fulfilmentCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');
                if (courierCell) window.orderCourierData[orderId] = courierCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');

                // Extract Issue from row (8th column)
                const issueCell = row.querySelector('td:nth-child(8)');
                let rowIssue = "—";
                if (issueCell) {
                    rowIssue = issueCell.innerText.trim().replace(/[\u00A0\n]/g, ' ');
                    if (!rowIssue) rowIssue = "—";
                }
                window.orderIssueData[orderId] = rowIssue;

                // Extract subtotal from the TABLE ROW (last cell) BEFORE opening drawer
                const rowSubtotalCell = row.lastElementChild;
                let subtotal = { text: "—", value: 0 };
                if (rowSubtotalCell) {
                    const rawText = rowSubtotalCell.innerText.trim();
                    const numericValue = parseFloat(rawText.replace(/[^0-9.]/g, '')) || 0;
                    if (numericValue > 0) {
                        subtotal = { text: rawText, value: numericValue };
                        log(` Order ${orderId}: Extracted subtotal from row: "${rawText}" = £${numericValue}`);
                    }
                }

                // Try to open drawer
                log(` Order ${orderId}: Attempting to open drawer...`);
                let drawer = await openDrawerForRow(row, 5);
                let offer = { text: "—", value: 0 };
                let issue = window.orderIssueData[orderId] || "—";

                if (drawer) {
                    // Validate drawer content
                    const isCorrectOrder = await waitForOrderToLoadInDrawer(drawer, orderId, 6000);

                    if (!isCorrectOrder) {
                        console.error(`[UberEats Script] Order ${orderId}: ⚠️ DRAWER VALIDATION FAILED - Retrying...`);
                        if (row.click) {
                            row.click();
                            await new Promise(r => setTimeout(r, 500));
                        }
                        const retryCorrect = await waitForOrderToLoadInDrawer(drawer, orderId, 4000);
                        if (!retryCorrect) {
                            console.error(`[UberEats Script] Order ${orderId}: ❌ Validation failed after retry. Skipping.`);
                            drawer = null;
                        } else {
                            log(` Order ${orderId}: Validation successful after retry.`);
                        }
                    }
                }

                if (drawer) {
                    console.log(`[UberEats Script] ▶ Order ${orderId}: Drawer opened & verified, extracting data...`);
                    await waitForDrawerContent(drawer, 8000);
                    offer = extractOfferDataFromDrawer(drawer);
                    const drawerIssue = extractIssueDataFromDrawer(drawer);
                    if (drawerIssue && drawerIssue !== "—" && issue === "—") {
                        issue = drawerIssue;
                    }
                    const items = extractItemsFromDrawer(drawer);
                    const date = extractDateFromDrawer(drawer, orderId);
                    const cancelled = isCancelledOrder(drawer);
                    const financials = extractDynamicMetadataFromDrawer(drawer);

                    window.orderCancelledData[orderId] = cancelled;
                    window.orderItemsData[orderId] = items;
                    window.orderDateData[orderId] = date;
                    window.orderFinancialsData[orderId] = financials;

                    if (cancelled) {
                        console.warn(`[UberEats Script] ⚠️ Order ${orderId}: CANCELLED ORDER DETECTED`);
                    }

                    // ALWAYS log extraction results (not gated by DEBUG)
                    console.log(`[UberEats Script] ✅ Order ${orderId}: offer="${offer.text}" (£${offer.value}), subtotal="${subtotal.text}" (£${subtotal.value}), items=${items.length}, date="${date}", cancelled=${cancelled}`);
                    if (items.length > 0) {
                        console.log(`[UberEats Script]    Items: ${items.map(i => `${i.name} x${i.quantity} @ ${i.price}`).join(' | ')}`);
                    }
                } else {
                    console.warn(`[UberEats Script] ❌ Order ${orderId}: Drawer timeout or validation failed`);
                    issue = "Drawer Error";
                    window.orderCancelledData[orderId] = false;
                }

                window.orderOfferData[orderId] = offer;
                window.orderIssueData[orderId] = issue;
                window.orderSubtotalData[orderId] = subtotal;

                if (subtotal.value !== 0 && !isNaN(subtotal.value)) {
                    totalSubtotalSum += subtotal.value;
                }

                if (offer.value !== 0 && !isNaN(offer.value)) {
                    totalOfferSum += offer.value;
                    ordersWithOffers++;
                }

                // Update UI cells (debug columns only)
                if (SHOW_DEBUG_COLUMNS) {
                    const offerCell = row.querySelector('.td-offer');
                    if (offerCell) {
                        offerCell.textContent = offer.text;
                        offerCell.className = offer.value !== 0 ? 'td-offer-value td-offer' : 'td-no-offer td-offer';
                    }

                    const issueCell = row.querySelector('.td-issue');
                    if (issueCell) {
                        issueCell.textContent = issue;
                        issueCell.className = issue !== "—" ? 'td-offer-value td-issue' : 'td-no-offer td-issue';
                    }

                    const itemsDetectedCell = row.querySelector('.td-items-detected');
                    if (itemsDetectedCell) {
                        const allItems = window.orderItemsData[orderId] || [];
                        const bogoItemsForCount = allItems.filter(item => 
                            /\bMeal\b/i.test(item.name) && 
                            (/\bwith\b/i.test(item.name) || /&|\+/.test(item.name) || /▪️/.test(item.name))
                        );

                        if (bogoItemsForCount.length > 0 && offer.value !== 0) {
                            const shortNames = bogoItemsForCount.map(item => {
                                let shortName = 'Other';
                                if (item.name.includes('Beef')) shortName = 'Beef';
                                else if (item.name.includes('Tofu')) shortName = 'Tofu';
                                else if (item.name.includes('Pork')) shortName = 'Pork';
                                const actualSold = Math.ceil(item.quantity / 2);
                                return `${shortName}×${actualSold}`;
                            }).join(', ');
                            itemsDetectedCell.textContent = shortNames;
                            itemsDetectedCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-offer-value td-items-detected';
                            window.orderItemsDetected[orderId] = shortNames;
                        } else {
                            itemsDetectedCell.textContent = '—';
                            itemsDetectedCell.className = '_c1 _di _fh _f0 _e5 _ea _e6 _e9 _c0 _ni _ng _kc _nh td-no-offer td-items-detected';
                        }
                    }

                    // Calculate item counts for this order and update running totals
                    const allItems = window.orderItemsData[orderId] || [];
                    const bogoItemsForCount = allItems.filter(item => 
                        /\bMeal\b/i.test(item.name) && 
                        (/\bwith\b/i.test(item.name) || /&|\+/.test(item.name) || /▪️/.test(item.name))
                    );

                    let orderTofuCount = 0;
                    let orderPorkCount = 0;
                    let orderBeefCount = 0;

                    // Only count if there's an offer (BOGO items)
                    if (offer.value !== 0 && bogoItemsForCount.length > 0) {
                        bogoItemsForCount.forEach(item => {
                            const actualSold = Math.ceil(item.quantity / 2);
                            if (item.name.includes('Tofu')) {
                                orderTofuCount += actualSold;
                            } else if (item.name.includes('Pork')) {
                                orderPorkCount += actualSold;
                            } else if (item.name.includes('Beef')) {
                                orderBeefCount += actualSold;
                            }
                        });

                        runningTofuCount += orderTofuCount;
                        runningPorkCount += orderPorkCount;
                        runningBeefCount += orderBeefCount;

                        if (DEBUG) log(` Order ${orderId}: +Tofu=${orderTofuCount} +Pork=${orderPorkCount} +Beef=${orderBeefCount} | Running: Tofu=${runningTofuCount} Pork=${runningPorkCount} Beef=${runningBeefCount}`);
                    }

                    // Update the running count cells in this row
                    const tofuCountCell = row.querySelector('.td-tofu-count');
                    if (tofuCountCell) {
                        if (orderTofuCount > 0) {
                            tofuCountCell.textContent = `+${orderTofuCount} (${runningTofuCount})`;
                        } else {
                            tofuCountCell.textContent = runningTofuCount > 0 ? `(${runningTofuCount})` : '—';
                        }
                    }

                    const porkCountCell = row.querySelector('.td-pork-count');
                    if (porkCountCell) {
                        if (orderPorkCount > 0) {
                            porkCountCell.textContent = `+${orderPorkCount} (${runningPorkCount})`;
                        } else {
                            porkCountCell.textContent = runningPorkCount > 0 ? `(${runningPorkCount})` : '—';
                        }
                    }

                    const beefCountCell = row.querySelector('.td-beef-count');
                    if (beefCountCell) {
                        if (orderBeefCount > 0) {
                            beefCountCell.textContent = `+${orderBeefCount} (${runningBeefCount})`;
                        } else {
                            beefCountCell.textContent = runningBeefCount > 0 ? `(${runningBeefCount})` : '—';
                        }
                    }
                }

                // Verify data was stored and add to processed set
                const hasItems = window.orderItemsData[orderId] && window.orderItemsData[orderId].length > 0;
                const hasOffer = window.orderOfferData[orderId] && window.orderOfferData[orderId].value !== undefined;

                if (!hasItems || !hasOffer) {
                    console.warn(`[UberEats Script] Order ${orderId}: ⚠️ DATA INTEGRITY WARNING - items=${hasItems}, offer=${hasOffer}`);
                }

                window.processedOrderIds.add(orderId);
                log(` Order ${orderId}: ✓ Added to processedOrderIds (total: ${window.processedOrderIds.size})`);
                processedThisRound++;

                // Close the drawer
                let closeButton = null;
                if (drawer) {
                    closeButton = drawer.querySelector('button[aria-label="Close"]') ||
                        Array.from(drawer.querySelectorAll('button')).find(btn => {
                            const text = btn.textContent || btn.getAttribute('aria-label') || '';
                            return /close/i.test(text);
                        });
                }
                if (!closeButton) {
                    closeButton = document.querySelector('button[aria-label="Close"]') ||
                        Array.from(document.querySelectorAll('button')).find(btn => {
                            const text = btn.textContent || btn.getAttribute('aria-label') || '';
                            return /close/i.test(text) && btn.offsetParent !== null;
                        });
                }
                if (closeButton) {
                    closeButton.click();
                }
                await waitForElementToDisappear('button[aria-label="Close"]', 3000);
                
                // We dramatically reduced the manual delay to speed up processing.
                // Natural drawer open/close provides enough spacing.
                const delayMs = 50;
                log(` Order ${orderId}: Waiting ${delayMs}ms before next order...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));

                // Clean up active processing marker
                localStorage.removeItem('ubereats_active_processing_order');

                // Clean up URL to prevent UUID accumulation
                await cleanupAfterOrder();

                log(` Order ${orderId}: Complete\n`);
                // Virtualize DOM: Hide the row completely to free up rendering and layout memory
                // This prevents the browser from crashing with 30,000 DOM elements
                if (row && typeof row.style !== 'undefined') {
                    row.style.display = 'none';
                    row.style.contentVisibility = 'hidden';
                }

                // Save state to IndexedDB after every order to prevent any data loss
                if (window.processedOrderIds.size > 0) {
                    logDebug(` Processed ${window.processedOrderIds.size} orders. Saving state to IndexedDB...`);
                    await saveStateToIndexedDB();
                }
            }

            // 3. Check if we made progress
            if (window.processedOrderIds.size === lastProcessedCount) {
                stuckCount++;
                log(` No new orders processed this round (stuck count: ${stuckCount}). Scrolling to load more...`);
            } else {
                stuckCount = 0;
                lastProcessedCount = window.processedOrderIds.size;
            }

            // 4. If not done and no visible unprocessed rows, scroll to load more
            if (window.processedOrderIds.size < totalOrderCount) {
                // Scroll down to trigger loading
                const currentCount = window.processedOrderIds.size;
                const loadingText = `Loading more orders<span class="animated-dots"></span> (${currentCount}/${totalOrderCount})`;

                if (SHOW_PROCESSING_OVERLAY) {
                    updateProcessingStatus(loadingText, currentCount, totalOrderCount);
                } else {
                    // Update button text (preserving btn-text structure for progress-fill animation)
                    updateButtonProgress(currentCount, totalOrderCount, loadingText);
                }

                // 1. Aggressively scroll all potential containers
                const containersToScroll = [
                    scrollableElement,
                    document.documentElement,
                    document.body,
                    document.querySelector('div[data-baseweb="flex-grid"]'),
                    ...document.querySelectorAll('div[style*="overflow"]') // any element with overflow
                ].filter(Boolean);

                containersToScroll.forEach(container => {
                    try {
                        container.scrollTop = container.scrollHeight;
                        if (typeof container.scrollTo === 'function') {
                            container.scrollTo(0, container.scrollHeight);
                        }
                        container.dispatchEvent(new WheelEvent('wheel', { deltaY: 500, bubbles: true, cancelable: true }));
                    } catch (e) {}
                });

                // 2. Also scroll the window
                window.scrollTo(0, document.body.scrollHeight);
                window.dispatchEvent(new WheelEvent('wheel', { deltaY: 500, bubbles: true, cancelable: true }));

                // 3. Scroll the last visible row into view
                const currentVisibleRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');
                const lastRow = currentVisibleRows[currentVisibleRows.length - 1];
                if (lastRow) {
                    lastRow.scrollIntoView({ block: 'end', behavior: 'smooth' });
                }

                // 4. Send arrow down key events just in case
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));

                // Wait for loading indicator or new rows
                let waitCount = 0;
                let newRowsLoaded = false;
                
                while (waitCount < 100) { // Max 5 seconds wait per scroll attempt
                    await new Promise(resolve => setTimeout(resolve, 50));
                    waitCount++;
                    
                    const newRowCount = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]').length;
                    if (newRowCount > currentVisibleRows.length) {
                        log(` Scroll successful: loaded ${newRowCount - currentVisibleRows.length} new rows!`);
                        newRowsLoaded = true;
                        break;
                    }
                    
                    // If still stuck after 2.5s, try scrolling again
                    if (waitCount === 50 && lastRow) {
                        lastRow.scrollIntoView({ block: 'start', behavior: 'auto' });
                        await new Promise(resolve => setTimeout(resolve, 100));
                        lastRow.scrollIntoView({ block: 'end', behavior: 'auto' });
                    }
                }
                
                if (!newRowsLoaded) {
                    log(` Scroll attempt ${stuckCount} finished, no new rows detected yet.`);
                }
                
                // Add an extra small delay before the next iteration
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        log(` Finished processing. ${window.processedOrderIds.size} of ${totalOrderCount} orders processed.`);

        if (window.processedOrderIds.size < totalOrderCount) {
            await loadSweetAlert();
            Swal.fire('Processing Warning', `Only processed ${window.processedOrderIds.size} of ${totalOrderCount} orders. Some orders may not have loaded.`, 'warning');
        }

        // --- 5. Final report ---
        button.classList.remove('loading');

        // Hide the processing overlay
        hideProcessingOverlay();

        // Release Wake Lock now that processing is complete
        if (wakeLock) {
            try {
                await wakeLock.release();
                log(' Wake Lock released - screen can sleep again');
            } catch (err) {
                console.warn('[UberEats Script] Failed to release Wake Lock:', err);
            }
        }

        // **FIX:** Use the correct variable for the "processed" count
        const finalProcessedCount = window.processedOrderIds.size;

        // Generate summary by date
        const summaryByDate = {};
        let finalTotalOfferSum = 0;
        let finalTotalSubtotalSum = 0;
        let finalTotalDiscountedItems = 0;

        // *** DIAGNOSTIC: Check for orders with UI data that aren't in processedOrderIds ***
        logDebug(`\n========== PRE-AGGREGATION DIAGNOSTIC ==========`);
        logDebug(`[DIAGNOSTIC] Total orders in processedOrderIds: ${window.processedOrderIds.size}`);
        logDebug(`[DIAGNOSTIC] Orders in set: ${Array.from(window.processedOrderIds).join(', ')}`);

        // Scan all table rows to find orders with offer data in UI
        const allRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');
        const ordersWithUIData = [];
        const missingFromSet = [];

        allRows.forEach(row => {
            const orderIdEl = row.querySelector('[class*="_fk"][class*="_fl"]');
            const orderId = orderIdEl ? orderIdEl.textContent.trim() : null;
            const offerValueCell = row.querySelector('.td-offer-value');
            const itemsCell = row.querySelector('.td-items-detected');

            if (orderId && offerValueCell && offerValueCell.textContent && offerValueCell.textContent !== '—') {
                ordersWithUIData.push({
                    orderId,
                    offerValue: offerValueCell.textContent,
                    items: itemsCell ? itemsCell.textContent : 'N/A'
                });

                if (!window.processedOrderIds.has(orderId)) {
                    missingFromSet.push({
                        orderId,
                        offerValue: offerValueCell.textContent,
                        items: itemsCell ? itemsCell.textContent : 'N/A'
                    });
                }
            }
        });

        logDebug(`[DIAGNOSTIC] Orders with UI data (offer column populated): ${ordersWithUIData.length}`);

        if (missingFromSet.length > 0) {
            console.error(`[DIAGNOSTIC] ⚠️ FOUND ${missingFromSet.length} ORDERS WITH UI DATA BUT NOT IN processedOrderIds:`);
            missingFromSet.forEach(o => {
                console.error(`  - Order ${o.orderId}: Offer=${o.offerValue}, Items=${o.items}`);
                // Try to add missing orders to the set for aggregation
                // Check if we have stored data for this order
                if (window.orderOfferData[o.orderId]) {
                    logDebug(`  → Adding ${o.orderId} to processedOrderIds for aggregation`);
                    window.processedOrderIds.add(o.orderId);
                } else {
                    console.warn(`  → ${o.orderId} has no stored offer data, cannot recover`);
                }
            });
        } else {
            logDebug(`[DIAGNOSTIC] ✓ All orders with UI data are in processedOrderIds`);
        }
        logDebug(`========== END DIAGNOSTIC ==========\n`);

        for (const orderId of window.processedOrderIds) {
            // Skip cancelled orders - they should not be counted at all
            const isCancelled = window.orderCancelledData[orderId] === true;
            if (isCancelled) {
                log(` Order ${orderId}: ⚠️ CANCELLED - skipping from aggregation`);
                continue;
            }

            const offer = window.orderOfferData[orderId];
            let date = window.orderDateData[orderId];
            // Ensure we always have a valid date - use URL fallback if extraction failed
            if (!date || date === "" || date === "Unknown Date") {
                console.warn(`[UberEats Script] Order ${orderId}: Date was empty/unknown during aggregation, using URL fallback`);
                date = getDateFromURLFallback() || "Fallback Date Required";
            }
            const items = window.orderItemsData[orderId] || [];

            // Initialize date entry if it doesn't exist
            if (!summaryByDate[date]) {
                summaryByDate[date] = {
                    totalOrders: 0,
                    ordersWithOffers: 0,
                    totalOfferSum: 0,
                    itemCounts: {},
                    totalDiscountedItems: 0,
                    totalSubtotalSum: 0,
                    orderDetails: [] // Track each order's ID and item type for debugging
                };
            }

            // Count all orders for this date
            summaryByDate[date].totalOrders++;

            // Use the SCRAPED subtotal from the Subtotal column (not calculated from items)
            // Item prices don't account for the BOGO discount, so calculating from items would double the amount
            const subtotalData = window.orderSubtotalData[orderId];
            const subtotalValue = (subtotalData && subtotalData.value) ? subtotalData.value : 0;

            // Add to date total
            summaryByDate[date].totalSubtotalSum += subtotalValue;

            // Add to grand total
            finalTotalSubtotalSum += subtotalValue;

            // TRACK EVERY ORDER FOR MARKET BASKET CSV (regardless of offers)
            if (items && items.length > 0) {
                if (!summaryByDate[date].detailedCsvRows) summaryByDate[date].detailedCsvRows = [];
                const financials = window.orderFinancialsData[orderId] || {};
                
                const shop = window.orderShopData[orderId] || "";
                const time = window.orderTimeData[orderId] || "";
                const customer = window.orderCustomerData[orderId] || "";
                const fulfilment = window.orderFulfilmentData[orderId] || "";
                const courier = window.orderCourierData[orderId] || "";
                const issue = window.orderIssueData[orderId] || "";

                summaryByDate[date].detailedCsvRows.push({
                    id: orderId,
                    shop: shop,
                    time: time,
                    customer: customer,
                    fulfilment: fulfilment,
                    courier: courier,
                    issue: issue,
                    subtotalValue: subtotalValue,
                    financials: financials,
                    items: items
                });

                const itemCountByName = {};
                items.forEach(item => {
                    if (!itemCountByName[item.name]) {
                        itemCountByName[item.name] = { totalQty: 0 };
                    }
                    itemCountByName[item.name].totalQty += item.quantity;
                });
                const allItemsDesc = Object.entries(itemCountByName).map(([name, data]) => `${name}×${data.totalQty}`).join(', ');
                summaryByDate[date].orderDetails.push({
                    id: orderId,
                    items: allItemsDesc,
                    offer: offer ? offer.value : 0
                });
            }

            // Only process orders that have offers (positive or negative)
            // FIX: Changed > 0 to !== 0 to handle negative discounts
            if (offer && offer.value !== 0) {
                summaryByDate[date].ordersWithOffers++;
                summaryByDate[date].totalOfferSum += offer.value;

                // Add to grand total
                finalTotalOfferSum += offer.value;

                // Process items with BOGO-aware logic
                if (items.length > 0) {
                    // DEBUG: Log ALL items in this order
                    logDebug(`\n========== ORDER ${orderId} ANALYSIS ==========`);
                    logDebug(` All items in order (${items.length} total):`);
                    items.forEach((item, idx) => {
                        logDebug(`  [${idx}] "${item.name}" - Price: £${item.priceValue}, Qty: ${item.quantity}, Total: £${(item.priceValue * item.quantity).toFixed(2)}`);
                    });

                    // STEP 1: Consolidate split-line items (same item appearing multiple times with qty=1)
                    // Uber Eats sometimes shows the same item on separate rows instead of a single row with qty=N
                    const itemCountByName = {};
                    items.forEach(item => {
                        if (!itemCountByName[item.name]) {
                            itemCountByName[item.name] = { totalQty: 0, unitPrice: 0, count: 0 };
                        }
                        itemCountByName[item.name].totalQty += item.quantity;
                        // Capture unit price from the first occurrence
                        if (itemCountByName[item.name].count === 0) {
                            itemCountByName[item.name].unitPrice = item.priceValue;
                        }
                        itemCountByName[item.name].count++;
                    });

                    const consolidatedItems = Object.entries(itemCountByName).map(([name, data]) => ({
                        name,
                        quantity: data.totalQty,
                        unitPrice: data.unitPrice,
                        isSplitLine: data.count > 1
                    }));

                    // Log consolidated items
                    const splitLineItems = consolidatedItems.filter(i => i.isSplitLine);
                    if (splitLineItems.length > 0) {
                        logDebug(` Split-line items detected and consolidated:`);
                        splitLineItems.forEach(item => {
                            logDebug(`  - "${item.name}": Combined qty=${item.quantity}, Unit price=£${item.unitPrice.toFixed(2)}`);
                        });
                    }

                    let orderItemsDesc = [];
                    consolidatedItems.forEach(item => {
                        // Normalize: strip (N), ▪️, ✔️ so DB key is stable even if Uber Eats changes decorators
                        const itemKey = normalizeItemKey(item.name);
                        logDebug(`  KEY: "${item.name}" → "${itemKey}"`);
                        if (!summaryByDate[date].itemCounts[itemKey]) {
                            summaryByDate[date].itemCounts[itemKey] = 0;
                        }
                        const prev = summaryByDate[date].itemCounts[itemKey];
                        
                        // Default to actual quantity. Only divide by 2 if it's explicitly a BOGO meal deal
                        // so we don't undercount regular non-discounted side items in the same basket.
                        const isMealDeal = /\bMeal\b/i.test(item.name) && (/\bwith\b/i.test(item.name) || /&|\+/.test(item.name) || /▪️/.test(item.name));
                        const actualSold = isMealDeal ? Math.ceil(item.quantity / 2) : item.quantity;
                        
                        summaryByDate[date].itemCounts[itemKey] += actualSold;
                        summaryByDate[date].totalDiscountedItems += actualSold;
                        logDebug(`  AGGREGATION: "${itemKey}" ${prev} + ${actualSold} = ${summaryByDate[date].itemCounts[itemKey]}`);
                        orderItemsDesc.push(`${itemKey}×${actualSold}`);
                    });

                    logDebug(`========== END ORDER ${orderId} ==========\n`);
                } else {
                    log(` Order ${orderId}: No items found to attribute offer to.`);
                }
            } else {
                // No offer value - skip counting items for this order
                log(` Order ${orderId}: No offer value (Value=${offer ? offer.value : 'null'}), skipping item count.`);
            }
        }

        // Calculate grand total of discounted items
        for (const date of Object.keys(summaryByDate)) {
            finalTotalDiscountedItems += summaryByDate[date].totalDiscountedItems;
        }

        // DEBUG: Print final summary of all item counts
        logDebug(`\n\n========== FINAL ITEM COUNT SUMMARY ==========`);
        for (const date of Object.keys(summaryByDate)) {
            logDebug(`Date: ${date}`);
            const counts = summaryByDate[date].itemCounts;
            for (const [itemName, count] of Object.entries(counts)) {
                logDebug(`  - "${itemName}": ${count}`);
            }
        }
        logDebug(`================================================\n`);

        // Build HTML table
        let tableHTML = `
            <div style="text-align: left; max-height: 400px; overflow-y: auto;">
                <h3 style="margin-top: 0;">Summary by Date</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background-color: #f5f5f5; border-bottom: 2px solid #ddd;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Date</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Items (Quantity)</th>
                            <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Offers</th>
                            <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Offer Sum</th>
                            <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Subtotal Sum</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Sort dates
        const sortedDates = Object.keys(summaryByDate).sort();

        for (const date of sortedDates) {
            const summary = summaryByDate[date];

            // Show all dates that have any orders (so subtotal sums match the grand total)
            // Previously we skipped dates with no offers, which caused subtotal discrepancy
            if (summary.totalOrders === 0) {
                continue;
            }

            // Build items list
            let itemsHTML = '';
            const sortedItems = Object.entries(summary.itemCounts).sort((a, b) => b[1] - a[1]); // Sort by quantity desc

            if (sortedItems.length > 0) {
                itemsHTML = sortedItems.map(([name, qty]) => `${name} (${qty})`).join('<br>');
            } else {
                itemsHTML = '<em>No items with offers</em>';
            }

            tableHTML += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${itemsHTML}</td>
                    <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${summary.totalDiscountedItems}/${summary.totalOrders}</td>
                    <td style="padding: 8px; text-align: right; border: 1px solid #ddd; color: ${summary.totalOfferSum < 0 ? 'red' : 'green'}; font-weight: bold;">£${summary.totalOfferSum.toFixed(2)}</td>
                    <td style="padding: 8px; text-align: right; border: 1px solid #ddd;">£${(summary.totalSubtotalSum || 0).toFixed(2)}</td>
                </tr>
            `;
        }

        tableHTML += `
                    </tbody>
                </table>
            </div>
        `;

        await loadSweetAlert();
        
        // Push data to Supabase
        const RESAI_SUPABASE_URL = "https://pdcpyuyzerrgixhjnspe.supabase.co/functions/v1/sync-uber-eats";
        const RESAI_SYNC_SECRET = "RES_AI_UBER_EATS_SYNC_KEY_2026";
        
        // Hard-coded org ID for Chilli Daddy
        const orgId = '4b951be2-a0ff-4a91-86fe-14e4be14102b';

        let syncStatusHTML = '';
        if (orgId) {
            try {
                // Prepare records
                const records = sortedDates.map(date => ({
                    org_id: orgId,
                    date: date,
                    items_summary: summaryByDate[date].itemCounts,
                    total_orders: summaryByDate[date].totalOrders,
                    orders_with_offers: summaryByDate[date].ordersWithOffers,
                    total_offer_sum: summaryByDate[date].totalOfferSum,
                    total_subtotal_sum: summaryByDate[date].totalSubtotalSum
                }));
                
                // ALWAYS log sync payload for debugging
                console.log(`[UberEats Script] 📤 SYNC: Preparing ${records.length} records for org ${orgId}`);
                records.forEach((r, i) => {
                    console.log(`[UberEats Script]   Record ${i+1}: date=${r.date}, orders=${r.total_orders}, withOffers=${r.orders_with_offers}, offerSum=£${r.total_offer_sum?.toFixed(2)}, subtotalSum=£${r.total_subtotal_sum?.toFixed(2)}, items=${JSON.stringify(r.items_summary)}`);
                });
                
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: RESAI_SUPABASE_URL,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-uber-eats-secret': RESAI_SYNC_SECRET
                        },
                        data: JSON.stringify({ records }),
                        onload: function(res) {
                            resolve({
                                ok: res.status >= 200 && res.status < 300,
                                text: () => Promise.resolve(res.responseText)
                            });
                        },
                        onerror: function(err) {
                            reject(err);
                        }
                    });
                });
                
                if (response.ok) {
                    syncStatusHTML = '<div style="margin-top: 10px; padding: 10px; background: #e8f5e9; color: #2e7d32; border-radius: 8px;">✓ Successfully synced to ResAI</div>';
                } else {
                    const errorMsg = await response.text();
                    console.error('[UberEats Script] Sync failed:', errorMsg);
                    syncStatusHTML = '<div style="margin-top: 10px; padding: 10px; background: #ffebee; color: #c62828; border-radius: 8px;">❌ Failed to sync to ResAI</div>';
                }
            } catch (err) {
                console.error('[UberEats Script] Sync error:', err);
                syncStatusHTML = '<div style="margin-top: 10px; padding: 10px; background: #ffebee; color: #c62828; border-radius: 8px;">❌ Error syncing to ResAI</div>';
            }
        }

        // 1. Find Max Modifiers and Metadata Keys
        let maxModifiers = 0;
        let metadataKeys = new Set();
        
        for (const date of Object.keys(summaryByDate)) {
            const rows = summaryByDate[date].detailedCsvRows;
            if (rows) {
                rows.forEach(order => {
                    if (order.financials) {
                        Object.keys(order.financials).forEach(k => metadataKeys.add(k));
                    }
                    order.items.forEach(item => {
                        if (item.modifiers && item.modifiers.length > maxModifiers) {
                            maxModifiers = item.modifiers.length;
                        }
                    });
                });
            }
        }

        const sortedMetadataKeys = Array.from(metadataKeys).sort();

        // 2. Build Header
        let csvContent = "Date,Time,OrderID,ShopDetails,Customer,Fulfilment,Courier,Issue,Subtotal";
        for (const k of sortedMetadataKeys) {
            csvContent += `,"${k.replace(/"/g, '""')}"`;
        }
        csvContent += ",ItemQty,ItemName,ItemPrice";
        for (let i = 1; i <= maxModifiers; i++) {
            csvContent += `,Mod${i}_Category,Mod${i}_Name,Mod${i}_Qty,Mod${i}_Price`;
        }
        csvContent += "\n";

        // 3. Build Rows
        for (const date of Object.keys(summaryByDate)) {
            const rows = summaryByDate[date].detailedCsvRows;
            if (rows) {
                rows.forEach(order => {
                    order.items.forEach(item => {
                        const safeItemName = '"' + normalizeItemKey(item.name || '').replace(/"/g, '""') + '"';
                        const safeShop = '"' + (order.shop || '').replace(/"/g, '""') + '"';
                        const safeCustomer = '"' + (order.customer || '').replace(/"/g, '""') + '"';
                        const safeFulfilment = '"' + (order.fulfilment || '').replace(/"/g, '""') + '"';
                        const safeCourier = '"' + (order.courier || '').replace(/"/g, '""') + '"';
                        const safeIssue = '"' + (order.issue || '').replace(/"/g, '""') + '"';

                        let rowStr = `${date},${order.time},${order.id},${safeShop},${safeCustomer},${safeFulfilment},${safeCourier},${safeIssue},${order.subtotalValue}`;
                        
                        // Append dynamic metadata
                        for (const k of sortedMetadataKeys) {
                            const val = order.financials && order.financials[k] !== undefined ? order.financials[k] : "";
                            rowStr += `,"${String(val).replace(/"/g, '""')}"`;
                        }
                        
                        rowStr += `,${item.quantity},${safeItemName},${item.priceValue}`;
                        
                        if (item.modifiers) {
                            for (let i = 0; i < maxModifiers; i++) {
                                if (i < item.modifiers.length) {
                                    const mod = item.modifiers[i];
                                    const safeCat = '"' + (mod.category || '').replace(/"/g, '""') + '"';
                                    const safeName = '"' + normalizeItemKey(mod.name || '').replace(/"/g, '""') + '"';
                                    rowStr += `,${safeCat},${safeName},${mod.quantity},${mod.priceValue}`;
                                } else {
                                    // Empty columns for missing modifiers
                                    rowStr += `,,,,`;
                                }
                            }
                        }
                        csvContent += rowStr + "\n";
                    });
                });
            }
        }
        // Use Blob with UTF-8 BOM (\uFEFF) so Excel correctly handles emojis and non-breaking spaces
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const csvUrl = URL.createObjectURL(blob);
        const downloadLinkHTML = `<div style="margin-top: 15px; text-align: center;"><a href="${csvUrl}" download="ubereats_market_basket_orders.csv" style="padding: 12px 24px; background: #000; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">📥 Download Full Order CSV</a></div>`;

        Swal.fire({
            title: 'Calculation Complete!',
            html: `
                <div style="text-align: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; color: #DE1135;">£${finalTotalOfferSum.toFixed(2)}</h2>
                    <p style="margin: 3px 0; font-size: 13px;">Total Offer Sum</p>
                    <h3 style="margin: 8px 0 0 0; color: #333;">£${finalTotalSubtotalSum.toFixed(2)}</h3>
                    <p style="margin: 3px 0; font-size: 13px;">Total Subtotal Sum</p>
                    <p style="margin: 8px 0 0 0; color: #666; font-size: 12px;">${finalTotalDiscountedItems} discounted items · ${finalProcessedCount}/${totalOrderCount} orders</p>
                </div>
                ${tableHTML}
                ${syncStatusHTML}
                ${downloadLinkHTML}
            `,
            icon: 'success',
            width: '800px',
            confirmButtonText: 'OK'
        });
    }

    // --- 6. Function to add the button to the page ---
    let lastScrollTop = 0;
    let scrollHideTimeout = null;

    function addButton() {
        const heading = document.querySelector('h1[data-baseweb="heading"]');
        if (heading && !document.getElementById('fetch-offer-data-btn')) {
            const button = document.createElement('button');
            button.id = 'fetch-offer-data-btn';

            // Add progress fill element and text wrapper for water-fill animation
            button.innerHTML = `
                <div class="progress-fill"></div>
                <span class="btn-text">Fetch Offer Data</span>
            `;

            heading.parentElement.appendChild(button);
            button.addEventListener('click', processOrders);

            // Setup scroll-aware auto-hide behavior
            setupScrollAutoHide(button);
        }
    }

    function setupScrollAutoHide(button) {
        // Try multiple possible scroll containers
        const scrollContainer = document.querySelector('.infinite-scroll-component')
            || document.querySelector('[class*="OrdersList"]')
            || document.querySelector('main')
            || document.body;

        const SCROLL_THRESHOLD = 50; // Minimum scroll distance to trigger hide/show
        let accumulatedDelta = 0;
        let touchStartY = 0;

        // Handle scroll hiding logic
        const handleScrollDelta = (delta) => {
            // Don't hide while processing
            if (button.classList.contains('loading')) return;

            // Clear any pending timeout
            if (scrollHideTimeout) {
                clearTimeout(scrollHideTimeout);
            }

            // Accumulate scroll delta
            accumulatedDelta += delta;

            if (accumulatedDelta > SCROLL_THRESHOLD) {
                // Scrolling DOWN - hide button
                button.classList.add('hidden');
                accumulatedDelta = 0;
            } else if (accumulatedDelta < -SCROLL_THRESHOLD) {
                // Scrolling UP - show button
                button.classList.remove('hidden');
                accumulatedDelta = 0;
            }

            // Auto-show button after 1.5s of no scrolling
            scrollHideTimeout = setTimeout(() => {
                button.classList.remove('hidden');
                accumulatedDelta = 0;
            }, 1500);
        };

        // Desktop: wheel event
        const handleWheel = (e) => {
            handleScrollDelta(e.deltaY);
        };

        // Mobile/Tablet: touch events
        const handleTouchStart = (e) => {
            touchStartY = e.touches[0].clientY;
        };

        const handleTouchMove = (e) => {
            if (touchStartY === 0) return;
            const touchCurrentY = e.touches[0].clientY;
            const delta = touchStartY - touchCurrentY; // Positive = scrolling down, Negative = scrolling up
            touchStartY = touchCurrentY; // Update for continuous tracking
            handleScrollDelta(delta);
        };

        // Listen on the document for both wheel and touch events
        document.addEventListener('wheel', handleWheel, { passive: true });
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: true });
    }

    // --- Use an observer to add the button and new cells ---
    // Track the last URL to detect SPA navigation
    let lastUrl = window.location.href;
    let isInitialized = false;
    let scrollObserver = null;
    let urlCheckInterval = null;

    // Dynamic wait for orders to appear
    async function waitForOrdersToLoad(maxWaitMs = 15000) {
        const startTime = Date.now();
        return new Promise((resolve) => {
            const check = () => {
                const resultsText = findElementByText('div', 'Showing', 'results');
                const rows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');

                if (resultsText && rows.length > 0) {
                    let logText = resultsText.textContent.trim();
                    if (logText.length > 50) logText = logText.substring(0, 50) + "...";
                    log(` Orders loaded: "${logText}" with ${rows.length} rows`);
                    resolve(true);
                } else if (Date.now() - startTime > maxWaitMs) {
                    log(' Timeout waiting for orders to load');
                    resolve(false);
                } else {
                    setTimeout(check, 200);
                }
            };
            check();
        });
    }

    function initializeOnOrdersPage() {
        // Only run on orders page
        if (!window.location.href.includes('/manager/orders')) {
            if (isInitialized) {
                log(' Left orders page, resetting state');
                isInitialized = false;
                if (scrollObserver) {
                    scrollObserver.disconnect();
                    scrollObserver = null;
                }
            }
            return;
        }

        // Look for the "Showing X results" text AND at least one order row
        const resultsText = findElementByText('div', 'Showing', 'results');
        const orderRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');

        // Only initialize when BOTH the results text AND at least one order row are present
        if (resultsText && orderRows.length > 0 && !isInitialized) {
            log(` Orders page ready: "${resultsText.textContent}" with ${orderRows.length} rows`);
            addButton(); // Add the button only after orders are visible
            updateNewRows(); // Add cells to rows that are already there
            isInitialized = true;

            // Start scroll observer if not already running
            if (!scrollObserver) {
                scrollObserver = new MutationObserver(() => {
                    updateNewRows();
                });
                const scrollTarget = document.querySelector('.infinite-scroll-component');
                if (scrollTarget) {
                    scrollObserver.observe(scrollTarget, { childList: true });
                    log(' Scroll observer started');
                }
            }

            // *** RECOVERY MODE CHECK ***
            if (isRecoveryMode()) {
                log(' Recovery mode detected - restoring state and resuming...');
                loadStateFromIndexedDB().then(recoveryState => {
                    if (recoveryState) {
                        window.processedOrderIds = new Set(recoveryState.processedOrderIds);
                        window.orderOfferData = recoveryState.orderOfferData;
                        window.orderSubtotalData = recoveryState.orderSubtotalData;
                        window.orderItemsData = recoveryState.orderItemsData;
                        window.orderDateData = recoveryState.orderDateData;
                        window.orderShopData = recoveryState.orderShopData || {};
                        window.orderTimeData = recoveryState.orderTimeData || {};
                        window.orderCustomerData = recoveryState.orderCustomerData || {};
                        window.orderFulfilmentData = recoveryState.orderFulfilmentData || {};
                        window.orderCourierData = recoveryState.orderCourierData || {};
                        window.orderFinancialsData = recoveryState.orderFinancialsData || {};
                        window.orderCancelledData = recoveryState.orderCancelledData;

                        log(` Restored ${window.processedOrderIds.size} processed orders from recovery state`);
                        clearRecoveryState();

                        (async () => {
                            await waitForOrdersToLoad();
                            await new Promise(r => setTimeout(r, 500));
                            log(' Auto-resuming processing after recovery...');
                            processOrders();
                        })();
                    } else {
                        log(' No valid recovery state found, clearing flags');
                        clearRecoveryState();
                    }
                });
            }
        }
    }

    // Handle URL change (called from multiple sources)
    async function handleUrlChange() {
        log(` URL change detected: ${window.location.href}`);
        lastUrl = window.location.href;
        isInitialized = false;

        // Disconnect scroll observer
        if (scrollObserver) {
            scrollObserver.disconnect();
            scrollObserver = null;
        }

        // If we're on orders page, wait for orders to load dynamically
        if (window.location.href.includes('/manager/orders')) {
            log(' Navigated to orders page, waiting for orders to load...');
            const loaded = await waitForOrdersToLoad();
            if (loaded) {
                initializeOnOrdersPage();
            }
        }
    }

    // Intercept History API to detect SPA navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        log(' history.pushState intercepted');
        if (window.location.href !== lastUrl) {
            handleUrlChange();
        }
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        log(' history.replaceState intercepted');
        if (window.location.href !== lastUrl) {
            handleUrlChange();
        }
    };

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', () => {
        log(' popstate event');
        if (window.location.href !== lastUrl) {
            handleUrlChange();
        }
    });

    // Fallback: Poll URL every 500ms in case other methods fail
    urlCheckInterval = setInterval(() => {
        if (window.location.href !== lastUrl) {
            log(' URL change detected via polling');
            handleUrlChange();
        }
    }, 500);

    // Main observer - for DOM changes (scrolling, new rows)
    const mainObserver = new MutationObserver(() => {
        // Try to initialize if not yet done and on orders page
        if (!isInitialized && window.location.href.includes('/manager/orders')) {
            initializeOnOrdersPage();
        }

        // Update rows if columns exist
        if (document.querySelector('.th-offer')) {
            updateNewRows();
        }
    });

    // Start the observer
    const targetNode = document.getElementById('root');
    if (targetNode) {
        mainObserver.observe(targetNode, { childList: true, subtree: true });
        log(' Observer started with History API interception');
    }

    // Initial check
    setTimeout(initializeOnOrdersPage, 500);

})();