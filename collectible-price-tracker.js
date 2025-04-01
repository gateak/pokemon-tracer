const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Configuration for different collectible types
/**
 * Creates a configuration for a Pokemon collectible
 * @param {string} set - The name of the Pokemon set (e.g., 'astral-radiance')
 * @param {string} productType - The product type (e.g., 'booster-box')
 * @returns {object} - Configuration object for the collectible
 */
function createPokemonConfig(set, productType) {
  const formattedSet = set.toLowerCase().replace(/\s+/g, '-');
  const formattedType = productType.toLowerCase().replace(/\s+/g, '-');

  return {
    name: `Pokemon ${set.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} ${productType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}`,
    url: `https://www.pricecharting.com/game/pokemon-${formattedSet}/${formattedType}`,
    selectors: {
      salesTable: 'table.hoverable-rows.sortable',
      dateCell: 'td.date',
      titleCell: 'td.title a',
      priceCell: 'td.numeric span.js-price'
    }
  };
}

const collectibleConfigs = {
  'pokemon-astral-radiance': createPokemonConfig('astral-radiance', 'booster-box'),
  // Add more configurations easily:
  // 'pokemon-silver-tempest': createPokemonConfig('silver-tempest', 'booster-box'),
  // 'pokemon-brilliant-stars': createPokemonConfig('brilliant-stars', 'etb'),
};

/**
 * Main function to run the collectible price tracker
 * @param {string} collectibleType - Type of collectible to scrape
 * @param {boolean} analyzeOnly - Whether to only analyze existing data without scraping
 */
async function trackCollectiblePrices(collectibleType, analyzeOnly = false) {
  // Check if the collectible type is supported
  if (!collectibleConfigs[collectibleType]) {
    console.error(`Error: Collectible type '${collectibleType}' not found in configuration.`);
    console.log('Available collectible types:');
    Object.keys(collectibleConfigs).forEach(type => {
      console.log(`- ${type} (${collectibleConfigs[type].name})`);
    });
    return;
  }

  const config = collectibleConfigs[collectibleType];
  const outputDir = path.join('data', collectibleType);

  // Create output directory if it doesn't exist
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Output directory created: ${outputDir}`);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error(`Error creating output directory: ${error.message}`);
      return;
    }
  }

  const salesDataPath = path.join(outputDir, 'sales-data.json');

  // Scrape data if not in analyze-only mode
  if (!analyzeOnly) {
    try {
      const salesData = await scrapeCollectibleData(config);

      if (salesData.length > 0) {
        // Save the data to a JSON file
        await fs.writeFile(salesDataPath, JSON.stringify(salesData, null, 2));
        console.log(`Successfully extracted ${salesData.length} sales for ${config.name}`);

        // Create a CSV file
        const csvPath = path.join(outputDir, 'sales-data.csv');
        const csvHeader = 'Date,Title,Price,URL,ID\n';
        const csvRows = salesData.map(sale => {
          // Escape commas and quotes in the title
          const safeTitle = `"${sale.title.replace(/"/g, '""')}"`;
          return `${sale.date},${safeTitle},${sale.price},${sale.url},${sale.id}`;
        });

        await fs.writeFile(csvPath, csvHeader + csvRows.join('\n'));
        console.log(`Saved data to ${csvPath}`);
      } else {
        console.log('No sales data found');
        if (analyzeOnly) {
          return;
        }
      }
    } catch (error) {
      console.error('Error during scraping:', error);
      if (analyzeOnly) {
        return;
      }
    }
  }

  // Analyze the data
  try {
    const salesData = JSON.parse(await fs.readFile(salesDataPath, 'utf8'));
    await analyzeCollectibleData(salesData, config, outputDir);
  } catch (error) {
    console.error('Error during analysis:', error);
    if (error.code === 'ENOENT') {
      console.log(`No data file found at ${salesDataPath}. Run without --analyze-only flag to scrape data first.`);
    }
  }
}

/**
 * Scrape collectible data from PriceCharting
 * @param {object} config - Configuration for the collectible
 * @returns {Array} - Array of sales data
 */
