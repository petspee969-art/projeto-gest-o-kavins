
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

// --- COMPATIBILIDADE ES MODULES / COMMONJS ---
// Necessário pois o projeto está como "type": "module" no package.json
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Caminho do arquivo do banco de dados
const dbPath = path.resolve(__dirname, 'confeccao.db');

// --- CONEXÃO COM SQLITE ---
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log(`✅ Conectado ao banco de dados SQLite em: ${dbPath}`);
    initializeTables();
  }
});

// --- HELPER FUNCTIONS (Promises para SQLite) ---
// O sqlite3 usa callbacks, então criamos wrappers para usar async/await
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// --- INICIALIZAÇÃO DAS TABELAS ---
async function initializeTables() {
    try {
        // Habilita chaves estrangeiras
        await dbRun("PRAGMA foreign_keys = ON");

        // Users
        await dbRun(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )`);

        // Products (stock guardado como JSON string)
        await dbRun(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            reference TEXT NOT NULL,
            color TEXT NOT NULL,
            grid_type TEXT NOT NULL,
            stock TEXT, 
            enforce_stock INTEGER DEFAULT 0,
            base_price REAL DEFAULT 0
        )`);

        // Clients
        await dbRun(`CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            rep_id TEXT NOT NULL,
            name TEXT NOT NULL,
            city TEXT,
            neighborhood TEXT,
            state TEXT,
            FOREIGN KEY(rep_id) REFERENCES users(id)
        )`);

        // Orders
        await dbRun(`CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            display_id INTEGER,
            romaneio TEXT,
            is_partial INTEGER DEFAULT 0,
            rep_id TEXT,
            rep_name TEXT,
            client_id TEXT,
            client_name TEXT,
            client_city TEXT,
            client_state TEXT,
            created_at TEXT,
            delivery_date TEXT,
            payment_method TEXT,
            status TEXT,
            items TEXT,
            total_pieces INTEGER,
            subtotal_value REAL,
            discount_type TEXT,
            discount_value REAL,
            final_total_value REAL
        )`);

        // Rep Prices
        await dbRun(`CREATE TABLE IF NOT EXISTS rep_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rep_id TEXT NOT NULL,
            reference TEXT NOT NULL,
            price REAL NOT NULL
        )`);

        // Config
        await dbRun(`CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Verifica se existe admin, se não, cria
        const admin = await dbGet("SELECT * FROM users WHERE username = ?", ['admin']);
        if (!admin) {
            await dbRun("INSERT INTO users (id, name, username, password, role) VALUES (?, ?, ?, ?, ?)", 
                ['admin-id-default', 'Administrador', 'admin', 'admin', 'admin']);
            console.log("👤 Usuário padrão criado: admin / admin");
        }

        console.log("📦 Tabelas verificadas/criadas com sucesso.");

    } catch (err) {
        console.error("Erro ao inicializar tabelas:", err);
    }
}

app.use(cors());
app.use(bodyParser.json());

// --- ROUTES (Adaptadas para sintaxe SQLite: ? ao invés de $1) ---

// --- USERS ---
app.get('/api/users', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM users');
    res.json(rows);
  } catch (err) { res.status(500).json({error: err.message}); }
});

app.post('/api/users', async (req, res) => {
  const { id, name, username, password, role } = req.body;
  try {
    await dbRun('INSERT INTO users (id, name, username, password, role) VALUES (?, ?, ?, ?, ?)', 
        [id, name, username, password, role]);
    res.status(201).send();
  } catch (err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM products');
    // Parse JSON strings back to objects for frontend compatibility
    const products = rows.map(p => ({
        ...p,
        stock: p.stock ? JSON.parse(p.stock) : {},
        enforce_stock: !!p.enforce_stock // Converte 0/1 para boolean
    }));
    res.json(products);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/products', async (req, res) => {
  const { id, reference, color, grid_type, stock, enforce_stock, base_price } = req.body;
  try {
    await dbRun(
      'INSERT INTO products (id, reference, color, grid_type, stock, enforce_stock, base_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, reference, color, grid_type, JSON.stringify(stock), enforce_stock ? 1 : 0, base_price]
    );
    res.status(201).send();
  } catch (err) { console.error(err); res.status(500).json(err); }
});

app.put('/api/products/:id', async (req, res) => {
  const { stock, enforce_stock, base_price } = req.body;
  try {
    await dbRun(
      'UPDATE products SET stock = ?, enforce_stock = ?, base_price = ? WHERE id = ?',
      [JSON.stringify(stock), enforce_stock ? 1 : 0, base_price, req.params.id]
    );
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

// --- CLIENTS ---
app.get('/api/clients', async (req, res) => {
  const { rep_id } = req.query;
  try {
    let query = 'SELECT * FROM clients';
    let params = [];
    if (rep_id) {
      query += ' WHERE rep_id = ?';
      params.push(rep_id);
    }
    const rows = await dbAll(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/clients', async (req, res) => {
  const { id, rep_id, name, city, neighborhood, state } = req.body;
  try {
    await dbRun(
      'INSERT INTO clients (id, rep_id, name, city, neighborhood, state) VALUES (?, ?, ?, ?, ?, ?)',
      [id, rep_id, name, city, neighborhood, state]
    );
    res.status(201).send();
  } catch (err) { res.status(500).json(err); }
});

app.put('/api/clients/:id', async (req, res) => {
  const { rep_id, name, city, neighborhood, state } = req.body;
  try {
    await dbRun(
      'UPDATE clients SET rep_id=?, name=?, city=?, neighborhood=?, state=? WHERE id=?',
      [rep_id, name, city, neighborhood, state, req.params.id]
    );
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.status(200).send();
  } catch (err) { 
    if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
        res.status(400).json({ message: 'foreign key constraint' });
    } else {
        res.status(500).json(err); 
    }
  }
});

// --- ORDERS ---
app.get('/api/orders', async (req, res) => {
  const { id, romaneio, excludeId } = req.query;
  try {
      let rows;
      if (romaneio) {
          let query = 'SELECT * FROM orders WHERE romaneio = ?';
          let params = [romaneio];
          if (excludeId) {
              query += ' AND id != ?';
              params.push(excludeId);
          }
          rows = await dbAll(query, params);
      } else if (id) {
          rows = await dbAll('SELECT * FROM orders WHERE id = ?', [id]);
      } else {
          rows = await dbAll('SELECT * FROM orders');
      }

      // SQLite converte boolean pra 0/1 e JSON pra string, precisa converter de volta
      const parsedRows = rows.map(r => ({
          ...r,
          is_partial: !!r.is_partial,
          items: r.items ? JSON.parse(r.items) : []
      }));
      
      res.json(parsedRows);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/orders', async (req, res) => {
  const order = req.body;
  try {
    await dbRun(
      `INSERT INTO orders (id, display_id, romaneio, is_partial, rep_id, rep_name, client_id, client_name, client_city, client_state, created_at, delivery_date, payment_method, status, items, total_pieces, subtotal_value, discount_type, discount_value, final_total_value) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.display_id, order.romaneio, order.is_partial ? 1 : 0, order.rep_id, order.rep_name, order.client_id, order.client_name, order.client_city, order.client_state, order.created_at, order.delivery_date, order.payment_method, order.status, JSON.stringify(order.items), order.total_pieces, order.subtotal_value, order.discount_type, order.discount_value, order.final_total_value]
    );
    res.status(201).send();
  } catch (err) { console.error(err); res.status(500).json(err); }
});

