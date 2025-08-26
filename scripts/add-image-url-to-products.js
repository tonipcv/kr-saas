/**
 * Script to add imageUrl field to products table using direct SQL
 * 
 * This script adds an imageUrl column to the products table
 * to support displaying product images on the public products page.
 * It uses the sqlite3 package to execute SQL directly against the SQLite database.
 */

// Import the sqlite3 package for SQLite connection
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const readline = require('readline');
const fs = require('fs');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Path to the SQLite database file
const dbPath = path.join(__dirname, '../prisma/dev.db');

async function main() {
  // Check if database file exists
  if (!fs.existsSync(dbPath)) {
    console.error(`Database file not found at: ${dbPath}`);
    console.error('Please check the path to your SQLite database file.');
    process.exit(1);
  }

  console.log(`Using database at: ${dbPath}`);
  
  // Open database connection
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
    console.log('Connected to the SQLite database.');
  });

  try {
    console.log('Starting SQL migration: Adding imageUrl field to products table...');
    
    // Execute SQL to add the imageUrl column if it doesn't exist
    db.run(`PRAGMA foreign_keys = ON;`);
    
    // In SQLite, we need to check if column exists first as there's no direct 'ADD COLUMN IF NOT EXISTS'
    db.all(`PRAGMA table_info(products)`, (err, rows) => {
      if (err) {
        console.error('Error checking table schema:', err.message);
        closeAndExit(db, 1);
        return;
      }
      
      // Check if imageUrl column already exists
      const columnExists = rows && Array.isArray(rows) && rows.some(row => row.name === 'imageUrl');
      
      if (columnExists) {
        console.log('Column imageUrl already exists in products table.');
        askForExampleImages(db);
      } else {
        // Add the column if it doesn't exist
        db.run(`ALTER TABLE products ADD COLUMN imageUrl TEXT;`, (err) => {
          if (err) {
            console.error('Error adding imageUrl column:', err.message);
            closeAndExit(db, 1);
            return;
          }
          
          console.log('SQL migration completed successfully!');
          console.log('Products table now has imageUrl field.');
          
          askForExampleImages(db);
        });
      }
    });
    
  } catch (error) {
    console.error('Error during SQL migration:', error);
    closeAndExit(db, 1);
  }
}

function askForExampleImages(db) {
  rl.question('Would you like to add example image URLs to some products? (y/n) ', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      console.log('Adding example image URLs to some products...');
      
      // Get some products to update
      db.all(`SELECT id, name FROM products WHERE isActive = 1 LIMIT 5`, [], (err, products) => {
        if (err) {
          console.error('Error fetching products:', err.message);
          closeAndExit(db, 1);
          return;
        }
        
        if (products.length === 0) {
          console.log('No active products found to update.');
          closeAndExit(db, 0);
          return;
        }
        
        // Example image URLs (placeholder images)
        const exampleImages = [
          'https://placehold.co/400x300/e2f4ff/0a2540?text=Product+Image',
          'https://placehold.co/400x300/fff5e2/403c0a?text=Health+Product',
          'https://placehold.co/400x300/f0e2ff/340a40?text=Wellness+Item',
          'https://placehold.co/400x300/e2ffea/0a4023?text=Natural+Product',
          'https://placehold.co/400x300/ffe2e2/400a0a?text=Premium+Item'
        ];
        
        // Update each product with a different example image
        let updatedCount = 0;
        
        products.forEach((product, i) => {
          const imageUrl = exampleImages[i % exampleImages.length];
          
          db.run(`UPDATE products SET imageUrl = ? WHERE id = ?`, 
            [imageUrl, product.id], 
            function(err) {
              if (err) {
                console.error(`Error updating product ${product.name}:`, err.message);
                return;
              }
              
              console.log(`Updated product ${product.name} with an example image URL`);
              updatedCount++;
              
              // Check if all updates are complete
              if (updatedCount === products.length) {
                console.log(`Added example image URLs to ${updatedCount} products.`);
                closeAndExit(db, 0);
              }
            }
          );
        });
      });
    } else {
      closeAndExit(db, 0);
    }
  });
}

function closeAndExit(db, exitCode) {
  console.log('Script execution completed.');
  
  // Close the database connection
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
      process.exit(1);
    }
    
    console.log('Database connection closed.');
    rl.close();
    process.exit(exitCode);
  });
}

// Check if sqlite3 package is installed
try {
  require.resolve('sqlite3');
  main();
} catch (e) {
  console.error('The sqlite3 package is not installed. Please install it with:');
  console.error('npm install sqlite3');
  console.error('\nOr if you use yarn:');
  console.error('yarn add sqlite3');
  process.exit(1);
}
