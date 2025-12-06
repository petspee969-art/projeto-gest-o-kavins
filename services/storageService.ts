
import { User, ProductDef, Order, Client, Role, RepPrice, OrderItem } from '../types';

// URL da API Local
const API_URL = 'http://localhost:3000/api';

// --- UTILS ---
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// --- USERS ---
export const getUsers = async (): Promise<User[]> => {
  const res = await fetch(`${API_URL}/users`);
  if (!res.ok) throw new Error("Erro ao buscar usuários");
  return res.json();
};

export const addUser = async (user: User): Promise<void> => {
  const res = await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
  if (!res.ok) throw new Error("Erro ao criar usuário");
};

export const deleteUser = async (id: string): Promise<void> => {
  const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Erro ao deletar usuário");
};

// --- PRODUCTS ---
export const getProducts = async (): Promise<ProductDef[]> => {
  try {
      const res = await fetch(`${API_URL}/products`);
      if (!res.ok) return [];
      const data = await res.json();
      
      return data.map((p: any) => ({
        id: p.id,
        reference: p.reference,
        color: p.color,
        gridType: p.grid_type || p.gridType,
        stock: p.stock || {}, 
        enforceStock: p.enforce_stock || false,
        basePrice: parseFloat(p.base_price) || 0
      })) as ProductDef[];
  } catch (e) {
      console.error(e);
      return [];
  }
};

export const addProduct = async (prod: ProductDef): Promise<void> => {
  const dbProd = {
    id: prod.id,
    reference: prod.reference,
    color: prod.color,
    grid_type: prod.gridType,
    stock: prod.stock,
    enforce_stock: prod.enforceStock,
    base_price: prod.basePrice
  };

  const res = await fetch(`${API_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dbProd)
  });
  if (!res.ok) throw new Error("Erro ao criar produto");
};

export const updateProductInventory = async (id: string, newStock: any, enforceStock: boolean, basePrice: number): Promise<void> => {
    const res = await fetch(`${API_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock, enforce_stock: enforceStock, base_price: basePrice })
    });
    if (!res.ok) throw new Error("Erro ao atualizar produto");
}

export const deleteProduct = async (id: string): Promise<void> => {
  const res = await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Erro ao deletar produto");
};

// --- LOGICA DE ESTOQUE ---
export const updateStockOnOrderCreation = async (items: OrderItem[]): Promise<void> => {
    const currentProducts = await getProducts();

    for (const item of items) {
        const product = currentProducts.find(
            p => p.reference === item.reference && p.color === item.color
        );

        if (product && product.enforceStock) {
            const newStock = { ...product.stock };
            
            Object.entries(item.sizes).forEach(([size, qty]) => {
                const currentQty = newStock[size] || 0;
                newStock[size] = currentQty - qty;
            });

            await updateProductInventory(product.id, newStock, product.enforceStock, product.basePrice);
        }
    }
};

