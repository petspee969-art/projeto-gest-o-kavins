-- ============================================
-- EXTENSÕES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ALTERAÇÕES EM TABELAS EXISTENTES
-- ============================================

-- Adicionar coluna is_partial em orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE;

-- Adicionar coluna romaneio em orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS romaneio TEXT;

-- Adicionar base_price em products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0;

-- ============================================
-- TABELA DE USUÁRIOS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'rep')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABELA DE PRODUTOS
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference TEXT NOT NULL,
  color TEXT NOT NULL,
  grid_type TEXT NOT NULL,  -- ADULT ou PLUS
  stock JSONB DEFAULT '{}'::jsonb,
  enforce_stock BOOLEAN DEFAULT FALSE,
  base_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABELA PREÇOS DE REPRESENTANTE
-- ============================================
CREATE TABLE IF NOT EXISTS rep_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rep_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rep_id, reference)
);

-- ============================================
-- TABELA DE CLIENTES
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rep_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  city TEXT,
  neighborhood TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABELA DE PEDIDOS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id INTEGER,
  rep_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rep_name TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_city TEXT,
  client_state TEXT,
  delivery_date DATE,
  payment_method TEXT,
  status TEXT DEFAULT 'open',
  items JSONB DEFAULT '[]'::jsonb,
  total_pieces INTEGER DEFAULT 0,
  subtotal_value NUMERIC DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC DEFAULT 0,
  final_total_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_partial BOOLEAN DEFAULT FALSE,
  romaneio TEXT
);

-- ============================================
-- TABELA CONFIGURAÇÕES DO APP
-- ============================================
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value NUMERIC
);

-- ============================================
-- DADOS INICIAIS
-- ============================================

-- Sequencial inicial de pedidos
INSERT INTO app_config (key, value)
VALUES ('order_seq', 1000)
ON CONFLICT (key) DO NOTHING;

-- Usuário admin padrão
INSERT INTO users (name, username, password, role)
SELECT 'Administrador', 'admin', '123', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
