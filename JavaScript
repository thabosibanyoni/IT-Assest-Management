const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database setup
const db = new sqlite3.Database('./assets.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_tag TEXT UNIQUE NOT NULL,
        device_type TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        serial_number TEXT,
        location TEXT,
        assigned_to TEXT,
        status TEXT DEFAULT 'Active',
        purchase_date DATE,
        warranty_expiry DATE,
        last_maintenance DATE,
        ip_address TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER,
        ticket_number TEXT UNIQUE NOT NULL,
        issue_type TEXT NOT NULL,
        priority TEXT DEFAULT 'Medium',
        status TEXT DEFAULT 'Open',
        reported_by TEXT,
        assigned_technician TEXT,
        description TEXT,
        resolution TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        FOREIGN KEY (asset_id) REFERENCES assets(id)
    )`);
});

// API Routes

// Get all assets
app.get('/api/assets', (req, res) => {
    const sql = 'SELECT * FROM assets ORDER BY created_at DESC';
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ assets: rows });
    });
});

// Add new asset
app.post('/api/assets', (req, res) => {
    const { asset_tag, device_type, brand, model, serial_number, location, 
            assigned_to, status, purchase_date, warranty_expiry, ip_address, notes } = req.body;
    
    const sql = `INSERT INTO assets 
        (asset_tag, device_type, brand, model, serial_number, location, 
         assigned_to, status, purchase_date, warranty_expiry, ip_address, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [asset_tag, device_type, brand, model, serial_number, location, 
                 assigned_to, status, purchase_date, warranty_expiry, ip_address, notes], 
    function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Asset added successfully' });
    });
});

// Update asset
app.put('/api/assets/:id', (req, res) => {
    const { status, location, assigned_to, last_maintenance, notes } = req.body;
    const sql = `UPDATE assets SET 
        status = ?, location = ?, assigned_to = ?, 
        last_maintenance = ?, notes = ? 
        WHERE id = ?`;
    
    db.run(sql, [status, location, assigned_to, last_maintenance, notes, req.params.id], 
    function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes, message: 'Asset updated' });
    });
});

// Delete asset
app.delete('/api/assets/:id', (req, res) => {
    db.run('DELETE FROM assets WHERE id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Asset deleted' });
    });
});

// Get tickets
app.get('/api/tickets', (req, res) => {
    const sql = `SELECT t.*, a.asset_tag, a.device_type 
                 FROM tickets t 
                 LEFT JOIN assets a ON t.asset_id = a.id 
                 ORDER BY t.created_at DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ tickets: rows });
    });
});

// Create ticket
app.post('/api/tickets', (req, res) => {
    const { asset_id, ticket_number, issue_type, priority, reported_by, description } = req.body;
    const sql = `INSERT INTO tickets 
        (asset_id, ticket_number, issue_type, priority, reported_by, description) 
        VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [asset_id, ticket_number, issue_type, priority, reported_by, description], 
    function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Ticket created' });
    });
});

// Dashboard stats
app.get('/api/dashboard', (req, res) => {
    const queries = {
        totalAssets: "SELECT COUNT(*) as count FROM assets",
        activeAssets: "SELECT COUNT(*) as count FROM assets WHERE status = 'Active'",
        maintenanceDue: "SELECT COUNT(*) as count FROM assets WHERE warranty_expiry < date('now', '+30 days')",
        openTickets: "SELECT COUNT(*) as count FROM tickets WHERE status = 'Open'",
        criticalTickets: "SELECT COUNT(*) as count FROM tickets WHERE priority = 'Critical' AND status = 'Open'"
    };
    
    const results = {};
    let completed = 0;
    const total = Object.keys(queries).length;
    
    for (const [key, sql] of Object.entries(queries)) {
        db.get(sql, [], (err, row) => {
            if (err) results[key] = 0;
            else results[key] = row.count;
            completed++;
            if (completed === total) res.json(results);
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
