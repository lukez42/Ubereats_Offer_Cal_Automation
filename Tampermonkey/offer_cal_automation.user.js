// ==UserScript==
// @name         Uber Eats - Get Offer Data (v7 - Patient Scroll & Fetch)
// @namespace    http://tampermonkey.net/
// @version      8.7
// @description  This script patiently scrolls to load all orders, then processes them one-by-one, waiting for the GraphQL data for each before continuing.
// @author       Gemini Assistant
// @match        https://merchants.ubereats.com/manager/*
// @updateURL    https://raw.githubusercontent.com/lukez42/Ubereats_Offer_Cal_Automation/main/Tampermonkey/offer_cal_automation.user.js
// @downloadURL  https://raw.githubusercontent.com/lukez42/Ubereats_Offer_Cal_Automation/main/Tampermonkey/offer_cal_automation.user.js
// @grant        GM_addStyle
// @grant        window.fetch
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
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
`);

(function () {
    'use strict';

    // *** CONFIGURATION ***
    const DEBUG = false; // Set to true to enable verbose console logging
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
            textEl.textContent = statusText;
        }

        // Update progress ring
        const progressRing = processingOverlay.querySelector('.progress-ring-fill');
        if (progressRing && total > 0) {
            const circumference = 62.83; // 2 * PI * 10 (radius)
            const progress = current / total;
            const offset = circumference * (1 - progress);
            progressRing.style.strokeDashoffset = offset;
        }
    }

    // Update button progress (for non-overlay mode)
    function updateButtonProgress(current, total, statusText) {
        const button = document.getElementById('fetch-offer-data-btn');
        if (!button) return;

        const btnText = button.querySelector('.btn-text');
        const progressFill = button.querySelector('.progress-fill');

        if (btnText) {
            btnText.textContent = `Processing... (${current}/${total})`;
        }

        if (progressFill && total > 0) {
            const progress = current / total;
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

    // *** SESSION STORAGE RECOVERY FUNCTIONS ***
    function saveStateToSession() {
        try {
            const state = {
                processedOrderIds: Array.from(window.processedOrderIds),
                orderOfferData: window.orderOfferData || {},
                orderSubtotalData: window.orderSubtotalData || {},
                orderItemsData: window.orderItemsData || {},
                orderDateData: window.orderDateData || {},
                orderCancelledData: window.orderCancelledData || {},
                timestamp: Date.now()
            };
            sessionStorage.setItem('ubereats_recovery_state', JSON.stringify(state));
            log(` Saved recovery state: ${state.processedOrderIds.length} orders processed`);
        } catch (e) {
            console.warn('[UberEats Script] Failed to save recovery state:', e);
        }
    }

    function loadStateFromSession() {
        try {
            const stateJson = sessionStorage.getItem('ubereats_recovery_state');
            if (!stateJson) return null;

            const state = JSON.parse(stateJson);

            // Only use recovery state if it's less than 5 minutes old
            const ageMinutes = (Date.now() - state.timestamp) / 1000 / 60;
            if (ageMinutes > 5) {
                log(' Recovery state is too old, discarding');
                clearRecoveryState();
                return null;
            }

            return state;
        } catch (e) {
            console.warn('[UberEats Script] Failed to load recovery state:', e);
            return null;
        }
    }

    function clearRecoveryState() {
        sessionStorage.removeItem('ubereats_reload_recovery');
        sessionStorage.removeItem('ubereats_recovery_state');
        sessionStorage.removeItem('ubereats_last_order_index');
    }

    function isRecoveryMode() {
        return sessionStorage.getItem('ubereats_reload_recovery') === 'true';
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
            await new Promise(resolve => setTimeout(resolve, 150));
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
            await new Promise(r => setTimeout(r, 300));
            return true;
        }
        return false;
    }

    // *** URL CORRUPTION DETECTION AND RECOVERY ***
    // The Uber Eats site pushes order UUIDs to the URL when clicking rows.
    // If we click too fast or retry clicks, UUIDs accumulate and corrupt the URL.

    function getCleanBaseUrl() {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const restaurantUUID = params.get('restaurantUUID');
        const dateRange = params.get('dateRange');
        const start = params.get('start');
        const end = params.get('end');

        if (restaurantUUID && start && end) {
            return `${url.origin}/manager/orders?restaurantUUID=${restaurantUUID}&dateRange=${dateRange || 'custom'}&start=${start}&end=${end}`;
        }
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
            await new Promise(r => setTimeout(r, 500));
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
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.warn('[UberEats Script] cleanupAfterOrder: replaceState failed', e);
            }
        }

        // Also check for corruption as a safety net
        if (isUrlCorrupted()) {
            console.warn('[UberEats Script] cleanupAfterOrder: URL still corrupted, forcing reset...');
            await resetCorruptedUrl();
            await new Promise(r => setTimeout(r, 500));
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
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 300));

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
                    await new Promise(r => setTimeout(r, 300));
                } catch (e) { }
            }

            // *** DEAD STATE DETECTION ***
            // If we've had multiple attempts with no drawer at all, React is broken
            if (consecutiveEmptyDrawerCount >= MAX_EMPTY_BEFORE_RELOAD) {
                console.warn(`[UberEats Script] openDrawerForRow: ${MAX_EMPTY_BEFORE_RELOAD} consecutive empty drawers - React Router is broken. Forcing page reload...`);

                // Save current state before reload so we can resume
                saveStateToSession();
                sessionStorage.setItem('ubereats_reload_recovery', 'true');

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

            await new Promise(r => setTimeout(r, 400));
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

            // Look for "Offers on items" (with or without VAT text)
            if (/Offers on items/i.test(label)) {
                log(` extractOfferDataFromDrawer: Found "Offers on items" in paragraph: "${label}"`);

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
            .find(text => /(items?|issue|missing|damaged|incorrect|charged)/i.test(text));

        return candidate || "—";
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
        // Removed deduplication logic as it might skip valid items with same name/price

        // Target the accordion headers which contain the main item details.
        // These are div elements with role="button".
        const itemHeaders = drawer.querySelectorAll('div[role="button"]');

        for (const header of itemHeaders) {
            // 1. Get Quantity
            const quantityLabel = header.querySelector('div[data-baseweb="typo-labelsmall"]');
            if (!quantityLabel) continue; // Not an item header

            const quantityText = quantityLabel.textContent.trim();
            const quantity = parseInt(quantityText);
            if (isNaN(quantity)) continue;

            // 2. Get Item Name
            const itemNameEl = header.querySelector('div[data-baseweb="typo-labelmedium"]');
            if (!itemNameEl) continue;

            const itemName = itemNameEl.textContent.trim();

            // 3. Get Price
            const priceEl = header.querySelector('[data-baseweb="typo-monoparagraphmedium"]');
            const priceText = priceEl ? priceEl.textContent.trim() : "";
            const priceValue = parseFloat(priceText.replace(/[^\d.-]/g, ''));

            // 4. Filter out non-food items and modifiers
            // Skip timestamps
            if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(itemName)) {
                continue;
            }

            // Skip Modifiers and Options
            if (/^(Spice\s+\d+|No(\s+|$)|Add\s+|Extra\s+|Choose\s+|Option\s+|Cutlery|Napkins|Wheat Noodle|Rice Noodle|Udon Noodle|Sweet Potato Noodle)/i.test(itemName)) {
                continue;
            }

            // 5. Filter out items with 0 price (likely modifiers or duplicate headers without price)
            if (priceValue <= 0) {
                continue;
            }

            items.push({
                name: itemName,
                quantity: quantity,
                price: priceText,
                priceValue: isNaN(priceValue) ? 0 : priceValue
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
            const count = parseInt(totalCountEl.textContent.match(/Showing (\d+) results/)[1]);
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
            await new Promise(resolve => setTimeout(resolve, 200));
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

        // Clear data from any previous runs UNLESS we're resuming from recovery
        const hasRecoveredData = window.processedOrderIds && window.processedOrderIds.size > 0;
        if (hasRecoveredData) {
            log(` Resuming with ${window.processedOrderIds.size} previously processed orders`);
        } else {
            window.orderOfferData = {};
            window.orderIssueData = {};
            window.orderItemsData = {};
            window.orderDateData = {};
            window.orderSubtotalData = {};
            window.orderCancelledData = {};
            window.orderItemsDetected = {};
            window.processedOrderIds = new Set();
        }
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
            Swal.fire('Error', 'Could not find total order count (e.g., "Showing 76 results"). Make sure it is visible on the page.', 'error');
            button.classList.remove('loading');
            hideProcessingOverlay();
            if (wakeLock) await wakeLock.release();
            return;
        }

        // 2. Setup columns
        if (!setupTableColumns()) {
            Swal.fire('Error', 'Could not find the orders table.', 'error');
            button.classList.remove('loading');
            hideProcessingOverlay();
            if (wakeLock) await wakeLock.release();
            return;
        }

        // 3. Scroll to load all rows
        const scrollableElement = document.querySelector('.infinite-scroll-component');
        if (!scrollableElement) {
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

                // Removed redundant second scrollIntoView and 300ms wait here to speed up processing

                // Open drawer
                log(` Order ${orderId}: Attempting to open drawer...`);
                let drawer = await openDrawerForRow(row, 5);
                let offer = { text: "—", value: 0 };
                let issue = "—";

                if (drawer) {
                    // Validate drawer content
                    const isCorrectOrder = await waitForOrderToLoadInDrawer(drawer, orderId, 6000);

                    if (!isCorrectOrder) {
                        console.error(`[UberEats Script] Order ${orderId}: ⚠️ DRAWER VALIDATION FAILED - Retrying...`);
                        if (row.click) {
                            row.click();
                            await new Promise(r => setTimeout(r, 1500));
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
                    log(` Order ${orderId}: Drawer opened & verified, extracting data...`);
                    await waitForDrawerContent(drawer, 8000);
                    offer = extractOfferDataFromDrawer(drawer);
                    issue = extractIssueDataFromDrawer(drawer);
                    const items = extractItemsFromDrawer(drawer);
                    const date = extractDateFromDrawer(drawer, orderId);
                    const cancelled = isCancelledOrder(drawer);

                    window.orderCancelledData[orderId] = cancelled;
                    window.orderItemsData[orderId] = items;
                    window.orderDateData[orderId] = date;

                    if (cancelled) {
                        log(` Order ${orderId}: ⚠️ CANCELLED ORDER DETECTED`);
                    }

                    log(` Order ${orderId}: offer="${offer.text}", subtotal="${subtotal.text}", items=${items.length}, date="${date}", cancelled=${cancelled}`);
                } else {
                    log(` Order ${orderId}: Drawer timeout or validation failed`);
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
                        const items = window.orderItemsData[orderId] || [];
                        const bogoMealPattern = /^\(\d+\)/;
                        const bogoItems = items.filter(item => bogoMealPattern.test(item.name));

                        if (bogoItems.length > 0 && offer.value !== 0) {
                            const shortNames = bogoItems.map(item => {
                                let shortName = 'Other';
                                if (item.name.includes('Beef')) shortName = 'Beef';
                                else if (item.name.includes('Tofu')) shortName = 'Tofu';
                                else if (item.name.includes('Pork')) shortName = 'Pork';
                                return `${shortName}×${item.quantity}`;
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
                    const bogoPattern = /^\(\d+\)/;
                    const bogoItemsForCount = allItems.filter(item => bogoPattern.test(item.name));

                    let orderTofuCount = 0;
                    let orderPorkCount = 0;
                    let orderBeefCount = 0;

                    // Only count if there's an offer (BOGO items)
                    if (offer.value !== 0 && bogoItemsForCount.length > 0) {
                        bogoItemsForCount.forEach(item => {
                            if (item.name.includes('Tofu')) {
                                orderTofuCount += item.quantity;
                            } else if (item.name.includes('Pork')) {
                                orderPorkCount += item.quantity;
                            } else if (item.name.includes('Beef')) {
                                orderBeefCount += item.quantity;
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
                await new Promise(resolve => setTimeout(resolve, 100));

                // Clean up URL to prevent UUID accumulation
                await cleanupAfterOrder();

                log(` Order ${orderId}: Complete\n`);
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
                // Update status to indicate loading
                const currentCount = window.processedOrderIds.size;
                const loadingText = `Loading more orders... (${currentCount}/${totalOrderCount})`;

                if (SHOW_PROCESSING_OVERLAY) {
                    updateProcessingStatus(loadingText, currentCount, totalOrderCount);
                } else {
                    // Update button text (preserving btn-text structure for progress-fill animation)
                    updateButtonProgress(currentCount, totalOrderCount, loadingText);
                }

                // Scroll down to trigger loading
                scrollableElement.scrollTop = scrollableElement.scrollHeight;
                scrollableElement.scrollTo(0, scrollableElement.scrollHeight);
                const currentVisibleRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');
                const lastRow = currentVisibleRows[currentVisibleRows.length - 1];
                if (lastRow) {
                    lastRow.scrollIntoView({ block: 'end', behavior: 'auto' });
                }
                scrollableElement.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));

                // Wait for loading indicator
                await new Promise(resolve => setTimeout(resolve, 500));
                const loadingIndicator = scrollableElement.querySelector('[role="progressbar"], .loading, i[role="progressbar"]');
                if (loadingIndicator) {
                    let waitCount = 0;
                    while (scrollableElement.querySelector('[role="progressbar"], .loading, i[role="progressbar"]') && waitCount < 20) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        waitCount++;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        log(` Finished processing. ${window.processedOrderIds.size} of ${totalOrderCount} orders processed.`);

        if (window.processedOrderIds.size < totalOrderCount) {
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

                    const offerAbs = Math.abs(offer.value);

                    // STEP 0: Detect and combine split-line items (same item appearing multiple times with qty=1)
                    // This handles cases where Uber Eats displays a BOGO pair as separate line items
                    const itemCountByName = {};
                    items.forEach(item => {
                        if (!itemCountByName[item.name]) {
                            itemCountByName[item.name] = { totalQty: 0, totalPrice: 0, count: 0 };
                        }
                        itemCountByName[item.name].totalQty += item.quantity;
                        itemCountByName[item.name].totalPrice += item.priceValue;
                        itemCountByName[item.name].count++;
                    });

                    // Create consolidated items list for BOGO detection
                    const consolidatedItems = [];
                    for (const [name, data] of Object.entries(itemCountByName)) {
                        consolidatedItems.push({
                            name: name,
                            quantity: data.totalQty,
                            priceValue: data.totalPrice, // Combined price for all instances
                            isSplitLine: data.count > 1 // Flag to track if this was consolidated
                        });
                    }

                    // Log if we detected split-line items
                    const splitLineItems = consolidatedItems.filter(item => item.isSplitLine);
                    if (splitLineItems.length > 0) {
                        logDebug(` Split-line items detected and consolidated:`);
                        splitLineItems.forEach(item => {
                            logDebug(`  - "${item.name}": Combined qty=${item.quantity}, Combined price=£${item.priceValue.toFixed(2)}`);
                        });
                    }

                    // STEP 0.5: Filter to ONLY include BOGO meal combos
                    // BOGO items start with a number in parentheses: "(1)", "(2)", "(3)", etc.
                    // Other items like "Stewed Beef Rice Meal" or "Pork Saozi Noodle Hotpot" are NOT BOGO items
                    const bogoMealPattern = /^\(\d+\)/; // Matches "(1)", "(2)", "(3)", etc. at the start
                    const bogoEligibleItems = consolidatedItems.filter(item => bogoMealPattern.test(item.name));

                    const nonBogoItems = consolidatedItems.filter(item => !bogoMealPattern.test(item.name));
                    if (nonBogoItems.length > 0) {
                        logDebug(` Non-BOGO items excluded from counting:`);
                        nonBogoItems.forEach(item => {
                            logDebug(`  - "${item.name}" (no meal combo prefix, skipping)`);
                        });
                    }

                    // STEP 1: Find all items that could be BOGO candidates (qty >= 2) from BOGO-ELIGIBLE items only
                    const bogoCandidates = bogoEligibleItems.filter(item => item.quantity >= 2);
                    logDebug(` BOGO candidates (qty >= 2): ${bogoCandidates.length} items`);

                    // STEP 2: Check for MULTI-BOGO scenario
                    // Calculate sum of expected BOGO discounts for ALL candidates
                    let totalExpectedDiscount = 0;
                    bogoCandidates.forEach(item => {
                        // BOGO discount is 50% of the unit price (base price ~£18.50 or ~£19.50)
                        const basePrice = item.priceValue / 2; // Price per item in the pair
                        totalExpectedDiscount += basePrice;
                    });

                    const multiBogoMatch = bogoCandidates.length >= 2 && Math.abs(offerAbs - totalExpectedDiscount) < 2.0;

                    logDebug(` Multi-BOGO Check:`);
                    logDebug(`  - Total expected discount (sum of 50% of each): £${totalExpectedDiscount.toFixed(2)}`);
                    logDebug(`  - Offer value: £${offerAbs.toFixed(2)}`);
                    logDebug(`  - Difference: £${Math.abs(offerAbs - totalExpectedDiscount).toFixed(2)}`);
                    logDebug(`  - Is Multi-BOGO: ${multiBogoMatch}`);

                    if (multiBogoMatch) {
                        // MULTI-BOGO: Count each BOGO candidate with HALVED quantity (BOGO pairs, not total items)
                        logDebug(` ✓ MULTI-BOGO DETECTED! Processing ${bogoCandidates.length} items at HALVED quantity:`);
                        let orderItemsDesc = [];
                        bogoCandidates.forEach(item => {
                            const quantityToAdd = Math.floor(item.quantity / 2); // HALVED quantity for BOGO pairs
                            const itemKey = item.name;
                            if (!summaryByDate[date].itemCounts[itemKey]) {
                                summaryByDate[date].itemCounts[itemKey] = 0;
                            }
                            const previousCount = summaryByDate[date].itemCounts[itemKey];
                            summaryByDate[date].itemCounts[itemKey] += quantityToAdd;
                            summaryByDate[date].totalDiscountedItems += quantityToAdd;
                            logDebug(`  - "${itemKey}": ${previousCount} + ${quantityToAdd} = ${summaryByDate[date].itemCounts[itemKey]}`);
                            // Extract short item type (Beef/Tofu/Pork) from name
                            let shortName = 'Other';
                            if (itemKey.includes('Beef')) shortName = 'Beef';
                            else if (itemKey.includes('Tofu')) shortName = 'Tofu';
                            else if (itemKey.includes('Pork')) shortName = 'Pork';
                            orderItemsDesc.push(`${shortName}×${quantityToAdd}`);
                        });
                        // Track order details
                        summaryByDate[date].orderDetails.push({
                            id: orderId,
                            items: orderItemsDesc.join('+'),
                            offer: offer.value
                        });
                    } else {
                        // SINGLE-ITEM BOGO: Use bogoEligibleItems (only meal combos with (1)/(2)/(3) prefix)
                        if (bogoEligibleItems.length === 0) {
                            logDebug(` No BOGO-eligible items found (no items with meal combo prefix)`);
                            logDebug(`========== END ORDER ${orderId} ==========\n`);
                            continue;
                        }
                        const sortedItems = [...bogoEligibleItems].sort((a, b) => b.priceValue - a.priceValue);
                        const highestPricedItem = sortedItems[0];

                        logDebug(` Single-item BOGO check for: "${highestPricedItem.name}"`);

                        const unitPrice = highestPricedItem.priceValue;
                        const expectedBogoDiscount = unitPrice / 2;
                        const diff = Math.abs(offerAbs - expectedBogoDiscount);

                        const qtyCheck = highestPricedItem.quantity >= 2;
                        const diffCheck = diff < 2.0;
                        const isBogo = qtyCheck && diffCheck;

                        logDebug(` BOGO Calculation Details:`);
                        logDebug(`  - Offer value: £${offer.value} (Absolute: £${offerAbs.toFixed(2)})`);
                        logDebug(`  - Unit price of item: £${unitPrice.toFixed(2)}`);
                        logDebug(`  - Expected BOGO discount (50% of unit): £${expectedBogoDiscount.toFixed(2)}`);
                        logDebug(`  - Difference: |${offerAbs.toFixed(2)} - ${expectedBogoDiscount.toFixed(2)}| = ${diff.toFixed(4)}`);
                        logDebug(`  - Quantity check (qty >= 2): ${highestPricedItem.quantity} >= 2 = ${qtyCheck}`);
                        logDebug(`  - Difference check (diff < 2.0): ${diff.toFixed(4)} < 2.0 = ${diffCheck}`);
                        logDebug(`  - FINAL BOGO RESULT: ${isBogo}`);

                        // Always use HALVED quantity - we count BOGO pairs, not total items made
                        const quantityToAdd = Math.floor(highestPricedItem.quantity / 2);
                        logDebug(` Using HALVED quantity: ${quantityToAdd} (BOGO pairs)`);

                        const itemKey = highestPricedItem.name;
                        if (!summaryByDate[date].itemCounts[itemKey]) {
                            summaryByDate[date].itemCounts[itemKey] = 0;
                        }
                        const previousCount = summaryByDate[date].itemCounts[itemKey];
                        summaryByDate[date].itemCounts[itemKey] += quantityToAdd;
                        summaryByDate[date].totalDiscountedItems += quantityToAdd;

                        logDebug(` AGGREGATION: "${itemKey}" ${previousCount} + ${quantityToAdd} = ${summaryByDate[date].itemCounts[itemKey]}`);

                        // Track order details for debugging
                        let shortName = 'Other';
                        if (itemKey.includes('Beef')) shortName = 'Beef';
                        else if (itemKey.includes('Tofu')) shortName = 'Tofu';
                        else if (itemKey.includes('Pork')) shortName = 'Pork';
                        summaryByDate[date].orderDetails.push({
                            id: orderId,
                            items: `${shortName}×${quantityToAdd}`,
                            offer: offer.value
                        });
                    }

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

        Swal.fire({
            title: 'Calculation Complete!',
            html: `
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #DE1135;">£${finalTotalOfferSum.toFixed(2)}</h2>
                    <p style="margin: 5px 0;">Total Offer Sum</p>
                    <h3 style="margin: 10px 0 0 0; color: #333;">£${finalTotalSubtotalSum.toFixed(2)}</h3>
                    <p style="margin: 5px 0;">Total Subtotal Sum</p>
                    <p style="margin: 5px 0; color: #666;">Found <strong>${finalTotalDiscountedItems}</strong> discounted items across <strong>${finalProcessedCount}</strong> processed orders.</p>
                    <p style="margin: 5px 0; color: #999; font-size: 12px;">(Target was ${totalOrderCount})</p>
                </div>
                ${tableHTML}
                <p style="margin-top: 20px; font-size: 12px; color: #666;">The "Offer" and "Issue" columns have been populated in the table.</p>
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
                    log(` Orders loaded: "${resultsText.textContent}" with ${rows.length} rows`);
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
                const recoveryState = loadStateFromSession();
                if (recoveryState) {
                    window.processedOrderIds = new Set(recoveryState.processedOrderIds);
                    window.orderOfferData = recoveryState.orderOfferData;
                    window.orderSubtotalData = recoveryState.orderSubtotalData;
                    window.orderItemsData = recoveryState.orderItemsData;
                    window.orderDateData = recoveryState.orderDateData;
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