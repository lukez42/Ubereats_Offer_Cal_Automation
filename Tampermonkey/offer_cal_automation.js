// ==UserScript==
// @name         Uber Eats - Get Offer Data (v7 - Patient Scroll & Fetch)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  This script patiently scrolls to load all orders, then processes them one-by-one, waiting for the GraphQL data for each before continuing.
// @author       Gemini Assistant
// @match        https://merchants.ubereats.com/manager/orders*
// @grant        GM_addStyle
// @grant        window.fetch
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// ==/UserScript==

/* --- This is the CSS that styles the new button and offer text --- */
GM_addStyle(`
    #fetch-offer-data-btn {
        margin-left: 20px;
        padding: 10px 16px;
        background-color: #06C167; /* Uber's green */
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
    }
    #fetch-offer-data-btn:hover {
        background-color: #059c52;
    }
    #fetch-offer-data-btn.loading {
        background-color: #5E5E5E;
        cursor: not-allowed;
    }
    .th-offer, .th-issue {
        text-align: left;
        padding: 16px 16px 16px 0;
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
`);

(function() {
    'use strict';

    // --- 1. A global store to hold the data we intercept ---
    window.orderOfferData = {};
    window.orderIssueData = {};
    window.processedOrderIds = new Set(); // Keep track of processed orders

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
                console.log(`[UberEats Script] waitForDrawerOpen: Found ${closeButtons.length} Close buttons`);

                for (const closeBtn of closeButtons) {
                    // Check if the close button is actually visible
                    if (closeBtn.offsetParent !== null) {
                        console.log(`[UberEats Script] waitForDrawerOpen: Found visible Close button`);
                        // Find the drawer container - it's the ancestor with data-baseweb="drawer"
                        const drawer = closeBtn.closest('div[data-baseweb="drawer"]');
                        if (drawer) {
                            console.log(`[UberEats Script] waitForDrawerOpen: Found drawer element via Close button`, drawer.className);
                            clearInterval(interval);
                            resolve(drawer);
                            return;
                        } else {
                            // If no data-baseweb="drawer", just use a parent container
                            const drawerContainer = closeBtn.closest('div[class*="_ap"]') || closeBtn.parentElement.parentElement;
                            console.log(`[UberEats Script] waitForDrawerOpen: Found drawer container (no data-baseweb)`, drawerContainer ? drawerContainer.className : 'null');
                            clearInterval(interval);
                            resolve(drawerContainer);
                            return;
                        }
                    }
                }

                totalTime += intervalTime;
                if (totalTime >= timeout) {
                    console.log(`[UberEats Script] waitForDrawerOpen: Timeout after ${timeout}ms`);
                    // Log all elements to debug
                    console.log(`[UberEats Script] All elements with data-baseweb="drawer":`, document.querySelectorAll('div[data-baseweb="drawer"]'));
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

    function simulateClick(element) {
        if (!element) return;
        if (element.focus) {
            element.focus({ preventScroll: true });
        }
        const baseEvent = {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 1,
            composed: true
        };
        try {
            if (typeof PointerEvent === 'function') {
                element.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', ...baseEvent }));
            }
        } catch (_) {}
        element.dispatchEvent(new MouseEvent('mousedown', baseEvent));
        try {
            if (typeof PointerEvent === 'function') {
                element.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', ...baseEvent }));
            }
        } catch (_) {}
        element.dispatchEvent(new MouseEvent('mouseup', baseEvent));
        element.dispatchEvent(new MouseEvent('click', baseEvent));
        if (typeof element.click === 'function') {
            element.click();
        }
    }

    async function openDrawerForRow(row, attempts = 4) {
        if (!row) return null;
        let lastDrawer = null;
        for (let i = 0; i < attempts; i++) {
            // Try clicking the row itself first, as this is what users do
            const clickable = row;
            console.log(`[UberEats Script] openDrawerForRow attempt ${i+1}/${attempts}: clicking row`, clickable.tagName);

            // Use native click on the row
            if (clickable.click) {
                clickable.click();
            }

            console.log(`[UberEats Script] openDrawerForRow attempt ${i+1}/${attempts}: waiting for drawer...`);
            lastDrawer = await waitForDrawerOpen(6000);
            if (lastDrawer) {
                console.log(`[UberEats Script] openDrawerForRow attempt ${i+1}/${attempts}: drawer opened successfully`);
                return lastDrawer;
            }
            console.log(`[UberEats Script] openDrawerForRow attempt ${i+1}/${attempts}: no drawer appeared, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return lastDrawer;
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
            console.log(`[UberEats Script] extractOfferDataFromDrawer: No drawer provided`);
            return { text: "—", value: 0 };
        }

        // Method 1: Look for the div structure with "Offers on items" text
        const allParagraphs = drawer.querySelectorAll('p');
        console.log(`[UberEats Script] extractOfferDataFromDrawer: Found ${allParagraphs.length} paragraphs in drawer`);

        // Log first 10 paragraph texts for debugging
        const paragraphTexts = Array.from(allParagraphs).slice(0, 15).map(p => p.textContent.trim());
        console.log(`[UberEats Script] extractOfferDataFromDrawer: First 15 paragraph texts:`, paragraphTexts);

        for (const paragraph of allParagraphs) {
            const label = paragraph.textContent ? paragraph.textContent.trim() : "";
            if (!label) continue;

            // Look for "Offers on items" (with or without VAT text)
            if (/Offers on items/i.test(label)) {
                console.log(`[UberEats Script] extractOfferDataFromDrawer: Found "Offers on items" in paragraph: "${label}"`);

                // The value is in a sibling element. Walk up to find the parent container
                const parentBlock = paragraph.closest('div[data-baseweb="block"]');
                if (parentBlock) {
                    console.log(`[UberEats Script] extractOfferDataFromDrawer: Found parent block`);
                    // Look for the sibling block that contains the value
                    const valueBlock = parentBlock.nextElementSibling;
                    if (valueBlock) {
                        const valueText = valueBlock.textContent;
                        console.log(`[UberEats Script] extractOfferDataFromDrawer: Found value in next sibling: "${valueText}"`);
                        return sanitizeOfferValue(valueText);
                    }
                }

                // Fallback: look for any paragraph or monoparagraph near this one
                const nearbyMonoParagraphs = paragraph.parentElement.parentElement.querySelectorAll('p[data-baseweb="typo-monoparagraphmedium"]');
                for (const monoPara of nearbyMonoParagraphs) {
                    const text = monoPara.textContent.trim();
                    if (text.includes('-') || text.includes('£')) {
                        console.log(`[UberEats Script] extractOfferDataFromDrawer: Found value in nearby monoparagraph: "${text}"`);
                        return sanitizeOfferValue(text);
                    }
                }
            }
        }

        console.log(`[UberEats Script] extractOfferDataFromDrawer: No "Offers on items" found, returning default`);
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

    // Adds the "Offer" and "Issue" columns if they don't exist
    function setupTableColumns() {
        const headerRow = document.querySelector('table > tbody > tr:has(th)');
        if (!headerRow) return false; // Table not ready

        const subtotalHeader = headerRow.lastElementChild;
        if (!subtotalHeader) return false; // Table row is empty

        // Add "Offer" Header
        if (!headerRow.querySelector('.th-offer')) {
            const newHeader = document.createElement('th');
            newHeader.className = "_c1 _ez _c2 _f0 _qs _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _hr _il _i5 _ik th-offer";
            newHeader.innerHTML = `<div class="_af _ag _h7"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm">Offer</div></div>`;
            headerRow.insertBefore(newHeader, subtotalHeader);
        }

        // Add "Issue (Scraped)" Header
        if (!headerRow.querySelector('.th-issue')) {
            const newIssueHeader = document.createElement('th');
            newIssueHeader.className = "_c1 _ez _c2 _f0 _qs _al _e5 _ea _e6 _e9 _b9 _c0 _f9 _fj _hr _il _i5 _ik th-issue";
            newIssueHeader.innerHTML = `<div class="_af _ag _h7"><div data-baseweb="typo-labelsmall" class="_c0 _c1 _c2 _di _cm">Issue (Scraped)</div></div>`;
            headerRow.insertBefore(newIssueHeader, subtotalHeader);
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
        if (!document.querySelector('.th-offer')) return; // Columns not ready

        const orderRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');
        orderRows.forEach(row => {
            const subtotalCell = row.lastElementChild;
            if (!subtotalCell) return;

            if (!row.querySelector('.td-offer')) {
                const offerCell = document.createElement('td');
                offerCell.className = 'td-no-offer td-offer';
                row.insertBefore(offerCell, subtotalCell);
            }
            if (!row.querySelector('.td-issue')) {
                const issueCell = document.createElement('td');
                issueCell.className = 'td-no-offer td-issue';
                row.insertBefore(issueCell, subtotalCell);
            }
        });
    }

    // --- 4. Main function to process the orders ---
    async function processOrders() {
        const button = document.getElementById('fetch-offer-data-btn');
        if (button.classList.contains('loading')) return;
        button.classList.add('loading');

        // Clear data from any previous runs
        window.orderOfferData = {};
        window.orderIssueData = {};
        window.processedOrderIds = new Set();
        let totalOfferSum = 0;
        let ordersWithOffers = 0;

        // 1. Get total count
        const totalOrderCount = getTotalOrderCount();
        if (totalOrderCount === null) {
            Swal.fire('Error', 'Could not find total order count (e.g., "Showing 76 results"). Make sure it is visible on the page.', 'error');
            button.classList.remove('loading');
            return;
        }

        // 2. Setup columns
        if (!setupTableColumns()) {
            Swal.fire('Error', 'Could not find the orders table.', 'error');
            button.classList.remove('loading');
            return;
        }

        // 3. Scroll to load all rows
        const scrollableElement = document.querySelector('.infinite-scroll-component');
        if (!scrollableElement) {
             Swal.fire('Error', 'Could not find the scrollable order list.', 'error');
             button.classList.remove('loading');
             return;
        }

        console.log(`[UberEats Script] Starting scroll to load ${totalOrderCount} orders...`);
        console.log(`[UberEats Script] Scrollable element:`, scrollableElement);
        console.log(`[UberEats Script] Initial scrollHeight: ${scrollableElement.scrollHeight}, clientHeight: ${scrollableElement.clientHeight}`);

        let allRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');
        let lastRowCount = allRows.length;
        let attempts = 0;
        const maxScrollAttempts = 50;
        let stuckCount = 0;

        while (allRows.length < totalOrderCount && attempts < maxScrollAttempts) {
            attempts++;
            const oldScrollTop = scrollableElement.scrollTop;
            const oldScrollHeight = scrollableElement.scrollHeight;

            button.textContent = `Loading... (${allRows.length}/${totalOrderCount})`;
            console.log(`[UberEats Script] Scroll attempt ${attempts}: ${allRows.length}/${totalOrderCount} rows loaded`);
            console.log(`[UberEats Script] Before scroll - scrollTop: ${oldScrollTop}, scrollHeight: ${oldScrollHeight}`);

            // Try multiple scroll methods
            // Method 1: Set scrollTop
            scrollableElement.scrollTop = scrollableElement.scrollHeight;

            // Method 2: Use scrollTo
            scrollableElement.scrollTo(0, scrollableElement.scrollHeight);

            // Method 3: Use scrollIntoView on the last row
            const lastRow = allRows[allRows.length - 1];
            if (lastRow) {
                lastRow.scrollIntoView({ block: 'end', behavior: 'auto' });
            }

            // Method 4: Dispatch wheel event to trigger scroll
            scrollableElement.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));

            console.log(`[UberEats Script] After scroll - scrollTop: ${scrollableElement.scrollTop}`);

            // Wait for loading indicator to appear and disappear
            await new Promise(resolve => setTimeout(resolve, 500));
            const loadingIndicator = scrollableElement.querySelector('[role="progressbar"], .loading, i[role="progressbar"]');
            if (loadingIndicator) {
                console.log(`[UberEats Script] Found loading indicator, waiting for it to disappear...`);
                let waitCount = 0;
                while (scrollableElement.querySelector('[role="progressbar"], .loading, i[role="progressbar"]') && waitCount < 20) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    waitCount++;
                }
                console.log(`[UberEats Script] Loading indicator gone or timeout`);
            }

            // Wait for new rows to load
            await new Promise(resolve => setTimeout(resolve, 1500));
            updateNewRows();
            allRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]');

            console.log(`[UberEats Script] After wait - scrollHeight: ${scrollableElement.scrollHeight}, rows: ${allRows.length}`);

            if (allRows.length === lastRowCount) {
                stuckCount++;
                console.log(`[UberEats Script] No new rows loaded (stuck count: ${stuckCount})`);
                if (stuckCount >= 5) {
                    console.log(`[UberEats Script] Giving up after ${stuckCount} attempts with no growth`);
                    break;
                }
            } else {
                stuckCount = 0;
            }
            lastRowCount = allRows.length;
        }

        console.log(`[UberEats Script] Finished scrolling. Loaded ${allRows.length} of ${totalOrderCount} orders`);

        if (allRows.length < totalOrderCount) {
             Swal.fire('Loading Warning', `Only found ${allRows.length} of ${totalOrderCount} orders after scrolling. Proceeding with the ${allRows.length} visible orders.`, 'warning');
        }

        // 4. All rows are loaded. Now, process them ONE BY ONE.
        allRows = document.querySelectorAll('tr[data-testid="ordersRevamped-row"]'); // Get final list
        const totalRowsToProcess = allRows.length;
        let i = 0;

        console.log(`[UberEats Script] Processing ${totalRowsToProcess} orders...`);
        for (const row of allRows) {
            i++;
            const currentCount = window.processedOrderIds.size;
            button.textContent = `Processing... (${currentCount + 1}/${totalRowsToProcess})`;

            const orderIdEl = row.querySelector('td:first-child div[role="button"]');
            if (!orderIdEl) {
                console.log(`[UberEats Script] Row ${i}: No order ID button found`);
                continue;
            }

            const orderId = (orderIdEl.textContent || '').trim();
            if (window.processedOrderIds.has(orderId)) {
                console.log(`[UberEats Script] Row ${i} (${orderId}): Already processed, skipping`);
                continue;
            }

            console.log(`[UberEats Script] Row ${i} (${orderId}): Starting processing`);

            // Click the row to trigger the fetch
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 300));

            console.log(`[UberEats Script] Row ${i} (${orderId}): Attempting to open drawer...`);
            let drawer = await openDrawerForRow(row, 4);
            let offer = { text: "—", value: 0 };
            let issue = "—";

            if (drawer) {
                console.log(`[UberEats Script] Row ${i} (${orderId}): Drawer opened, waiting for content...`);
                await waitForDrawerContent(drawer, 8000);
                offer = extractOfferDataFromDrawer(drawer);
                issue = extractIssueDataFromDrawer(drawer);
                console.log(`[UberEats Script] Row ${i} (${orderId}): Extracted offer="${offer.text}", issue="${issue}"`);
            } else {
                console.log(`[UberEats Script] Row ${i} (${orderId}): Drawer timeout - could not open`);
                issue = "Drawer timeout";
            }

            window.orderOfferData[orderId] = offer;
            window.orderIssueData[orderId] = issue;

            if (offer.value !== 0 && !isNaN(offer.value)) {
                totalOfferSum += offer.value;
                ordersWithOffers++;
            }

            // Update the cell with the intercepted data
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

            window.processedOrderIds.add(orderId);

            // Close the drawer
            let closeButton = null;
            if (drawer) {
                // Try multiple ways to find the close button
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
                console.log(`[UberEats Script] Row ${i} (${orderId}): Closing drawer`);
                closeButton.click();
            } else {
                console.log(`[UberEats Script] Row ${i} (${orderId}): No close button found, drawer may auto-close`);
            }

            // Wait for the drawer to be fully gone
            await waitForElementToDisappear('button[aria-label="Close"]', 5000);
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log(`[UberEats Script] Row ${i} (${orderId}): Complete\n`);
        }

        // --- 5. Final report ---
        button.textContent = 'Fetch Offer Data';
        button.classList.remove('loading');

        // **FIX:** Use the correct variable for the "processed" count
        const finalProcessedCount = window.processedOrderIds.size;

        Swal.fire({
            title: 'Calculation Complete!',
            html: `
                <strong>Total Offer Sum: ${totalOfferSum.toFixed(2)}</strong><br>
                Found in <strong>${ordersWithOffers}</strong> out of
                <strong>${finalProcessedCount}</strong> processed orders.
                (Target was ${totalOrderCount})
                <br><br>
                The "Offer" and "Issue" columns have been populated.
            `,
            icon: 'success'
        });
    }

    // --- 6. Function to add the button to the page ---
    function addButton() {
        const heading = document.querySelector('h1[data-baseweb="heading"]');
        if (heading && !document.getElementById('fetch-offer-data-btn')) {
            const button = document.createElement('button');
            button.id = 'fetch-offer-data-btn';
            button.textContent = 'Fetch Offer Data';
            heading.parentElement.appendChild(button);
            button.addEventListener('click', processOrders);
        }
    }

    // --- Use an observer to add the button and new cells ---
    // This runs once when the script loads
    const initialLoadObserver = new MutationObserver((mutations, observer) => {
        // Look for the "Showing X results" text
        const resultsText = findElementByText('div', 'Showing', 'results');
        if (resultsText) {
            addButton(); // Add the button
            updateNewRows(); // Add cells to rows that are already there
            observer.disconnect(); // Stop this observer, we are done

            // Start a new observer just for scrolling
            const scrollObserver = new MutationObserver(() => {
                updateNewRows();
            });
            const targetNode = document.querySelector('.infinite-scroll-component');
            if (targetNode) {
                scrollObserver.observe(targetNode, { childList: true });
            }
        }
    });

    const targetNode = document.getElementById('root');
    if (targetNode) {
        initialLoadObserver.observe(targetNode, { childList: true, subtree: true });
    }

})();