app.put('/api/orders/:id', async (req, res) => {
  const { romaneio, status, is_partial, items, total_pieces, subtotal_value, final_total_value } = req.body;
  
  try {
    let fields = [];
    let values = [];

    if (romaneio !== undefined) { fields.push(`romaneio=?`); values.push(romaneio); }
    if (status !== undefined) { fields.push(`status=?`); values.push(status); }
    if (is_partial !== undefined) { fields.push(`is_partial=?`); values.push(is_partial ? 1 : 0); }
    if (items !== undefined) { fields.push(`items=?`); values.push(JSON.stringify(items)); }
    if (total_pieces !== undefined) { fields.push(`total_pieces=?`); values.push(total_pieces); }
    if (subtotal_value !== undefined) { fields.push(`subtotal_value=?`); values.push(subtotal_value); }
    if (final_total_value !== undefined) { fields.push(`final_total_value=?`); values.push(final_total_value); }

    values.push(req.params.id);

    const query = `UPDATE orders SET ${fields.join(', ')} WHERE id=?`;
    
    // SQLite não suporta RETURNING * facilmente em todas as versões no UPDATE
    // Então fazemos o UPDATE e depois o SELECT
    await dbRun(query, values);
    const updatedRow = await dbGet("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    
    if (updatedRow) {
        updatedRow.is_partial = !!updatedRow.is_partial;
        updatedRow.items = updatedRow.items ? JSON.parse(updatedRow.items) : [];
        res.json(updatedRow);
    } else {
        res.status(404).json({error: "Order not found"});
    }

  } catch (err) { console.error(err); res.status(500).json(err); }
});

// --- REP PRICES ---
app.get('/api/rep_prices', async (req, res) => {
  const { rep_id } = req.query;
  try {
    const rows = await dbAll('SELECT * FROM rep_prices WHERE rep_id = ?', [rep_id]);
    res.json(rows);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/rep_prices', async (req, res) => {
  const { rep_id, reference, price } = req.body;
  try {
    const check = await dbGet('SELECT id FROM rep_prices WHERE rep_id=? AND reference=?', [rep_id, reference]);
    if (check) {
       await dbRun('UPDATE rep_prices SET price=? WHERE id=?', [price, check.id]);
    } else {
       await dbRun('INSERT INTO rep_prices (rep_id, reference, price) VALUES (?, ?, ?)', [rep_id, reference, price]);
    }
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

// --- CONFIG ---
app.get('/api/config/:key', async (req, res) => {
  try {
    const row = await dbGet('SELECT value FROM app_config WHERE key = ?', [req.params.key]);
    // SQLite retorna value como string, se for número, o frontend converte, mas vamos facilitar
    if (row && !isNaN(row.value)) {
        row.value = Number(row.value);
    }
    res.json(row || null);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/config', async (req, res) => {
  const { key, value } = req.body;
  try {
    // Upsert no SQLite
    await dbRun(`INSERT INTO app_config (key, value) VALUES (?, ?) 
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

app.listen(port, () => {
  console.log(`API SQLite rodando na porta ${port}`);
});
