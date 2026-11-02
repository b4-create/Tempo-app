const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tempo-super-secret-change-me-in-production-2024';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CLASSROOMS_FILE = path.join(DATA_DIR, 'classrooms.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize data files
function loadJSON(file, fallback = []) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { console.error('Load error', file, e.message); }
  return fallback;
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(USERS_FILE)) saveJSON(USERS_FILE, []);
if (!fs.existsSync(CLASSROOMS_FILE)) saveJSON(CLASSROOMS_FILE, []);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Multer for image uploads (store as data URL in JSON for simplicity, or disk)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } }); // 3MB

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ========== AUTH ROUTES ==========
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const users = loadJSON(USERS_FILE);
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username: username.trim(),
      displayName: (displayName || username).trim(),
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveJSON(USERS_FILE, users);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const users = loadJSON(USERS_FILE);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', auth, (req, res) => {
  const users = loadJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, displayName: user.displayName });
});

// ========== CLASSROOM ROUTES ==========
app.get('/api/classrooms', auth, (req, res) => {
  const all = loadJSON(CLASSROOMS_FILE);
  const mine = all.filter(c => c.ownerId === req.user.id);
  res.json(mine);
});

app.post('/api/classrooms', auth, (req, res) => {
  try {
    const { name, studentCount, mainAdviser, description, subTeachers, subjects } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Classroom name is required' });

    const all = loadJSON(CLASSROOMS_FILE);
    const classroom = {
      id: uuidv4(),
      ownerId: req.user.id,
      name: name.trim(),
      studentCount: Math.max(0, Number(studentCount) || 0),
      mainAdviser: (mainAdviser || '').trim(),
      description: (description || '').trim(),
      subTeachers: Array.isArray(subTeachers) ? subTeachers : [],
      subjects: Array.isArray(subjects) ? subjects.map(s => ({
        id: s.id || uuidv4(),
        name: (s.name || '').trim(),
        teacher: (s.teacher || '').trim(),
        description: (s.description || '').trim()
      })).filter(s => s.name) : [],
      items: [],
      createdAt: new Date().toISOString()
    };
    all.unshift(classroom);
    saveJSON(CLASSROOMS_FILE, all);
    res.status(201).json(classroom);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/classrooms/:id', auth, (req, res) => {
  const all = loadJSON(CLASSROOMS_FILE);
  const c = all.find(x => x.id === req.params.id && x.ownerId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Classroom not found' });
  res.json(c);
});

app.put('/api/classrooms/:id', auth, (req, res) => {
  const all = loadJSON(CLASSROOMS_FILE);
  const idx = all.findIndex(x => x.id === req.params.id && x.ownerId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Classroom not found' });

  const updates = req.body;
  // Only allow safe fields
  if (updates.name) all[idx].name = updates.name.trim();
  if (updates.studentCount !== undefined) all[idx].studentCount = Math.max(0, Number(updates.studentCount) || 0);
  if (updates.mainAdviser !== undefined) all[idx].mainAdviser = (updates.mainAdviser || '').trim();
  if (updates.description !== undefined) all[idx].description = (updates.description || '').trim();
  if (Array.isArray(updates.subTeachers)) all[idx].subTeachers = updates.subTeachers;
  if (Array.isArray(updates.subjects)) all[idx].subjects = updates.subjects;

  saveJSON(CLASSROOMS_FILE, all);
  res.json(all[idx]);
});

app.delete('/api/classrooms/:id', auth, (req, res) => {
  let all = loadJSON(CLASSROOMS_FILE);
  const before = all.length;
  all = all.filter(x => !(x.id === req.params.id && x.ownerId === req.user.id));
  if (all.length === before) return res.status(404).json({ error: 'Classroom not found' });
  saveJSON(CLASSROOMS_FILE, all);
  res.json({ ok: true });
});

// ========== ITEMS (events / activities) ==========
app.post('/api/classrooms/:id/items', auth, upload.single('picture'), (req, res) => {
  try {
    const all = loadJSON(CLASSROOMS_FILE);
    const idx = all.findIndex(x => x.id === req.params.id && x.ownerId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Classroom not found' });

    const { item_date, item_type, details, publisher, subject_id, subject } = req.body;
    if (!item_date || !details) return res.status(400).json({ error: 'Date and details are required' });

    let picture = null;
    if (req.file) {
      // Store as base64 data URL for simplicity (keeps everything in JSON)
      const b64 = req.file.buffer.toString('base64');
      picture = `data:${req.file.mimetype};base64,${b64}`;
    } else if (req.body.picture && req.body.picture.startsWith('data:')) {
      picture = req.body.picture;
    }

    const item = {
      id: uuidv4(),
      item_date,
      item_type: item_type === 'activity' ? 'activity' : 'event',
      details: details.trim(),
      publisher: (publisher || '').trim(),
      picture,
      subject_id: subject_id || null,
      subject: subject || null,
      createdAt: new Date().toISOString()
    };

    if (!all[idx].items) all[idx].items = [];
    all[idx].items.push(item);
    saveJSON(CLASSROOMS_FILE, all);
    res.status(201).json(item);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/classrooms/:cid/items/:iid', auth, (req, res) => {
  const all = loadJSON(CLASSROOMS_FILE);
  const idx = all.findIndex(x => x.id === req.params.cid && x.ownerId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Classroom not found' });

  const before = (all[idx].items || []).length;
  all[idx].items = (all[idx].items || []).filter(i => i.id !== req.params.iid);
  if (all[idx].items.length === before) return res.status(404).json({ error: 'Item not found' });
  saveJSON(CLASSROOMS_FILE, all);
  res.json({ ok: true });
});

// Global calendar view helper
app.get('/api/calendar', auth, (req, res) => {
  const all = loadJSON(CLASSROOMS_FILE);
  const mine = all.filter(c => c.ownerId === req.user.id);
  const items = mine.flatMap(c => (c.items || []).map(i => ({
    ...i,
    classroomId: c.id,
    classroomName: c.name
  })));
  res.json(items);
});

// Serve the SPA for any non-API route
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not found. Place index.html in /public');
  }
});

app.listen(PORT, () => {
  console.log(`\n  Tempo server running at http://localhost:${PORT}`);
  console.log(`  Data stored in: ${DATA_DIR}\n`);
});
