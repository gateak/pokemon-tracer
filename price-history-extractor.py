#!/usr/bin/env python3
import os
import re
import json
import csv
import argparse
import requests
from pathlib import Path
from datetime import datetime

def extract_price_history_data(html):
    """
    Extract price history data from the HTML content

    Args:
        html (str): HTML content of the page

    Returns:
        dict: Object containing price history data
    """
    try:
        # Find the script tag that contains VGPC.chart_data
        script_match = re.search(r'<script[^>]*>([\s\S]*?VGPC\.chart_data\s*=\s*({[\s\S]*?});[\s\S]*?)</script>', html)

        if not script_match:
            print('No script tag with price history data found in HTML')
            return {}

        # Extract the relevant script content
        script_content = script_match.group(1)

        # Extract chart data using a safer approach
        chart_data = {}
        chart_data_match = re.search(r'VGPC\.chart_data\s*=\s*({[\s\S]*?});', script_content)
        if chart_data_match:
            try:
                # Clean the JSON string before parsing
                chart_data_string = chart_data_match.group(1).strip()
                chart_data_string = re.sub(r'(\w+):', r'"\1":', chart_data_string)  # Convert property names to quoted strings
                chart_data_string = chart_data_string.replace("'", '"')  # Replace single quotes with double quotes

                chart_data = json.loads(chart_data_string)
                print('Successfully extracted chart data')
            except Exception as e:
                print(f'Error parsing chart data: {e}')

                # Save the problematic JSON string for debugging
                try:
                    with open('debug-chart-data.txt', 'w') as f:
                        f.write(chart_data_match.group(1))
                except Exception:
                    pass

        # Extract volume data
        volume_data = {}
        volume_data_match = re.search(r'VGPC\.volume_data\s*=\s*({[\s\S]*?});', script_content)
        if volume_data_match:
            try:
                volume_data_string = volume_data_match.group(1).strip()
                volume_data_string = re.sub(r'(\w+):', r'"\1":', volume_data_string)
                volume_data_string = volume_data_string.replace("'", '"')

                volume_data = json.loads(volume_data_string)
                print('Successfully extracted volume data')
            except Exception as e:
                print(f'Error parsing volume data: {e}')

                # Save for debugging
                try:
                    with open('debug-volume-data.txt', 'w') as f:
                        f.write(volume_data_match.group(1))
                except Exception:
                    pass

        # Extract product data with improved handling
        product_data = {}
        product_data_match = re.search(r'VGPC\.product\s*=\s*({[\s\S]*?});', script_content)
        if product_data_match:
            try:
                # Get the raw string
                raw_product_data_string = product_data_match.group(1).strip()

                # Save the original for debugging
                try:
                    with open('debug-product-data-original.txt', 'w') as f:
                        f.write(raw_product_data_string)
                except Exception:
                    pass

                # More comprehensive conversion to valid JSON
                product_data_string = raw_product_data_string
                # Handle any property name followed by a colon (not just word chars)
                product_data_string = re.sub(r'([a-zA-Z0-9_$]+)\s*:', r'"\1":', product_data_string)
                # Replace single quotes with double quotes
                product_data_string = product_data_string.replace("'", '"')
                # Remove trailing commas in objects
                product_data_string = re.sub(r',\s*}', '}', product_data_string)
                # Remove trailing commas in arrays
                product_data_string = re.sub(r',\s*\]', ']', product_data_string)
                # Handle boolean values
                product_data_string = re.sub(r':\s*true', ': true', product_data_string)
                product_data_string = re.sub(r':\s*false', ': false', product_data_string)

                # Save the processed string for debugging
                try:
                    with open('debug-product-data-processed.txt', 'w') as f:
                        f.write(product_data_string)
                except Exception:
                    pass

                product_data = json.loads(product_data_string)
                print('Successfully extracted product data')
            except Exception as e:
                print(f'Error parsing product data: {e}, Check debug files for details')

        return {
            'chartData': chart_data,
            'volumeData': volume_data,
            'productData': product_data
        }
    except Exception as error:
        print(f'Error in extract_price_history_data: {error}')
        return {}

def fetch_url(url, email=None, password=None):
    """
    Fetch data from a URL

    Args:
        url (str): URL to fetch data from
        email (str, optional): Email for login
        password (str, optional): Password for login

    Returns:
        str: HTML content
    """
    try:
        # Create a session to maintain cookies
        session = requests.Session()

        # Optional: Login first if credentials are provided
        if email and password:
            login_data = {
                'return': 'https://www.pricecharting.com/',
                'email': email,
                'password': password
            }

            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml',
                'Content-Type': 'application/x-www-form-urlencoded'
            }

            session.post('https://www.pricecharting.com/login', headers=headers, data=login_data)

        # Make the actual request
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml'
        }

        response = session.get(url, headers=headers)
        return response.text
    except Exception as error:
        print(f'Error fetching {url}: {error}')
        raise error

