# Code 03 — Server vs Client components, in actual code

Goal: see, in real files, what runs on the server, what runs in the browser,
how data crosses the boundary, and how a write refreshes the screen.

Read codes 01–02 first; this is the layer the user actually sees.

---

## 1. The shape (pattern)

Next.js App Router: **every component is a Server Component by default.** It
runs on the server, can `await` data directly, ships zero JS for itself.
Add the string **`"use client"`** at the top of a file and it (and its
imports) become a Client Component: runs in the browser, can use state /
events / effects, ships JS.

The winning pattern:

```
Server Component  → fetch data (securely, on the server)
      │ passes data as props ▼
Client Component  → interactivity (forms, buttons, state)
      │ calls a tRPC mutation ▼
   server          → writes, returns
      ▲ router.refresh() ─ re-runs the Server Component with fresh data
```

Server fetches, client interacts, refresh re-syncs. That's the loop.

---

## 2. A Server Component — the trucks list

File: [`app/(app)/trucks/page.tsx`](../../app/\(app\)/trucks/page.tsx).

```tsx
export const dynamic = "force-dynamic";

export default async function TrucksPage() {
  const api = await serverApi();
  const trucks = await api.truck.list();
  return ( /* ...maps trucks to <Card> links... */ );
}
```

- **`async function` component** — only Server Components can be `async` and
  `await` directly in the body. No `useEffect`, no loading spinner: the HTML
  arrives with the data already in it.
- **`serverApi()`** ([`lib/trpc/server.ts`](../../lib/trpc/server.ts)) — a
  *server-side caller* for the same tRPC routers the browser uses. So
  "list trucks for my account" is written **once** (code note 01) and reused
  here — no duplicate SQL, same account scoping.
- **`export const dynamic = "force-dynamic"`** — tells Next "this depends on
  the logged-in user, never statically cache it." Without it Next might
  serve one user's prerendered trucks to everyone.
- No `"use client"` anywhere → the browser gets HTML, **no JavaScript for
  this page**, and the DB/service-role credentials never leave the server.

There's no `onClick` here, and that's the tell: a list you only *look at* is
server-rendered.

---

## 3. A Client Component — the truck form

File: [`components/features/truck-form.tsx`](../../components/features/truck-form.tsx).

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";

export function TruckForm({ truck }: { truck?: Truck }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.truck.create.useMutation({ onSuccess: onDone });
  // ...
  async function onDone() {
    router.push("/trucks");
    router.refresh();          // ← re-runs the Server Component above
  }
}
```

- **`"use client"`** (line 1) — required because this file uses `useState`,
  an `onSubmit` handler, and the tRPC React hooks. All browser-only.
- **`trpc.truck.create.useMutation()`** — the browser half of code note 01.
  Fully typed from the server router; gives `isPending`, `onSuccess`,
  `onError`.
- **`router.refresh()`** — the key trick. After a successful write it tells
  Next to **re-run the Server Components** for the current route. The trucks
  list (server) re-fetches and re-renders with the new truck — without a
  full page reload and without client-side cache juggling. Server owns the
  data; the client just asks it to refresh.
- **`truck?: Truck`** — same component does "create" (no prop) and "edit"
  (prop passed by the server detail page). Props are how server→client data
  travels. Note: only **serializable** data crosses (objects, strings,
  dates) — you can't pass a DB handle or a function with closures over server
  secrets.

---

## 4. Mixed page — server shell + client islands

File: [`app/(app)/items/[id]/page.tsx`](../../app/\(app\)/items/\[id\]/page.tsx)
(a Server Component) renders client "islands":

```tsx
const item = await api.item.byId({ id });        // server fetch
const history = await listAuditForEntity(...);   // server fetch
return (
  <>
    <ItemForm item={item} trucks={trucks} />     {/* client island */}
    <DocumentsPanel complianceItemId={item.id} />{/* client island */}
    <RemindersPanel complianceItemId={item.id} />{/* client island */}
    {/* audit list rendered right here = server, no JS */}
  </>
);
```

The page is server-rendered (fast, secure data access). Only the genuinely
interactive parts are client components, and they're kept small. The audit
trail is plain server JSX — no interactivity, so no JS shipped for it. This
"server shell, small client islands" layout is the whole app's structure.

---

## 5. Why the split matters (remove it → what breaks)

| Mistake | Consequence |
|---|---|
| Put `"use client"` on the items page | DB queries + service-role key would run in the browser → security hole + it simply won't compile (`server-only` imports throw). |
| Fetch in the client with `useEffect` instead of server `await` | Slower (waterfall: page → JS → fetch → render), flash of empty state, and you'd hand-build auth headers tRPC already handles. |
| Skip `router.refresh()` after a mutation | Write succeeds but the list still shows stale data until a manual reload. |
| Pass a non-serializable prop server→client | Runtime error: "only plain objects can be passed to Client Components". |

Heuristic you can apply yourself: **does this bit react to the user
(type/click/live)?** No → Server Component. Yes → the smallest possible
Client Component, fed by props from a server parent.

---

## 6. Build it yourself (exercise)

Add a read-only "Truck count" to the dashboard:

1. The dashboard page is already a Server Component. Add
   `const trucks = await api.truck.list();` near its other `await`s.
2. Render `<p>{trucks.length} trucks</p>`. No `"use client"`, no hook —
   notice you never needed the browser at all.
3. Now *intentionally* break it: add `"use client"` to the top of
   `dashboard/page.tsx`. Run `npm run dev`, load it → watch it fail because
   server-only modules can't run in the browser. Remove it. That error is
   the boundary teaching you where it is.

---

## 7. Gotchas

- **`"use client"` is viral downward, not upward.** A client component can
  render server-passed children, but everything it *imports* becomes client.
  Keep client components leaf-ish; don't import heavy server libs into them.
- **`server-only` package** is imported by `lib/db`, `lib/auth/session`,
  etc. on purpose: if a client file ever pulls them in, the build fails
  loudly instead of leaking secrets silently.
- **`router.refresh()` ≠ `router.push()`.** `push` navigates; `refresh`
  re-runs server components for the *current* route. Mutations usually want
  both (go somewhere, and make sure it's fresh).
- **Server Components can't use hooks** (`useState`/`useEffect`/`use…`). If
  you reach for one, that subtree needs to become a client component — or
  better, lift the interactivity into a small child so the parent stays
  server.
- **`async` page params in Next 15:** `params`/`searchParams` are Promises —
  `const { id } = await params;`. Forgetting the `await` is a common first
  bug.
