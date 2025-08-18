const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Database connection string
const connectionString = 'postgres://postgres:4582851d42f33edc95b0@dpbdp1.easypanel.host:140/servidor?sslmode=disable';

// Function to generate SQL schema from Prisma
async function generateSchema() {
  return new Promise((resolve, reject) => {
    console.log('Generating SQL schema from Prisma...');
    
    // Use Prisma to generate SQL
    exec('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', 
      { cwd: path.resolve(__dirname, '..') }, 
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error generating schema: ${error.message}`);
          return reject(error);
        }
        if (stderr) {
          console.error(`Schema generation stderr: ${stderr}`);
        }
        
        // Save SQL to file
        const sqlPath = path.resolve(__dirname, '../prisma/schema.sql');
        fs.writeFileSync(sqlPath, stdout);
        console.log(`SQL schema generated and saved to ${sqlPath}`);
        
        resolve(stdout);
      }
    );
  });
}

// Function to execute SQL on the database
async function executeSql(sql) {
  const client = new Client({
    connectionString,
  });
  
  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Executing SQL...');
    // Split the SQL into separate statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await client.query(statement + ';');
        } catch (err) {
          console.error(`Error executing statement: ${err.message}`);
          console.error(`Statement: ${statement}`);
          // Continue with next statement
        }
      }
    }
    
    console.log('SQL execution completed');
  } catch (err) {
    console.error('Database error:', err);
    throw err;
  } finally {
    await client.end();
  }
}

// Main function
async function main() {
  try {
    // Generate schema
    const sql = await generateSchema();
    
    // Execute schema
    await executeSql(sql);
    
    console.log('Database schema created successfully!');
  } catch (err) {
    console.error('Failed to create schema:', err);
    process.exit(1);
  }
}

// Run the script
main();
