const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

/**
 * Extract price history data from the HTML content
 * @param {string} html - HTML content of the page
 * @returns {object} - Object containing price history data
 */
function extractPriceHistoryData(html) {
  try {
    // Find the script tag that contains VGPC.chart_data
    // Use a more robust pattern to match the entire script block
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?VGPC\.chart_data\s*=\s*({[\s\S]*?});[\s\S]*?)<\/script>/);

    if (!scriptMatch) {
      console.log('No script tag with price history data found in HTML');
      return {};
    }

    // Extract the relevant script content
    const scriptContent = scriptMatch[1];

    // Extract chart data using a safer approach
    let chartData = {};
    const chartDataMatch = scriptContent.match(/VGPC\.chart_data\s*=\s*({[\s\S]*?});/);
    if (chartDataMatch) {
      try {
        // Clean the JSON string before parsing
        const chartDataString = chartDataMatch[1].trim()
          .replace(/(\w+):/g, '"$1":') // Convert property names to quoted strings
          .replace(/'/g, '"'); // Replace single quotes with double quotes

        chartData = JSON.parse(chartDataString);
        console.log('Successfully extracted chart data');
      } catch (e) {
        console.error('Error parsing chart data:', e);

        // Save the problematic JSON string for debugging
        fs.writeFile('debug-chart-data.txt', chartDataMatch[1]).catch(err => {});
      }
    }

    // Extract volume data
    let volumeData = {};
    const volumeDataMatch = scriptContent.match(/VGPC\.volume_data\s*=\s*({[\s\S]*?});/);
    if (volumeDataMatch) {
      try {
        const volumeDataString = volumeDataMatch[1].trim()
          .replace(/(\w+):/g, '"$1":')
          .replace(/'/g, '"');

        volumeData = JSON.parse(volumeDataString);
        console.log('Successfully extracted volume data');
      } catch (e) {
        console.error('Error parsing volume data:', e);

        // Save for debugging
        fs.writeFile('debug-volume-data.txt', volumeDataMatch[1]).catch(err => {});
      }
    }

    // Extract product data with improved handling
    let productData = {};
    const productDataMatch = scriptContent.match(/VGPC\.product\s*=\s*({[\s\S]*?});/);
    if (productDataMatch) {
      try {
        // Get the raw string
        const rawProductDataString = productDataMatch[1].trim();

        // Save the original for debugging
        fs.writeFile('debug-product-data-original.txt', rawProductDataString).catch(err => {});

        // More comprehensive conversion to valid JSON
        let productDataString = rawProductDataString
          // Handle any property name followed by a colon (not just word chars)
          .replace(/([a-zA-Z0-9_$]+)\s*:/g, '"$1":')
          // Replace single quotes with double quotes
          .replace(/'/g, '"')
          // Remove trailing commas in objects
          .replace(/,\s*}/g, '}')
          // Remove trailing commas in arrays
          .replace(/,\s*\]/g, ']')
          // Handle boolean values
          .replace(/:\s*true/g, ': true')
          .replace(/:\s*false/g, ': false');

        // Save the processed string for debugging
        fs.writeFile('debug-product-data-processed.txt', productDataString).catch(err => {});

        productData = JSON.parse(productDataString);
        console.log('Successfully extracted product data');
      } catch (e) {
        console.error('Error parsing product data:', e, 'Check debug files for details');
      }
    }

    return {
      chartData,
      volumeData,
      productData
    };
  } catch (error) {
    console.error('Error in extractPriceHistoryData:', error);
    return {};
  }
}

/**
 * Fetch data from a URL
 * @param {string} url - URL to fetch data from
 * @returns {Promise<string>} - HTML content
 */