def save_price_history_to_csv(data, output_dir):
    """
    Save price history data to CSV files

    Args:
        data (dict): Price history data
        output_dir (str): Directory to save files to
    """
    try:
        # Create output directory if it doesn't exist
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        chart_data = data.get('chartData', {})
        volume_data = data.get('volumeData', {})
        product_data = data.get('productData', {})

        # Save chart data (prices)
        if chart_data:
            for condition, entries in chart_data.items():
                if not entries:
                    continue

                condition_file_path = output_path / f'price-history-{condition}.csv'

                with open(condition_file_path, 'w', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow(['Date', 'Price'])

                    for entry in entries:
                        date = datetime.fromtimestamp(entry[0]/1000).strftime('%Y-%m-%d')
                        price = f"{entry[1]/100:.2f}"
                        writer.writerow([date, price])

                print(f'Saved price history data for {condition} to {condition_file_path}')

        # Save volume data
        if volume_data and 'volume' in volume_data:
            volume_file_path = output_path / 'volume-data.csv'

            with open(volume_file_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Date', 'Volume'])

                for entry in volume_data['volume']:
                    date = datetime.fromtimestamp(entry[0]/1000).strftime('%Y-%m-%d')
                    volume = entry[1]
                    writer.writerow([date, volume])

            print(f'Saved volume data to {volume_file_path}')

        # Save product metadata
        if product_data:
            metadata_path = output_path / 'product-metadata.json'
            with open(metadata_path, 'w') as f:
                json.dump(product_data, f, indent=2)

            print(f'Saved product metadata to {metadata_path}')

        print('All data saved successfully!')
    except Exception as error:
        print(f'Error saving data: {error}')

def extract_price_history(url, output_dir, email=None, password=None):
    """
    Main function to extract price history

    Args:
        url (str): URL to extract price history from
        output_dir (str): Directory to save data to
        email (str, optional): Email for login
        password (str, optional): Password for login
    """
    try:
        print(f'Fetching data from {url}...')
        html = fetch_url(url, email, password)

        # Save HTML for reference
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        with open(output_path / 'page.html', 'w', encoding='utf-8') as f:
            f.write(html)

        print('Extracting price history data...')
        price_data = extract_price_history_data(html)

        if not price_data.get('chartData'):
            print('No price history data found')
            return

        print('Price history data extracted, saving to CSV...')
        save_price_history_to_csv(price_data, output_dir)
    except Exception as error:
        print(f'Error extracting price history: {error}')

def build_url(collection, product_type):
    """
    Build URL from collection and product type

    Args:
        collection (str): Collection name (e.g., pokemon-silver-tempest)
        product_type (str): Product type (e.g., booster-box)

    Returns:
        str: Complete URL
    """
    return f'https://www.pricecharting.com/game/{collection}/{product_type}'

def build_output_dir(base_dir, collection, product_type):
    """
    Build output directory path based on collection and product type

    Args:
        base_dir (str): Base output directory
        collection (str): Collection name
        product_type (str): Product type

    Returns:
        str: Output directory path
    """
    return os.path.join(base_dir, collection, product_type)

def main():
    parser = argparse.ArgumentParser(description='Extract price history data from PriceCharting.com')

    parser.add_argument('--url', '-u', help='URL to extract price history from (overrides collection/type)')
    parser.add_argument('--collection', '-c', default='pokemon-silver-tempest', help='Collection name (e.g., pokemon-silver-tempest)')
    parser.add_argument('--type', '-t', dest='product_type', default='booster-box', help='Product type (e.g., booster-box)')
    parser.add_argument('--output', '-o', dest='base_output_dir', default='data', help='Base output directory (default: data)')
    parser.add_argument('--email', '-e', default='akbar@nexgendistro.com', help='Email for PriceCharting login (optional)')
    parser.add_argument('--password', '-p', default='password', help='Password for PriceCharting login (optional)')

    args = parser.parse_args()

    url = args.url

    # If URL wasn't provided directly, build it from collection and product type
    if not url:
        url = build_url(args.collection, args.product_type)
        print(f'Using built URL: {url}')

    # Build the output directory path based on collection and product type
    output_dir = build_output_dir(args.base_output_dir, args.collection, args.product_type)
    print(f'Data will be saved to: {output_dir}')

    # Run the main function
    extract_price_history(url, output_dir, args.email, args.password)

if __name__ == '__main__':
    main()
