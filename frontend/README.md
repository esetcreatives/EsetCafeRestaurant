# ESET Cafe Frontend - Next.js 14

## Setup Instructions

### Development

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure Environment**
   Create `.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost/EsetCafeRestaurant/backend/api
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```
   
   Open http://localhost:3000

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── menu/page.tsx         # Digital tab
│   │   ├── admin/
│   │   │   ├── page.tsx          # Admin dashboard
│   │   │   └── login/page.tsx    # Admin login
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/
│   │   │   ├── GlassCard.tsx
│   │   │   └── Badge.tsx
│   │   └── intro/
│   │       └── LogoIntro.tsx
│   ├── store/
│   │   ├── tabStore.ts           # Customer tab state
│   │   └── adminStore.ts         # Admin state
│   └── lib/
│       ├── api.ts                # API client
│       ├── polling.ts            # Real-time polling
│       └── pusher-template.ts    # Pusher integration
├── public/
└── package.json
```

## Features

### Landing Page (/)
- GSAP animated logo intro (plays once)
- Hero section with glassmorphism
- Brand story
- Menu showcase
- Footer with contact info

### Digital Tab (/menu?table=X&token=Y)
- Session validation via QR parameters
- Menu browser with category filters
- Search functionality
- Availability badges
- Cart management
- Order placement
- Live pricing with VAT + service charge

### Admin Dashboard (/admin)
- JWT authentication
- Kitchen board (Kanban-style order tracking)
- Active sessions overview
- Menu management (86 items)
- Financial reports
- Payment confirmation
- Real-time polling (3s for orders, 5s for sessions)

## Design System

### Colors
- Gold: `#fdca00` - Primary accent
- Forest: `#05503c` - Brand green
- Cream: `#faf8f2` - Background

### Typography
- Headings: Bricolage Grotesque (Bold 700/800)
- Body: Instrument Sans (400/500/600)

### Components
- GlassCard: Glassmorphism effect
- Badge: Availability indicator
- LogoIntro: GSAP animated intro

## State Management

### Tab Store (Zustand)
- Session data (table, token, sessionId)
- Cart items with quantities
- Confirmed orders
- Split bill selections
- Persisted to localStorage

### Admin Store (Zustand)
- Authentication state
- Orders list
- Active sessions
- Real-time updates via polling

## API Integration

All API calls go through `src/lib/api.ts`:
- `menuAPI` - Menu operations
- `sessionAPI` - Session management
- `orderAPI` - Order placement and updates
- `adminAPI` - Admin operations

## Real-Time Updates

### Polling (Current)
- Orders: 3-second interval
- Sessions: 5-second interval
- Managed by `polling.ts`

### Pusher (Optional)
- Template ready in `pusher-template.ts`
- Requires Pusher credentials
- Channels: `kitchen`, `table-{number}`

## Testing

### Manual Testing Checklist

1. **Landing Page**
   - [ ] Logo intro plays on first visit
   - [ ] Hero section displays correctly
   - [ ] All sections scroll smoothly

2. **Digital Tab**
   - [ ] Invalid QR shows error screen
   - [ ] Valid QR creates/loads session
   - [ ] Menu items load and filter
   - [ ] Add to cart works
   - [ ] Cart drawer shows correct totals
   - [ ] Order placement succeeds

3. **Admin Dashboard**
   - [ ] Login with admin/admin123
   - [ ] Kitchen board shows orders
   - [ ] Order status updates work
   - [ ] Menu availability toggle works
   - [ ] Payment confirmation works
   - [ ] Reports show correct data

### Test URLs

- Landing: http://localhost:3000
- Menu (Table 1): http://localhost:3000/menu?table=1&token=ec_table_1_a7f3b9c2
- Admin Login: http://localhost:3000/admin/login

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Set environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-api-domain.com/api
   ```
4. Deploy

### Other Platforms

- Netlify: Works with same env vars
- AWS Amplify: Configure build settings
- Self-hosted: Use `npm run build && npm start`

## Troubleshooting

### API Connection Failed
- Check `NEXT_PUBLIC_API_URL` in `.env.local`
- Verify backend is running
- Check CORS settings in backend

### Logo Intro Keeps Playing
- Clear localStorage: `localStorage.removeItem('eset_intro_played')`

### Orders Not Updating
- Check browser console for polling errors
- Verify admin token is valid
- Ensure backend endpoints are accessible

## Future Enhancements

- [ ] PWA manifest for mobile installation
- [ ] Push notifications via Pusher
- [ ] QR code generator for tables
- [ ] Receipt printing
- [ ] Multi-language support
- [ ] Dark mode toggle
