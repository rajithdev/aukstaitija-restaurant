#!/usr/bin/env python3
"""
Backend API Test Suite for Waiter Analytics
Tests the new waiter analytics block in GET /api/admin/analytics
"""

import requests
import json
import time
import os
from datetime import datetime

# Configuration - use environment variable for base URL
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://reservation-alerts.preview.emergentagent.com') + '/api'
ADMIN_TOKEN = "admin123"

def log_test(test_name, passed, details=""):
    """Log test results"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def get_admin_headers():
    """Get headers with admin token"""
    return {"x-admin-token": ADMIN_TOKEN}

def test_waiter_analytics():
    """Test waiter analytics in /api/admin/analytics endpoint"""
    print("\n" + "="*80)
    print("TESTING: Waiter Analytics in /api/admin/analytics")
    print(f"BASE_URL: {BASE_URL}")
    print("="*80 + "\n")
    
    passed_tests = 0
    total_tests = 0
    
    # ========================================================================
    # SCENARIO A: Auth check - GET /api/admin/analytics WITHOUT x-admin-token → 401
    # ========================================================================
    print("\n--- SCENARIO A: Auth Check ---")
    total_tests += 1
    try:
        response = requests.get(f"{BASE_URL}/admin/analytics")
        if response.status_code == 401:
            passed_tests += log_test("A) GET /admin/analytics without token returns 401", True)
        else:
            log_test("A) GET /admin/analytics without token returns 401", False, 
                    f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("A) GET /admin/analytics without token returns 401", False, str(e))
    
    # ========================================================================
    # SCENARIO B: Shape check - verify waiter object structure
    # ========================================================================
    print("\n--- SCENARIO B: Shape Check ---")
    total_tests += 1
    try:
        response = requests.get(f"{BASE_URL}/admin/analytics", headers=get_admin_headers())
        if response.status_code != 200:
            log_test("B) GET /admin/analytics with token returns 200", False, 
                    f"Expected 200, got {response.status_code}")
        else:
            data = response.json()
            
            # Check if waiter object exists
            if 'waiter' not in data:
                log_test("B) Response contains waiter object", False, "waiter key missing")
            else:
                waiter = data['waiter']
                
                # Check all required keys
                required_keys = ['served_count', 'served_today', 'avg_pickup_minutes', 
                               'avg_serve_minutes', 'avg_kitchen_to_table_minutes', 'sample_size']
                missing_keys = [k for k in required_keys if k not in waiter]
                
                if missing_keys:
                    log_test("B) Waiter object has all required keys", False, 
                            f"Missing keys: {missing_keys}")
                else:
                    # Check sample_size structure
                    sample_size = waiter.get('sample_size', {})
                    sample_keys = ['pickup', 'serve', 'kitchen_to_table']
                    missing_sample_keys = [k for k in sample_keys if k not in sample_size]
                    
                    if missing_sample_keys:
                        log_test("B) sample_size has all required keys", False, 
                                f"Missing keys: {missing_sample_keys}")
                    else:
                        # Verify all values are numbers >= 0
                        all_numbers = True
                        for key in ['served_count', 'served_today', 'avg_pickup_minutes', 
                                   'avg_serve_minutes', 'avg_kitchen_to_table_minutes']:
                            val = waiter.get(key)
                            if not isinstance(val, (int, float)) or val < 0:
                                all_numbers = False
                                log_test(f"B) {key} is a number >= 0", False, 
                                        f"Got {type(val).__name__}: {val}")
                        
                        for key in ['pickup', 'serve', 'kitchen_to_table']:
                            val = sample_size.get(key)
                            if not isinstance(val, (int, float)) or val < 0:
                                all_numbers = False
                                log_test(f"B) sample_size.{key} is a number >= 0", False, 
                                        f"Got {type(val).__name__}: {val}")
                        
                        if all_numbers:
                            passed_tests += log_test("B) Waiter object shape is correct", True, 
                                                    f"served_count={waiter['served_count']}, "
                                                    f"served_today={waiter['served_today']}, "
                                                    f"sample_size={sample_size}")
                            
                            # Store baseline for later comparison
                            baseline_served_count = waiter['served_count']
                            baseline_served_today = waiter['served_today']
                            baseline_sample_pickup = sample_size['pickup']
                            baseline_sample_serve = sample_size['serve']
                            baseline_sample_k2t = sample_size['kitchen_to_table']
                            
                            print(f"  Baseline: served_count={baseline_served_count}, "
                                  f"served_today={baseline_served_today}")
                            print(f"  Baseline sample_size: pickup={baseline_sample_pickup}, "
                                  f"serve={baseline_sample_serve}, k2t={baseline_sample_k2t}")
    except Exception as e:
        log_test("B) Shape check", False, str(e))
        baseline_served_count = 0
        baseline_served_today = 0
        baseline_sample_pickup = 0
        baseline_sample_serve = 0
        baseline_sample_k2t = 0
    
    # ========================================================================
    # SCENARIO C: Happy path - push a dine-in plate through full waiter flow
    # ========================================================================
    print("\n--- SCENARIO C: Happy Path - Full Waiter Flow ---")
    
    try:
        # Step 1: Get a free table
        print("C.1) Getting a free table...")
        total_tests += 1
        tables_response = requests.get(f"{BASE_URL}/tables", headers=get_admin_headers())
        if tables_response.status_code != 200:
            log_test("C.1) GET /tables", False, f"Status {tables_response.status_code}")
        else:
            tables = tables_response.json()
            free_table = None
            
            # Find a free table or close an occupied one
            for table in tables:
                if table.get('status') == 'available':
                    free_table = table
                    break
            
            if not free_table:
                # Close the first occupied table
                for table in tables:
                    if table.get('status') == 'occupied':
                        print(f"  Closing occupied table {table['id']}...")
                        close_resp = requests.post(f"{BASE_URL}/tables/{table['id']}/close", 
                                                  headers=get_admin_headers())
                        if close_resp.status_code == 200:
                            cleaned_resp = requests.post(f"{BASE_URL}/tables/{table['id']}/cleaned", 
                                                        headers=get_admin_headers())
                            if cleaned_resp.status_code == 200:
                                free_table = table
                                break
            
            if not free_table:
                free_table = tables[0]  # Use first table anyway
            
            table_id = free_table['id']
            passed_tests += log_test("C.1) Got free table", True, f"Using table {table_id}")
            
            # Step 2: Get a dish
            print("C.2) Getting a dish...")
            total_tests += 1
            dishes_response = requests.get(f"{BASE_URL}/dishes")
            if dishes_response.status_code != 200:
                log_test("C.2) GET /dishes", False, f"Status {dishes_response.status_code}")
            else:
                dishes = dishes_response.json()
                dish = dishes[0]
                passed_tests += log_test("C.2) Got dish", True, f"Using {dish['name']}")
                
                # Step 3: Create dine-in order
                print("C.3) Creating dine-in order...")
                total_tests += 1
                order_payload = {
                    "items": [{
                        "id": dish['id'],
                        "name": dish['name'],
                        "price": dish['price'],
                        "quantity": 1
                    }],
                    "type": "dine-in",
                    "table_id": table_id,
                    "customer": {"name": "Analytics Diner"},
                    "payment_method": "pay_at_table"
                }
                
                create_resp = requests.post(f"{BASE_URL}/orders", json=order_payload)
                if create_resp.status_code != 200:
                    log_test("C.3) Create dine-in order", False, 
                            f"Status {create_resp.status_code}: {create_resp.text}")
                else:
                    order = create_resp.json()
                    order_id = order['id']
                    passed_tests += log_test("C.3) Created dine-in order", True, 
                                            f"Order ID: {order_id}")
                    
                    # Step 4: PUT status='preparing'
                    print("C.4) Setting status to 'preparing'...")
                    total_tests += 1
                    prep_resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                                            json={"status": "preparing"},
                                            headers=get_admin_headers())
                    if prep_resp.status_code == 200:
                        passed_tests += log_test("C.4) Set status='preparing'", True)
                    else:
                        log_test("C.4) Set status='preparing'", False, 
                                f"Status {prep_resp.status_code}")
                    
                    # Step 5: PUT status='ready'
                    print("C.5) Setting status to 'ready'...")
                    total_tests += 1
                    time.sleep(1)  # Small delay to ensure timestamp difference
                    ready_resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                                             json={"status": "ready"},
                                             headers=get_admin_headers())
                    if ready_resp.status_code == 200:
                        passed_tests += log_test("C.5) Set status='ready'", True)
                    else:
                        log_test("C.5) Set status='ready'", False, 
                                f"Status {ready_resp.status_code}")
                    
                    # Step 6: POST /orders/:id/waiter-pickup
                    print("C.6) Waiter picking up order...")
                    total_tests += 1
                    time.sleep(1)  # Small delay to ensure timestamp difference
                    pickup_resp = requests.post(f"{BASE_URL}/orders/{order_id}/waiter-pickup",
                                               headers=get_admin_headers())
                    if pickup_resp.status_code == 200:
                        pickup_order = pickup_resp.json()
                        if pickup_order.get('waiter_picked_up_at'):
                            passed_tests += log_test("C.6) Waiter picked up order", True,
                                                    f"waiter_picked_up_at set")
                        else:
                            log_test("C.6) Waiter picked up order", False,
                                    "waiter_picked_up_at not set")
                    else:
                        log_test("C.6) Waiter picked up order", False,
                                f"Status {pickup_resp.status_code}")
                    
                    # Step 7: POST /orders/:id/served
                    print("C.7) Marking order as served...")
                    total_tests += 1
                    time.sleep(1)  # Small delay to ensure timestamp difference
                    served_resp = requests.post(f"{BASE_URL}/orders/{order_id}/served",
                                               headers=get_admin_headers())
                    if served_resp.status_code == 200:
                        served_order = served_resp.json()
                        if served_order.get('served_at') and served_order.get('status') == 'delivered':
                            passed_tests += log_test("C.7) Marked order as served", True,
                                                    f"served_at set, status=delivered")
                        else:
                            log_test("C.7) Marked order as served", False,
                                    f"served_at={served_order.get('served_at')}, "
                                    f"status={served_order.get('status')}")
                    else:
                        log_test("C.7) Marked order as served", False,
                                f"Status {served_resp.status_code}")
                    
                    # Step 8: GET /admin/analytics again and verify increments
                    print("C.8) Verifying analytics increments...")
                    total_tests += 1
                    time.sleep(1)  # Give DB a moment to settle
                    analytics_resp = requests.get(f"{BASE_URL}/admin/analytics",
                                                 headers=get_admin_headers())
                    if analytics_resp.status_code != 200:
                        log_test("C.8) GET /admin/analytics after flow", False,
                                f"Status {analytics_resp.status_code}")
                    else:
                        analytics = analytics_resp.json()
                        waiter = analytics.get('waiter', {})
                        
                        # Verify increments
                        new_served_count = waiter.get('served_count', 0)
                        new_served_today = waiter.get('served_today', 0)
                        new_sample_pickup = waiter.get('sample_size', {}).get('pickup', 0)
                        new_sample_serve = waiter.get('sample_size', {}).get('serve', 0)
                        new_sample_k2t = waiter.get('sample_size', {}).get('kitchen_to_table', 0)
                        
                        print(f"  New values: served_count={new_served_count}, "
                              f"served_today={new_served_today}")
                        print(f"  New sample_size: pickup={new_sample_pickup}, "
                              f"serve={new_sample_serve}, k2t={new_sample_k2t}")
                        
                        checks_passed = True
                        
                        # Check served_count increment
                        if new_served_count <= baseline_served_count:
                            checks_passed = False
                            print(f"  ❌ served_count did not increment: "
                                  f"{baseline_served_count} -> {new_served_count}")
                        
                        # Check served_today increment
                        if new_served_today <= baseline_served_today:
                            checks_passed = False
                            print(f"  ❌ served_today did not increment: "
                                  f"{baseline_served_today} -> {new_served_today}")
                        
                        # Check sample_size increments
                        if new_sample_pickup <= baseline_sample_pickup:
                            checks_passed = False
                            print(f"  ❌ sample_size.pickup did not increment: "
                                  f"{baseline_sample_pickup} -> {new_sample_pickup}")
                        
                        if new_sample_serve <= baseline_sample_serve:
                            checks_passed = False
                            print(f"  ❌ sample_size.serve did not increment: "
                                  f"{baseline_sample_serve} -> {new_sample_serve}")
                        
                        if new_sample_k2t <= baseline_sample_k2t:
                            checks_passed = False
                            print(f"  ❌ sample_size.kitchen_to_table did not increment: "
                                  f"{baseline_sample_k2t} -> {new_sample_k2t}")
                        
                        # Check that averages are numbers (could be 0 if elapsed < 30s)
                        avg_pickup = waiter.get('avg_pickup_minutes', -1)
                        avg_serve = waiter.get('avg_serve_minutes', -1)
                        avg_k2t = waiter.get('avg_kitchen_to_table_minutes', -1)
                        
                        if not isinstance(avg_pickup, (int, float)) or avg_pickup < 0:
                            checks_passed = False
                            print(f"  ❌ avg_pickup_minutes is not a valid number: {avg_pickup}")
                        
                        if not isinstance(avg_serve, (int, float)) or avg_serve < 0:
                            checks_passed = False
                            print(f"  ❌ avg_serve_minutes is not a valid number: {avg_serve}")
                        
                        if not isinstance(avg_k2t, (int, float)) or avg_k2t < 0:
                            checks_passed = False
                            print(f"  ❌ avg_kitchen_to_table_minutes is not a valid number: {avg_k2t}")
                        
                        if checks_passed:
                            passed_tests += log_test("C.8) Analytics increments verified", True,
                                                    f"All counts and averages correct")
                        else:
                            log_test("C.8) Analytics increments verified", False,
                                    "Some checks failed (see above)")
                        
                        # Store new baseline for next scenario
                        baseline_served_count = new_served_count
    
    except Exception as e:
        log_test("C) Happy path flow", False, f"Exception: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # ========================================================================
    # SCENARIO D: Filter purity - non-dine-in orders must NOT inflate waiter stats
    # ========================================================================
    print("\n--- SCENARIO D: Filter Purity - Non-Dine-In Orders ---")
    
    try:
        # Note baseline from scenario C
        print(f"D.1) Baseline served_count: {baseline_served_count}")
        
        # Create and complete a delivery order
        print("D.2) Creating and completing a delivery order...")
        total_tests += 1
        
        # Get delivery zone
        zones_resp = requests.get(f"{BASE_URL}/delivery-zones")
        if zones_resp.status_code == 200:
            zones = zones_resp.json()
            if zones:
                zone_id = zones[0]['id']
                
                # Get dish
                dishes_resp = requests.get(f"{BASE_URL}/dishes")
                if dishes_resp.status_code == 200:
                    dishes = dishes_resp.json()
                    dish = dishes[0]
                    
                    # Create delivery order
                    delivery_payload = {
                        "type": "delivery",
                        "delivery_zone_id": zone_id,
                        "items": [{
                            "id": dish['id'],
                            "name": dish['name'],
                            "price": dish['price'],
                            "quantity": 1
                        }],
                        "customer": {
                            "name": "Delivery Customer",
                            "phone": "+37060099999",
                            "email": "delivery@test.com"
                        },
                        "address": {
                            "address": "Test St 123",
                            "city": "Kaunas",
                            "zip": "44280"
                        },
                        "payment_method": "cash"
                    }
                    
                    delivery_resp = requests.post(f"{BASE_URL}/orders", json=delivery_payload)
                    if delivery_resp.status_code == 200:
                        delivery_order = delivery_resp.json()
                        delivery_id = delivery_order['id']
                        
                        # Walk through delivery flow
                        requests.put(f"{BASE_URL}/orders/{delivery_id}",
                                   json={"status": "preparing"},
                                   headers=get_admin_headers())
                        time.sleep(0.5)
                        requests.put(f"{BASE_URL}/orders/{delivery_id}",
                                   json={"status": "ready"},
                                   headers=get_admin_headers())
                        time.sleep(0.5)
                        
                        # Try to dispatch (if endpoint exists)
                        dispatch_resp = requests.post(f"{BASE_URL}/orders/{delivery_id}/dispatch",
                                                     json={"provider": "in_house"},
                                                     headers=get_admin_headers())
                        
                        # Mark as delivered
                        delivered_resp = requests.post(f"{BASE_URL}/orders/{delivery_id}/delivered",
                                                      headers=get_admin_headers())
                        
                        if delivered_resp.status_code == 200:
                            passed_tests += log_test("D.2) Created and completed delivery order", True)
                        else:
                            log_test("D.2) Created and completed delivery order", False,
                                    f"Delivered status {delivered_resp.status_code}")
        
        # Create and complete a pickup order
        print("D.3) Creating and completing a pickup order...")
        total_tests += 1
        
        dishes_resp = requests.get(f"{BASE_URL}/dishes")
        if dishes_resp.status_code == 200:
            dishes = dishes_resp.json()
            dish = dishes[0]
            
            pickup_payload = {
                "type": "pickup",
                "items": [{
                    "id": dish['id'],
                    "name": dish['name'],
                    "price": dish['price'],
                    "quantity": 1
                }],
                "customer": {
                    "name": "Pickup Customer",
                    "phone": "+37060088888"
                },
                "payment_method": "cash"
            }
            
            pickup_resp = requests.post(f"{BASE_URL}/orders", json=pickup_payload)
            if pickup_resp.status_code == 200:
                pickup_order = pickup_resp.json()
                pickup_id = pickup_order['id']
                
                # Walk through pickup flow
                requests.put(f"{BASE_URL}/orders/{pickup_id}",
                           json={"status": "preparing"},
                           headers=get_admin_headers())
                time.sleep(0.5)
                requests.put(f"{BASE_URL}/orders/{pickup_id}",
                           json={"status": "ready"},
                           headers=get_admin_headers())
                time.sleep(0.5)
                requests.put(f"{BASE_URL}/orders/{pickup_id}",
                           json={"status": "delivered"},
                           headers=get_admin_headers())
                
                passed_tests += log_test("D.3) Created and completed pickup order", True)
        
        # Verify waiter.served_count is UNCHANGED
        print("D.4) Verifying waiter stats unchanged...")
        total_tests += 1
        time.sleep(1)
        
        analytics_resp = requests.get(f"{BASE_URL}/admin/analytics",
                                     headers=get_admin_headers())
        if analytics_resp.status_code == 200:
            analytics = analytics_resp.json()
            waiter = analytics.get('waiter', {})
            final_served_count = waiter.get('served_count', 0)
            final_sample_pickup = waiter.get('sample_size', {}).get('pickup', 0)
            final_sample_serve = waiter.get('sample_size', {}).get('serve', 0)
            final_sample_k2t = waiter.get('sample_size', {}).get('kitchen_to_table', 0)
            
            if final_served_count == baseline_served_count:
                passed_tests += log_test("D.4) Waiter stats unchanged by non-dine-in orders", True,
                                        f"served_count still {baseline_served_count}")
            else:
                log_test("D.4) Waiter stats unchanged by non-dine-in orders", False,
                        f"served_count changed from {baseline_served_count} to {final_served_count}")
    
    except Exception as e:
        log_test("D) Filter purity", False, f"Exception: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # ========================================================================
    # SCENARIO E: Regression sanity - top-level fields still exist and work
    # ========================================================================
    print("\n--- SCENARIO E: Regression Sanity ---")
    total_tests += 1
    
    try:
        analytics_resp = requests.get(f"{BASE_URL}/admin/analytics",
                                     headers=get_admin_headers())
        if analytics_resp.status_code == 200:
            analytics = analytics_resp.json()
            
            required_fields = ['total_revenue', 'today_revenue', 'total_orders', 
                             'today_orders', 'avg_order_value', 'top_dishes', 'delivery']
            
            missing_fields = [f for f in required_fields if f not in analytics]
            
            if missing_fields:
                log_test("E) Top-level analytics fields present", False,
                        f"Missing: {missing_fields}")
            else:
                # Check delivery sub-object
                delivery = analytics.get('delivery', {})
                if not isinstance(delivery, dict):
                    log_test("E) Top-level analytics fields present", False,
                            "delivery is not a dict")
                else:
                    passed_tests += log_test("E) Top-level analytics fields present", True,
                                            "All required fields exist")
        else:
            log_test("E) Top-level analytics fields present", False,
                    f"Status {analytics_resp.status_code}")
    except Exception as e:
        log_test("E) Regression sanity", False, f"Exception: {str(e)}")
    
    # ========================================================================
    # SCENARIO F: Verify existing waiter dashboard endpoints still pass
    # ========================================================================
    print("\n--- SCENARIO F: Waiter Dashboard Endpoints Regression ---")
    
    # F.1: GET /waiter/orders without token → 401
    total_tests += 1
    try:
        resp = requests.get(f"{BASE_URL}/waiter/orders")
        if resp.status_code == 401:
            passed_tests += log_test("F.1) GET /waiter/orders without token → 401", True)
        else:
            log_test("F.1) GET /waiter/orders without token → 401", False,
                    f"Got {resp.status_code}")
    except Exception as e:
        log_test("F.1) GET /waiter/orders without token → 401", False, str(e))
    
    # F.2: GET /waiter/orders with admin token → 200
    total_tests += 1
    try:
        resp = requests.get(f"{BASE_URL}/waiter/orders", headers=get_admin_headers())
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                passed_tests += log_test("F.2) GET /waiter/orders with token → 200 array", True)
            else:
                log_test("F.2) GET /waiter/orders with token → 200 array", False,
                        f"Not an array: {type(data)}")
        else:
            log_test("F.2) GET /waiter/orders with token → 200 array", False,
                    f"Got {resp.status_code}")
    except Exception as e:
        log_test("F.2) GET /waiter/orders with token → 200 array", False, str(e))
    
    # F.3: POST /orders/<bogus-id>/served without admin token → 401
    total_tests += 1
    try:
        resp = requests.post(f"{BASE_URL}/orders/bogus-id-12345/served")
        if resp.status_code == 401:
            passed_tests += log_test("F.3) POST /orders/:id/served without token → 401", True)
        else:
            log_test("F.3) POST /orders/:id/served without token → 401", False,
                    f"Got {resp.status_code}")
    except Exception as e:
        log_test("F.3) POST /orders/:id/served without token → 401", False, str(e))
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "="*80)
    print(f"WAITER ANALYTICS TEST SUMMARY: {passed_tests}/{total_tests} tests passed")
    print("="*80 + "\n")
    
    if passed_tests == total_tests:
        print("✅ ALL TESTS PASSED - Waiter analytics feature is working correctly!")
        return True
    else:
        print(f"❌ SOME TESTS FAILED - {total_tests - passed_tests} test(s) failed")
        return False

if __name__ == "__main__":
    success = test_waiter_analytics()
    exit(0 if success else 1)
