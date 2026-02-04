const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: 'wifique-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/bandwidth', require('./routes/bandwidth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/pakasir', require('./routes/pakasir'));
app.use('/api/audit', require('./routes/audit'));

// Portal route (Captive Portal)
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'portal', 'index.html'));
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// Root redirect to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                     WIFIQUE SERVER                        ║
╠═══════════════════════════════════════════════════════════╣
║  Dashboard: http://localhost:${PORT}/dashboard              ║
║  Portal:    http://localhost:${PORT}/portal                 ║
║  API:       http://localhost:${PORT}/api                    ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
