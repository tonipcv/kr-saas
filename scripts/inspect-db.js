const { Client } = require('pg');

const connectionString = 'postgres://postgres:4582851d42f33edc95b0@dpbdp1.easypanel.host:140/servidor?sslmode=disable';

async function inspectDatabase() {
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to database');
    
    // Check if the User table exists and get its schema
    console.log('Checking User table...');
    const tableResult = await client.query(`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_name = 'User' OR table_name = 'user';
    `);
    console.log('Tables found:', tableResult.rows);
    
    // Get column information for the User table
    if (tableResult.rows.length > 0) {
      const tableName = tableResult.rows[0].table_name;
      const schemaName = tableResult.rows[0].table_schema;
      
      console.log(`Getting columns for ${schemaName}.${tableName}...`);
      const columnResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = $2;
      `, [tableName, schemaName]);
      
      console.log('Columns:', columnResult.rows);
      
      // Check specifically for stripe_connect_id
      const hasStripeConnectId = columnResult.rows.some(
        col => col.column_name === 'stripe_connect_id'
      );
      console.log('Has stripe_connect_id column:', hasStripeConnectId);
    }
  } catch (error) {
    console.error('Error inspecting database:', error);
  } finally {
    await client.end();
  }
}

inspectDatabase();
