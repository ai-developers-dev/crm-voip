# VoIP CRM Project

## Overview
Multi-tenant SaaS VoIP CRM with real-time calling dashboard, drag-and-drop call management, and comprehensive call logging.

## Tech Stack
- **Frontend**: Next.js 15 (App Router)
- **Backend**: Convex (real-time database)
- **Auth**: Clerk (multi-tenant with organizations)
- **VoIP**: Twilio Voice SDK
- **UI**: shadcn/ui + Tailwind CSS
- **Deployment**: Vercel

## Key Directories
- `/src/app/(dashboard)/` - Protected dashboard routes
- `/src/app/api/twilio/` - Twilio webhook handlers
- `/src/components/calling/` - VoIP UI components
- `/src/hooks/` - Custom hooks (useTwilioDevice)
- `/convex/` - Database schema and functions

## Sub-Agents Available
- **twilio-expert**: Twilio Voice SDK, TwiML, webhooks
- **convex-expert**: Schema design, queries, mutations
- **clerk-expert**: Multi-tenant auth, organizations
- **ui-designer**: shadcn/ui, Tailwind, drag-and-drop

## Setup Instructions

### 1. Environment Variables
Copy `.env.example` to `.env.local` and fill in:
- Clerk keys (from clerk.com dashboard)
- Convex URL (run `npx convex dev`)
- Twilio credentials (from twilio.com console)

### 2. Initialize Convex
```bash
npx convex dev
```

### 3. Configure Clerk Webhooks
Set webhook URL to: `https://your-convex-url.convex.site/clerk-webhook`

### 4. Configure Twilio
1. Create a TwiML App in Twilio Console
2. Set Voice URL to: `https://your-app.vercel.app/api/twilio/voice`
3. Set Status Callback to: `https://your-app.vercel.app/api/twilio/status`

### 5. Run Development Server
```bash
npm run dev
```

## Database Schema
See `/convex/schema.ts` for complete schema including:
- organizations (tenants)
- users (agents)
- activeCalls (real-time call state)
- callHistory (historical records)
- parkingLots (call parking slots)
- presence (real-time user status)
- contacts (CRM contacts)

## Features
- [x] Multi-tenant authentication
- [x] Real-time presence system
- [x] Incoming call notifications
- [x] Drag-and-drop call parking
- [x] Drag-and-drop call transfers
- [x] Call history logging
- [ ] Call recording playback
- [ ] IVR configuration
- [ ] Call queues
