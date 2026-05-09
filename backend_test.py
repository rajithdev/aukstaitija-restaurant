#!/usr/bin/env python3
"""
Backend API Test Suite for Aukstaitija Restaurant
Tests dual-key order lookup functionality (UUID + order_number)
"""

import requests
import json
import re
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "admin123"

def log_test(test_name, passed, details=""):
    """Log test results"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def test_dual_key_order_lookup():
    """Test dual-key order lookup: UUID and order_number (case-insensitive)"""
    print("\n" + "="*80)
    print("TESTING: Dual-Key Order Lookup (UUID + order_number)")
    print("="*80 + "\n")
    
    passed_tests = 0
    total_tests = 0
    
    # Step 1: Create a fresh delivery order
    print("Step 1: Creating a fresh delivery order...")
    total_tests += 1
    
    try:
        # First get a delivery zone
        zones_response = requests.get(f"{BASE_URL}/delivery-zones")
        if zones_response.status_code != 200:
            print(f"❌ Failed to get delivery zones: {zones_response.status_code}")
            return
        
        zones = zones_response.json()
        if not zones or len(zones) == 0:
            print("❌ No delivery zones available")
            return
        
        zone_id = zones[0]['id']
        
        # Get a dish for the order
        dishes_response = requests.get(f"{BASE_URL}/dishes")
        if dishes_response.status_code != 200:
            print(f"❌ Failed to get dishes: {dishes_response.status_code}")
            return
        
        dishes = dishes_response.json()
        if not dishes or len(dishes) == 0:
            print("❌ No dishes available")
            return
        
        dish = dishes[0]
        
        # Create delivery order
        order_payload = {
            "type": "delivery",
            "delivery_zone_id": zone_id,
            "items": [
                {
                    "id": dish['id'],
                    "name": dish['name'],
                    "price": dish['price'],
                    "quantity": 2
                }
            ],
            "customer": {
                "name": "Jonas Petraitis",
                "phone": "+37060012345",
                "email": "jonas@example.com"
            },
            "address": {
                "street": "Laisvės al. 101",
                "city": "Kaunas",
                "postal_code": "44280"
            },
            "payment_method": "cash"
        }
        
        create_response = requests.post(f"{BASE_URL}/orders", json=order_payload)
        
        if create_response.status_code != 200:
            print(f"❌ Failed to create order: {create_response.status_code}")
            print(f"Response: {create_response.text}")
            return
        
        order_data = create_response.json()
        order_id = order_data.get('id')
        order_number = order_data.get('order_number')
        
        # Verify order_number format (AK + 6 digits)
        if not order_number or not re.match(r'^AK\d{6}$', order_number):
            log_test("Order creation - order_number format", False, 
                    f"Expected format AK######, got: {order_number}")
            return
        
        passed_tests += log_test("Order creation with valid order_number format", True,
                                f"UUID: {order_id}, order_number: {order_number}")
        
        print(f"\n📋 Created Order:")
        print(f"   UUID: {order_id}")
        print(f"   Order Number: {order_number}")
        print(f"   Prep Time Total: {order_data.get('prep_time_total')}")
        print(f"   Delivery Status: {order_data.get('delivery_status')}")
        
    except Exception as e:
        log_test("Order creation", False, f"Exception: {str(e)}")
        return
    
    # Step 2: GET by UUID (backward compatibility)
    print(f"\nStep 2: Testing GET /api/orders/{order_id} (UUID lookup)...")
    total_tests += 1
    
    try:
        uuid_response = requests.get(f"{BASE_URL}/orders/{order_id}")
        
        if uuid_response.status_code != 200:
            log_test("GET by UUID", False, f"Status: {uuid_response.status_code}")
        else:
            uuid_data = uuid_response.json()
            if uuid_data.get('id') == order_id and uuid_data.get('order_number') == order_number:
                passed_tests += log_test("GET by UUID (backward compat)", True,
                                        f"Retrieved order with id={order_id}")
            else:
                log_test("GET by UUID", False, "Order data mismatch")
    except Exception as e:
        log_test("GET by UUID", False, f"Exception: {str(e)}")
    
    # Step 3: GET by order_number (exact case)
    print(f"\nStep 3: Testing GET /api/orders/{order_number} (order_number lookup)...")
    total_tests += 1
    
    try:
        order_num_response = requests.get(f"{BASE_URL}/orders/{order_number}")
        
        if order_num_response.status_code != 200:
            log_test("GET by order_number", False, f"Status: {order_num_response.status_code}")
        else:
            order_num_data = order_num_response.json()
            if (order_num_data.get('id') == order_id and 
                order_num_data.get('order_number') == order_number):
                passed_tests += log_test("GET by order_number (exact case)", True,
                                        f"Retrieved order with order_number={order_number}")
            else:
                log_test("GET by order_number", False, 
                        f"Data mismatch: id={order_num_data.get('id')}, order_number={order_num_data.get('order_number')}")
    except Exception as e:
        log_test("GET by order_number", False, f"Exception: {str(e)}")
    
    # Step 4: GET by order_number (lowercase - case-insensitive)
    print(f"\nStep 4: Testing GET /api/orders/{order_number.lower()} (case-insensitive lookup)...")
    total_tests += 1
    
    try:
        lowercase_order_num = order_number.lower()
        lowercase_response = requests.get(f"{BASE_URL}/orders/{lowercase_order_num}")
        
        if lowercase_response.status_code != 200:
            log_test("GET by order_number (lowercase)", False, 
                    f"Status: {lowercase_response.status_code}")
        else:
            lowercase_data = lowercase_response.json()
            if (lowercase_data.get('id') == order_id and 
                lowercase_data.get('order_number') == order_number):
                passed_tests += log_test("GET by order_number (case-insensitive)", True,
                                        f"Retrieved order with lowercase {lowercase_order_num}")
            else:
                log_test("GET by order_number (lowercase)", False, "Data mismatch")
    except Exception as e:
        log_test("GET by order_number (lowercase)", False, f"Exception: {str(e)}")
    
    # Step 5: GET by non-existent order_number (should return 404)
    print(f"\nStep 5: Testing GET /api/orders/AK999999 (non-existent order_number)...")
    total_tests += 1
    
    try:
        not_found_response = requests.get(f"{BASE_URL}/orders/AK999999")
        
        if not_found_response.status_code == 404:
            error_data = not_found_response.json()
            if 'error' in error_data:
                passed_tests += log_test("GET non-existent order_number returns 404", True,
                                        f"Error: {error_data.get('error')}")
            else:
                log_test("GET non-existent order_number", False, "Missing error field in response")
        else:
            log_test("GET non-existent order_number", False, 
                    f"Expected 404, got {not_found_response.status_code}")
    except Exception as e:
        log_test("GET non-existent order_number", False, f"Exception: {str(e)}")
    
    # Step 6: GET by non-existent UUID (should return 404)
    print(f"\nStep 6: Testing GET /api/orders/00000000-0000-0000-0000-000000000000 (non-existent UUID)...")
    total_tests += 1
    
    try:
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        uuid_not_found_response = requests.get(f"{BASE_URL}/orders/{fake_uuid}")
        
        if uuid_not_found_response.status_code == 404:
            error_data = uuid_not_found_response.json()
            if 'error' in error_data:
                passed_tests += log_test("GET non-existent UUID returns 404", True,
                                        f"Error: {error_data.get('error')}")
            else:
                log_test("GET non-existent UUID", False, "Missing error field in response")
        else:
            log_test("GET non-existent UUID", False, 
                    f"Expected 404, got {uuid_not_found_response.status_code}")
    except Exception as e:
        log_test("GET non-existent UUID", False, f"Exception: {str(e)}")
    
    # Step 7: Regression check - verify response shape
    print(f"\nStep 7: Regression check - verifying response shape...")
    total_tests += 1
    
    try:
        regression_response = requests.get(f"{BASE_URL}/orders/{order_id}")
        
        if regression_response.status_code != 200:
            log_test("Regression check", False, f"Status: {regression_response.status_code}")
        else:
            regression_data = regression_response.json()
            required_fields = ['id', 'order_number', 'prep_time_total', 'delivery_status']
            missing_fields = [f for f in required_fields if f not in regression_data]
            
            if not missing_fields:
                passed_tests += log_test("Regression check - response shape", True,
                                        f"All required fields present: {', '.join(required_fields)}")
                print(f"   Response includes:")
                print(f"     - id: {regression_data.get('id')}")
                print(f"     - order_number: {regression_data.get('order_number')}")
                print(f"     - prep_time_total: {regression_data.get('prep_time_total')}")
                print(f"     - delivery_status: {regression_data.get('delivery_status')}")
            else:
                log_test("Regression check", False, f"Missing fields: {', '.join(missing_fields)}")
    except Exception as e:
        log_test("Regression check", False, f"Exception: {str(e)}")
    
    # Summary
    print("\n" + "="*80)
    print(f"DUAL-KEY ORDER LOOKUP TEST SUMMARY")
    print("="*80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
    print("="*80 + "\n")
    
    return passed_tests, total_tests

if __name__ == "__main__":
    print("\n🧪 Starting Backend API Tests - Dual-Key Order Lookup")
    print(f"Base URL: {BASE_URL}")
    print(f"Admin Token: {ADMIN_TOKEN}")
    
    try:
        passed, total = test_dual_key_order_lookup()
        
        if passed == total:
            print("\n✅ ALL TESTS PASSED!")
            exit(0)
        else:
            print(f"\n⚠️  {total - passed} TEST(S) FAILED")
            exit(1)
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
