# Uber Eats Offer Calculator Automation

A Tampermonkey/Violentmonkey userscript that automates the extraction and calculation of BOGO (Buy One Get One) offer data from the Uber Eats Manager portal.

## Features

- **Automatic Offer Detection**: Scrapes "Offers on items" data from each order's detail drawer
- **BOGO Calculation**: Intelligently detects and calculates Buy One Get One promotions
- **Multi-BOGO Support**: Handles orders with multiple different BOGO items
- **Running Count Columns**: Live tracking of Tofu, Pork, and Beef item counts as orders are processed
- **Summary by Date**: Aggregates data with breakdown by date, item type, and offer values
- **SPA Navigation Support**: Works seamlessly when navigating within the Uber Eats portal
- **Auto-Recovery**: Saves progress and resumes if the page reloads mid-processing
- **Wake Lock**: Keeps screen on during long processing sessions
- **Cross-Device Sync**: Auto-updates from GitHub on all devices

## Installation

### Desktop (Chrome, Firefox, Edge)

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click the link below to install the script:
   
   **[Install Script](https://raw.githubusercontent.com/lukez42/Ubereats_Offer_Cal_Automation/main/Tampermonkey/offer_cal_automation.user.js)**

3. Tampermonkey will show an install dialog - click "Install"

### Android (Kiwi Browser)

1. Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) from Play Store
2. Install **Violentmonkey** extension from Chrome Web Store (recommended over Tampermonkey for Android)
3. Enable Developer Mode:
   - Go to `chrome://flags`
   - Search for "Extensions on chrome:// URLs" and enable it
   - Restart Kiwi Browser
4. Navigate to the script URL:
   ```
   https://raw.githubusercontent.com/lukez42/Ubereats_Offer_Cal_Automation/main/Tampermonkey/offer_cal_automation.user.js
   ```
5. Violentmonkey will offer to install - click "Confirm installation"

## Usage

1. Log into [Uber Eats Manager](https://merchants.ubereats.com/manager/)
2. Navigate to **Orders** → **History**
3. Select your desired date range
4. Click the green **"Fetch Offer Data"** button (bottom-right corner)
5. Wait for processing to complete (progress shown on button)
6. View the summary popup with totals and breakdown by date

### Table Columns Added

The script adds these columns to the orders table:

| Column | Description |
|--------|-------------|
| **Offer** | The offer type detected (e.g., "BOGO") |
| **Issue (Scraped)** | Any issues flagged on the order |
| **Items Detected** | BOGO items found (e.g., "Beef×1, Tofu×2") |
| **Offer Value** | The discount amount in £ |
| **Tofu #** | Running count of Tofu BOGO items |
| **Pork #** | Running count of Pork BOGO items |
| **Beef #** | Running count of Beef BOGO items |

## How It Works

1. **Scroll & Load**: Automatically scrolls to load all orders in the infinite scroll list
2. **Open Drawers**: Clicks each order row to open the detail drawer
3. **Extract Data**: Scrapes offer values, items, dates, and subtotals from the drawer
4. **BOGO Detection**: Analyzes item prices and quantities to identify BOGO promotions
5. **Aggregate**: Sums up all offers and groups by date with item breakdowns
6. **Display**: Shows a comprehensive summary popup and populates table columns

### BOGO Logic

The script detects BOGO promotions by:
- Looking for items with quantity ≥ 2
- Matching offer value to ~50% of the item's unit price
- Only counting items with BOGO meal combo prefixes (e.g., "(1)", "(2)")
- Handling multi-BOGO orders (e.g., 2× Beef + 2× Tofu in same order)

## Auto-Updates

The script automatically checks for updates from this GitHub repository. To manually update:

1. Open Tampermonkey/Violentmonkey dashboard
2. Click "Check for updates"
3. The script will update if a new version is available

Version updates are tracked in the `@version` header.

## Troubleshooting

### Button Not Appearing

- **Ensure script is active**: Check the extension icon shows the script running
- **Wait for page load**: The button appears after "Showing X results" is visible
- **Try refreshing**: Hard refresh with Ctrl+Shift+R (Cmd+Shift+R on Mac)

### Android: "Enable Developer Mode" Message

1. Go to `chrome://flags`
2. Enable "Extensions on chrome:// URLs"
3. Restart Kiwi Browser
4. If still not working, try Violentmonkey instead of Tampermonkey

### Orders Not Processing

- **Check console**: Open DevTools (F12) and look for `[UberEats Script]` logs
- **URL issues**: If URL gets corrupted, the script will auto-recover by reloading
- **Cancelled orders**: These are automatically excluded from calculations

### Incorrect Item Counts

- Only items with BOGO meal combo prefixes are counted
- Quantities are halved (counting BOGO pairs, not total items)
- Split-line items (same item on multiple lines) are consolidated

## Development

### File Structure

```
Ubereats_Offer_Cal_Automation/
├── Tampermonkey/
│   └── offer_cal_automation.user.js  # Main userscript
├── README.md                          # This file
└── LICENSE                            # MIT License
```

### Making Changes

1. Edit `offer_cal_automation.user.js`
2. Increment the `@version` number
3. Commit and push to GitHub:
   ```bash
   git add -A
   git commit -m "Description of changes"
   git push
   ```
4. All devices will auto-update on next check

### Key Functions

| Function | Purpose |
|----------|---------|
| `processOrders()` | Main entry point - orchestrates the scraping process |
| `extractOfferDataFromDrawer()` | Extracts offer value from order detail drawer |
| `extractItemsFromDrawer()` | Parses item names, quantities, and prices |
| `openDrawerForRow()` | Handles clicking order rows with retry logic |
| `initializeOnOrdersPage()` | Sets up the button and observers |

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

Built with assistance from AI (Gemini/Claude)

---

**Note**: This script is for personal use to help calculate BOGO offer totals. It interacts with the Uber Eats Manager portal DOM and may break if Uber updates their UI. Report issues on GitHub.
