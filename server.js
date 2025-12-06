
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
// EDITE AQUI SE SEU USUÁRIO/SENHA FOREM DIFERENTES
const dbConfig = {
  user: 'postgres',       // Seu usuário do PostgreSQL (ex: postgres, admin)
  host: 'localhost',
  database: 'confeccao_db',
  password: '123',      // A senha que você definiu ao instalar ou criar o usuário
  port: 5432,
};

const pool = new Pool(dbConfig);

// Teste de conexão imediato ao iniciar
pool.connect((err, client, release) => {
  if (err) {
    console.error('\n\x1b[31m---------------------------------------------------------');
    console.error('ERRO CRÍTICO AO CONECTAR NO POSTGRESQL:');
    console.error('---------------------------------------------------------');
    console.error('Código do Erro:', err.code);
    if (err.code === '28P01') {
      console.error('MOTIVO: Senha incorreta ou usuário inexistente.');
      console.error(`Verifique se o usuário "${dbConfig.user}" e a senha "${dbConfig.password}" estão corretos.`);
    } else if (err.code === '3D000') {
      console.error(`MOTIVO: O banco de dados "${dbConfig.database}" não existe.`);
      console.error('SOLUÇÃO: Abra o pgAdmin e execute: CREATE DATABASE confeccao_db;');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('MOTIVO: O PostgreSQL não está rodando ou a porta está errada.');
    } else {
        console.error('Detalhes:', err.message);
    }
    console.error('---------------------------------------------------------\x1b[0m\n');
  } else {
    console.log('\n\x1b[32m---------------------------------------------------------');
    console.log('✅ SUCESSO: Conectado ao PostgreSQL corretamente!');
    console.log('---------------------------------------------------------\x1b[0m\n');
    release();
  }
});

app.use(cors());
app.use(bodyParser.json());

// --- USERS ---
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (err) { 
    console.error(err);
    res.status(500).json({error: "Erro ao buscar usuários", details: err.message}); 
  }
});

app.post('/api/users', async (req, res) => {
  const { id, name, username, password, role } = req.body;
  try {
    await pool.query('INSERT INTO users (id, name, username, password, role) VALUES ($1, $2, $3, $4, $5)', [id, name, username, password, role]);
    res.status(201).send();
  } catch (err) { 
    console.error(err);
    res.status(500).json({error: "Erro ao criar usuário", details: err.message}); 
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products');
    res.json(rows);
  } catch (err) { 
    // Se a tabela não existir, retorna array vazio para não quebrar o front
    if (err.code === '42P01') { 
        console.warn("Tabela 'products' não encontrada. Rodou o schema.sql?");
        return res.json([]); 
    }
    res.status(500).json(err); 
  }
});

app.post('/api/products', async (req, res) => {
  const { id, reference, color, grid_type, stock, enforce_stock, base_price } = req.body;
  try {
    await pool.query(
      'INSERT INTO products (id, reference, color, grid_type, stock, enforce_stock, base_price) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, reference, color, grid_type, stock, enforce_stock, base_price]
    );
    res.status(201).send();
  } catch (err) { console.error(err); res.status(500).json(err); }
});

