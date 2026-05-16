# Eset Cafe & Restaurant - Developer Documentation

Welcome to the technical documentation for the Eset Cafe & Restaurant application. This guide provides a comprehensive overview of the architecture, data models, state management, and core workflows to help new developers understand and contribute to the codebase.

## 1. High-Level Architecture

The application is built using a modern full-stack approach with **Next.js 16 (App Router)** and **Supabase** acting as the Backend-as-a-Service (BaaS). The separation of concerns is clearly defined:
- **Frontend (UI & Routing):** React Server Components (RSC) and Client Components managed by Next.js App Router.
- **State Management:** Zustand for client-side state across user sessions.
- **Data Layer:** Centralized API utility (`src/lib/api.ts`) abstracting Supabase SDK calls.
- **Backend & Database:** Supabase PostgreSQL with Row Level Security (RLS) for data integrity.

### 1.1 Tech Stack
- **Framework:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS v4, Framer Motion, GSAP
- **State Management:** Zustand (`zustand`, `zustand/middleware` for persistence)
- **Data Fetching:** SWR, `@supabase/supabase-js`
- **Integrations:** Sheger Pay (for webhooks/payments), QRCode generation.

---

## 2. Project Structure Overview

```text
src/
├── app/                  # Next.js App Router root
│   ├── admin/            # Admin dashboard and authentication routes
│   ├── api/              # API routes (e.g., /api/payments for Sheger Pay webhooks)
│   ├── checkout/         # Customer checkout flow
│   ├── menu/             # Customer digital menu and ordering
│   ├── layout.tsx        # Global layout
│   └── page.tsx          # Landing page (with GSAP animations)
├── components/           # Reusable React components
│   ├── admin/            # Components specific to the admin dashboard
│   ├── intro/            # Landing page introduction components
│   └── ui/               # Shared UI elements (buttons, modals, etc.)
├── lib/                  # Utility functions and API wrappers
│   ├── api.ts            # Centralized Supabase API endpoints
│   ├── shegerpay.ts      # Sheger Pay SDK integration
│   ├── supabase.ts       # Supabase client initialization
│   └── supabaseServer.ts # Server-side Supabase client for RSC/API routes
└── store/                # Zustand state management
    ├── adminStore.ts     # Admin application state (Auth, Roles, Dashboard data)
    └── tabStore.ts       # Customer session state (Cart, Confirmed Orders, Split Bills)
```

---

## 3. Core Workflows

The application is split into two primary experiences: the **Customer Experience** and the **Admin/Staff Experience**.

### 3.1 Customer Experience (Digital Menu)
1. **Session Initialization:** 
   - Customers scan a QR Code on their physical table. The URL contains a table number and a secure token: `/menu?table=1&token=table_1_mock_token`.
   - The application checks the `tables` and `sessions` schema. If a session is open, it resumes; otherwise, it creates a new session and securely generates a `sessionToken`.
2. **Browsing & Ordering:**
   - The customer browses `menu_items`. Items are added to the cart stored locally via `useTabStore` (persisted to `localStorage`).
   - Placing an order triggers a Supabase RPC function (`place_order`), which atomically inserts records into `orders` and `order_items`.
3. **Real-time Updates:**
   - Customers' devices subscribe to Supabase Realtime Channels (`session-orders-{sessionId}`) to listen for status changes (`pending` -> `preparing` -> `ready` -> `served`).

### 3.2 Admin Experience (Dashboard)
1. **Authentication & RBAC:**
   - Admins log in via Supabase Auth. The user role (`super_admin`, `admin`, `manager`) dictates access to specific actions (e.g., only `super_admin` or `admin` can delete menu items).
2. **Order Fulfillment (Kanban Board):**
   - Staff view real-time incoming orders. Updating an order status updates the `orders` table and broadcasts the change back to the respective customer.
3. **Session & Billing:**
   - Staff can view active table sessions, check totals, split bills, and process payments (e.g., cash, Sheger Pay). Upon payment, the session is marked as `paid`, and the physical table is freed up (`status = 'available'`).

---

## 4. State Management (Zustand)

State is managed by two distinct stores depending on the user context:

### 4.1 `tabStore.ts` (Customer Store)
Handles the customer's current session and cart. It utilizes `persist` middleware to ensure a customer doesn't lose their cart if they accidentally refresh or close the tab.
- **State:** `tableId`, `tableNumber`, `sessionId`, `sessionToken`, `cartItems`, `confirmedOrders`, `splitSelections`.
- **Actions:** `addToCart`, `updateQuantity`, `clearCart`, `toggleSplitSelection`.
- **Derived Data:** `getCartTotal()`, `getSplitTotal()`.

### 4.2 `adminStore.ts` (Admin Store)
Handles the authentication and global dashboard state for staff members.
- **State:** `isAuthenticated`, `user` (with `role`), `orders`, `sessions`.
- **Actions:** `setAuth`, `logout`, `setOrders`, `updateOrderStatus`, `setSessions`.
- **Helper Methods:** `hasRole(role)`, `canManageMenu()`, `canAccessDashboard()`, etc.

---

## 5. Database Schema & RLS

The PostgreSQL database leverages Row Level Security (RLS) to ensure that customers can only view their own session data and place orders for their active session, while admins have elevated privileges.

### Core Tables
- **`menu_items`**: Contains the catalog. Fields include `id`, `name`, `category`, `price`, `is_available`, and `is_signature`.
- **`tables`**: Represents the physical tables. Fields include `number`, `token` (for QR validation), and `status` (`available` or `occupied`).
- **`sessions`**: A customer's stay at a table. Includes `table_id`, `token` (session token), `status` (`open`, `paid`, `cancelled`), and `opened_at`.
- **`orders`**: An order tied to a session. Includes `session_id`, `status` (`pending`, `preparing`, `ready`, `served`), and `notes`.
- **`order_items`**: Junction table for `orders` and `menu_items`. Contains `quantity` and price snapshots.
- **`payments`**: Finalized financial records tied to sessions. Tracks `subtotal`, `vat`, `service_charge`, `total`, and `payment_method`.
- **`admin_users`**: Custom schema to link with Supabase Auth users to enforce internal roles and tracking.

---

## 6. API Abstraction Layer (`src/lib/api.ts`)

All direct interactions with Supabase are abstracted within `api.ts`. This ensures uniform error handling, logging, and type safety across the frontend. It is divided into contextual namespaces:

- **`menuAPI`**: Fetching, creating, and updating menu items.
- **`uploadAPI`**: Handling file uploads to Supabase Storage (`menu-images` bucket).
- **`sessionAPI`**: Creating sessions based on QR tokens, resuming sessions, and fetching session details.
- **`orderAPI`**: Placing orders (via RPC), subscribing to real-time order updates, and fetching history.
- **`adminAPI`**: Authentication, fetching dashboard metrics, confirming payments, managing admin users, and retrieving business reports.

## 7. Next Steps & Recommended Practices

- **Adding New Features:** When adding new database interactions, always implement them as methods within `src/lib/api.ts` rather than making direct Supabase calls from components.
- **Supabase Realtime:** Be mindful of Realtime quotas. Always ensure that `unsubscribe()` is called when a component utilizing Realtime (e.g., `orderAPI.subscribeToOrders`) unmounts.
- **Error Handling:** `api.ts` provides a structured `ApiResponse<T>` containing `data` and `error` objects. Always verify `!res.error` before consuming data in the UI.
