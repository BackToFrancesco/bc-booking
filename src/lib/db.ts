import postgres from 'postgres';

const sql = postgres(import.meta.env.DATABASE_URL, { ssl: 'require' });

export default sql;
