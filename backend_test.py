#!/usr/bin/env python3
"""
Backend test for predictive courier dispatch feature
Tests all scenarios from the review request
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "admin123"
HEADERS_ADMIN = {"x-admin-token": ADMIN_TOKEN, "Content-Type": "application/json"}
HEADERS_NO_AUTH = {"Content-Type": "application/json"}

# Test results tracking
test_results = []
pass_count = 0
fail_count = 0

def log_test(test_name, passed, details=""):
    global pass_count, fail_count
    status = "✅ PASS" if passed else "❌ FAIL"
    if passed:
        pass_count += 1
    else:
        fail_count += 1
    result = f"{status} - {test_name}"
    if details:
        result += f"\n    Details: {details}"
    print(result)
    test_results.append({"test": test_name, "passed": passed, "details": details})

def test_scenario_1_order_creation_prep_time():
    """Scenario 1: Order creation stores prep_time_total"""
    print("\n=== Scenario 1: Order creation stores prep_time_total ===")
    
    try:
        # Get a dish
        resp = requests.get(f"{BASE_URL}/dishes")
        assert resp.status_code == 200, f"Failed to get dishes: {resp.status_code}"
        dishes = resp.json()
        assert len(dishes) > 0, "No dishes found"
        dish = dishes[0]
        dish_prep_time = dish.get('prep_time', 15)
        log_test("1.1 - Get dish with prep_time", True, f"Dish: {dish['name']}, prep_time: {dish_prep_time}")
        
        # Get a delivery zone
        resp = requests.get(f"{BASE_URL}/delivery-zones")
        assert resp.status_code == 200, f"Failed to get delivery zones: {resp.status_code}"
        zones = resp.json()
        assert len(zones) > 0, "No delivery zones found"
        zone = zones[0]
        zone_eta = zone.get('eta_minutes', 30)
        log_test("1.2 - Get delivery zone", True, f"Zone: {zone['name']}, eta_minutes: {zone_eta}")
        
        # Create delivery order
        order_data = {
            "type": "delivery",
            "delivery_zone_id": zone['id'],
            "customer": {
                "name": "Maria Petrauskas",
                "phone": "+37060012345"
            },
            "address": {
                "address": "Laisvės alėja 101",
                "city": "Kaunas",
                "zip": "44280"
            },
            "items": [
                {
                    "id": dish['id'],
                    "name": dish['name'],
                    "price": dish['price'],
                    "quantity": 1
                }
            ]
        }
        
        resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
        assert resp.status_code == 200, f"Failed to create order: {resp.status_code} - {resp.text}"
        order = resp.json()
        
        # Verify prep_time_total
        assert 'prep_time_total' in order, "prep_time_total not in order"
        assert isinstance(order['prep_time_total'], (int, float)), f"prep_time_total is not a number: {type(order['prep_time_total'])}"
        assert order['prep_time_total'] > 0, f"prep_time_total should be > 0, got {order['prep_time_total']}"
        
        # Verify initial state
        assert order['delivery_status'] == 'pending', f"Expected delivery_status='pending', got '{order['delivery_status']}'"
        assert order['courier_requested_at'] is None, f"Expected courier_requested_at=null, got {order['courier_requested_at']}"
        assert order['courier_eta'] == zone_eta, f"Expected courier_eta={zone_eta}, got {order['courier_eta']}"
        
        log_test("1.3 - Order created with prep_time_total", True, 
                f"prep_time_total={order['prep_time_total']} minutes, delivery_status=pending, courier_requested_at=null")
        
        return order['id']
        
    except AssertionError as e:
        log_test("1 - Order creation stores prep_time_total", False, str(e))
        return None
    except Exception as e:
        log_test("1 - Order creation stores prep_time_total", False, f"Exception: {str(e)}")
        return None

def test_scenario_2_dispatch_during_preparing(order_id=None):
    """Scenario 2: Dispatch during PREPARING (NEW behavior — predictive)"""
    print("\n=== Scenario 2: Dispatch during PREPARING (predictive) ===")
    
    try:
        # Create a new delivery order if not provided
        if not order_id:
            resp = requests.get(f"{BASE_URL}/dishes")
            dishes = resp.json()
            dish = dishes[0]
            
            resp = requests.get(f"{BASE_URL}/delivery-zones")
            zones = resp.json()
            zone = zones[0]
            
            order_data = {
                "type": "delivery",
                "delivery_zone_id": zone['id'],
                "customer": {"name": "Jonas Kazlauskas", "phone": "+37060098765"},
                "address": {"address": "Savanorių pr. 255", "city": "Kaunas", "zip": "44300"},
                "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
            }
            resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
            order = resp.json()
            order_id = order['id']
            log_test("2.1 - Created new delivery order", True, f"Order ID: {order_id}")
        
        # Update status to 'preparing'
        resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                          json={"status": "preparing"}, 
                          headers=HEADERS_ADMIN)
        assert resp.status_code == 200, f"Failed to update status: {resp.status_code}"
        order = resp.json()
        assert order['status'] == 'preparing', f"Expected status='preparing', got '{order['status']}'"
        log_test("2.2 - Updated order status to 'preparing'", True)
        
        # Dispatch courier during preparing
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "in_house"},
                           headers=HEADERS_ADMIN)
        assert resp.status_code == 200, f"Failed to dispatch: {resp.status_code} - {resp.text}"
        result = resp.json()
        
        # Verify response structure
        assert result.get('ok') == True, f"Expected ok=true, got {result.get('ok')}"
        assert result.get('manual') == True, f"Expected manual=true, got {result.get('manual')}"
        assert 'order' in result, "order not in response"
        
        order = result['order']
        
        # Verify delivery_status
        assert order['delivery_status'] == 'courier_requested', \
            f"Expected delivery_status='courier_requested', got '{order['delivery_status']}'"
        
        # Verify courier_requested_at is set
        assert order['courier_requested_at'] is not None, "courier_requested_at should be set"
        
        # Verify status is STILL 'preparing' (NOT advanced to 'out')
        assert order['status'] == 'preparing', \
            f"Expected status='preparing' (not advanced), got '{order['status']}'"
        
        # Verify out_at is not set
        assert order.get('out_at') is None or order.get('out_at') == '', \
            f"out_at should be null/undefined, got {order.get('out_at')}"
        
        # Verify delivery method
        assert order['delivery_method'] == 'in_house', \
            f"Expected delivery_method='in_house', got '{order['delivery_method']}'"
        assert order['delivery_provider'] == 'in_house', \
            f"Expected delivery_provider='in_house', got '{order['delivery_provider']}'"
        
        log_test("2.3 - Dispatch during PREPARING (predictive)", True,
                f"delivery_status=courier_requested, status=preparing (not advanced), courier_requested_at set, out_at=null")
        
        return order_id
        
    except AssertionError as e:
        log_test("2 - Dispatch during PREPARING", False, str(e))
        return None
    except Exception as e:
        log_test("2 - Dispatch during PREPARING", False, f"Exception: {str(e)}")
        return None

def test_scenario_3_dispatch_during_ready():
    """Scenario 3: Dispatch during READY (still works)"""
    print("\n=== Scenario 3: Dispatch during READY ===")
    
    try:
        # Create delivery order
        resp = requests.get(f"{BASE_URL}/dishes")
        dishes = resp.json()
        dish = dishes[0]
        
        resp = requests.get(f"{BASE_URL}/delivery-zones")
        zones = resp.json()
        zone = zones[0]
        
        order_data = {
            "type": "delivery",
            "delivery_zone_id": zone['id'],
            "customer": {"name": "Rūta Jankauskas", "phone": "+37060055555"},
            "address": {"address": "Vytauto pr. 50", "city": "Kaunas", "zip": "44281"},
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
        }
        resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
        order = resp.json()
        order_id = order['id']
        log_test("3.1 - Created delivery order", True)
        
        # Update to preparing
        resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                          json={"status": "preparing"}, 
                          headers=HEADERS_ADMIN)
        assert resp.status_code == 200
        log_test("3.2 - Updated to 'preparing'", True)
        
        # Update to ready
        resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                          json={"status": "ready"}, 
                          headers=HEADERS_ADMIN)
        assert resp.status_code == 200
        order = resp.json()
        assert order['status'] == 'ready'
        log_test("3.3 - Updated to 'ready'", True)
        
        # Dispatch with wolt
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "wolt"},
                           headers=HEADERS_ADMIN)
        assert resp.status_code == 200, f"Failed to dispatch: {resp.status_code} - {resp.text}"
        result = resp.json()
        order = result['order']
        
        # Verify delivery_status
        assert order['delivery_status'] == 'courier_requested', \
            f"Expected delivery_status='courier_requested', got '{order['delivery_status']}'"
        
        # Verify status STAYS 'ready' (not 'out')
        assert order['status'] == 'ready', \
            f"Expected status='ready' (not advanced), got '{order['status']}'"
        
        # Verify courier_requested_at is set
        assert order['courier_requested_at'] is not None, "courier_requested_at should be set"
        
        log_test("3.4 - Dispatch during READY", True,
                f"delivery_status=courier_requested, status=ready (not advanced), courier_requested_at set")
        
        return order_id
        
    except AssertionError as e:
        log_test("3 - Dispatch during READY", False, str(e))
        return None
    except Exception as e:
        log_test("3 - Dispatch during READY", False, f"Exception: {str(e)}")
        return None

def test_scenario_4_double_dispatch_prevention(order_id):
    """Scenario 4: Double-dispatch prevention"""
    print("\n=== Scenario 4: Double-dispatch prevention ===")
    
    if not order_id:
        log_test("4 - Double-dispatch prevention", False, "No order_id from scenario 3")
        return
    
    try:
        # Try to dispatch again
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "bolt_food"},
                           headers=HEADERS_ADMIN)
        
        # Should return 400
        assert resp.status_code == 400, \
            f"Expected 400 for double-dispatch, got {resp.status_code}"
        
        error_data = resp.json()
        error_msg = error_data.get('error', '').lower()
        assert 'already' in error_msg or 'courier' in error_msg, \
            f"Error message should mention 'already' or 'courier', got: {error_msg}"
        
        log_test("4 - Double-dispatch prevention", True,
                f"Correctly returned 400 with error: {error_data.get('error')}")
        
    except AssertionError as e:
        log_test("4 - Double-dispatch prevention", False, str(e))
    except Exception as e:
        log_test("4 - Double-dispatch prevention", False, f"Exception: {str(e)}")

def test_scenario_5_dispatch_from_received():
    """Scenario 5: Dispatch from RECEIVED returns 400"""
    print("\n=== Scenario 5: Dispatch from RECEIVED returns 400 ===")
    
    try:
        # Create delivery order (status will be 'received')
        resp = requests.get(f"{BASE_URL}/dishes")
        dishes = resp.json()
        dish = dishes[0]
        
        resp = requests.get(f"{BASE_URL}/delivery-zones")
        zones = resp.json()
        zone = zones[0]
        
        order_data = {
            "type": "delivery",
            "delivery_zone_id": zone['id'],
            "customer": {"name": "Petras Vilkas", "phone": "+37060077777"},
            "address": {"address": "Jonavos g. 60", "city": "Kaunas", "zip": "44282"},
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
        }
        resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
        order = resp.json()
        order_id = order['id']
        assert order['status'] == 'received'
        log_test("5.1 - Created order with status='received'", True)
        
        # Try to dispatch without changing status
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "in_house"},
                           headers=HEADERS_ADMIN)
        
        # Should return 400
        assert resp.status_code == 400, \
            f"Expected 400 for dispatch from 'received', got {resp.status_code}"
        
        error_data = resp.json()
        error_msg = error_data.get('error', '').lower()
        assert 'preparing' in error_msg or 'ready' in error_msg, \
            f"Error should mention 'Preparing or Ready', got: {error_data.get('error')}"
        
        log_test("5.2 - Dispatch from RECEIVED returns 400", True,
                f"Correctly returned 400 with error: {error_data.get('error')}")
        
    except AssertionError as e:
        log_test("5 - Dispatch from RECEIVED", False, str(e))
    except Exception as e:
        log_test("5 - Dispatch from RECEIVED", False, f"Exception: {str(e)}")

def test_scenario_6_dispatch_non_delivery_order():
    """Scenario 6: Dispatch on non-delivery order returns 400"""
    print("\n=== Scenario 6: Dispatch on non-delivery order returns 400 ===")
    
    try:
        # Create pickup order
        resp = requests.get(f"{BASE_URL}/dishes")
        dishes = resp.json()
        dish = dishes[0]
        
        order_data = {
            "type": "pickup",
            "customer": {"name": "Gintarė Mockus", "phone": "+37060088888"},
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
        }
        resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
        order = resp.json()
        order_id = order['id']
        assert order['type'] == 'pickup'
        log_test("6.1 - Created pickup order", True)
        
        # Update to preparing
        resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                          json={"status": "preparing"}, 
                          headers=HEADERS_ADMIN)
        assert resp.status_code == 200
        log_test("6.2 - Updated to 'preparing'", True)
        
        # Try to dispatch
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "in_house"},
                           headers=HEADERS_ADMIN)
        
        # Should return 400
        assert resp.status_code == 400, \
            f"Expected 400 for dispatch on pickup order, got {resp.status_code}"
        
        error_data = resp.json()
        error_msg = error_data.get('error', '').lower()
        assert 'not a delivery' in error_msg or 'delivery order' in error_msg, \
            f"Error should mention 'Not a delivery order', got: {error_data.get('error')}"
        
        log_test("6.3 - Dispatch on pickup order returns 400", True,
                f"Correctly returned 400 with error: {error_data.get('error')}")
        
    except AssertionError as e:
        log_test("6 - Dispatch on non-delivery order", False, str(e))
    except Exception as e:
        log_test("6 - Dispatch on non-delivery order", False, f"Exception: {str(e)}")

def test_scenario_7_dispatch_auth():
    """Scenario 7: Dispatch auth"""
    print("\n=== Scenario 7: Dispatch auth ===")
    
    try:
        # Create and prepare a delivery order
        resp = requests.get(f"{BASE_URL}/dishes")
        dishes = resp.json()
        dish = dishes[0]
        
        resp = requests.get(f"{BASE_URL}/delivery-zones")
        zones = resp.json()
        zone = zones[0]
        
        order_data = {
            "type": "delivery",
            "delivery_zone_id": zone['id'],
            "customer": {"name": "Audrius Balčiūnas", "phone": "+37060099999"},
            "address": {"address": "Kauno g. 15", "city": "Kaunas", "zip": "44283"},
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
        }
        resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
        order = resp.json()
        order_id = order['id']
        
        resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                          json={"status": "preparing"}, 
                          headers=HEADERS_ADMIN)
        assert resp.status_code == 200
        log_test("7.1 - Created and prepared delivery order", True)
        
        # Try to dispatch WITHOUT admin token
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "in_house"},
                           headers=HEADERS_NO_AUTH)
        
        # Should return 401
        assert resp.status_code == 401, \
            f"Expected 401 without admin token, got {resp.status_code}"
        
        log_test("7.2 - Dispatch without admin token returns 401", True)
        
    except AssertionError as e:
        log_test("7 - Dispatch auth", False, str(e))
    except Exception as e:
        log_test("7 - Dispatch auth", False, f"Exception: {str(e)}")

def test_scenario_8_picked_up_endpoint(order_id=None):
    """Scenario 8: Picked-up endpoint NEW behavior"""
    print("\n=== Scenario 8: Picked-up endpoint NEW behavior ===")
    
    try:
        # Use order from scenario 2 or create new one
        if not order_id:
            # Create and dispatch a new order
            resp = requests.get(f"{BASE_URL}/dishes")
            dishes = resp.json()
            dish = dishes[0]
            
            resp = requests.get(f"{BASE_URL}/delivery-zones")
            zones = resp.json()
            zone = zones[0]
            
            order_data = {
                "type": "delivery",
                "delivery_zone_id": zone['id'],
                "customer": {"name": "Kristina Paulauskas", "phone": "+37060011111"},
                "address": {"address": "Donelaičio g. 73", "city": "Kaunas", "zip": "44290"},
                "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
            }
            resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
            order = resp.json()
            order_id = order['id']
            
            # Update to preparing
            resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                              json={"status": "preparing"}, 
                              headers=HEADERS_ADMIN)
            
            # Dispatch
            resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                               json={"provider": "in_house"},
                               headers=HEADERS_ADMIN)
            assert resp.status_code == 200
            log_test("8.1 - Created, prepared, and dispatched order", True)
        
        # Call picked-up endpoint
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/picked-up",
                           headers=HEADERS_ADMIN)
        
        assert resp.status_code == 200, \
            f"Failed to mark as picked-up: {resp.status_code} - {resp.text}"
        
        order = resp.json()
        
        # Verify status advanced to 'out'
        assert order['status'] == 'out', \
            f"Expected status='out', got '{order['status']}'"
        
        # Verify delivery_status is 'picked_up'
        assert order['delivery_status'] == 'picked_up', \
            f"Expected delivery_status='picked_up', got '{order['delivery_status']}'"
        
        # Verify picked_up_at is set
        assert order['picked_up_at'] is not None, "picked_up_at should be set"
        
        # Verify out_at is set
        assert order['out_at'] is not None, "out_at should be set"
        
        log_test("8.2 - Picked-up endpoint", True,
                f"status=out, delivery_status=picked_up, picked_up_at and out_at both set")
        
        return order_id
        
    except AssertionError as e:
        log_test("8 - Picked-up endpoint", False, str(e))
        return None
    except Exception as e:
        log_test("8 - Picked-up endpoint", False, f"Exception: {str(e)}")
        return None

def test_scenario_9_picked_up_auth():
    """Scenario 9: Picked-up auth"""
    print("\n=== Scenario 9: Picked-up auth ===")
    
    try:
        # Create, prepare, and dispatch an order
        resp = requests.get(f"{BASE_URL}/dishes")
        dishes = resp.json()
        dish = dishes[0]
        
        resp = requests.get(f"{BASE_URL}/delivery-zones")
        zones = resp.json()
        zone = zones[0]
        
        order_data = {
            "type": "delivery",
            "delivery_zone_id": zone['id'],
            "customer": {"name": "Darius Šimkus", "phone": "+37060022222"},
            "address": {"address": "Taikos pr. 111", "city": "Kaunas", "zip": "44291"},
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
        }
        resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
        order = resp.json()
        order_id = order['id']
        
        resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                          json={"status": "preparing"}, 
                          headers=HEADERS_ADMIN)
        
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                           json={"provider": "in_house"},
                           headers=HEADERS_ADMIN)
        assert resp.status_code == 200
        log_test("9.1 - Created, prepared, and dispatched order", True)
        
        # Try picked-up WITHOUT admin token
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/picked-up",
                           headers=HEADERS_NO_AUTH)
        
        # Should return 401
        assert resp.status_code == 401, \
            f"Expected 401 without admin token, got {resp.status_code}"
        
        log_test("9.2 - Picked-up without admin token returns 401", True)
        
    except AssertionError as e:
        log_test("9 - Picked-up auth", False, str(e))
    except Exception as e:
        log_test("9 - Picked-up auth", False, f"Exception: {str(e)}")

def test_scenario_10_delivered_endpoint(order_id=None):
    """Scenario 10: Delivered endpoint still works"""
    print("\n=== Scenario 10: Delivered endpoint still works ===")
    
    try:
        # Use order from scenario 8 or create new one
        if not order_id:
            # Create full flow order
            resp = requests.get(f"{BASE_URL}/dishes")
            dishes = resp.json()
            dish = dishes[0]
            
            resp = requests.get(f"{BASE_URL}/delivery-zones")
            zones = resp.json()
            zone = zones[0]
            
            order_data = {
                "type": "delivery",
                "delivery_zone_id": zone['id'],
                "customer": {"name": "Vaida Rimkus", "phone": "+37060033333"},
                "address": {"address": "Kęstučio g. 44", "city": "Kaunas", "zip": "44292"},
                "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}]
            }
            resp = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS_NO_AUTH)
            order = resp.json()
            order_id = order['id']
            
            resp = requests.put(f"{BASE_URL}/orders/{order_id}", 
                              json={"status": "preparing"}, 
                              headers=HEADERS_ADMIN)
            
            resp = requests.post(f"{BASE_URL}/orders/{order_id}/dispatch",
                               json={"provider": "in_house"},
                               headers=HEADERS_ADMIN)
            
            resp = requests.post(f"{BASE_URL}/orders/{order_id}/picked-up",
                               headers=HEADERS_ADMIN)
            assert resp.status_code == 200
            log_test("10.1 - Created full flow order (dispatched + picked-up)", True)
        
        # Call delivered endpoint
        resp = requests.post(f"{BASE_URL}/orders/{order_id}/delivered",
                           headers=HEADERS_ADMIN)
        
        assert resp.status_code == 200, \
            f"Failed to mark as delivered: {resp.status_code} - {resp.text}"
        
        order = resp.json()
        
        # Verify status is 'delivered'
        assert order['status'] == 'delivered', \
            f"Expected status='delivered', got '{order['status']}'"
        
        # Verify delivery_status is 'delivered'
        assert order['delivery_status'] == 'delivered', \
            f"Expected delivery_status='delivered', got '{order['delivery_status']}'"
        
        # Verify delivered_at is set
        assert order['delivered_at'] is not None, "delivered_at should be set"
        
        log_test("10.2 - Delivered endpoint", True,
                f"status=delivered, delivery_status=delivered, delivered_at set")
        
    except AssertionError as e:
        log_test("10 - Delivered endpoint", False, str(e))
    except Exception as e:
        log_test("10 - Delivered endpoint", False, f"Exception: {str(e)}")

def test_scenario_11_regression_sanity():
    """Scenario 11: Regression sanity checks"""
    print("\n=== Scenario 11: Regression sanity checks ===")
    
    try:
        # 11.1 - GET /api/categories returns 5
        resp = requests.get(f"{BASE_URL}/categories")
        assert resp.status_code == 200, f"Categories failed: {resp.status_code}"
        categories = resp.json()
        assert len(categories) == 5, f"Expected 5 categories, got {len(categories)}"
        log_test("11.1 - GET /api/categories returns 5", True)
        
        # 11.2 - GET /api/dishes returns array
        resp = requests.get(f"{BASE_URL}/dishes")
        assert resp.status_code == 200, f"Dishes failed: {resp.status_code}"
        dishes = resp.json()
        assert isinstance(dishes, list), "Dishes should be an array"
        assert len(dishes) > 0, "Should have dishes"
        log_test("11.2 - GET /api/dishes returns array", True, f"Found {len(dishes)} dishes")
        
        # 11.3 - POST /api/admin/login with password 'admin123' returns token
        resp = requests.post(f"{BASE_URL}/admin/login",
                           json={"password": "admin123"},
                           headers=HEADERS_NO_AUTH)
        assert resp.status_code == 200, f"Admin login failed: {resp.status_code}"
        login_data = resp.json()
        assert 'token' in login_data, "Token not in response"
        assert login_data['token'] == 'admin123', f"Expected token='admin123', got '{login_data['token']}'"
        log_test("11.3 - POST /api/admin/login returns token", True)
        
        # 11.4 - GET /api/kitchen/orders with admin returns array
        resp = requests.get(f"{BASE_URL}/kitchen/orders", headers=HEADERS_ADMIN)
        assert resp.status_code == 200, f"Kitchen orders failed: {resp.status_code}"
        kitchen_orders = resp.json()
        assert isinstance(kitchen_orders, list), "Kitchen orders should be an array"
        log_test("11.4 - GET /api/kitchen/orders returns array", True, 
                f"Found {len(kitchen_orders)} active orders")
        
        # 11.5 - POST /api/reservations with valid body works
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        reservation_data = {
            "name": "Tomas Urbanavičius",
            "phone": "+37060044444",
            "email": "tomas@example.lt",
            "date": tomorrow,
            "time": "19:00",
            "guests": 4,
            "special_requests": "Window table if possible"
        }
        resp = requests.post(f"{BASE_URL}/reservations",
                           json=reservation_data,
                           headers=HEADERS_NO_AUTH)
        assert resp.status_code == 200, f"Reservation failed: {resp.status_code} - {resp.text}"
        reservation = resp.json()
        assert 'confirmation' in reservation, "Confirmation not in response"
        assert reservation['confirmation'].startswith('RES'), "Confirmation should start with RES"
        log_test("11.5 - POST /api/reservations works", True,
                f"Created reservation {reservation['confirmation']}")
        
    except AssertionError as e:
        log_test("11 - Regression sanity", False, str(e))
    except Exception as e:
        log_test("11 - Regression sanity", False, f"Exception: {str(e)}")

def main():
    print("=" * 80)
    print("PREDICTIVE COURIER DISPATCH - BACKEND TEST SUITE")
    print("=" * 80)
    
    # Run all scenarios
    order_1 = test_scenario_1_order_creation_prep_time()
    order_2 = test_scenario_2_dispatch_during_preparing()
    order_3 = test_scenario_3_dispatch_during_ready()
    test_scenario_4_double_dispatch_prevention(order_3)
    test_scenario_5_dispatch_from_received()
    test_scenario_6_dispatch_non_delivery_order()
    test_scenario_7_dispatch_auth()
    order_8 = test_scenario_8_picked_up_endpoint(order_2)
    test_scenario_9_picked_up_auth()
    test_scenario_10_delivered_endpoint(order_8)
    test_scenario_11_regression_sanity()
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {pass_count + fail_count}")
    print(f"✅ Passed: {pass_count}")
    print(f"❌ Failed: {fail_count}")
    print(f"Success Rate: {(pass_count / (pass_count + fail_count) * 100):.1f}%")
    print("=" * 80)
    
    if fail_count > 0:
        print("\n⚠️  FAILED TESTS:")
        for result in test_results:
            if not result['passed']:
                print(f"  - {result['test']}")
                if result['details']:
                    print(f"    {result['details']}")
    else:
        print("\n🎉 ALL TESTS PASSED!")
    
    return fail_count == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
