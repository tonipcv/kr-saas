const { Client } = require('pg');

const connectionString = 'postgres://postgres:4582851d42f33edc95b0@dpbdp1.easypanel.host:140/servidor?sslmode=disable';

async function fixDatabase() {
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to database');
    
    // Add missing column
    const result = await client.query(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_connect_id" TEXT;
    `);
    
    console.log('Column added successfully:', result);
  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await client.end();
  }
}

fixDatabase();
