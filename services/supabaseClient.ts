
// Este arquivo não é mais utilizado na versão PostgreSQL Local.
// Mantido apenas para evitar erros de importação se houver resquícios.
export const supabase = {
    from: () => ({ select: () => ({}), insert: () => ({}), update: () => ({}), delete: () => ({}) }),
    channel: () => ({ on: () => ({ subscribe: () => {} }), unsubscribe: () => {} }),
    removeChannel: () => {}
} as any;
