const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 3000;

const db = new sqlite3.Database(path.join(__dirname, 'prosjekt.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      user_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      post_id INTEGER
    )
  `);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "secretkey",
  resave: false,
  saveUninitialized: true
}));

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}


app.get('/', (req, res) => {
  res.render('index', { user: req.session.userId });
});

app.get('/register', (req, res) => {
  res.render('register', { message: null });
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render('register', { message: "Fyll ut alle felt" });
    }

    const hash = await bcrypt.hash(password, 10);

    await dbRun(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username.trim(), hash]
    );

    res.redirect('/login');

  } catch {
    res.render('register', { message: "Brukernavn finnes fra før" });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { message: null });
});

app.post('/login', async (req, res) => {
  const user = await dbGet(
    'SELECT * FROM users WHERE username = ?',
    [req.body.username]
  );

  if (!user) {
    return res.render('login', { message: "Feil brukernavn" });
  }

  const valid = await bcrypt.compare(req.body.password, user.password);

  if (!valid) {
    return res.render('login', { message: "Feil passord" });
  }

  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/dashboard', requireLogin, async (req, res) => {
  const posts = await dbAll('SELECT * FROM posts ORDER BY id DESC');
  res.render('dashboard', { posts });
});

app.post('/posts', requireLogin, async (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) return res.redirect('/dashboard');

  await dbRun(
    'INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)',
    [title.trim(), content.trim(), req.session.userId]
  );

  res.redirect('/dashboard');
});

app.post('/delete-post/:id', requireLogin, async (req, res) => {
  await dbRun('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.redirect('/dashboard');
});

app.get('/post/:id', async (req, res) => {
  const post = await dbGet(
    'SELECT * FROM posts WHERE id = ?',
    [req.params.id]
  );

  const comments = await dbAll(
    'SELECT * FROM comments WHERE post_id = ?',
    [req.params.id]
  );

  res.render('post', { post, comments });
});

app.post('/comment/:id', async (req, res) => {
  await dbRun(
    'INSERT INTO comments (content, post_id) VALUES (?, ?)',
    [req.body.content, req.params.id]
  );

  res.redirect('/post/' + req.params.id);
});

app.get('/cipher', (req, res) => {
  res.render('cipher');
});

app.post('/delete-user', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;


    await dbRun('DELETE FROM posts WHERE user_id = ?', [userId]);


    await dbRun('DELETE FROM users WHERE id = ?', [userId]);

    req.session.destroy();

    res.redirect('/');

  } catch (err) {
    console.error(err);
    res.send("Kunne ikke slette bruker");
  }
});

app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});