# Stock Manager

A real-time inventory management web application built with React, Vite, and Firebase.
## Features

- **Real-time Inventory Management**: Track stock items with instant updates across all users
- **User Authentication**: Secure login with Firebase Authentication
- **Stock Adjustments**: Increment/decrement quantities with optional notes
- **Transaction History**: Track all inventory changes with timestamps and user attribution
- **User Profiles**: Manage display names and view user information
- **Company Management**: Organize inventory by company
- **Real-time Sync**: All changes sync instantly across browser tabs and devices

## Prerequisites

- Node.js 16+ and npm
- Firebase project

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with your Firebase credentials (see `.env.example`)

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Email/Password authentication
3. Create Firestore database
4. Add the following collections: users, companies, stock-items, transactions
5. Update security rules to allow authenticated access

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

## Building

```bash
npm run build
```

## Technologies

- React 18 with TypeScript
- Vite (build tool)
- Tailwind CSS
- Firebase Firestore & Authentication
- Zustand (state management)
- Lucide React (icons)

## Project Structure

```
src/
├── components/          # Reusable React components
├── config/             # Firebase configuration
├── pages/              # Page components (Home, Stock, History, Profile)
├── store/              # Zustand store for auth state
├── types/              # TypeScript type definitions
├── utils/              # Helper functions
├── App.tsx             # Main app component
└── index.css           # Global styles with Tailwind
```

## Key Features

### Authentication
- Login with email and password
- Session persistence using localStorage
- Automatic logout and redirect

### Stock Management
- View all stock items in real-time
- Add new items with name, category, size, and quantity
- Adjust quantities with increment/decrement buttons
- Add optional notes to transactions
- View last updated timestamp for each item

### Transaction History
- Real-time transaction updates
- Reverse chronological order (newest first)
- Green for increases, red for decreases
- Shows user who made the change
- Includes timestamps and optional notes
- Manual refresh button

### Real-time Synchronization
- Firestore real-time listeners for automatic updates
- Server timestamps for consistency
- Multiple users see changes without refresh
- Optimistic UI updates

## License

Private and proprietary.

