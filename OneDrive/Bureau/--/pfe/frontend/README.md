# Smart Hospital Frontend

Modern, professional React + TypeScript + Tailwind CSS dashboard for Smart Hospital monitoring system.

## Features

- 🎨 **Modern UI/UX** - Professional design with Tailwind CSS
- 🔐 **Authentication** - JWT-based secure authentication
- 📊 **Real-time Dashboard** - Live patient monitoring
- 🚨 **Alert System** - Instant notifications
- 👥 **Multi-role Support** - Admin, Doctor, Nurse dashboards
- 📱 **Responsive** - Works on all devices

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

## Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── layouts/       # Layout components (Sidebar, Header)
│   └── dashboard/     # Dashboard specific components
├── pages/             # Page components
├── store/             # Zustand state management
├── lib/               # Utilities (API client, etc.)
└── index.css          # Global styles & Tailwind
```

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **React Router** - Routing
- **Axios** - HTTP client
- **Socket.IO** - Real-time communication
- **Recharts** - Data visualization
- **Lucide React** - Icons

## Default Credentials

- **Doctor**: `doctor@hospital.com` / `password123`
- **Nurse**: `nurse@hospital.com` / `password123`
- **Admin**: `admin@hospital.com` / `password123`
