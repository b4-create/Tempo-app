# Tempo — Scheduling & Event Reminder (with Login + Server)

Full-stack version of your classroom scheduling app.

## Features

- **User accounts** — Register / Login with username + password
- **JWT authentication** — Secure sessions (7-day tokens)
- **Server-side storage** — All classrooms, events, activities, and pictures are stored on the server (JSON files)
- **Per-user data** — Each user only sees their own classrooms
- Same UI you already know (Dashboard, Calendar, Subjects, Institutes, etc.)

## Quick Start

```bash
cd tempo-server
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

1. Click **Register** and create an account
2. Create classrooms, add events/activities as before

## Project Structure

```
tempo-server/
├── server.js          # Express API + static file server
├── package.json
├── public/
│   └── index.html     # Frontend (login + app)
└── data/              # Auto-created
    ├── users.json
    ├── classrooms.json
    └── uploads/       # (reserved)
```

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| POST   | /api/register | Create account |
| POST   | /api/login | Login → JWT |
| GET    | /api/me | Current user |
| GET    | /api/classrooms | List my classrooms |
| POST   | /api/classrooms | Create classroom |
| GET    | /api/classrooms/:id | Get one |
| PUT    | /api/classrooms/:id | Update |
| DELETE | /api/classrooms/:id | Delete |
| POST   | /api/classrooms/:id/items | Add event/activity (multipart or JSON) |
| DELETE | /api/classrooms/:cid/items/:iid | Delete item |
| GET    | /api/calendar | All items for calendar view |

All routes except register/login require header:
`Authorization: Bearer <token>`

## Notes

- Passwords are hashed with bcrypt
- Pictures are stored as base64 data-URLs inside the classroom JSON (simple, no extra file management)
- Change `JWT_SECRET` in `server.js` (or set env var) before deploying
- Data lives in the `data/` folder — back it up if needed

## Production Tips

- Set `JWT_SECRET` environment variable to a long random string
- Use a reverse proxy (nginx / Caddy) and HTTPS
- For larger scale, swap the JSON files for SQLite or PostgreSQL
