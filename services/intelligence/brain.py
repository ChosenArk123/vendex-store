import os
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# 1. Configuration Setup
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# --- BUSINESS LOGIC CONSTANTS (Real World Data) ---
# A 15% margin is the baseline for most small-scale electronics retailers.
MIN_PROFIT_MARGIN = 0.1 

# We limit price drops to 10% per day to avoid being tricked by "fake" low-price listings.
MAX_DAILY_PRICE_CHANGE = 0.10 

# The "Penny Strategy": Be exactly $0.01 cheaper than the lowest competitor.
PRICING_OFFSET = -0.01

def run_pricing_logic():
    client = MongoClient(os.getenv("MONGO_URI"))
    db = client['test']
    products_col = db['products']

    # Fetch all products that have market data from the Watcher
    updates_needed = list(products_col.find({"custom_label_0": {"$exists": True}}))
    
    print(f"🧠 Brain: Analyzing market data for {len(updates_needed)} products...")

    for p in updates_needed:
        try:
            current_price = float(p['price'])
            market_price = float(p['custom_label_0'])
            
            # 1. Calculate Cost Basis
            # If you haven't set a 'cost' field in your DB, we assume a 30% markup as fallback
            cost_basis = float(p.get('cost', current_price * 0.70))

            # 2. Determine Target Price
            suggested_price = market_price + PRICING_OFFSET

            # 3. SAFETY GATE 1: Profit Margin Check
            # Calculation: (Price - Cost) / Price
            potential_margin = (suggested_price - cost_basis) / suggested_price
            
            if potential_margin < MIN_PROFIT_MARGIN:
                print(f"⚠️ Skipped {p['title']}: Margin too low ({potential_margin:.2%})")
                continue

            # 4. SAFETY GATE 2: Volatility Check
            # Prevent the price from swinging more than 10% in one day
            price_delta = abs(suggested_price - current_price) / current_price
            if price_delta > MAX_DAILY_PRICE_CHANGE:
                print(f"⚠️ Skipped {p['title']}: Change too volatile ({price_delta:.2%})")
                # Here we could set a 'flag' for manual review in the Dashboard
                continue

            # 5. EXECUTE UPDATE
            if suggested_price != current_price:
                products_col.update_one(
                    {'_id': p['_id']},
                    {'$set': {'price': suggested_price}}
                )
                print(f"✅ Updated {p['title']}: ${current_price} -> ${suggested_price}")

        except Exception as e:
            print(f"❌ Error processing {p['title']}: {e}")

if __name__ == "__main__":
    run_pricing_logic()