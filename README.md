# E-Menu Portal

AI-Assisted Restaurant Analytics & Operations Platform

A production-oriented restaurant operations platform built to help restaurant owners and managers monitor business performance, manage inventory, configure menus, and generate AI-powered operational insights.

The platform combines real-time analytics, inventory management, operational monitoring, and an AI Restaurant Analyst into a centralized management system.

---

## Summary

* Real-time restaurant analytics and operational monitoring
* AI-powered restaurant analyst for business insights and recommendations
* Inventory tracking with automatic menu availability management
* Centralized menu configuration and management
* Firebase-powered real-time synchronization
* Secure role-based access to operational data
* Responsive dashboard for restaurant owners and managers

---

## Features

### Analytics Dashboard

Monitor restaurant performance through:

* Revenue tracking
* Order monitoring
* Product performance analysis
* Sales trends
* Business KPIs

All metrics update in real time.

### AI Restaurant Analyst

The AI Analyst interprets operational data and provides:

* Trend analysis
* Business insights
* Opportunity identification
* Operational recommendations
* Performance summaries

### Inventory Management

Track inventory levels and availability.

Features include:

* Stock monitoring
* Low inventory detection
* Out-of-stock handling
* Automatic menu availability updates

### Menu Configuration

Manage restaurant offerings through:

* Product creation
* Price updates
* Availability management
* Menu configuration

Changes are reflected throughout the platform in real time.

### Real-Time Synchronization

Orders and operational data are synchronized instantly across:

* Analytics dashboards
* Inventory systems
* Management interfaces
* AI analysis modules

---

## System Architecture

```text
Customer Ordering Interface
           │
           ▼
Firebase Realtime Database
           │
           ▼
      E-Menu Portal
 ├─ Dashboard Analytics
 ├─ Inventory Management
 ├─ Menu Configuration
 ├─ Reports
 └─ AI Restaurant Analyst
           │
           ▼
 Business Recommendations
```

---

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend Services

* Firebase Authentication
* Firebase Realtime Database
* Firebase Hosting

### AI Integration

* Google Gemini API

### State Management

* React Context API
* Custom Hooks

---

## Quick Start

Clone the repository:

```bash
git clone https://github.com/Fitzschh/AI-automated-restaurant-operations-analysis.git

cd AI-automated-restaurant-operations-analysis
```

Install dependencies:

```bash
npm install
```

Configure environment variables:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_GEMINI_API_KEY=
```

Run development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

---

## Project Structure

```text
src/
├── components/
├── pages/
├── hooks/
├── services/
├── contexts/
├── firebase/
├── utils/
├── types/
└── assets/
```

---

## Development Notes

* Firebase Realtime Database is used for real-time synchronization.
* Gemini API powers the AI Restaurant Analyst.
* Inventory updates can automatically affect menu availability.
* The platform is designed for restaurant owners and managers.
* Customer ordering interfaces operate independently from management controls.

---

## Demo Workflow

```text
Customer Places Order
          │
          ▼
Order Stored in Database
          │
          ▼
Dashboard Updates
          │
          ▼
Analytics Generated
          │
          ▼
AI Analyst Processes Data
          │
          ▼
Recommendations Produced
          │
          ▼
Manager Takes Action
```

---

## Repository Status

Active Development

E-Menu Portal is currently being developed as an AI-assisted restaurant operations platform focused on operational intelligence, inventory management, and real-time business analytics.
