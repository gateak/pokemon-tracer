# Pokemon Collectible Price Tracker

A tool for tracking and analyzing prices of Pokemon collectibles from PriceCharting.com.

## Overview

This tool allows you to:

1. Scrape sales data for Pokemon collectibles (cards, booster boxes, etc.) from PriceCharting
2. Store the data in JSON and CSV formats
3. Generate statistical analysis and reports on pricing trends

## Requirements

- Node.js (v14 or higher)
- npm

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/pokemon-collectible-price-tracker.git
cd pokemon-collectible-price-tracker

# Install dependencies
npm install
```

## Usage

### Basic Usage

```bash
node collectible-price-tracker.js
```

This will run the tracker with default settings (Pokemon Astral Radiance Booster Box).

### Command Line Options

```bash
node collectible-price-tracker.js [options]

Options:
  --type, -t <type>      Specify the collectible type to track
  --analyze-only, -a     Only analyze existing data without scraping new data
  --help, -h             Show help information
```

### Examples

```bash
# Track prices for Pokemon Astral Radiance Booster Box (default)
node collectible-price-tracker.js

# Track a different collectible (if configured)
node collectible-price-tracker.js --type pokemon-silver-tempest

# Analyze existing data without scraping new data
node collectible-price-tracker.js --analyze-only
```

## Data Structure

All data is stored in the `data/` directory, organized by collectible type:

```
data/
  pokemon-astral-radiance/
    sales-data.json       # Raw sales data in JSON format
    sales-data.csv        # Raw sales data in CSV format
    summary.json          # Statistical summary
    analysis.md           # Markdown report with analysis
```

## Adding New Collectibles

To track a new Pokemon collectible, add a new configuration to the `collectibleConfigs` object in `collectible-price-tracker.js`:

```javascript
const collectibleConfigs = {
  'pokemon-astral-radiance': createPokemonConfig('astral-radiance', 'booster-box'),
  'pokemon-silver-tempest': createPokemonConfig('silver-tempest', 'booster-box'),
  // Add more configurations here
};
```

## For Python Programmers / Data Analysts

### Accessing the Data

The data is stored in standard JSON and CSV formats, which can be easily loaded into Python using libraries like pandas:

```python
import pandas as pd
import json

# Load CSV data
df = pd.read_csv('data/pokemon-astral-radiance/sales-data.csv')

# Load JSON data
with open('data/pokemon-astral-radiance/sales-data.json') as f:
    data = json.load(f)

# Load summary statistics
with open('data/pokemon-astral-radiance/summary.json') as f:
    summary = json.load(f)
```

### Analysis Opportunities

The data is well-structured for various analyses:

1. Time series analysis of price trends
2. Price correlation with card/set attributes
3. Market seasonality analysis
4. Predictive modeling for future prices
5. Visualization dashboards (using matplotlib, seaborn, or plotly)

### Potential Improvements

For Python developers looking to enhance this tool:

1. Create a Python version using libraries like BeautifulSoup or Selenium
2. Implement advanced statistical analysis using scipy or statsmodels
3. Add machine learning models to predict price trends
4. Create interactive dashboards with Dash or Streamlit
5. Implement database storage (SQLite, PostgreSQL) for better data management
6. Add automated data refresh schedules using tools like Airflow
7. Expand to track more collectible types and markets

## File Structure

- `collectible-price-tracker.js` - Main script for scraping and analyzing data
- `package.json` - Project configuration and dependencies
- `data/` - Directory containing all scraped data and analyses

## License

[ISC License](LICENSE)
