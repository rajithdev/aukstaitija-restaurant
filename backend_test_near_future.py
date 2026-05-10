#!/usr/bin/env python3
"""
Backend API Testing for Aukstaitija Restaurant Reservation System
Testing with near-future reservations (within 2 hours) to verify instant status sync
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://reservation-alerts.preview.emergentagent.com/api"
ADMIN_TOKEN = "admin123"
HEADERS = {"Content-Type": "application/json"}
ADMIN_HEADERS = {"Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN}

def print_test(test_name):
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print('='*80)

def print_pass(message):
    print(f"✅ PASS: {message}")

def print_fail(message):
    print(f"❌ FAIL: {message}")

def print_info(message):
    print(f"ℹ️  INFO: {message}")

# Test with near-future reservation (within 2 hours)
def test_near_future_table_status_sync():
    print_test("Table Status Sync with Near-Future Reservation (within 2 hours)")
    
    try:
        # Create reservation for 1 hour from now
        now = datetime.now()
        future_time = now + timedelta(hours=1)
        date_str = future_time.strftime('%Y-%m-%d')
        time_str = future_time.strftime('%H:%M')
        
        # Round to nearest 30-minute slot
        minute = int(time_str.split(':')[1])
        if minute < 30:
            time_str = time_str.split(':')[0] + ':00'
        else:
            time_str = time_str.split(':')[0] + ':30'
        
        print_info(f"Creating reservation for {date_str} at {time_str} (within 2 hours)")
        
        payload = {
            "name": "Near Future Test",
            "phone": "+37060088888",
            "email": "nearfuture@example.com",
            "date": date_str,
            "time": time_str,
            "guests": 2,
            "seating_preference": "Window side",
            "occasion": "Test"
        }
        
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Assign table 't7'
        print_info("Assigning table 't7' to reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"table_id": "t7"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        print_pass("Table 't7' assigned")
        
        # Verify table status is 'reserved'
        print_info("Verifying table status is 'reserved'...")
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        tables = table_response.json()
        table_t7 = next((t for t in tables if t.get('id') == 't7'), None)
        
        if not table_t7:
            print_fail("Table 't7' not found")
            return False
        
        if table_t7.get('status') != 'reserved':
            print_fail(f"Expected table status='reserved', got '{table_t7.get('status')}'")
            print_info(f"Reservation time: {date_str} {time_str}")
            print_info(f"Current time: {now.strftime('%Y-%m-%d %H:%M')}")
            return False
        print_pass("Table status is 'reserved' for near-future reservation")
        
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test with far-future reservation (beyond 2 hours)
def test_far_future_table_status():
    print_test("Table Status with Far-Future Reservation (beyond 2 hours)")
    
    try:
        # Create reservation for tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        print_info(f"Creating reservation for {tomorrow} at 19:00 (far future)")
        
        payload = {
            "name": "Far Future Test",
            "phone": "+37060099999",
            "email": "farfuture@example.com",
            "date": tomorrow,
            "time": "19:00",
            "guests": 2,
            "seating_preference": "Window side",
            "occasion": "Test"
        }
        
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Assign table 't8'
        print_info("Assigning table 't8' to reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"table_id": "t8"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        print_pass("Table 't8' assigned")
        
        # Check table status
        print_info("Checking table status...")
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        tables = table_response.json()
        table_t8 = next((t for t in tables if t.get('id') == 't8'), None)
        
        if not table_t8:
            print_fail("Table 't8' not found")
            return False
        
        print_info(f"Table 't8' status: {table_t8.get('status')}")
        
        if table_t8.get('status') == 'reserved':
            print_pass("Table status is 'reserved' (instant sync working for far-future)")
            return True
        else:
            print_info(f"Table status is '{table_t8.get('status')}' (not 'reserved')")
            print_info("This indicates autoUpdateTableStatuses() is overriding the instant sync for far-future reservations")
            return False
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

def main():
    print("\n" + "="*80)
    print("RESERVATION SYSTEM - TABLE STATUS SYNC INVESTIGATION")
    print("="*80)
    
    print_info("Testing to understand the table status sync behavior...")
    print_info("The autoUpdateTableStatuses() function only marks tables as 'reserved'")
    print_info("for reservations within 2 hours. This may be causing test failures.")
    
    near_future_result = test_near_future_table_status_sync()
    far_future_result = test_far_future_table_status()
    
    print("\n" + "="*80)
    print("INVESTIGATION SUMMARY")
    print("="*80)
    
    if near_future_result:
        print_pass("Near-future reservations (within 2 hours): Table status sync WORKING")
    else:
        print_fail("Near-future reservations (within 2 hours): Table status sync FAILING")
    
    if far_future_result:
        print_pass("Far-future reservations (beyond 2 hours): Table status sync WORKING")
    else:
        print_info("Far-future reservations (beyond 2 hours): Table status NOT syncing to 'reserved'")
        print_info("This is due to autoUpdateTableStatuses() logic that only marks tables")
        print_info("as 'reserved' for reservations within 2 hours.")
    
    print("\n" + "="*80)
    print("CONCLUSION")
    print("="*80)
    print_info("The instant table status sync feature has a limitation:")
    print_info("- Tables are only marked 'reserved' for reservations within 2 hours")
    print_info("- For far-future reservations, tables remain 'available' until 2 hours before")
    print_info("- This is controlled by autoUpdateTableStatuses() function (lines 84-116)")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
