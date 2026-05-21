# Profit View Design

## Goal

Add a dedicated Profit View so the business owner can understand both current inventory value and profit from items already sold.

The feature uses existing product fields:

- Cost Price
- Selling Price
- Quantity

It does not require a database migration and does not change how sales profit is recorded.

## Scope

Profit View will calculate values for two separate sections:

- Remaining inventory answers: "What is the value and expected profit of stock currently on hand?"
- Sold items answers: "What revenue, cost, and profit have already been realized from completed sales?"

These sections must stay visually separate so sold items are not double-counted inside current stock value.

## Calculations

For each remaining product:

- Profit per item = Selling Price - Cost Price
- Total cost value = Cost Price x Quantity
- Total selling value = Selling Price x Quantity
- Expected profit = Total selling value - Total cost value
- Margin = Expected profit / Total selling value

For all remaining inventory:

- Total Cost Price = sum of all product cost values
- Total Selling Price = sum of all product selling values
- Total Expected Profit = sum of all expected product profits
- Overall Margin = Total Expected Profit / Total Selling Price

For sold items:

- Sold Revenue = sum of saved sale totals
- Sold Cost = sum of saved sale cost values
- Sold Profit = sum of saved sale profits
- Sold Margin = Sold Profit / Sold Revenue

Products with missing or zero values will still render, but their calculated values will be treated as zero.

## UI Placement

The feature will live inside the existing More screen as a third segmented tab:

`Expenses | Reports | Profit View`

This avoids crowding the bottom navigation, which already has five tabs.

Profit View will include:

- A Current Stock section with Total Cost Price, Total Selling Price, Expected Profit, and Margin
- A Sold Items section with Sold Revenue, Sold Cost, Sold Profit, and Sold Margin
- A product-by-product current stock valuation list
- A recent sold-items profit list based on saved sales
- Empty state when no products exist

## Product Form Preview

The Add/Edit Product sheet will show live calculations while the user types:

- Profit per item
- Total expected profit for the quantity entered

This helps the user immediately confirm whether a product is profitable before saving it.

## Data Flow

All calculations happen in React from the existing `products` state.

Saving or editing a product already updates IndexedDB through Dexie and refreshes local state. Profit View will automatically update because it derives from that state.

No Supabase, server, or new local database table is required for this feature.

Saved sales already store total and profit. To calculate Sold Cost robustly, the app can derive it as `sale.total - sale.profit` for existing sales. This preserves compatibility with sales already recorded on the live app.

## Error Handling

Invalid or empty numeric fields will be normalized to zero in calculations.

If selling price is lower than cost price, the product row will show a negative expected profit clearly instead of hiding it.

## Testing

Verification should cover:

- Product sheet live profit changes when cost, selling price, or quantity changes
- Profit View totals update after adding a product
- Profit View totals update after editing a product
- Profit View totals update after deleting a product
- Sold Items totals reflect existing saved sales
- Build succeeds
- Browser install gate still loads without console errors
