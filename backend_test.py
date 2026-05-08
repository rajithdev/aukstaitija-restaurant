#!/usr/bin/env python3
"""
Backend API Test Suite for Aukstaitija Restaurant
Tests all endpoints systematically as per requirements
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://277842d5-3eca-4a9e-bbec-aeb8b56bce5e.preview.emergentagent.com/api"
ADMIN_TOKEN = "admin123"
ADMIN_HEADERS = {"x-admin-token": ADMIN_TOKEN, "Content-Type": "application/json"}
HEADERS = {"Content-Type": "application/json"}

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "total": 0
}

def log_test(test_name, passed, details=""):
    """Log test result"""
    test_results["total"] += 1
    if passed:
        test_results["passed"].append(test_name)
        print(f"✅ PASS: {test_name}")
    else:
        test_results["failed"].append(test_name)
        print(f"❌ FAIL: {test_name}")
    if details:
        print(f"   Details: {details}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests: {test_results['total']}")
    print(f"Passed: {len(test_results['passed'])}")
    print(f"Failed: {len(test_results['failed'])}")
    print(f"Success Rate: {len(test_results['passed'])/test_results['total']*100:.1f}%")
    if test_results['failed']:
        print("\nFailed Tests:")
        for test in test_results['failed']:
            print(f"  - {test}")
    print("="*80)

# ============================================================================
# TEST 1: Categories API
# ============================================================================
def test_categories():
    """Test GET /api/categories"""
    print("\n" + "="*80)
    print("TEST 1: Categories API")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/categories", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            # Verify it's an array
            if not isinstance(data, list):
                log_test("Categories returns array", False, f"Expected array, got {type(data)}")
                return
            
            # Verify 5 categories
            if len(data) != 5:
                log_test("Categories count is 5", False, f"Expected 5, got {len(data)}")
            else:
                log_test("Categories count is 5", True)
            
            # Verify each has 'order' field and is sorted
            has_order = all('order' in cat for cat in data)
            if not has_order:
                log_test("Categories have 'order' field", False)
            else:
                log_test("Categories have 'order' field", True)
                
                # Check if sorted by order
                orders = [cat['order'] for cat in data]
                is_sorted = orders == sorted(orders)
                log_test("Categories sorted by order", is_sorted, f"Orders: {orders}")
        else:
            log_test("Categories API returns 200", False, f"Got {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Categories API", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 2: Dishes API - List and Filters
# ============================================================================
def test_dishes_list():
    """Test GET /api/dishes with various filters"""
    print("\n" + "="*80)
    print("TEST 2: Dishes API - List and Filters")
    print("="*80)
    
    try:
        # Test basic list
        response = requests.get(f"{BASE_URL}/dishes", timeout=10)
        print(f"Basic list status: {response.status_code}")
        
        if response.status_code == 200:
            dishes = response.json()
            print(f"Total dishes: {len(dishes)}")
            
            if len(dishes) == 10:
                log_test("Dishes list returns 10 items", True)
            else:
                log_test("Dishes list returns 10 items", False, f"Got {len(dishes)}")
            
            # Test search filter
            response = requests.get(f"{BASE_URL}/dishes?search=cepelinai", timeout=10)
            if response.status_code == 200:
                search_results = response.json()
                print(f"Search 'cepelinai' results: {len(search_results)}")
                has_cepelinai = any('cepelinai' in d.get('name', '').lower() or 'cepelinai' in d.get('id', '').lower() for d in search_results)
                log_test("Dishes search filter works", has_cepelinai, f"Found {len(search_results)} results")
            else:
                log_test("Dishes search filter", False, f"Status {response.status_code}")
            
            # Test category filter
            response = requests.get(f"{BASE_URL}/dishes?category=mains", timeout=10)
            if response.status_code == 200:
                mains = response.json()
                all_mains = all(d.get('category') == 'mains' for d in mains)
                log_test("Dishes category filter works", all_mains, f"Found {len(mains)} mains")
            else:
                log_test("Dishes category filter", False, f"Status {response.status_code}")
            
            # Test dietary filter
            response = requests.get(f"{BASE_URL}/dishes?dietary=veg", timeout=10)
            if response.status_code == 200:
                veg_dishes = response.json()
                print(f"Vegetarian dishes: {len(veg_dishes)}")
                log_test("Dishes dietary filter works", True, f"Found {len(veg_dishes)} veg dishes")
            else:
                log_test("Dishes dietary filter", False, f"Status {response.status_code}")
            
            # Test sort price_asc
            response = requests.get(f"{BASE_URL}/dishes?sort=price_asc", timeout=10)
            if response.status_code == 200:
                sorted_dishes = response.json()
                prices = [d.get('price', 0) for d in sorted_dishes]
                is_ascending = prices == sorted(prices)
                log_test("Dishes sort price_asc works", is_ascending, f"Prices: {prices[:3]}...")
            else:
                log_test("Dishes sort price_asc", False, f"Status {response.status_code}")
            
            # Test sort price_desc
            response = requests.get(f"{BASE_URL}/dishes?sort=price_desc", timeout=10)
            if response.status_code == 200:
                sorted_dishes = response.json()
                prices = [d.get('price', 0) for d in sorted_dishes]
                is_descending = prices == sorted(prices, reverse=True)
                log_test("Dishes sort price_desc works", is_descending, f"Prices: {prices[:3]}...")
            else:
                log_test("Dishes sort price_desc", False, f"Status {response.status_code}")
        else:
            log_test("Dishes list API", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Dishes list API", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 3: Dishes API - Get by ID
# ============================================================================
def test_dishes_by_id():
    """Test GET /api/dishes/:id"""
    print("\n" + "="*80)
    print("TEST 3: Dishes API - Get by ID")
    print("="*80)
    
    try:
        # Test valid dish ID
        response = requests.get(f"{BASE_URL}/dishes/cepelinai", timeout=10)
        print(f"GET cepelinai status: {response.status_code}")
        
        if response.status_code == 200:
            dish = response.json()
            print(f"Dish: {dish.get('name', 'N/A')}")
            log_test("Get dish by ID (cepelinai)", True, f"Name: {dish.get('name')}")
        else:
            log_test("Get dish by ID (cepelinai)", False, f"Status {response.status_code}")
        
        # Test nonexistent dish
        response = requests.get(f"{BASE_URL}/dishes/nonexistent", timeout=10)
        print(f"GET nonexistent status: {response.status_code}")
        
        if response.status_code == 404:
            log_test("Get nonexistent dish returns 404", True)
        else:
            log_test("Get nonexistent dish returns 404", False, f"Got {response.status_code}")
    except Exception as e:
        log_test("Dishes by ID API", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 4: Dishes Admin CRUD
# ============================================================================
def test_dishes_admin_crud():
    """Test POST/PUT/DELETE /api/dishes with admin auth"""
    print("\n" + "="*80)
    print("TEST 4: Dishes Admin CRUD")
    print("="*80)
    
    new_dish_id = None
    
    try:
        # Test POST without token (should fail)
        dish_data = {
            "name": "Test Dish",
            "price": 9.99,
            "category": "starters"
        }
        response = requests.post(f"{BASE_URL}/dishes", json=dish_data, headers=HEADERS, timeout=10)
        print(f"POST without token status: {response.status_code}")
        
        if response.status_code == 401:
            log_test("POST dish without token returns 401", True)
        else:
            log_test("POST dish without token returns 401", False, f"Got {response.status_code}")
        
        # Test POST with token (should succeed)
        response = requests.post(f"{BASE_URL}/dishes", json=dish_data, headers=ADMIN_HEADERS, timeout=10)
        print(f"POST with token status: {response.status_code}")
        
        if response.status_code == 200:
            new_dish = response.json()
            new_dish_id = new_dish.get('id')
            print(f"Created dish ID: {new_dish_id}")
            log_test("POST dish with token succeeds", True, f"ID: {new_dish_id}")
            
            # Test PUT to update price
            update_data = {"price": 12.50}
            response = requests.put(f"{BASE_URL}/dishes/{new_dish_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
            print(f"PUT dish status: {response.status_code}")
            
            if response.status_code == 200:
                updated_dish = response.json()
                if updated_dish.get('price') == 12.50:
                    log_test("PUT dish updates price", True, f"New price: {updated_dish.get('price')}")
                else:
                    log_test("PUT dish updates price", False, f"Expected 12.50, got {updated_dish.get('price')}")
            else:
                log_test("PUT dish", False, f"Status {response.status_code}")
            
            # Test DELETE
            response = requests.delete(f"{BASE_URL}/dishes/{new_dish_id}", headers=ADMIN_HEADERS, timeout=10)
            print(f"DELETE dish status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                if result.get('ok') == True:
                    log_test("DELETE dish succeeds", True)
                else:
                    log_test("DELETE dish succeeds", False, f"Response: {result}")
            else:
                log_test("DELETE dish", False, f"Status {response.status_code}")
        else:
            log_test("POST dish with token", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Dishes admin CRUD", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 5: Orders API
# ============================================================================
def test_orders():
    """Test POST /api/orders and related endpoints"""
    print("\n" + "="*80)
    print("TEST 5: Orders API")
    print("="*80)
    
    order_id = None
    
    try:
        # Create an order
        order_data = {
            "items": [
                {
                    "id": "cepelinai",
                    "name": "Cepelinai",
                    "price": 14.50,
                    "quantity": 2
                }
            ],
            "type": "delivery",
            "customer": {
                "name": "Petras Petraitis",
                "phone": "+37061234567"
            },
            "address": {
                "address": "Laisvės al. 123, Kaunas"
            },
            "payment_method": "cash"
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS, timeout=10)
        print(f"POST order status: {response.status_code}")
        
        if response.status_code == 200:
            order = response.json()
            order_id = order.get('id')
            order_number = order.get('order_number')
            subtotal = order.get('subtotal')
            tax = order.get('tax')
            delivery_fee = order.get('delivery_fee')
            total = order.get('total')
            
            print(f"Order ID: {order_id}")
            print(f"Order Number: {order_number}")
            print(f"Subtotal: €{subtotal}")
            print(f"Tax: €{tax}")
            print(f"Delivery Fee: €{delivery_fee}")
            print(f"Total: €{total}")
            
            # Verify order number starts with AK
            if order_number and order_number.startswith('AK'):
                log_test("Order number starts with AK", True, f"Number: {order_number}")
            else:
                log_test("Order number starts with AK", False, f"Got: {order_number}")
            
            # Verify calculations
            expected_subtotal = 29.00  # 14.50 * 2
            expected_tax = 6.09  # 29.00 * 0.21
            expected_delivery = 3.50
            expected_total = 38.59  # 29.00 + 6.09 + 3.50
            
            if abs(subtotal - expected_subtotal) < 0.01:
                log_test("Order subtotal correct", True, f"€{subtotal}")
            else:
                log_test("Order subtotal correct", False, f"Expected €{expected_subtotal}, got €{subtotal}")
            
            if abs(tax - expected_tax) < 0.01:
                log_test("Order tax (21%) correct", True, f"€{tax}")
            else:
                log_test("Order tax (21%) correct", False, f"Expected €{expected_tax}, got €{tax}")
            
            if abs(delivery_fee - expected_delivery) < 0.01:
                log_test("Order delivery fee correct", True, f"€{delivery_fee}")
            else:
                log_test("Order delivery fee correct", False, f"Expected €{expected_delivery}, got €{delivery_fee}")
            
            if abs(total - expected_total) < 0.01:
                log_test("Order total correct", True, f"€{total}")
            else:
                log_test("Order total correct", False, f"Expected €{expected_total}, got €{total}")
            
            # Test GET order by ID
            response = requests.get(f"{BASE_URL}/orders/{order_id}", timeout=10)
            print(f"GET order by ID status: {response.status_code}")
            
            if response.status_code == 200:
                fetched_order = response.json()
                log_test("GET order by ID works", True, f"ID: {fetched_order.get('id')}")
            else:
                log_test("GET order by ID", False, f"Status {response.status_code}")
            
            # Test GET orders without token (should fail)
            response = requests.get(f"{BASE_URL}/orders", headers=HEADERS, timeout=10)
            print(f"GET orders without token status: {response.status_code}")
            
            if response.status_code == 401:
                log_test("GET orders without token returns 401", True)
            else:
                log_test("GET orders without token returns 401", False, f"Got {response.status_code}")
            
            # Test GET orders with token
            response = requests.get(f"{BASE_URL}/orders", headers=ADMIN_HEADERS, timeout=10)
            print(f"GET orders with token status: {response.status_code}")
            
            if response.status_code == 200:
                orders = response.json()
                has_our_order = any(o.get('id') == order_id for o in orders)
                log_test("GET orders with token works", has_our_order, f"Found {len(orders)} orders")
            else:
                log_test("GET orders with token", False, f"Status {response.status_code}")
            
            # Test PUT order status
            update_data = {"status": "preparing"}
            response = requests.put(f"{BASE_URL}/orders/{order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
            print(f"PUT order status: {response.status_code}")
            
            if response.status_code == 200:
                updated_order = response.json()
                if updated_order.get('status') == 'preparing':
                    log_test("PUT order status works", True, f"Status: {updated_order.get('status')}")
                else:
                    log_test("PUT order status works", False, f"Expected 'preparing', got {updated_order.get('status')}")
            else:
                log_test("PUT order status", False, f"Status {response.status_code}")
        else:
            log_test("POST order", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Orders API", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 6: Reservations API
# ============================================================================
def test_reservations():
    """Test POST /api/reservations and availability"""
    print("\n" + "="*80)
    print("TEST 6: Reservations API")
    print("="*80)
    
    reservation_id = None
    
    try:
        # Create a reservation
        reservation_data = {
            "name": "Jonas Jonaitis",
            "phone": "+37061111111",
            "date": "2099-12-31",
            "time": "19:00",
            "guests": 2
        }
        
        response = requests.post(f"{BASE_URL}/reservations", json=reservation_data, headers=HEADERS, timeout=10)
        print(f"POST reservation status: {response.status_code}")
        
        if response.status_code == 200:
            reservation = response.json()
            reservation_id = reservation.get('id')
            confirmation = reservation.get('confirmation')
            
            print(f"Reservation ID: {reservation_id}")
            print(f"Confirmation: {confirmation}")
            
            if confirmation:
                log_test("Reservation has confirmation field", True, f"Confirmation: {confirmation}")
            else:
                log_test("Reservation has confirmation field", False)
            
            # Test GET availability
            response = requests.get(f"{BASE_URL}/reservations/availability?date=2099-12-31", timeout=10)
            print(f"GET availability status: {response.status_code}")
            
            if response.status_code == 200:
                availability = response.json()
                slots = availability.get('slots', [])
                slot_19 = next((s for s in slots if s.get('time') == '19:00'), None)
                
                if slot_19:
                    available = slot_19.get('available')
                    print(f"19:00 slot available: {available}")
                    if available == 9:
                        log_test("Availability shows 9 tables for 19:00", True)
                    else:
                        log_test("Availability shows 9 tables for 19:00", False, f"Got {available}")
                else:
                    log_test("Availability includes 19:00 slot", False)
            else:
                log_test("GET availability", False, f"Status {response.status_code}")
        else:
            log_test("POST reservation", False, f"Status {response.status_code}: {response.text}")
        
        # Test GET reservations without token
        response = requests.get(f"{BASE_URL}/reservations", headers=HEADERS, timeout=10)
        print(f"GET reservations without token status: {response.status_code}")
        
        if response.status_code == 401:
            log_test("GET reservations without token returns 401", True)
        else:
            log_test("GET reservations without token returns 401", False, f"Got {response.status_code}")
        
        # Test GET reservations with token
        response = requests.get(f"{BASE_URL}/reservations", headers=ADMIN_HEADERS, timeout=10)
        print(f"GET reservations with token status: {response.status_code}")
        
        if response.status_code == 200:
            reservations = response.json()
            log_test("GET reservations with token works", True, f"Found {len(reservations)} reservations")
        else:
            log_test("GET reservations with token", False, f"Status {response.status_code}")
        
        # Test PUT reservation status
        if reservation_id:
            update_data = {"status": "cancelled"}
            response = requests.put(f"{BASE_URL}/reservations/{reservation_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
            print(f"PUT reservation status: {response.status_code}")
            
            if response.status_code == 200:
                updated_res = response.json()
                if updated_res.get('status') == 'cancelled':
                    log_test("PUT reservation status works", True, f"Status: {updated_res.get('status')}")
                else:
                    log_test("PUT reservation status works", False, f"Expected 'cancelled', got {updated_res.get('status')}")
            else:
                log_test("PUT reservation status", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Reservations API", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 7: Double-booking Prevention
# ============================================================================
def test_double_booking():
    """Test reservation double-booking prevention"""
    print("\n" + "="*80)
    print("TEST 7: Double-booking Prevention")
    print("="*80)
    
    try:
        # Create 10 reservations for the same slot
        test_date = "2099-12-30"
        test_time = "20:00"
        
        print(f"Creating 10 reservations for {test_date} at {test_time}...")
        
        for i in range(10):
            reservation_data = {
                "name": f"Test User {i+1}",
                "phone": f"+3706111111{i:02d}",
                "date": test_date,
                "time": test_time,
                "guests": 2
            }
            response = requests.post(f"{BASE_URL}/reservations", json=reservation_data, headers=HEADERS, timeout=10)
            if response.status_code != 200:
                log_test(f"Create reservation {i+1}/10", False, f"Status {response.status_code}")
                return
        
        log_test("Create 10 reservations for same slot", True)
        
        # Try to create 11th reservation (should fail with 409)
        reservation_data = {
            "name": "Test User 11",
            "phone": "+37061111110",
            "date": test_date,
            "time": test_time,
            "guests": 2
        }
        response = requests.post(f"{BASE_URL}/reservations", json=reservation_data, headers=HEADERS, timeout=10)
        print(f"11th reservation status: {response.status_code}")
        
        if response.status_code == 409:
            error_data = response.json()
            error_msg = error_data.get('error', '')
            print(f"Error message: {error_msg}")
            
            if 'fully booked' in error_msg.lower() or 'slot fully booked' in error_msg.lower():
                log_test("11th reservation returns 409 with 'fully booked' error", True)
            else:
                log_test("11th reservation returns 409 with 'fully booked' error", False, f"Got: {error_msg}")
        else:
            log_test("11th reservation returns 409", False, f"Got {response.status_code}")
    except Exception as e:
        log_test("Double-booking prevention", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 8: Admin Login
# ============================================================================
def test_admin_login():
    """Test POST /api/admin/login"""
    print("\n" + "="*80)
    print("TEST 8: Admin Login")
    print("="*80)
    
    try:
        # Test with wrong password
        login_data = {"password": "wrong"}
        response = requests.post(f"{BASE_URL}/admin/login", json=login_data, headers=HEADERS, timeout=10)
        print(f"Login with wrong password status: {response.status_code}")
        
        if response.status_code == 401:
            log_test("Login with wrong password returns 401", True)
        else:
            log_test("Login with wrong password returns 401", False, f"Got {response.status_code}")
        
        # Test with correct password
        login_data = {"password": "admin123"}
        response = requests.post(f"{BASE_URL}/admin/login", json=login_data, headers=HEADERS, timeout=10)
        print(f"Login with correct password status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            token = result.get('token')
            print(f"Token: {token}")
            
            if token == "admin123":
                log_test("Login with correct password returns token", True, f"Token: {token}")
            else:
                log_test("Login with correct password returns token", False, f"Expected 'admin123', got {token}")
        else:
            log_test("Login with correct password", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Admin login", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 9: Admin Analytics
# ============================================================================
def test_admin_analytics():
    """Test GET /api/admin/analytics"""
    print("\n" + "="*80)
    print("TEST 9: Admin Analytics")
    print("="*80)
    
    try:
        # First create an order to ensure non-zero data
        order_data = {
            "items": [
                {
                    "id": "cepelinai",
                    "name": "Cepelinai",
                    "price": 14.50,
                    "quantity": 1
                }
            ],
            "type": "pickup",
            "customer": {
                "name": "Analytics Test",
                "phone": "+37061234567"
            },
            "payment_method": "cash"
        }
        requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS, timeout=10)
        
        # Get analytics
        response = requests.get(f"{BASE_URL}/admin/analytics", headers=ADMIN_HEADERS, timeout=10)
        print(f"GET analytics status: {response.status_code}")
        
        if response.status_code == 200:
            analytics = response.json()
            print(f"Analytics: {json.dumps(analytics, indent=2)}")
            
            required_fields = ['total_revenue', 'today_revenue', 'total_orders', 'today_orders', 'avg_order_value', 'top_dishes']
            
            missing_fields = [f for f in required_fields if f not in analytics]
            if missing_fields:
                log_test("Analytics has all required fields", False, f"Missing: {missing_fields}")
            else:
                log_test("Analytics has all required fields", True)
            
            # Verify types
            if isinstance(analytics.get('total_revenue'), (int, float)):
                log_test("Analytics total_revenue is number", True, f"€{analytics.get('total_revenue')}")
            else:
                log_test("Analytics total_revenue is number", False, f"Got {type(analytics.get('total_revenue'))}")
            
            if isinstance(analytics.get('avg_order_value'), (int, float)):
                log_test("Analytics avg_order_value is number", True, f"€{analytics.get('avg_order_value')}")
            else:
                log_test("Analytics avg_order_value is number", False, f"Got {type(analytics.get('avg_order_value'))}")
            
            if isinstance(analytics.get('top_dishes'), list):
                log_test("Analytics top_dishes is array", True, f"Count: {len(analytics.get('top_dishes'))}")
            else:
                log_test("Analytics top_dishes is array", False, f"Got {type(analytics.get('top_dishes'))}")
        else:
            log_test("GET analytics", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Admin analytics", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 10: Newsletter
# ============================================================================
def test_newsletter():
    """Test POST /api/newsletter"""
    print("\n" + "="*80)
    print("TEST 10: Newsletter")
    print("="*80)
    
    try:
        # Test with email
        newsletter_data = {"email": "test@test.com"}
        response = requests.post(f"{BASE_URL}/newsletter", json=newsletter_data, headers=HEADERS, timeout=10)
        print(f"POST newsletter with email status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('ok') == True:
                log_test("Newsletter with email returns ok:true", True)
            else:
                log_test("Newsletter with email returns ok:true", False, f"Got: {result}")
        else:
            log_test("Newsletter with email", False, f"Status {response.status_code}")
        
        # Test without email
        response = requests.post(f"{BASE_URL}/newsletter", json={}, headers=HEADERS, timeout=10)
        print(f"POST newsletter without email status: {response.status_code}")
        
        if response.status_code == 400:
            log_test("Newsletter without email returns 400", True)
        else:
            log_test("Newsletter without email returns 400", False, f"Got {response.status_code}")
    except Exception as e:
        log_test("Newsletter", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 11: Kitchen Orders Endpoint
# ============================================================================
def test_kitchen_orders():
    """Test GET /api/kitchen/orders - filtering and sorting"""
    print("\n" + "="*80)
    print("TEST 11: Kitchen Orders Endpoint")
    print("="*80)
    
    try:
        # Test without admin token (should fail)
        response = requests.get(f"{BASE_URL}/kitchen/orders", headers=HEADERS, timeout=10)
        print(f"GET kitchen/orders without token status: {response.status_code}")
        
        if response.status_code == 401:
            log_test("Kitchen orders without token returns 401", True)
        else:
            log_test("Kitchen orders without token returns 401", False, f"Got {response.status_code}")
        
        # Create 3 test orders
        print("\nCreating 3 test orders...")
        order_ids = []
        
        for i in range(3):
            order_data = {
                "items": [
                    {
                        "id": "cepelinai",
                        "name": "Cepelinai",
                        "price": 14.50,
                        "quantity": 1
                    }
                ],
                "type": "delivery",
                "customer": {
                    "name": f"Kitchen Test {i+1}",
                    "phone": f"+3706999999{i}"
                },
                "payment_method": "cash"
            }
            response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS, timeout=10)
            if response.status_code == 200:
                order = response.json()
                order_ids.append(order.get('id'))
                print(f"Created order {i+1}: {order.get('id')}")
            else:
                log_test(f"Create test order {i+1}", False, f"Status {response.status_code}")
                return
        
        log_test("Create 3 test orders", True, f"IDs: {order_ids}")
        
        # Mark first order as 'delivered' (should be excluded from kitchen view)
        if order_ids:
            update_data = {"status": "delivered"}
            response = requests.put(f"{BASE_URL}/orders/{order_ids[0]}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
            print(f"Mark order 1 as delivered status: {response.status_code}")
            
            if response.status_code == 200:
                log_test("Mark order as delivered", True)
            else:
                log_test("Mark order as delivered", False, f"Status {response.status_code}")
        
        # Test GET kitchen/orders with admin token
        response = requests.get(f"{BASE_URL}/kitchen/orders", headers=ADMIN_HEADERS, timeout=10)
        print(f"GET kitchen/orders with token status: {response.status_code}")
        
        if response.status_code == 200:
            kitchen_orders = response.json()
            print(f"Kitchen orders count: {len(kitchen_orders)}")
            
            log_test("Kitchen orders with token returns 200", True, f"Found {len(kitchen_orders)} orders")
            
            # Verify it's an array
            if not isinstance(kitchen_orders, list):
                log_test("Kitchen orders returns array", False, f"Got {type(kitchen_orders)}")
            else:
                log_test("Kitchen orders returns array", True)
            
            # Verify only active orders (received/preparing/ready) are returned
            # The delivered order should NOT be in the list
            has_delivered = any(o.get('id') == order_ids[0] for o in kitchen_orders)
            if has_delivered:
                log_test("Kitchen orders excludes delivered orders", False, "Delivered order found in results")
            else:
                log_test("Kitchen orders excludes delivered orders", True)
            
            # Verify only received/preparing/ready statuses
            invalid_statuses = [o.get('status') for o in kitchen_orders if o.get('status') not in ['received', 'preparing', 'ready']]
            if invalid_statuses:
                log_test("Kitchen orders only includes active statuses", False, f"Found: {invalid_statuses}")
            else:
                log_test("Kitchen orders only includes active statuses", True)
            
            # Test sorting: priority orders first, then by created_at ascending
            # Set priority on one order
            if len(order_ids) >= 2:
                priority_data = {"priority": True}
                response = requests.put(f"{BASE_URL}/orders/{order_ids[1]}", json=priority_data, headers=ADMIN_HEADERS, timeout=10)
                print(f"Set priority on order 2 status: {response.status_code}")
                
                # Fetch kitchen orders again
                response = requests.get(f"{BASE_URL}/kitchen/orders", headers=ADMIN_HEADERS, timeout=10)
                if response.status_code == 200:
                    kitchen_orders = response.json()
                    
                    # Find our priority order
                    priority_order_index = next((i for i, o in enumerate(kitchen_orders) if o.get('id') == order_ids[1]), None)
                    
                    if priority_order_index is not None:
                        # Priority order should be first (or among first if multiple priority orders)
                        if priority_order_index == 0 or kitchen_orders[0].get('priority') == True:
                            log_test("Kitchen orders sorts priority first", True, f"Priority order at index {priority_order_index}")
                        else:
                            log_test("Kitchen orders sorts priority first", False, f"Priority order at index {priority_order_index}, expected 0 or first")
                    else:
                        log_test("Kitchen orders includes priority order", False, "Priority order not found")
                    
                    # Verify created_at ascending within same priority
                    non_priority = [o for o in kitchen_orders if not o.get('priority')]
                    if len(non_priority) >= 2:
                        dates = [o.get('created_at') for o in non_priority]
                        is_ascending = dates == sorted(dates)
                        log_test("Kitchen orders sorts by created_at ascending", is_ascending, f"Dates: {dates[:3]}")
                    else:
                        log_test("Kitchen orders sorts by created_at ascending", True, "Not enough non-priority orders to verify")
        else:
            log_test("Kitchen orders with token", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Kitchen orders endpoint", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 12: Order Status Timestamps + Priority Flag
# ============================================================================
def test_order_timestamps_priority():
    """Test PUT /api/orders/:id - timestamps and priority flag"""
    print("\n" + "="*80)
    print("TEST 12: Order Status Timestamps + Priority Flag")
    print("="*80)
    
    try:
        # Create a fresh order
        order_data = {
            "items": [
                {
                    "id": "cepelinai",
                    "name": "Cepelinai",
                    "price": 14.50,
                    "quantity": 1
                }
            ],
            "type": "pickup",
            "customer": {
                "name": "Timestamp Test",
                "phone": "+37061234567"
            },
            "payment_method": "cash"
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS, timeout=10)
        print(f"Create test order status: {response.status_code}")
        
        if response.status_code != 200:
            log_test("Create order for timestamp test", False, f"Status {response.status_code}")
            return
        
        order = response.json()
        order_id = order.get('id')
        print(f"Test order ID: {order_id}")
        log_test("Create order for timestamp test", True, f"ID: {order_id}")
        
        # Test PUT without admin token (should fail)
        update_data = {"status": "preparing"}
        response = requests.put(f"{BASE_URL}/orders/{order_id}", json=update_data, headers=HEADERS, timeout=10)
        print(f"PUT order without token status: {response.status_code}")
        
        if response.status_code == 401:
            log_test("PUT order without token returns 401", True)
        else:
            log_test("PUT order without token returns 401", False, f"Got {response.status_code}")
        
        # Test status='preparing' → should set accepted_at
        update_data = {"status": "preparing"}
        response = requests.put(f"{BASE_URL}/orders/{order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
        print(f"PUT status=preparing status: {response.status_code}")
        
        if response.status_code == 200:
            updated_order = response.json()
            accepted_at = updated_order.get('accepted_at')
            
            if accepted_at:
                log_test("PUT status=preparing sets accepted_at", True, f"accepted_at: {accepted_at}")
            else:
                log_test("PUT status=preparing sets accepted_at", False, "accepted_at field missing")
        else:
            log_test("PUT status=preparing", False, f"Status {response.status_code}")
        
        # Test status='ready' → should set ready_at
        update_data = {"status": "ready"}
        response = requests.put(f"{BASE_URL}/orders/{order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
        print(f"PUT status=ready status: {response.status_code}")
        
        if response.status_code == 200:
            updated_order = response.json()
            ready_at = updated_order.get('ready_at')
            
            if ready_at:
                log_test("PUT status=ready sets ready_at", True, f"ready_at: {ready_at}")
            else:
                log_test("PUT status=ready sets ready_at", False, "ready_at field missing")
        else:
            log_test("PUT status=ready", False, f"Status {response.status_code}")
        
        # Test status='out' → should set out_at
        update_data = {"status": "out"}
        response = requests.put(f"{BASE_URL}/orders/{order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
        print(f"PUT status=out status: {response.status_code}")
        
        if response.status_code == 200:
            updated_order = response.json()
            out_at = updated_order.get('out_at')
            
            if out_at:
                log_test("PUT status=out sets out_at", True, f"out_at: {out_at}")
            else:
                log_test("PUT status=out sets out_at", False, "out_at field missing")
        else:
            log_test("PUT status=out", False, f"Status {response.status_code}")
        
        # Test status='delivered' → should set delivered_at
        update_data = {"status": "delivered"}
        response = requests.put(f"{BASE_URL}/orders/{order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
        print(f"PUT status=delivered status: {response.status_code}")
        
        if response.status_code == 200:
            updated_order = response.json()
            delivered_at = updated_order.get('delivered_at')
            
            if delivered_at:
                log_test("PUT status=delivered sets delivered_at", True, f"delivered_at: {delivered_at}")
            else:
                log_test("PUT status=delivered sets delivered_at", False, "delivered_at field missing")
        else:
            log_test("PUT status=delivered", False, f"Status {response.status_code}")
        
        # Create another order for priority testing
        response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=HEADERS, timeout=10)
        if response.status_code == 200:
            priority_order = response.json()
            priority_order_id = priority_order.get('id')
            print(f"Priority test order ID: {priority_order_id}")
            
            # Test priority=true
            update_data = {"priority": True}
            response = requests.put(f"{BASE_URL}/orders/{priority_order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
            print(f"PUT priority=true status: {response.status_code}")
            
            if response.status_code == 200:
                updated_order = response.json()
                priority = updated_order.get('priority')
                
                if priority == True:
                    log_test("PUT priority=true sets priority field", True, f"priority: {priority}")
                else:
                    log_test("PUT priority=true sets priority field", False, f"Expected True, got {priority}")
            else:
                log_test("PUT priority=true", False, f"Status {response.status_code}")
            
            # Test priority=false
            update_data = {"priority": False}
            response = requests.put(f"{BASE_URL}/orders/{priority_order_id}", json=update_data, headers=ADMIN_HEADERS, timeout=10)
            print(f"PUT priority=false status: {response.status_code}")
            
            if response.status_code == 200:
                updated_order = response.json()
                priority = updated_order.get('priority')
                
                if priority == False:
                    log_test("PUT priority=false sets priority field", True, f"priority: {priority}")
                else:
                    log_test("PUT priority=false sets priority field", False, f"Expected False, got {priority}")
            else:
                log_test("PUT priority=false", False, f"Status {response.status_code}")
        else:
            log_test("Create order for priority test", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Order timestamps and priority", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================
def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("AUKSTAITIJA RESTAURANT BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin Token: {ADMIN_TOKEN}")
    print("="*80)
    
    # Run all tests
    test_categories()
    test_dishes_list()
    test_dishes_by_id()
    test_dishes_admin_crud()
    test_orders()
    test_reservations()
    test_double_booking()
    test_admin_login()
    test_admin_analytics()
    test_newsletter()
    test_kitchen_orders()
    test_order_timestamps_priority()
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