export const saveOrderPicking = async (orderId: string, oldItems: OrderItem[], newItems: OrderItem[]): Promise<Order> => {
    
    // 1. Busca dados atuais do pedido
    const resOrder = await fetch(`${API_URL}/orders?id=${orderId}`);
    const dataOrder = await resOrder.json();
    const currentOrder = dataOrder[0];
    
    if (!currentOrder) throw new Error("Pedido não encontrado");

    if (currentOrder.romaneio) {
        throw new Error("Este pedido já possui Romaneio (Finalizado). Não é possível alterar itens ou estoque.");
    }

    // 2. Recalcula os totais
    let newTotalPieces = 0;
    let newSubtotalValue = 0;

    const processedItems = newItems.map(item => {
        const orderedQty = item.sizes ? Object.values(item.sizes).reduce((a, b) => a + (b || 0), 0) : 0;
        item.totalQty = orderedQty;

        const pickedQty = item.picked ? Object.values(item.picked).reduce((a, b) => a + b, 0) : 0;
        newTotalPieces += orderedQty;

        const quantityForValue = pickedQty > 0 ? pickedQty : orderedQty;
        const itemValue = quantityForValue * item.unitPrice;
        newSubtotalValue += itemValue;

        return { ...item, totalItemValue: itemValue };
    });

    let discountAmount = 0;
    if (currentOrder.discount_type === 'percentage') {
        discountAmount = newSubtotalValue * (currentOrder.discount_value / 100);
    } else if (currentOrder.discount_type === 'fixed') {
        discountAmount = currentOrder.discount_value;
    }

    const newFinalValue = Math.max(0, newSubtotalValue - discountAmount);

    // 4. Atualiza o Pedido na API
    const updateRes = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            items: processedItems,
            total_pieces: newTotalPieces,
            subtotal_value: newSubtotalValue,
            final_total_value: newFinalValue
        })
    });
    
    if (!updateRes.ok) throw new Error("Erro ao atualizar pedido");
    const updatedRow = await updateRes.json();

    // 5. Calcula diferença e atualiza estoque
    const currentProducts = await getProducts();
    const processedKeys = new Set<string>();
    const getKey = (ref: string, color: string) => `${ref}:::${color}`;

    const oldMap: Record<string, OrderItem> = {};
    oldItems.forEach(i => oldMap[getKey(i.reference, i.color)] = i);

    const newMap: Record<string, OrderItem> = {};
    processedItems.forEach(i => newMap[getKey(i.reference, i.color)] = i);

    Object.keys(oldMap).forEach(k => processedKeys.add(k));
    Object.keys(newMap).forEach(k => processedKeys.add(k));

    for (const key of processedKeys) {
        const [ref, color] = key.split(':::');
        const oldItem = oldMap[key];
        const newItem = newMap[key];
        const product = currentProducts.find(p => p.reference === ref && p.color === color);

        if (product) {
            let stockChanged = false;
            const newStock = { ...product.stock };
            
            const oldPicked = oldItem?.picked || {};
            const oldOrderedSizes = oldItem?.sizes || {};
            const newPicked = newItem?.picked || {};
            const newOrderedSizes = newItem?.sizes || {};

            const allSizes = new Set([
                ...Object.keys(oldPicked), ...Object.keys(oldOrderedSizes),
                ...Object.keys(newPicked), ...Object.keys(newOrderedSizes)
            ]);

            allSizes.forEach(size => {
                const qOldOrdered = oldOrderedSizes[size] || 0;
                const qOldPicked = oldPicked[size] || 0;
                const qNewOrdered = newOrderedSizes[size] || 0;
                const qNewPicked = newPicked[size] || 0;

                let delta = 0;
                if (!product.enforceStock) {
                    delta = qNewPicked - qOldPicked;
                } else {
                    delta = qNewOrdered - qOldOrdered;
                }

                if (delta !== 0) {
                    const currentStockQty = newStock[size] || 0;
                    newStock[size] = currentStockQty - delta;
                    stockChanged = true;
                }
            });

            if (stockChanged) {
                 await updateProductInventory(product.id, newStock, product.enforceStock, product.basePrice);
            }
        }
    }

    return mapOrderFromApi(updatedRow);
};

// --- REP PRICES ---
export const getRepPrices = async (repId: string): Promise<RepPrice[]> => {
  try {
      const res = await fetch(`${API_URL}/rep_prices?rep_id=${repId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((d: any) => ({
        id: d.id,
        repId: d.rep_id,
        reference: d.reference,
        price: parseFloat(d.price)
      }));
  } catch (e) {
      return [];
  }
};

export const upsertRepPrice = async (priceData: RepPrice): Promise<void> => {
  const res = await fetch(`${API_URL}/rep_prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        rep_id: priceData.repId,
        reference: priceData.reference,
        price: priceData.price
    })
  });
  if (!res.ok) throw new Error("Erro ao salvar preço");
};

// --- CLIENTS ---
export const getClients = async (repId?: string): Promise<Client[]> => {
  let url = `${API_URL}/clients`;
  if (repId) url += `?rep_id=${repId}`;
  
  try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((row: any) => ({
        id: row.id,
        repId: row.rep_id,
        name: row.name,
        city: row.city,
        neighborhood: row.neighborhood,
        state: row.state
      }));
  } catch (e) { return []; }
};

export const addClient = async (client: Client): Promise<void> => {
  const dbClient = {
    id: client.id,
    rep_id: client.repId,
    name: client.name,
    city: client.city,
    neighborhood: client.neighborhood,
    state: client.state
  };

  const res = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbClient)
  });
  if (!res.ok) throw new Error("Erro ao adicionar cliente");
};