app.put('/api/products/:id', async (req, res) => {
  const { stock, enforce_stock, base_price } = req.body;
  try {
    await pool.query(
      'UPDATE products SET stock = $1, enforce_stock = $2, base_price = $3 WHERE id = $4',
      [stock, enforce_stock, base_price, req.params.id]
    );
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
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
      query += ' WHERE rep_id = $1';
      params.push(rep_id);
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/clients', async (req, res) => {
  const { id, rep_id, name, city, neighborhood, state } = req.body;
  try {
    await pool.query(
      'INSERT INTO clients (id, rep_id, name, city, neighborhood, state) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, rep_id, name, city, neighborhood, state]
    );
    res.status(201).send();
  } catch (err) { res.status(500).json(err); }
});

app.put('/api/clients/:id', async (req, res) => {
  const { rep_id, name, city, neighborhood, state } = req.body;
  try {
    await pool.query(
      'UPDATE clients SET rep_id=$1, name=$2, city=$3, neighborhood=$4, state=$5 WHERE id=$6',
      [rep_id, name, city, neighborhood, state, req.params.id]
    );
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.status(200).send();
  } catch (err) { 
      // Tratamento para FK constraint
      if (err.code === '23503') {
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
      if (romaneio) {
          let query = 'SELECT * FROM orders WHERE romaneio = $1';
          let params = [romaneio];
          if (excludeId) {
              query += ' AND id != $2';
              params.push(excludeId);
          }
          const { rows } = await pool.query(query, params);
          return res.json(rows);
      }
      
      if (id) {
          const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
          return res.json(rows);
      }

      const { rows } = await pool.query('SELECT * FROM orders');
      res.json(rows);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/orders', async (req, res) => {
  const order = req.body;
  try {
    await pool.query(
      `INSERT INTO orders (id, display_id, romaneio, is_partial, rep_id, rep_name, client_id, client_name, client_city, client_state, created_at, delivery_date, payment_method, status, items, total_pieces, subtotal_value, discount_type, discount_value, final_total_value) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [order.id, order.display_id, order.romaneio, order.is_partial, order.rep_id, order.rep_name, order.client_id, order.client_name, order.client_city, order.client_state, order.created_at, order.delivery_date, order.payment_method, order.status, JSON.stringify(order.items), order.total_pieces, order.subtotal_value, order.discount_type, order.discount_value, order.final_total_value]
    );
    res.status(201).send();
  } catch (err) { console.error(err); res.status(500).json(err); }
});

app.put('/api/orders/:id', async (req, res) => {
  const { romaneio, status, is_partial, items, total_pieces, subtotal_value, final_total_value } = req.body;
  
  try {
    // Atualização dinâmica baseada no que foi enviado
    let fields = [];
    let values = [];
    let idx = 1;

    if (romaneio !== undefined) { fields.push(`romaneio=$${idx++}`); values.push(romaneio); }
    if (status !== undefined) { fields.push(`status=$${idx++}`); values.push(status); }
    if (is_partial !== undefined) { fields.push(`is_partial=$${idx++}`); values.push(is_partial); }
    if (items !== undefined) { fields.push(`items=$${idx++}`); values.push(JSON.stringify(items)); }
    if (total_pieces !== undefined) { fields.push(`total_pieces=$${idx++}`); values.push(total_pieces); }
    if (subtotal_value !== undefined) { fields.push(`subtotal_value=$${idx++}`); values.push(subtotal_value); }
    if (final_total_value !== undefined) { fields.push(`final_total_value=$${idx++}`); values.push(final_total_value); }

    values.push(req.params.id);

    const query = `UPDATE orders SET ${fields.join(', ')} WHERE id=$${idx}`;
    const { rows } = await pool.query(query + ' RETURNING *', values);
    
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json(err); }
});

// --- REP PRICES ---
app.get('/api/rep_prices', async (req, res) => {
  const { rep_id } = req.query;
  try {
    const { rows } = await pool.query('SELECT * FROM rep_prices WHERE rep_id = $1', [rep_id]);
    res.json(rows);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/rep_prices', async (req, res) => {
  const { rep_id, reference, price } = req.body;
  try {
    // Upsert logic simulada
    const check = await pool.query('SELECT id FROM rep_prices WHERE rep_id=$1 AND reference=$2', [rep_id, reference]);
    if (check.rows.length > 0) {
       await pool.query('UPDATE rep_prices SET price=$1 WHERE id=$2', [price, check.rows[0].id]);
    } else {
       await pool.query('INSERT INTO rep_prices (rep_id, reference, price) VALUES ($1, $2, $3)', [rep_id, reference, price]);
    }
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

// --- CONFIG ---
app.get('/api/config/:key', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT value FROM app_config WHERE key = $1', [req.params.key]);
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json(err); }
});

app.post('/api/config', async (req, res) => {
  const { key, value } = req.body;
  try {
    await pool.query('INSERT INTO app_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
    res.status(200).send();
  } catch (err) { res.status(500).json(err); }
});

app.listen(port, () => {
  console.log(`API Local rodando na porta ${port}`);
});
