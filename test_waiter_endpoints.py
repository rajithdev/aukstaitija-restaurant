#!/usr/bin/env python3
"""
Backend API Test Suite for Waiter Dashboard Endpoints
Tests GET /waiter/orders, POST /orders/:id/waiter-pickup, POST /orders/:id/served
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://table-reserve-timing.preview.emergentagent.com/api"
ADMIN_TOKEN = "admin123"
ADMIN_HEADERS = {"x-admin-token": ADMIN_TOKEN}

def log_test(test_name, passed, details=""):
    """Log test results"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def test_waiter_endpoints():
    """Test all waiter dashboard endpoints"""
    print("\n" + "="*80)
    print("TESTING: Waiter Dashboard Endpoints")
    print("="*80 + "\n")
    
    passed_tests = 0
    total_tests = 0
    
    # ========== A) AUTH CHECKS ==========
    print("\n--- A) AUTH CHECKS ---\n")
    
    # Test 1: GET /waiter/orders without admin token → 401
    print("Test 1: GET /waiter/orders without x-admin-token → 401")
    total_tests += 1
    try:
        response = requests.get(f"{BASE_URL}/waiter/orders")
        if response.status_code == 401:
            passed_tests += log_test("GET /waiter/orders without token returns 401", True, 
                                    f"Status: {response.status_code}")
        else:
            log_test("GET /waiter/orders without token returns 401", False, 
                    f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("GET /waiter/orders without token returns 401", False, str(e))
    
    # Test 2: POST /orders/:id/waiter-pickup without admin token → 401
    print("\nTest 2: POST /orders/:id/waiter-pickup without admin token → 401")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/orders/dummy-id/waiter-pickup")
        if response.status_code == 401:
            passed_tests += log_test("POST /waiter-pickup without token returns 401", True, 
                                    f"Status: {response.status_code}")
        else:
            log_test("POST /waiter-pickup without token returns 401", False, 
                    f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("POST /waiter-pickup without token returns 401", False, str(e))
    
    # Test 3: POST /orders/:id/served without admin token → 401
    print("\nTest 3: POST /orders/:id/served without admin token → 401")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/orders/dummy-id/served")
        if response.status_code == 401:
            passed_tests += log_test("POST /served without token returns 401", True, 
                                    f"Status: {response.status_code}")
        else:
            log_test("POST /served without token returns 401", False, 
                    f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("POST /served without token returns 401", False, str(e))
    
    # ========== B) HAPPY PATH - DINE-IN ORDER FLOW ==========
    print("\n--- B) HAPPY PATH - DINE-IN ORDER FLOW ---\n")
    
    # Step 1: Get a table
    print("Step 1: Getting a table...")
    total_tests += 1
    try:
        tables_response = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS)
        if tables_response.status_code != 200:
            log_test("Get tables", False, f"Status: {tables_response.status_code}")
            return
        
        tables = tables_response.json()
        if not tables or len(tables) == 0:
            log_test("Get tables", False, "No tables available")
            return
        
        # Find an available table or clean one
        table = None
        for t in tables:
            if t.get('status') == 'available':
                table = t
                break
        
        if not table:
            # Try to clean the first table
            table = tables[0]
            table_id = table['id']
            print(f"  Table {table_id} is {table.get('status')}, attempting to clean...")
            
            # Close session if exists
            close_resp = requests.post(f"{BASE_URL}/tables/{table_id}/close", headers=ADMIN_HEADERS)
            if close_resp.status_code == 200:
                print(f"  Closed session on table {table_id}")
            
            # Mark as cleaned
            cleaned_resp = requests.post(f"{BASE_URL}/tables/{table_id}/cleaned", headers=ADMIN_HEADERS)
            if cleaned_resp.status_code == 200:
                print(f"  Marked table {table_id} as cleaned")
                table = cleaned_resp.json().get('table', table)
        
        table_id = table['id']
        passed_tests += log_test("Get available table", True, f"Using table {table_id}")
        
    except Exception as e:
        log_test("Get available table", False, str(e))
        return
    
    # Step 2: Get a dish for the order
    print("\nStep 2: Getting a dish...")
    total_tests += 1
    try:
        dishes_response = requests.get(f"{BASE_URL}/dishes")
        if dishes_response.status_code != 200:
            log_test("Get dishes", False, f"Status: {dishes_response.status_code}")
            return
        
        dishes = dishes_response.json()
        if not dishes or len(dishes) == 0:
            log_test("Get dishes", False, "No dishes available")
            return
        
        dish = dishes[0]
        dish_id = dish['id']
        dish_name = dish['name']
        dish_price = dish['price']
        
        passed_tests += log_test("Get dish", True, f"Using dish {dish_name} (€{dish_price})")
        
    except Exception as e:
        log_test("Get dish", False, str(e))
        return
    
    # Step 3: Create a dine-in order
    print("\nStep 3: Creating a dine-in order...")
    total_tests += 1
    try:
        order_payload = {
            "items": [
                {
                    "id": dish_id,
                    "name": dish_name,
                    "price": dish_price,
                    "quantity": 2
                }
            ],
            "type": "dine-in",
            "table_id": table_id,
            "customer": {
                "name": "Maria Petrauskaite"
            },
            "payment_method": "pay_at_table"
        }
        
        order_response = requests.post(f"{BASE_URL}/orders", json=order_payload)
        if order_response.status_code != 200:
            log_test("Create dine-in order", False, 
                    f"Status: {order_response.status_code}, Response: {order_response.text}")
            return
        
        order = order_response.json()
        order_id = order['id']
        order_number = order.get('order_number', 'N/A')
        
        passed_tests += log_test("Create dine-in order", True, 
                                f"Order ID: {order_id}, Number: {order_number}")
        
    except Exception as e:
        log_test("Create dine-in order", False, str(e))
        return
    
    # Step 4: Update order status to 'preparing'
    print("\nStep 4: Updating order status to 'preparing'...")
    total_tests += 1
    try:
        update_response = requests.put(
            f"{BASE_URL}/orders/{order_id}",
            headers=ADMIN_HEADERS,
            json={"status": "preparing"}
        )
        
        if update_response.status_code != 200:
            log_test("Update to preparing", False, 
                    f"Status: {update_response.status_code}, Response: {update_response.text}")
            return
        
        updated_order = update_response.json()
        if updated_order.get('status') == 'preparing' and updated_order.get('accepted_at'):
            passed_tests += log_test("Update to preparing", True, 
                                    f"Status: {updated_order['status']}, accepted_at set")
        else:
            log_test("Update to preparing", False, 
                    f"Status: {updated_order.get('status')}, accepted_at: {updated_order.get('accepted_at')}")
            return
        
    except Exception as e:
        log_test("Update to preparing", False, str(e))
        return
    
    # Step 5: Update order status to 'ready'
    print("\nStep 5: Updating order status to 'ready'...")
    total_tests += 1
    try:
        update_response = requests.put(
            f"{BASE_URL}/orders/{order_id}",
            headers=ADMIN_HEADERS,
            json={"status": "ready"}
        )
        
        if update_response.status_code != 200:
            log_test("Update to ready", False, 
                    f"Status: {update_response.status_code}, Response: {update_response.text}")
            return
        
        updated_order = update_response.json()
        if updated_order.get('status') == 'ready' and updated_order.get('ready_at'):
            passed_tests += log_test("Update to ready", True, 
                                    f"Status: {updated_order['status']}, ready_at set")
        else:
            log_test("Update to ready", False, 
                    f"Status: {updated_order.get('status')}, ready_at: {updated_order.get('ready_at')}")
            return
        
    except Exception as e:
        log_test("Update to ready", False, str(e))
        return
    
    # Step 6: GET /waiter/orders should include this order
    print("\nStep 6: GET /waiter/orders should include this order...")
    total_tests += 1
    try:
        waiter_response = requests.get(f"{BASE_URL}/waiter/orders", headers=ADMIN_HEADERS)
        
        if waiter_response.status_code != 200:
            log_test("GET /waiter/orders includes order", False, 
                    f"Status: {waiter_response.status_code}, Response: {waiter_response.text}")
            return
        
        waiter_orders = waiter_response.json()
        order_found = any(o.get('id') == order_id for o in waiter_orders)
        
        if order_found:
            passed_tests += log_test("GET /waiter/orders includes order", True, 
                                    f"Found order {order_id} in waiter orders list")
        else:
            log_test("GET /waiter/orders includes order", False, 
                    f"Order {order_id} not found in waiter orders. Total orders: {len(waiter_orders)}")
            return
        
    except Exception as e:
        log_test("GET /waiter/orders includes order", False, str(e))
        return
    
    # Step 7: POST /orders/:id/waiter-pickup
    print("\nStep 7: POST /orders/:id/waiter-pickup...")
    total_tests += 1
    try:
        pickup_response = requests.post(
            f"{BASE_URL}/orders/{order_id}/waiter-pickup",
            headers=ADMIN_HEADERS
        )
        
        if pickup_response.status_code != 200:
            log_test("POST /waiter-pickup", False, 
                    f"Status: {pickup_response.status_code}, Response: {pickup_response.text}")
            return
        
        picked_order = pickup_response.json()
        
        # Verify serve_status='picked_up_by_waiter'
        if picked_order.get('serve_status') != 'picked_up_by_waiter':
            log_test("POST /waiter-pickup", False, 
                    f"serve_status: {picked_order.get('serve_status')}, expected 'picked_up_by_waiter'")
            return
        
        # Verify waiter_picked_up_at is set
        if not picked_order.get('waiter_picked_up_at'):
            log_test("POST /waiter-pickup", False, "waiter_picked_up_at not set")
            return
        
        # Verify status STILL 'ready'
        if picked_order.get('status') != 'ready':
            log_test("POST /waiter-pickup", False, 
                    f"status: {picked_order.get('status')}, expected 'ready' (should not change)")
            return
        
        passed_tests += log_test("POST /waiter-pickup", True, 
                                f"serve_status='picked_up_by_waiter', status still 'ready', waiter_picked_up_at set")
        
    except Exception as e:
        log_test("POST /waiter-pickup", False, str(e))
        return
    
    # Step 8: GET /waiter/orders should STILL include this order
    print("\nStep 8: GET /waiter/orders should STILL include this order (in-service)...")
    total_tests += 1
    try:
        waiter_response = requests.get(f"{BASE_URL}/waiter/orders", headers=ADMIN_HEADERS)
        
        if waiter_response.status_code != 200:
            log_test("GET /waiter/orders still includes order", False, 
                    f"Status: {waiter_response.status_code}")
            return
        
        waiter_orders = waiter_response.json()
        order_found = any(o.get('id') == order_id for o in waiter_orders)
        
        if order_found:
            passed_tests += log_test("GET /waiter/orders still includes order", True, 
                                    f"Order {order_id} still in waiter orders (in-service)")
        else:
            log_test("GET /waiter/orders still includes order", False, 
                    f"Order {order_id} should still be in waiter orders (not served yet)")
            return
        
    except Exception as e:
        log_test("GET /waiter/orders still includes order", False, str(e))
        return
    
    # Step 9: POST /orders/:id/served
    print("\nStep 9: POST /orders/:id/served...")
    total_tests += 1
    try:
        served_response = requests.post(
            f"{BASE_URL}/orders/{order_id}/served",
            headers=ADMIN_HEADERS
        )
        
        if served_response.status_code != 200:
            log_test("POST /served", False, 
                    f"Status: {served_response.status_code}, Response: {served_response.text}")
            return
        
        served_order = served_response.json()
        
        # Verify serve_status='served'
        if served_order.get('serve_status') != 'served':
            log_test("POST /served", False, 
                    f"serve_status: {served_order.get('serve_status')}, expected 'served'")
            return
        
        # Verify served_at is set
        if not served_order.get('served_at'):
            log_test("POST /served", False, "served_at not set")
            return
        
        # Verify status='delivered'
        if served_order.get('status') != 'delivered':
            log_test("POST /served", False, 
                    f"status: {served_order.get('status')}, expected 'delivered'")
            return
        
        # Verify delivered_at is set
        if not served_order.get('delivered_at'):
            log_test("POST /served", False, "delivered_at not set")
            return
        
        passed_tests += log_test("POST /served", True, 
                                f"serve_status='served', status='delivered', served_at and delivered_at set")
        
    except Exception as e:
        log_test("POST /served", False, str(e))
        return
    
    # Step 10: GET /waiter/orders should NOT include this order anymore
    print("\nStep 10: GET /waiter/orders should NOT include this order anymore...")
    total_tests += 1
    try:
        waiter_response = requests.get(f"{BASE_URL}/waiter/orders", headers=ADMIN_HEADERS)
        
        if waiter_response.status_code != 200:
            log_test("GET /waiter/orders excludes served order", False, 
                    f"Status: {waiter_response.status_code}")
            return
        
        waiter_orders = waiter_response.json()
        order_found = any(o.get('id') == order_id for o in waiter_orders)
        
        if not order_found:
            passed_tests += log_test("GET /waiter/orders excludes served order", True, 
                                    f"Order {order_id} correctly excluded (served)")
        else:
            log_test("GET /waiter/orders excludes served order", False, 
                    f"Order {order_id} should NOT be in waiter orders (already served)")
            return
        
    except Exception as e:
        log_test("GET /waiter/orders excludes served order", False, str(e))
        return
    
    # ========== C) FILTER CORRECTNESS ==========
    print("\n--- C) FILTER CORRECTNESS - NON-DINE-IN ORDERS ---\n")
    
    # Create a delivery order
    print("Step 1: Creating a delivery order...")
    total_tests += 1
    try:
        # Get delivery zone
        zones_response = requests.get(f"{BASE_URL}/delivery-zones")
        if zones_response.status_code != 200:
            log_test("Get delivery zones", False, f"Status: {zones_response.status_code}")
        else:
            zones = zones_response.json()
            if zones and len(zones) > 0:
                zone_id = zones[0]['id']
                
                delivery_payload = {
                    "items": [{"id": dish_id, "name": dish_name, "price": dish_price, "quantity": 1}],
                    "type": "delivery",
                    "delivery_zone_id": zone_id,
                    "customer": {
                        "name": "Jonas Kazlauskas",
                        "email": "jonas@example.com",
                        "phone": "+37060012345",
                        "address": "Laisvės al. 50",
                        "city": "Kaunas",
                        "zip": "44280"
                    },
                    "payment_method": "cash_on_delivery"
                }
                
                delivery_response = requests.post(f"{BASE_URL}/orders", json=delivery_payload)
                if delivery_response.status_code == 200:
                    delivery_order = delivery_response.json()
                    delivery_order_id = delivery_order['id']
                    
                    # Update to ready
                    requests.put(
                        f"{BASE_URL}/orders/{delivery_order_id}",
                        headers=ADMIN_HEADERS,
                        json={"status": "preparing"}
                    )
                    requests.put(
                        f"{BASE_URL}/orders/{delivery_order_id}",
                        headers=ADMIN_HEADERS,
                        json={"status": "ready"}
                    )
                    
                    passed_tests += log_test("Create delivery order and set to ready", True, 
                                            f"Delivery order {delivery_order_id}")
                else:
                    log_test("Create delivery order", False, 
                            f"Status: {delivery_response.status_code}")
            else:
                log_test("Get delivery zones", False, "No zones available")
    except Exception as e:
        log_test("Create delivery order", False, str(e))
    
    # Create a pickup order
    print("\nStep 2: Creating a pickup order...")
    total_tests += 1
    try:
        pickup_payload = {
            "items": [{"id": dish_id, "name": dish_name, "price": dish_price, "quantity": 1}],
            "type": "pickup",
            "customer": {
                "name": "Ruta Jankauskaite",
                "email": "ruta@example.com",
                "phone": "+37060098765"
            },
            "payment_method": "pay_on_pickup"
        }
        
        pickup_order_response = requests.post(f"{BASE_URL}/orders", json=pickup_payload)
        if pickup_order_response.status_code == 200:
            pickup_order = pickup_order_response.json()
            pickup_order_id = pickup_order['id']
            
            # Update to ready
            requests.put(
                f"{BASE_URL}/orders/{pickup_order_id}",
                headers=ADMIN_HEADERS,
                json={"status": "preparing"}
            )
            requests.put(
                f"{BASE_URL}/orders/{pickup_order_id}",
                headers=ADMIN_HEADERS,
                json={"status": "ready"}
            )
            
            passed_tests += log_test("Create pickup order and set to ready", True, 
                                    f"Pickup order {pickup_order_id}")
        else:
            log_test("Create pickup order", False, 
                    f"Status: {pickup_order_response.status_code}")
    except Exception as e:
        log_test("Create pickup order", False, str(e))
    
    # Verify waiter/orders does NOT include delivery or pickup orders
    print("\nStep 3: Verify GET /waiter/orders excludes delivery and pickup orders...")
    total_tests += 1
    try:
        waiter_response = requests.get(f"{BASE_URL}/waiter/orders", headers=ADMIN_HEADERS)
        
        if waiter_response.status_code == 200:
            waiter_orders = waiter_response.json()
            
            # Check that all orders are dine-in
            all_dine_in = True
            for order in waiter_orders:
                order_type = order.get('type') or order.get('order_type')
                has_table = order.get('table_id') is not None
                
                if order_type not in ['dine-in', 'dine_in'] and not has_table:
                    all_dine_in = False
                    break
            
            if all_dine_in:
                passed_tests += log_test("GET /waiter/orders only includes dine-in orders", True, 
                                        f"All {len(waiter_orders)} orders are dine-in")
            else:
                log_test("GET /waiter/orders only includes dine-in orders", False, 
                        "Found non-dine-in orders in waiter list")
        else:
            log_test("GET /waiter/orders only includes dine-in orders", False, 
                    f"Status: {waiter_response.status_code}")
    except Exception as e:
        log_test("GET /waiter/orders only includes dine-in orders", False, str(e))
    
    # ========== D) IDEMPOTENCY - RE-PICKUP ==========
    print("\n--- D) IDEMPOTENCY - RE-PICKUP ---\n")
    
    # Create a fresh dine-in order for idempotency test
    print("Step 1: Creating a fresh dine-in order for idempotency test...")
    total_tests += 1
    try:
        idempotent_payload = {
            "items": [{"id": dish_id, "name": dish_name, "price": dish_price, "quantity": 1}],
            "type": "dine-in",
            "table_id": table_id,
            "customer": {"name": "Petras Petraitis"},
            "payment_method": "pay_at_table"
        }
        
        idempotent_response = requests.post(f"{BASE_URL}/orders", json=idempotent_payload)
        if idempotent_response.status_code == 200:
            idempotent_order = idempotent_response.json()
            idempotent_order_id = idempotent_order['id']
            
            # Update to ready
            requests.put(
                f"{BASE_URL}/orders/{idempotent_order_id}",
                headers=ADMIN_HEADERS,
                json={"status": "preparing"}
            )
            requests.put(
                f"{BASE_URL}/orders/{idempotent_order_id}",
                headers=ADMIN_HEADERS,
                json={"status": "ready"}
            )
            
            passed_tests += log_test("Create order for idempotency test", True, 
                                    f"Order {idempotent_order_id}")
        else:
            log_test("Create order for idempotency test", False, 
                    f"Status: {idempotent_response.status_code}")
            idempotent_order_id = None
    except Exception as e:
        log_test("Create order for idempotency test", False, str(e))
        idempotent_order_id = None
    
    # Call waiter-pickup twice
    if idempotent_order_id:
        print("\nStep 2: Calling /waiter-pickup first time...")
        total_tests += 1
        try:
            first_pickup = requests.post(
                f"{BASE_URL}/orders/{idempotent_order_id}/waiter-pickup",
                headers=ADMIN_HEADERS
            )
            
            if first_pickup.status_code == 200:
                first_order = first_pickup.json()
                first_timestamp = first_order.get('waiter_picked_up_at')
                passed_tests += log_test("First /waiter-pickup call", True, 
                                        f"Timestamp: {first_timestamp}")
                
                # Wait a moment
                time.sleep(1)
                
                # Second call
                print("\nStep 3: Calling /waiter-pickup second time (idempotency)...")
                total_tests += 1
                second_pickup = requests.post(
                    f"{BASE_URL}/orders/{idempotent_order_id}/waiter-pickup",
                    headers=ADMIN_HEADERS
                )
                
                if second_pickup.status_code == 200:
                    second_order = second_pickup.json()
                    second_timestamp = second_order.get('waiter_picked_up_at')
                    
                    # Both calls should succeed
                    passed_tests += log_test("Second /waiter-pickup call (idempotent)", True, 
                                            f"Timestamp updated: {second_timestamp}")
                else:
                    log_test("Second /waiter-pickup call (idempotent)", False, 
                            f"Status: {second_pickup.status_code}")
            else:
                log_test("First /waiter-pickup call", False, 
                        f"Status: {first_pickup.status_code}")
        except Exception as e:
            log_test("Idempotency test", False, str(e))
    
    # ========== E) REGRESSION SANITY CHECKS ==========
    print("\n--- E) REGRESSION SANITY CHECKS ---\n")
    
    # Test 1: Admin login
    print("Test 1: POST /admin/login with password 'admin123'...")
    total_tests += 1
    try:
        login_response = requests.post(f"{BASE_URL}/admin/login", json={"password": "admin123"})
        if login_response.status_code == 200:
            login_data = login_response.json()
            if login_data.get('token'):
                passed_tests += log_test("Admin login", True, f"Token: {login_data['token']}")
            else:
                log_test("Admin login", False, "No token in response")
        else:
            log_test("Admin login", False, f"Status: {login_response.status_code}")
    except Exception as e:
        log_test("Admin login", False, str(e))
    
    # Test 2: GET /categories
    print("\nTest 2: GET /categories returns 5 categories...")
    total_tests += 1
    try:
        categories_response = requests.get(f"{BASE_URL}/categories")
        if categories_response.status_code == 200:
            categories = categories_response.json()
            if len(categories) == 5:
                passed_tests += log_test("GET /categories", True, f"Returns {len(categories)} categories")
            else:
                log_test("GET /categories", False, f"Expected 5, got {len(categories)}")
        else:
            log_test("GET /categories", False, f"Status: {categories_response.status_code}")
    except Exception as e:
        log_test("GET /categories", False, str(e))
    
    # Test 3: GET /dishes
    print("\nTest 3: GET /dishes returns array of 10 dishes...")
    total_tests += 1
    try:
        dishes_response = requests.get(f"{BASE_URL}/dishes")
        if dishes_response.status_code == 200:
            dishes = dishes_response.json()
            if len(dishes) == 10:
                passed_tests += log_test("GET /dishes", True, f"Returns {len(dishes)} dishes")
            else:
                log_test("GET /dishes", False, f"Expected 10, got {len(dishes)}")
        else:
            log_test("GET /dishes", False, f"Status: {dishes_response.status_code}")
    except Exception as e:
        log_test("GET /dishes", False, str(e))
    
    # Test 4: GET /kitchen/orders
    print("\nTest 4: GET /kitchen/orders with admin returns array...")
    total_tests += 1
    try:
        kitchen_response = requests.get(f"{BASE_URL}/kitchen/orders", headers=ADMIN_HEADERS)
        if kitchen_response.status_code == 200:
            kitchen_orders = kitchen_response.json()
            passed_tests += log_test("GET /kitchen/orders", True, 
                                    f"Returns array with {len(kitchen_orders)} orders")
        else:
            log_test("GET /kitchen/orders", False, f"Status: {kitchen_response.status_code}")
    except Exception as e:
        log_test("GET /kitchen/orders", False, str(e))
    
    # Test 5: Create delivery order with prep_time_total
    print("\nTest 5: POST /orders with delivery type creates order with prep_time_total...")
    total_tests += 1
    try:
        zones_response = requests.get(f"{BASE_URL}/delivery-zones")
        if zones_response.status_code == 200:
            zones = zones_response.json()
            if zones and len(zones) > 0:
                zone_id = zones[0]['id']
                
                delivery_test_payload = {
                    "items": [{"id": dish_id, "name": dish_name, "price": dish_price, "quantity": 1}],
                    "type": "delivery",
                    "delivery_zone_id": zone_id,
                    "customer": {
                        "name": "Ona Onaitė",
                        "email": "ona@example.com",
                        "phone": "+37060011111",
                        "address": "Gedimino g. 10",
                        "city": "Kaunas",
                        "zip": "44280"
                    },
                    "payment_method": "cash_on_delivery"
                }
                
                delivery_test_response = requests.post(f"{BASE_URL}/orders", json=delivery_test_payload)
                if delivery_test_response.status_code == 200:
                    delivery_test_order = delivery_test_response.json()
                    
                    if (delivery_test_order.get('prep_time_total') and 
                        delivery_test_order.get('delivery_status') == 'pending'):
                        passed_tests += log_test("Delivery order with prep_time_total", True, 
                                                f"prep_time_total={delivery_test_order['prep_time_total']}, "
                                                f"delivery_status={delivery_test_order['delivery_status']}")
                    else:
                        log_test("Delivery order with prep_time_total", False, 
                                f"prep_time_total={delivery_test_order.get('prep_time_total')}, "
                                f"delivery_status={delivery_test_order.get('delivery_status')}")
                else:
                    log_test("Delivery order with prep_time_total", False, 
                            f"Status: {delivery_test_response.status_code}")
            else:
                log_test("Delivery order with prep_time_total", False, "No delivery zones")
        else:
            log_test("Delivery order with prep_time_total", False, 
                    f"Status: {zones_response.status_code}")
    except Exception as e:
        log_test("Delivery order with prep_time_total", False, str(e))
    
    # Test 6: Dispatch on delivery order
    print("\nTest 6: POST /orders/:id/dispatch on delivery order...")
    total_tests += 1
    try:
        # Create a delivery order for dispatch test
        zones_response = requests.get(f"{BASE_URL}/delivery-zones")
        if zones_response.status_code == 200:
            zones = zones_response.json()
            if zones and len(zones) > 0:
                zone_id = zones[0]['id']
                
                dispatch_test_payload = {
                    "items": [{"id": dish_id, "name": dish_name, "price": dish_price, "quantity": 1}],
                    "type": "delivery",
                    "delivery_zone_id": zone_id,
                    "customer": {
                        "name": "Tomas Tomaitis",
                        "email": "tomas@example.com",
                        "phone": "+37060022222",
                        "address": "Savanorių pr. 20",
                        "city": "Kaunas",
                        "zip": "44280"
                    },
                    "payment_method": "cash_on_delivery"
                }
                
                dispatch_order_response = requests.post(f"{BASE_URL}/orders", json=dispatch_test_payload)
                if dispatch_order_response.status_code == 200:
                    dispatch_order = dispatch_order_response.json()
                    dispatch_order_id = dispatch_order['id']
                    
                    # Update to preparing
                    requests.put(
                        f"{BASE_URL}/orders/{dispatch_order_id}",
                        headers=ADMIN_HEADERS,
                        json={"status": "preparing"}
                    )
                    
                    # Dispatch
                    dispatch_response = requests.post(
                        f"{BASE_URL}/orders/{dispatch_order_id}/dispatch",
                        headers=ADMIN_HEADERS,
                        json={"provider": "in_house"}
                    )
                    
                    if dispatch_response.status_code == 200:
                        passed_tests += log_test("Dispatch on delivery order", True, 
                                                "Dispatch endpoint still works")
                    else:
                        log_test("Dispatch on delivery order", False, 
                                f"Status: {dispatch_response.status_code}")
                else:
                    log_test("Dispatch on delivery order", False, 
                            f"Status: {dispatch_order_response.status_code}")
            else:
                log_test("Dispatch on delivery order", False, "No delivery zones")
        else:
            log_test("Dispatch on delivery order", False, 
                    f"Status: {zones_response.status_code}")
    except Exception as e:
        log_test("Dispatch on delivery order", False, str(e))
    
    # ========== SUMMARY ==========
    print("\n" + "="*80)
    print(f"WAITER ENDPOINTS TEST SUMMARY: {passed_tests}/{total_tests} tests passed")
    print(f"Success rate: {(passed_tests/total_tests*100):.1f}%")
    print("="*80 + "\n")
    
    return passed_tests, total_tests

if __name__ == "__main__":
    try:
        passed, total = test_waiter_endpoints()
        exit(0 if passed == total else 1)
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