async function scrapeCollectibleData(config) {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: null,
    args: ['--window-size=1280,800']
  });

  try {
    console.log(`Starting browser and navigating to ${config.name} page...`);
    const page = await browser.newPage();

    await page.goto(`${config.url}#completed-auctions-used`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('Page loaded, extracting sales data...');

    // Extract the sales data directly from the table
    const salesData = await page.evaluate((selectors) => {
      const sales = [];

      // Get all rows from the sales table
      const rows = document.querySelectorAll(`${selectors.salesTable} tbody tr`);

      if (rows.length === 0) {
        console.log('No sales rows found');
        return sales;
      }

      console.log(`Found ${rows.length} sales rows`);

      rows.forEach(row => {
        // Extract data from each cell
        const dateCell = row.querySelector(selectors.dateCell);
        const titleCell = row.querySelector(selectors.titleCell);
        const priceCell = row.querySelector(selectors.priceCell);

        if (dateCell && titleCell && priceCell) {
          const id = row.id ? row.id.replace('ebay-', '') : '';

          sales.push({
            date: dateCell.textContent.trim(),
            title: titleCell.textContent.trim(),
            price: priceCell.textContent.trim(),
            url: titleCell.href,
            id: id
          });
        }
      });

      return sales;
    }, config.selectors);

    // Take a screenshot for reference
    const screenshotPath = path.join('data', config.url.split('/').pop(), 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);

    return salesData;
  } catch (error) {
    console.error('Error during scraping:', error);
    throw error;
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

/**
 * Analyze collectible data and generate reports
 * @param {Array} salesData - Array of sales data
 * @param {object} config - Configuration for the collectible
 * @param {string} outputDir - Directory to save analysis files
 */
async function analyzeCollectibleData(salesData, config, outputDir) {
  if (salesData.length === 0) {
    console.log('No sales data to analyze');
    return;
  }

  // Parse prices and sort them
  const prices = salesData.map(sale => {
    const price = parseFloat(sale.price.replace('$', '').replace(',', ''));
    return {
      date: sale.date,
      title: sale.title,
      price: price,
      formattedPrice: sale.price
    };
  }).sort((a, b) => a.price - b.price);

  // Calculate statistics
  const totalSales = prices.length;
  const sum = prices.reduce((total, item) => total + item.price, 0);
  const average = sum / totalSales;
  const median = prices[Math.floor(totalSales / 2)].price;
  const min = prices[0].price;
  const max = prices[prices.length - 1].price;

  // Create summary
  const summary = {
    collectible: config.name,
    totalSales,
    average: average.toFixed(2),
    median: median.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2),
    range: (max - min).toFixed(2),
    standardDeviation: calculateStandardDeviation(prices.map(p => p.price)).toFixed(2)
  };

  // Save summary to a JSON file
  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Print summary to console
  console.log(`\n=== ${config.name} Sales Analysis ===`);
  console.log(`Total sales analyzed: ${summary.totalSales}`);
  console.log(`Average price: $${summary.average}`);
  console.log(`Median price: $${summary.median}`);
  console.log(`Lowest price: $${summary.min} (${prices[0].title.substring(0, 40)}...)`);
  console.log(`Highest price: $${summary.max} (${prices[prices.length - 1].title.substring(0, 40)}...)`);
  console.log(`Price range: $${summary.range}`);
  console.log(`Standard deviation: $${summary.standardDeviation}`);

  // Generate breakdown by price range
  // Dynamically determine price ranges based on min and max
  const rangeSize = 20;  // $20 increments
  const baseMin = Math.floor(min / rangeSize) * rangeSize;
  const baseMax = Math.ceil(max / rangeSize) * rangeSize;

  const ranges = [];
  for (let i = baseMin; i < baseMax; i += rangeSize) {
    ranges.push({ min: i, max: i + rangeSize });
  }

  console.log('\n=== Price Distribution ===');
  ranges.forEach(range => {
    const count = prices.filter(p => p.price >= range.min && p.price < range.max).length;
    const percentage = (count / totalSales * 100).toFixed(1);
    console.log(`$${range.min} - $${range.max}: ${count} sales (${percentage}%)`);
  });

  // Generate markdown report
  const report = [
    `# ${config.name} - Sales Analysis`,
    `Report generated on ${new Date().toLocaleDateString()}`,
    '',
    '## Summary',
    `- **Total Sales:** ${summary.totalSales}`,
    `- **Average Price:** $${summary.average}`,
    `- **Median Price:** $${summary.median}`,
    `- **Price Range:** $${summary.min} - $${summary.max}`,
    `- **Standard Deviation:** $${summary.standardDeviation}`,
    '',
    '## Price Distribution',
    '| Price Range | Count | Percentage |',
    '|-------------|-------|------------|'
  ];

  ranges.forEach(range => {
    const count = prices.filter(p => p.price >= range.min && p.price < range.max).length;
    const percentage = (count / totalSales * 100).toFixed(1);
    report.push(`| $${range.min} - $${range.max} | ${count} | ${percentage}% |`);
  });

  report.push('', '## Recent Sales (Last 10)', '');
  report.push('| Date | Price | Title |');
  report.push('|------|-------|-------|');

  // Add the 10 most recent sales
  salesData.slice(0, 10).forEach(sale => {
    report.push(`| ${sale.date} | ${sale.price} | ${sale.title} |`);
  });

  // Save the report
  await fs.writeFile(path.join(outputDir, 'analysis.md'), report.join('\n'));
  console.log(`\nAnalysis report saved to ${path.join(outputDir, 'analysis.md')}`);
}

/**
 * Calculate standard deviation
 * @param {Array} values - Array of numeric values
 * @returns {number} - Standard deviation
 */
function calculateStandardDeviation(values) {
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

// Parse command line arguments
const args = process.argv.slice(2);
let collectibleType = 'pokemon-astral-radiance'; // Default
let analyzeOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' || args[i] === '-t') {
    collectibleType = args[i + 1];
    i++;
  } else if (args[i] === '--analyze-only' || args[i] === '-a') {
    analyzeOnly = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node collectible-price-tracker.js [options]');
    console.log('\nOptions:');
    console.log('  --type, -t <type>     Specify the collectible type');
    console.log('  --analyze-only, -a    Analyze existing data without scraping');
    console.log('  --help, -h            Show this help message');
    console.log('\nAvailable collectible types:');
    Object.keys(collectibleConfigs).forEach(type => {
      console.log(`  ${type} - ${collectibleConfigs[type].name}`);
    });
    console.log('\nExample: node collectible-price-tracker.js --type pokemon-silver-tempest');
    process.exit(0);
  }
}

// Run the main function
trackCollectiblePrices(collectibleType, analyzeOnly);
