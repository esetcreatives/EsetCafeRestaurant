# Eset Cafe & Restaurant

A modern, full-stack digital ordering and restaurant management system built for Eset Cafe. The platform provides a seamless digital menu for customers and a robust administrative dashboard for staff. 

Recently migrated from a legacy PHP backend to **Supabase** for enhanced real-time capabilities and security.

## 🚀 Tech Stack

### Core Technologies
- **Frontend Framework:** Next.js 16 (App Router)
- **UI Library:** React 19
- **Language:** TypeScript
- **Backend as a Service (BaaS):** Supabase (PostgreSQL, Auth, Storage, Real-time)

### Styling & Animation
- **Styling:** Tailwind CSS v4
- **Animations:** GSAP (landing page intro), Framer Motion
- **Icons:** Lucide React

### State Management & Data Fetching
- **Client State:** Zustand (Tab and Admin states)
- **Data Fetching:** SWR, Supabase JS Client (`@supabase/supabase-js`)

---

## 📂 Project Structure

```
c:\EsetCafeRestaurant\
├── frontend/ (Root)
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/          # Admin Dashboard & Login routes
│   │   │   ├── menu/           # Customer Digital Menu routes
│   │   │   ├── page.tsx        # Landing Page
│   │   │   ├── layout.tsx      # Root Layout
│   │   │   └── globals.css     # Global Styles (Tailwind)
│   │   ├── components/         # Reusable UI Components
│   │   ├── lib/
│   │   │   ├── api.ts          # Centralized Supabase data fetching functions
│   │   │   ├── supabase.ts     # Supabase Client Initialization
│   │   │   └── supabaseServer.ts # Server-side Supabase Client
│   │   └── store/
│   │       ├── adminStore.ts   # Zustand store for Admin state
│   │       └── tabStore.ts     # Zustand store for Customer Tab state
│   ├── public/                 # Static Assets
│   ├── package.json
│   └── .env.local              # Environment Variables
```

---

## ✨ Key Features

### 1. Customer Digital Experience (`/menu`)
- **QR-Code Driven Sessions:** Customers scan a QR code to securely open a table session (`/menu?table=X&token=Y`).
- **Interactive Menu:** Filter by categories, view "Signature Dishes", check real-time item availability.
- **Cart & Ordering:** Add items to cart, view live pricing (including VAT + service charge), and place orders directly to the kitchen.
- **Leave Table:** Customers can safely detach their device from the table session without losing data on the server.

### 2. Admin Dashboard (`/admin`)
- **Kitchen Kanban Board:** Real-time tracking of orders (Pending, Preparing, Ready, Served).
- **Session Management:** Monitor active table sessions, sync subtotals, and handle session financial closures.
- **Menu Maintenance:** Toggle item availability (86 items), update prices, add/remove items.
- **Financial Controls:** Secure billing, accurate "0 ETB" displays prevention, and payment confirmations.
- **Security & Maintenance:** Token-based authentication, Role-Based Access Control (RBAC) via Supabase Auth, and a privileged "Reset Dashboard" utility to clear historical data for maintenance.

---

## 🗄️ Database Architecture (Supabase)

The PostgreSQL database relies heavily on Row Level Security (RLS) to enforce data integrity. 

**Core Tables:**
- `menu_items`: Product catalog including categories, price, and `is_available` flag.
- `tables`: Physical tables tracking `status` (available/occupied) and secure `token` identifiers.
- `sessions`: Represents a customer's visit. Linked to a table. Tracks financial totals and `status` (open, paid, cancelled).
- `orders`: Links to sessions. Contains order `status` and timestamps.
- `order_items`: Junction table mapping `orders` to `menu_items`.
- `payments`: Financial records storing subtotal, VAT, service charges, and payment methods.
- `admin_users`: Manages internal staff roles and authentication.

---

## 🛠️ Setup Instructions

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- A Supabase Project (Database, Auth, and Storage buckets configured)

### 2. Environment Variables
Create a `.env.local` file at the root of the project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Installation

```bash
# Install dependencies
npm install

# Run the development server (runs on port 3000 by default)
npm run dev
```

Visit `http://localhost:3000` to view the landing page.

---

## 🧪 Testing Workflows

### Manual Testing Routes
- **Landing Page:** `http://localhost:3000`
- **Customer Menu (Simulated Table 1):** `http://localhost:3000/menu?table=1&token=table_1_mock_token`
- **Admin Dashboard:** `http://localhost:3000/admin` (Requires valid Supabase Auth credentials)

### Common Troubleshooting
- **Permission Denied (42501):** Occurs if Supabase Row Level Security (RLS) policies are misconfigured for the authenticated user or anonymous session trying to place an order. Verify policies in the Supabase Dashboard.
- **Data Not Syncing:** Check the browser console to see if the real-time polling (in `api.ts` or `polling.ts`) or Supabase Channels subscription is failing.
- **Unauthorized Actions:** Ensure the admin user token hasn't expired.

---

## 🚀 Deployment

This project is optimized for deployment on platforms like **Vercel** or **Netlify**.

1. Connect your GitHub repository to Vercel/Netlify.
2. Add your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the environment variables settings on the platform.
3. Deploy. The build script (`next build`) is automatically configured in `package.json`.

---

## 🔮 Future Enhancements
- Progressive Web App (PWA) manifest for native-like mobile usage.
- Thermal receipt printer integration.
- Multi-language localization support.
- Granular analytics and advanced sales forecasting.
