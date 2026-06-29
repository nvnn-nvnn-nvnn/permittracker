/**
 * Per-page "How-to" content. Rendered by <PageGuide /> (wired once into the app
 * shell), which looks up the current route here. Keep each guide to a few short,
 * action-oriented steps — it's onboarding, not documentation.
 *
 * Keys are route paths. Dynamic detail routes use `[id]` / `[type]`; the matcher
 * normalizes real ids before lookup, and falls back to the section base.
 */
export interface PageGuide {
  title: string;
  intro?: string;
  steps: string[];
  tip?: string;
}

const GUIDES: Record<string, PageGuide> = {
  "/dashboard": {
    title: "Your dashboard",
    intro: "Home base — whatever needs you soonest surfaces here first.",
    steps: [
      "Scan the “needs attention” area for expiring permits, low stock, and today's numbers.",
      "Use the left sidebar to move between Finances, Inventory, Compliance, and Trucks.",
      "Amber/red badges mean act soon — click through to handle them.",
    ],
  },

  // --- Finances -----------------------------------------------------------
  "/operations": {
    title: "Sales & P&L",
    intro: "Turns Square sales into profit you can read at a glance.",
    steps: [
      "Connect Square with the button up top, then open Locations to map each Square location to a truck.",
      "Hit Sync to pull sales — net sales, food cost, and the profit chart fill in.",
      "Use the pills to switch between All trucks and one truck (a green dot = that truck is connected to Square).",
      "Toggle Daily / Weekly / Monthly to change the time view.",
    ],
    tip: "No data after a sync? The truck may not have a Square location mapped yet.",
  },
  "/operations/square": {
    title: "Square locations",
    steps: [
      "Choose which truck each Square location belongs to.",
      "Sales from a location flow into that truck's P&L and inventory.",
      "Back on Sales & P&L, hit Sync to pull each mapped location's sales.",
    ],
  },
  "/operations/export": {
    title: "QuickBooks export",
    steps: [
      "Pick a date range and click Download CSV.",
      "In QuickBooks, go to Transactions → Import and upload the file.",
      "Live two-way sync is coming; the CSV keeps your books current until then.",
    ],
  },
  "/operations/menu": {
    title: "Menu analysis",
    steps: [
      "See each item's sales matched to its recipe cost and margin.",
      "Items are classified (e.g. star, workhorse) to guide menu decisions.",
      "Add recipes so more items get a cost and margin.",
    ],
  },
  "/expenses": {
    title: "Expenses",
    intro: "Your overhead — everything that isn't ingredients.",
    steps: [
      "Log costs like fuel, commissary rent, wages, and supplies.",
      "Tag an expense to a truck, or leave it business-wide.",
      "Expenses become the Overhead line in your P&L.",
    ],
  },
  "/expenses/new": {
    title: "Add an expense",
    steps: [
      "Enter the amount, date, and a category.",
      "Optionally tag it to a truck (leave blank for business-wide).",
      "Save — it flows into your P&L overhead.",
    ],
  },

  // --- Inventory ----------------------------------------------------------
  "/inventory": {
    title: "Inventory",
    intro: "The raw ingredients your recipes consume.",
    steps: [
      "Add the ingredients you buy, each with a unit and a cost per unit.",
      "On-hand drops automatically as Square sales hit matching recipes.",
      "Low-stock items are flagged; use the truck tabs to view one truck at a time.",
    ],
  },
  "/inventory/new": {
    title: "Add an ingredient",
    steps: [
      "Name it, pick a unit (each, lb, oz…), and set the cost per unit.",
      "Assign it to a truck — each truck keeps its own ingredients.",
      "Set the quantity you currently have on hand.",
    ],
  },
  "/inventory/usage": {
    title: "Inventory usage",
    intro: "Theoretical usage = Square item sales × your recipes.",
    steps: [
      "Review how much of each ingredient your sales should have used.",
      "Empty after a sync? Click Recompute usage (recipes must exist and match item names).",
      "This is theoretical food cost — physical counts remain the source of truth.",
    ],
  },
  "/inventory/counts": {
    title: "Inventory counts",
    intro: "A count records what you physically have on a given date.",
    steps: [
      "Start a new count and enter what's actually on the shelf.",
      "Two counts + purchases between them = your actual food cost (incl. waste/shrink).",
      "Counts reconcile on-hand back to reality.",
    ],
  },
  "/inventory/counts/new": {
    title: "New inventory count",
    steps: [
      "Pick the truck and the count date.",
      "Enter the counted quantity for each ingredient.",
      "Save — it sets the truck's on-hand and feeds actual food cost.",
    ],
  },
  "/recipes": {
    title: "Recipes",
    intro: "A recipe is the ingredient list behind one menu item.",
    steps: [
      "Name the recipe exactly like its Square item so sales deplete the right stock.",
      "List each ingredient and the amount used per serving.",
      "Each truck has its own recipes.",
    ],
  },
  "/recipes/new": {
    title: "New recipe",
    steps: [
      "Name it to match the Square menu item it represents.",
      "Add ingredient lines with the quantity used per serving.",
      "Save — future synced sales of this item will deplete these ingredients.",
    ],
  },
  "/recipes/[id]": {
    title: "Edit recipe",
    steps: [
      "Adjust ingredient lines or quantities; the cost updates automatically.",
      "After changes, run Recompute usage on the Inventory usage page to apply them.",
    ],
  },
  "/purchasing": {
    title: "Purchasing",
    intro: "Buying ingredients from suppliers.",
    steps: [
      "Create a purchase order for what you're ordering.",
      "When it arrives, mark the PO Received — it adds to on-hand and records the spend.",
      "Received purchases drive the food-cost line in your P&L.",
    ],
  },
  "/purchasing/new": {
    title: "New purchase order",
    steps: [
      "Pick the truck and supplier.",
      "Add ingredient lines with quantity and unit cost.",
      "Save as draft; mark Received when it arrives to update inventory.",
    ],
  },
  "/purchasing/[id]": {
    title: "Purchase order",
    steps: [
      "Review or edit the order's lines.",
      "Mark Received when it arrives to bump on-hand and log the spend.",
    ],
  },

  // --- Compliance ---------------------------------------------------------
  "/items": {
    title: "Compliance items",
    intro: "Permits, licenses, inspections, certs, and insurance.",
    steps: [
      "Add each item with its expiry date — we remind you before it lapses.",
      "Statuses move green → amber → red as expiry approaches.",
      "Renew in real life, then update the date here (we never mark it renewed for you).",
    ],
  },
  "/items/new": {
    title: "Add a compliance item",
    steps: [
      "Pick the type (permit, license, inspection…) and the truck/holder.",
      "Enter the number and the expiry date.",
      "Attach a photo or PDF — we can read key details for you to confirm.",
    ],
  },
  "/items/[id]": {
    title: "Compliance item",
    steps: [
      "Review the details, attachments, and reminder schedule.",
      "When you renew, update the expiry date to reset the reminders.",
    ],
  },
  "/items/category/[type]": {
    title: "Items by type",
    steps: [
      "All compliance items of this type across your trucks.",
      "Watch the amber/red badges for what's expiring next.",
    ],
  },
  "/digest": {
    title: "Inspection prep",
    steps: [
      "A clean summary of your compliance status for an inspector.",
      "Use it to spot and close gaps before an inspection.",
    ],
  },
  "/commissaries": {
    title: "Commissaries",
    steps: [
      "Record your commissary / base of operations and its agreement.",
      "Link trucks to a commissary to satisfy that compliance requirement.",
    ],
  },
  "/venues": {
    title: "Venues",
    steps: [
      "Save the places you serve — markets, events, lots.",
      "Attach venue permits/COIs and link them to events.",
    ],
  },
  "/people": {
    title: "People",
    steps: [
      "Add staff and their certifications (food handler, manager…).",
      "Cert expiries are tracked and reminded like any compliance item.",
    ],
  },
  "/events": {
    title: "Events",
    steps: [
      "Schedule where and when each truck is serving.",
      "Tie an event to a venue to keep its permits handy.",
    ],
  },

  // --- Trucks -------------------------------------------------------------
  "/trucks": {
    title: "Trucks",
    intro: "Each truck is its own unit — sales, inventory, recipes, and permits.",
    steps: [
      "Add a truck to start tracking it.",
      "From a truck's page, set its service status and current location.",
      "Then connect its Square location and add its recipes/inventory.",
    ],
  },
  "/trucks/new": {
    title: "Add a truck",
    steps: [
      "Name the truck and set its basic details.",
      "After saving, connect its Square location and add recipes/inventory.",
    ],
  },
  "/trucks/[id]": {
    title: "Truck details",
    steps: [
      "See this truck's status, compliance, and service info in one place.",
      "Set Open/Closed and the current location for the day.",
    ],
  },
  "/modifications": {
    title: "Truck log",
    steps: [
      "Log modifications and service — equipment, repairs, upgrades.",
      "Keeps the change history some jurisdictions require.",
    ],
  },

  // --- Account ------------------------------------------------------------
  "/settings": {
    title: "Settings",
    steps: [
      "Manage your account, plan, and billing.",
      "Set notification preferences and invite staff with roles.",
    ],
  },
  "/admin": {
    title: "Admin",
    steps: ["Platform tools — accounts, the OCR review queue, and digests."],
  },
};

const UUID_RE =
  /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/** Resolve the guide for a route, normalizing dynamic segments. */
export function getPageGuide(pathname: string): PageGuide | null {
  if (GUIDES[pathname]) return GUIDES[pathname];

  // Real ids → [id]; e.g. /recipes/3f2c… → /recipes/[id].
  const byId = pathname.replace(UUID_RE, "/[id]");
  if (GUIDES[byId]) return GUIDES[byId];

  // /items/category/<type> → /items/category/[type].
  const byType = byId.replace(/\/category\/[^/]+$/, "/category/[type]");
  if (GUIDES[byType]) return GUIDES[byType];

  // Fall back to the closest section base.
  const segs = pathname.split("/").filter(Boolean);
  for (let i = segs.length - 1; i >= 1; i--) {
    const base = `/${segs.slice(0, i).join("/")}`;
    if (GUIDES[base]) return GUIDES[base];
  }
  return null;
}