export const updateClient = async (updatedClient: Client): Promise<void> => {
  const dbClient = {
    rep_id: updatedClient.repId,
    name: updatedClient.name,
    city: updatedClient.city,
    neighborhood: updatedClient.neighborhood,
    state: updatedClient.state
  };

  const res = await fetch(`${API_URL}/clients/${updatedClient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbClient)
  });
  if (!res.ok) throw new Error("Erro ao atualizar cliente");
};

export const deleteClient = async (id: string): Promise<void> => {
  const res = await fetch(`${API_URL}/clients/${id}`, { method: 'DELETE' });
  if (!res.ok) {
      const err = await res.json();
      if (err.message === 'foreign key constraint') {
          throw new Error("foreign key constraint");
      }
      throw new Error("Erro ao deletar cliente");
  }
};

// --- ORDERS ---
const mapOrderFromApi = (row: any): Order => {
    let items = row.items;
    // Handle stringified JSON from older versions or raw DB response
    if (typeof items === 'string') items = JSON.parse(items);
    if (items && !Array.isArray(items) && items.list) items = items.list;

    return {
      ...row,
      id: row.id,
      displayId: row.display_id,
      romaneio: row.romaneio,
      isPartial: row.is_partial,
      repId: row.rep_id,
      repName: row.rep_name,
      clientId: row.client_id,
      clientName: row.client_name,
      clientCity: row.client_city,
      clientState: row.client_state,
      createdAt: row.created_at,
      deliveryDate: row.delivery_date,
      paymentMethod: row.payment_method,
      status: row.status,
      items: Array.isArray(items) ? items : [], 
      totalPieces: row.total_pieces,
      subtotalValue: parseFloat(row.subtotal_value) || 0,
      discountType: row.discount_type,
      discountValue: parseFloat(row.discount_value) || 0,
      finalTotalValue: parseFloat(row.final_total_value) || 0
    };
};

export const getOrders = async (): Promise<Order[]> => {
  try {
      const res = await fetch(`${API_URL}/orders`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.map(mapOrderFromApi);
  } catch (e) { return []; }
};

const checkRomaneioExists = async (romaneio: string, excludeOrderId?: string): Promise<boolean> => {
    if (!romaneio) return false;
    let url = `${API_URL}/orders?romaneio=${romaneio}`;
    if (excludeOrderId) url += `&excludeId=${excludeOrderId}`;
    
    const res = await fetch(url);
    const data = await res.json();
    return data && data.length > 0;
};

export const addOrder = async (order: Omit<Order, 'displayId'>): Promise<Order | null> => {
  if (order.romaneio) {
      const exists = await checkRomaneioExists(order.romaneio);
      if (exists) throw new Error(`O Romaneio nº ${order.romaneio} já existe.`);
  }

  // 1. Sequencial do ID (Via API Config)
  let newSeq = 1000;
  try {
      const resConfig = await fetch(`${API_URL}/config/order_seq`);
      const configData = await resConfig.json();
      
      if (configData) {
          newSeq = configData.value + 1;
          // Update Config
          await fetch(`${API_URL}/config`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ key: 'order_seq', value: newSeq })
          });
      }
  } catch (err) {
    newSeq = Math.floor(Date.now() / 1000) % 100000;
  }

  const orderWithSeq = { ...order, displayId: newSeq };

  const dbOrder = {
    id: orderWithSeq.id,
    display_id: orderWithSeq.displayId,
    romaneio: orderWithSeq.romaneio || null,
    is_partial: orderWithSeq.isPartial || false,
    rep_id: orderWithSeq.repId,
    rep_name: orderWithSeq.repName,
    client_id: orderWithSeq.clientId,
    client_name: orderWithSeq.clientName,
    client_city: orderWithSeq.clientCity,
    client_state: orderWithSeq.clientState,
    created_at: orderWithSeq.createdAt,
    delivery_date: orderWithSeq.deliveryDate,
    payment_method: orderWithSeq.paymentMethod,
    status: orderWithSeq.status,
    items: orderWithSeq.items, 
    total_pieces: orderWithSeq.totalPieces,
    subtotal_value: orderWithSeq.subtotalValue,
    discount_type: orderWithSeq.discountType,
    discount_value: orderWithSeq.discountValue,
    final_total_value: orderWithSeq.finalTotalValue
  };

  const res = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbOrder)
  });
  
  if (!res.ok) throw new Error("Erro desconhecido ao salvar no banco");

  try {
      await updateStockOnOrderCreation(orderWithSeq.items);
  } catch (err) {
      console.error("Pedido salvo, mas erro ao atualizar estoque:", err);
  }

  return orderWithSeq as Order;
};

export const updateOrderRomaneio = async (id: string, romaneio: string): Promise<void> => {
  const exists = await checkRomaneioExists(romaneio, id);
  if (exists) throw new Error(`O Romaneio nº ${romaneio} já existe em outro pedido.`);

  const res = await fetch(`${API_URL}/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ romaneio })
  });
  if (!res.ok) throw new Error("Erro ao atualizar romaneio");
};

export const updateOrderStatus = async (id: string, status: 'open' | 'printed'): Promise<void> => {
  await fetch(`${API_URL}/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
  });
};

export const initializeStorage = () => {
  console.log("Serviço de armazenamento LOCAL (PostgreSQL) inicializado.");
};
