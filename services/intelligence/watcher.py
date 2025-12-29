import os
import time
import random
import requests
from bs4 import BeautifulSoup
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# 1. Path Setup: Ensure we find the .env in the project root
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# 2. Database Connection
client = MongoClient(os.getenv("MONGO_URI"))
db = client['test']
products_col = db['products']

# 3. Request Headers (Crucial for Legal/Bot Compliance)
# We use a real browser User-Agent to avoid being blocked
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def get_ebay_price(gtin, title):
    """
    Scrapes the lowest 'Buy It Now' price from eBay for a specific item.
    """
    query = gtin if gtin else title
    # search URL for 'New' condition and 'Buy It Now' items
    search_url = f"https://www.ebay.com/sch/i.html?_nkw={query}&_sop=15&LH_BIN=1&LH_ItemCondition=3"
    
    try:
        # Respectful Delay: 5 to 10 seconds between products to stay in legal limits
        time.sleep(random.uniform(5, 10))
        
        response = requests.get(search_url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.text, 'html.parser')
        
        # eBay's price selector for the first result
        price_tag = soup.select_one(".s-item__price")
        
        if price_tag:
            # Clean data: "$1,299.00" -> 1299.00
            price_text = price_tag.text.replace('$', '').replace(',', '').strip()
            # Handle price ranges (e.g., "$10.00 to $15.00")
            if 'to' in price_text:
                price_text = price_text.split('to')[0].strip()
                
            return float(price_text)
            
    except Exception as e:
        print(f"Error scraping eBay for {title}: {e}")
    return None

def run_sync():
    print("🚀 Starting Market Intelligence Sync...")
    products = list(products_col.find({}))
    success_count = 0

    for p in products:
        market_price = get_ebay_price(p.get('gtin'), p['title'])
        
        if market_price:
            # We save the market price to custom_label_0 (The Watcher's output)
            products_col.update_one(
                {'_id': p['_id']},
                {'$set': {'custom_label_0': str(market_price)}}
            )
            print(f"✅ Found Market Price for {p['title']}: ${market_price}")
            success_count += 1
        else:
            print(f"❌ No match found for {p['title']}")

    print(f"📊 Sync Complete. Updated {success_count}/{len(products)} products.")

if __name__ == "__main__":
    run_sync()