async function fetchURL(url, email, password) {
  try {
    // Optional: Login first if credentials are provided
    let cookies = '';
    if (email && password) {
      const loginResponse = await fetch("https://www.pricecharting.com/login", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0",
          "Accept": "text/html,application/xhtml+xml,application/xml",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `return=https%3A%2F%2Fwww.pricecharting.com%2F&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        method: "POST",
      });

      if (loginResponse.headers.raw()['set-cookie']) {
        cookies = loginResponse.headers.raw()['set-cookie'].map(cookie => cookie.split(';')[0]).join('; ');
      }
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0",
        "Accept": "text/html,application/xhtml+xml,application/xml",
        "Cookie": cookies
      }
    });

    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}

/**
 * Save price history data to CSV files
 * @param {object} data - Price history data
 * @param {string} outputDir - Directory to save files to
 */
async function savePriceHistoryToCSV(data, outputDir) {
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    const { chartData, volumeData, productData } = data;

    // Save chart data (prices)
    if (chartData) {
      for (const condition in chartData) {
        if (chartData[condition].length === 0) continue;

        const conditionFilePath = path.join(outputDir, `price-history-${condition}.csv`);
        const csvHeader = 'Date,Price\n';
        const csvRows = chartData[condition].map(entry => {
          const date = new Date(entry[0]).toISOString().split('T')[0];
          const price = (entry[1] / 100).toFixed(2);
          return `${date},${price}`;
        });

        await fs.writeFile(conditionFilePath, csvHeader + csvRows.join('\n'));
        console.log(`Saved price history data for ${condition} to ${conditionFilePath}`);
      }
    }

    // Save volume data
    if (volumeData && volumeData.volume) {
      const volumeFilePath = path.join(outputDir, `volume-data.csv`);
      const csvHeader = 'Date,Volume\n';
      const csvRows = volumeData.volume.map(entry => {
        const date = new Date(entry[0]).toISOString().split('T')[0];
        const volume = entry[1];
        return `${date},${volume}`;
      });

      await fs.writeFile(volumeFilePath, csvHeader + csvRows.join('\n'));
      console.log(`Saved volume data to ${volumeFilePath}`);
    }

    // Save product metadata
    if (productData) {
      const metadataPath = path.join(outputDir, 'product-metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(productData, null, 2));
      console.log(`Saved product metadata to ${metadataPath}`);
    }

    console.log('All data saved successfully!');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

/**
 * Main function to extract price history
 */
async function extractPriceHistory(url, outputDir, email = null, password = null) {
  try {
    console.log(`Fetching data from ${url}...`);
    const html = await fetchURL(url, email, password);

    // Save HTML for reference
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'page.html'), html);

    console.log('Extracting price history data...');
    const priceData = extractPriceHistoryData(html);

    if (Object.keys(priceData.chartData || {}).length === 0) {
      console.log('No price history data found');
      return;
    }

    console.log('Price history data extracted, saving to CSV...');
    await savePriceHistoryToCSV(priceData, outputDir);
  } catch (error) {
    console.error('Error extracting price history:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let url = null;
let collection = 'pokemon-silver-tempest';
let productType = 'booster-box';
let baseOutputDir = 'data';
let email = 'akbar@nexgendistro.com';
let password = 'password';

/**
 * Build URL from collection and product type
 * @param {string} collection - Collection name (e.g., pokemon-silver-tempest)
 * @param {string} productType - Product type (e.g., booster-box)
 * @returns {string} - Complete URL
 */
function buildUrl(collection, productType) {
  return `https://www.pricecharting.com/game/${collection}/${productType}`;
}

/**
 * Build output directory path based on collection and product type
 * @param {string} baseDir - Base output directory
 * @param {string} collection - Collection name
 * @param {string} productType - Product type
 * @returns {string} - Output directory path
 */
function buildOutputDir(baseDir, collection, productType) {
  return path.join(baseDir, collection, productType);
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' || args[i] === '-u') {
    url = args[i + 1];
    i++;
  } else if (args[i] === '--collection' || args[i] === '-c') {
    collection = args[i + 1];
    i++;
  } else if (args[i] === '--type' || args[i] === '-t') {
    productType = args[i + 1];
    i++;
  } else if (args[i] === '--output' || args[i] === '-o') {
    baseOutputDir = args[i + 1];
    i++;
  } else if (args[i] === '--email' || args[i] === '-e') {
    email = args[i + 1];
    i++;
  } else if (args[i] === '--password' || args[i] === '-p') {
    password = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node price-history-extractor.js [options]');
    console.log('\nOptions:');
    console.log('  --url, -u <url>             URL to extract price history from (overrides collection/type)');
    console.log('  --collection, -c <name>     Collection name (e.g., pokemon-silver-tempest)');
    console.log('  --type, -t <type>           Product type (e.g., booster-box)');
    console.log('  --output, -o <dir>          Base output directory (default: data)');
    console.log('  --email, -e <email>         Email for PriceCharting login (optional)');
    console.log('  --password, -p <pass>       Password for PriceCharting login (optional)');
    console.log('  --help, -h                  Show this help message');
    console.log('\nExamples:');
    console.log('  node price-history-extractor.js --collection pokemon-silver-tempest --type booster-box');
    console.log('  node price-history-extractor.js --url https://www.pricecharting.com/game/pokemon-silver-tempest/booster-box');
    process.exit(0);
  }
}

// If URL wasn't provided directly, build it from collection and product type
if (!url) {
  url = buildUrl(collection, productType);
  console.log(`Using built URL: ${url}`);
}

// Build the output directory path based on collection and product type
const outputDir = buildOutputDir(baseOutputDir, collection, productType);
console.log(`Data will be saved to: ${outputDir}`);

// Run the main function
extractPriceHistory(url, outputDir, email, password);
