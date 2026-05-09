#!/usr/bin/env python3
"""
Backend API Test Suite for Aukstaitija Restaurant - Customer Authentication
Tests hybrid customer authentication with HTTP-only cookie sessions
"""

import requests
import json
import re
import time
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

def test_customer_authentication():
    """Test hybrid customer authentication system with HTTP-only cookies"""
    print("\n" + "="*80)
    print("TESTING: Hybrid Customer Authentication System")
    print("="*80 + "\n")
    
    passed_tests = 0
    total_tests = 0
    
    # Generate unique email for this test run
    timestamp = int(time.time())
    test_email = f"test+{timestamp}@example.com"
    test_phone = "+37060000111"
    
    # ========================================================================
    # AUTH BASICS
    # ========================================================================
    
    # Test 1: GET /auth/me without session → 200, body { user: null }
    print("\n--- Test 1: GET /auth/me without session ---")
    total_tests += 1
    try:
        response = requests.get(f"{BASE_URL}/auth/me")
        if response.status_code == 200:
            data = response.json()
            if data.get('user') is None:
                passed_tests += log_test("GET /auth/me without session returns user:null", True)
            else:
                log_test("GET /auth/me without session", False, f"Expected user:null, got {data}")
        else:
            log_test("GET /auth/me without session", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("GET /auth/me without session", False, str(e))
    
    # Test 2: POST /auth/signup validation - missing email
    print("\n--- Test 2: Signup validation - missing email ---")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/auth/signup", json={
            "name": "Test User",
            "password": "secret123"
        })
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'required' in data['error'].lower():
                passed_tests += log_test("Signup missing email returns 400", True, data['error'])
            else:
                log_test("Signup missing email", False, f"Wrong error message: {data}")
        else:
            log_test("Signup missing email", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Signup missing email", False, str(e))
    
    # Test 3: POST /auth/signup validation - bad email format
    print("\n--- Test 3: Signup validation - bad email format ---")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/auth/signup", json={
            "name": "Test User",
            "email": "notanemail",
            "password": "secret123"
        })
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and 'email' in data['error'].lower():
                passed_tests += log_test("Signup bad email format returns 400", True, data['error'])
            else:
                log_test("Signup bad email format", False, f"Wrong error message: {data}")
        else:
            log_test("Signup bad email format", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Signup bad email format", False, str(e))
    
    # Test 4: POST /auth/signup validation - password too short
    print("\n--- Test 4: Signup validation - password too short ---")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/auth/signup", json={
            "name": "Test User",
            "email": test_email,
            "password": "12345"  # Only 5 chars
        })
        if response.status_code == 400:
            data = response.json()
            if 'error' in data and ('6' in data['error'] or 'password' in data['error'].lower()):
                passed_tests += log_test("Signup short password returns 400", True, data['error'])
            else:
                log_test("Signup short password", False, f"Wrong error message: {data}")
        else:
            log_test("Signup short password", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Signup short password", False, str(e))
    
    # Test 5: Successful signup
    print("\n--- Test 5: Successful signup ---")
    total_tests += 1
    session = requests.Session()  # Use session to maintain cookies
    signup_user_id = None
    try:
        response = session.post(f"{BASE_URL}/auth/signup", json={
            "name": "Test User",
            "email": test_email,
            "phone": test_phone,
            "password": "secret123"
        })
        if response.status_code == 200:
            data = response.json()
            # Check response structure
            if (data.get('ok') == True and 
                'user' in data and 
                data['user'].get('email') == test_email and
                data['user'].get('name') == "Test User" and
                data['user'].get('phone') == test_phone and
                'linked_orders' in data and
                'linked_reservations' in data):
                
                # Verify password_hash is NOT in response
                if 'password_hash' in data['user']:
                    log_test("Successful signup", False, "password_hash leaked in response")
                else:
                    # Verify Set-Cookie header
                    set_cookie = response.headers.get('Set-Cookie', '')
                    if 'aukstaitija_session=' in set_cookie and 'HttpOnly' in set_cookie and 'SameSite=Lax' in set_cookie:
                        signup_user_id = data['user'].get('id')
                        passed_tests += log_test("Successful signup", True, 
                            f"User created with id={signup_user_id}, linked_orders={data['linked_orders']}, linked_reservations={data['linked_reservations']}")
                    else:
                        log_test("Successful signup", False, f"Cookie not set correctly: {set_cookie}")
            else:
                log_test("Successful signup", False, f"Invalid response structure: {data}")
        else:
            log_test("Successful signup", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Successful signup", False, str(e))
    
    # Test 6: Duplicate email
    print("\n--- Test 6: Duplicate email signup ---")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/auth/signup", json={
            "name": "Another User",
            "email": test_email,  # Same email
            "password": "secret123"
        })
        if response.status_code == 409:
            data = response.json()
            if 'error' in data and ('exist' in data['error'].lower() or 'already' in data['error'].lower()):
                passed_tests += log_test("Duplicate email returns 409", True, data['error'])
            else:
                log_test("Duplicate email", False, f"Wrong error message: {data}")
        else:
            log_test("Duplicate email", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Duplicate email", False, str(e))
    
    # Test 7: GET /auth/me WITH session cookie
    print("\n--- Test 7: GET /auth/me with session cookie ---")
    total_tests += 1
    try:
        response = session.get(f"{BASE_URL}/auth/me")
        if response.status_code == 200:
            data = response.json()
            if data.get('user') and data['user'].get('id') == signup_user_id:
                passed_tests += log_test("GET /auth/me with session returns user", True, f"User id={data['user']['id']}")
            else:
                log_test("GET /auth/me with session", False, f"Expected user id={signup_user_id}, got {data}")
        else:
            log_test("GET /auth/me with session", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("GET /auth/me with session", False, str(e))
    
    # Test 8: POST /auth/login with wrong password
    print("\n--- Test 8: Login with wrong password ---")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": test_email,
            "password": "wrongpassword"
        })
        if response.status_code == 401:
            data = response.json()
            if 'error' in data:
                passed_tests += log_test("Login wrong password returns 401", True, data['error'])
            else:
                log_test("Login wrong password", False, f"No error message: {data}")
        else:
            log_test("Login wrong password", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Login wrong password", False, str(e))
    
    # Test 9: POST /auth/login with correct credentials
    print("\n--- Test 9: Login with correct credentials ---")
    total_tests += 1
    login_session = requests.Session()
    try:
        response = login_session.post(f"{BASE_URL}/auth/login", json={
            "email": test_email,
            "password": "secret123"
        })
        if response.status_code == 200:
            data = response.json()
            set_cookie = response.headers.get('Set-Cookie', '')
            if (data.get('ok') == True and 
                'user' in data and 
                'aukstaitija_session=' in set_cookie):
                passed_tests += log_test("Login correct credentials", True, f"User logged in: {data['user']['email']}")
            else:
                log_test("Login correct credentials", False, f"Invalid response or cookie: {data}")
        else:
            log_test("Login correct credentials", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Login correct credentials", False, str(e))
    
    # Test 10: POST /auth/logout
    print("\n--- Test 10: Logout ---")
    total_tests += 1
    try:
        response = login_session.post(f"{BASE_URL}/auth/logout")
        if response.status_code == 200:
            set_cookie = response.headers.get('Set-Cookie', '')
            if 'Max-Age=0' in set_cookie or 'aukstaitija_session=;' in set_cookie:
                # Verify subsequent /auth/me returns null
                me_response = login_session.get(f"{BASE_URL}/auth/me")
                if me_response.status_code == 200:
                    me_data = me_response.json()
                    if me_data.get('user') is None:
                        passed_tests += log_test("Logout clears session", True, "Cookie cleared, /auth/me returns null")
                    else:
                        log_test("Logout", False, f"/auth/me still returns user: {me_data}")
                else:
                    log_test("Logout", False, f"/auth/me status {me_response.status_code}")
            else:
                log_test("Logout", False, f"Cookie not cleared: {set_cookie}")
        else:
            log_test("Logout", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Logout", False, str(e))
    
    # ========================================================================
    # GUEST ORDER LINKING ON SIGNUP
    # ========================================================================
    
    print("\n" + "="*80)
    print("GUEST ORDER LINKING ON SIGNUP")
    print("="*80 + "\n")
    
    # Test 11: Pre-create guest orders
    print("\n--- Test 11: Pre-create guest orders ---")
    total_tests += 1
    claim_email = f"claim+{timestamp}@example.com"
    claim_phone = "+37060000222"
    guest_order_ids = []
    try:
        # Get delivery zone and dish
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        zone_id = zones[0]['id']
        dish = dishes[0]
        
        # Create 2 guest orders
        for i in range(2):
            order_payload = {
                "type": "delivery",
                "delivery_zone_id": zone_id,
                "items": [{
                    "id": dish['id'],
                    "name": dish['name'],
                    "price": dish['price'],
                    "quantity": 1
                }],
                "customer": {
                    "name": "Guest User",
                    "phone": claim_phone,
                    "email": claim_email
                },
                "address": {
                    "address": "Vilniaus g. 10",
                    "city": "Kaunas",
                    "zip": "44280"
                }
            }
            response = requests.post(f"{BASE_URL}/orders", json=order_payload)
            if response.status_code == 200:
                order_data = response.json()
                guest_order_ids.append(order_data['id'])
        
        if len(guest_order_ids) == 2:
            passed_tests += log_test("Pre-create guest orders", True, f"Created 2 guest orders: {guest_order_ids}")
        else:
            log_test("Pre-create guest orders", False, f"Only created {len(guest_order_ids)} orders")
    except Exception as e:
        log_test("Pre-create guest orders", False, str(e))
    
    # Test 12: Pre-create guest reservation
    print("\n--- Test 12: Pre-create guest reservation ---")
    total_tests += 1
    guest_reservation_id = None
    try:
        from datetime import datetime, timedelta
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        reservation_payload = {
            "name": "Guest User",
            "email": claim_email,
            "phone": claim_phone,
            "date": tomorrow,
            "time": "19:00",
            "guests": 4,
            "special_requests": "Window seat please"
        }
        response = requests.post(f"{BASE_URL}/reservations", json=reservation_payload)
        if response.status_code == 200:
            res_data = response.json()
            guest_reservation_id = res_data['id']
            passed_tests += log_test("Pre-create guest reservation", True, f"Created reservation: {guest_reservation_id}")
        else:
            log_test("Pre-create guest reservation", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Pre-create guest reservation", False, str(e))
    
    # Test 13: Signup with matching email/phone and verify linking
    print("\n--- Test 13: Signup with matching email/phone (auto-link) ---")
    total_tests += 1
    claim_session = requests.Session()
    claim_user_id = None
    try:
        response = claim_session.post(f"{BASE_URL}/auth/signup", json={
            "name": "Claiming User",
            "email": claim_email,
            "phone": claim_phone,
            "password": "secret123"
        })
        if response.status_code == 200:
            data = response.json()
            if (data.get('linked_orders', 0) >= 2 and 
                data.get('linked_reservations', 0) >= 1):
                claim_user_id = data['user']['id']
                passed_tests += log_test("Signup auto-links guest orders/reservations", True, 
                    f"linked_orders={data['linked_orders']}, linked_reservations={data['linked_reservations']}")
            else:
                log_test("Signup auto-link", False, 
                    f"Expected linked_orders>=2, linked_reservations>=1, got {data.get('linked_orders')}, {data.get('linked_reservations')}")
        else:
            log_test("Signup auto-link", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Signup auto-link", False, str(e))
    
    # Test 14: GET /users/me/orders includes linked orders
    print("\n--- Test 14: GET /users/me/orders includes linked orders ---")
    total_tests += 1
    try:
        response = claim_session.get(f"{BASE_URL}/users/me/orders")
        if response.status_code == 200:
            orders = response.json()
            linked_count = sum(1 for o in orders if o['id'] in guest_order_ids)
            if linked_count >= 2:
                passed_tests += log_test("GET /users/me/orders includes linked orders", True, 
                    f"Found {linked_count} linked orders")
            else:
                log_test("GET /users/me/orders", False, f"Only found {linked_count} linked orders")
        else:
            log_test("GET /users/me/orders", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("GET /users/me/orders", False, str(e))
    
    # Test 15: GET /users/me/reservations includes linked reservation
    print("\n--- Test 15: GET /users/me/reservations includes linked reservation ---")
    total_tests += 1
    try:
        response = claim_session.get(f"{BASE_URL}/users/me/reservations")
        if response.status_code == 200:
            reservations = response.json()
            has_linked = any(r['id'] == guest_reservation_id for r in reservations)
            if has_linked:
                passed_tests += log_test("GET /users/me/reservations includes linked reservation", True)
            else:
                log_test("GET /users/me/reservations", False, "Linked reservation not found")
        else:
            log_test("GET /users/me/reservations", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("GET /users/me/reservations", False, str(e))
    
    # ========================================================================
    # LOGGED-IN ORDER CREATION
    # ========================================================================
    
    print("\n" + "="*80)
    print("LOGGED-IN ORDER CREATION")
    print("="*80 + "\n")
    
    # Test 16: Create order with active session (logged in)
    print("\n--- Test 16: Create order with active session ---")
    total_tests += 1
    try:
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        
        order_payload = {
            "type": "pickup",
            "items": [{
                "id": dishes[0]['id'],
                "name": dishes[0]['name'],
                "price": dishes[0]['price'],
                "quantity": 1
            }],
            "customer": {
                "name": "Logged In User",
                "phone": claim_phone,
                "email": claim_email
            }
        }
        response = claim_session.post(f"{BASE_URL}/orders", json=order_payload)
        if response.status_code == 200:
            order_data = response.json()
            if order_data.get('user_id') == claim_user_id:
                passed_tests += log_test("Order with session links to user_id", True, 
                    f"user_id={order_data['user_id']}")
            else:
                log_test("Order with session", False, 
                    f"Expected user_id={claim_user_id}, got {order_data.get('user_id')}")
        else:
            log_test("Order with session", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Order with session", False, str(e))
    
    # Test 17: Create order without session (anonymous)
    print("\n--- Test 17: Create order without session (anonymous) ---")
    total_tests += 1
    try:
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        
        order_payload = {
            "type": "pickup",
            "items": [{
                "id": dishes[0]['id'],
                "name": dishes[0]['name'],
                "price": dishes[0]['price'],
                "quantity": 1
            }],
            "customer": {
                "name": "Anonymous User",
                "phone": "+37060099999",
                "email": "anon@example.com"
            }
        }
        response = requests.post(f"{BASE_URL}/orders", json=order_payload)
        if response.status_code == 200:
            order_data = response.json()
            if order_data.get('user_id') is None:
                passed_tests += log_test("Order without session is anonymous", True, "user_id=null")
            else:
                log_test("Order without session", False, f"Expected user_id=null, got {order_data.get('user_id')}")
        else:
            log_test("Order without session", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Order without session", False, str(e))
    
    # ========================================================================
    # AUTO-SAVE ADDRESS ON DELIVERY CHECKOUT
    # ========================================================================
    
    print("\n" + "="*80)
    print("AUTO-SAVE ADDRESS ON DELIVERY CHECKOUT")
    print("="*80 + "\n")
    
    # Test 18: Create delivery order with new address (logged in)
    print("\n--- Test 18: Delivery order auto-saves address ---")
    total_tests += 1
    new_address = {
        "address": f"Gedimino g. {timestamp % 100}",
        "city": "Kaunas",
        "zip": "44280"
    }
    try:
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        zone_id = zones[0]['id']
        
        order_payload = {
            "type": "delivery",
            "delivery_zone_id": zone_id,
            "items": [{
                "id": dishes[0]['id'],
                "name": dishes[0]['name'],
                "price": dishes[0]['price'],
                "quantity": 1
            }],
            "customer": {
                "name": "Claiming User",
                "phone": claim_phone,
                "email": claim_email
            },
            "address": new_address
        }
        response = claim_session.post(f"{BASE_URL}/orders", json=order_payload)
        if response.status_code == 200:
            # Check if address was saved
            addr_response = claim_session.get(f"{BASE_URL}/users/me/addresses")
            if addr_response.status_code == 200:
                addresses = addr_response.json()
                has_address = any(
                    a['address'] == new_address['address'] and 
                    a['city'] == new_address['city'] and
                    a['zip'] == new_address['zip']
                    for a in addresses
                )
                if has_address:
                    passed_tests += log_test("Delivery order auto-saves address", True, 
                        f"Address saved: {new_address['address']}")
                else:
                    log_test("Delivery order auto-saves address", False, "Address not found in saved addresses")
            else:
                log_test("Delivery order auto-saves address", False, f"Failed to get addresses: {addr_response.status_code}")
        else:
            log_test("Delivery order auto-saves address", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Delivery order auto-saves address", False, str(e))
    
    # Test 19: Create another delivery order with same address (de-dup)
    print("\n--- Test 19: Same address de-duplication ---")
    total_tests += 1
    try:
        # Get address count before
        addr_response_before = claim_session.get(f"{BASE_URL}/users/me/addresses")
        addresses_before = addr_response_before.json()
        count_before = len(addresses_before)
        
        # Find the address we just saved
        saved_addr = next((a for a in addresses_before 
                          if a['address'] == new_address['address']), None)
        last_used_before = saved_addr['last_used_at'] if saved_addr else None
        
        # Wait a moment to ensure timestamp difference
        time.sleep(1)
        
        # Create another order with same address
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        zone_id = zones[0]['id']
        
        order_payload = {
            "type": "delivery",
            "delivery_zone_id": zone_id,
            "items": [{
                "id": dishes[0]['id'],
                "name": dishes[0]['name'],
                "price": dishes[0]['price'],
                "quantity": 1
            }],
            "customer": {
                "name": "Claiming User",
                "phone": claim_phone,
                "email": claim_email
            },
            "address": new_address
        }
        response = claim_session.post(f"{BASE_URL}/orders", json=order_payload)
        
        if response.status_code == 200:
            # Check address count after
            addr_response_after = claim_session.get(f"{BASE_URL}/users/me/addresses")
            addresses_after = addr_response_after.json()
            count_after = len(addresses_after)
            
            # Find the address again
            saved_addr_after = next((a for a in addresses_after 
                                    if a['address'] == new_address['address']), None)
            last_used_after = saved_addr_after['last_used_at'] if saved_addr_after else None
            
            if count_after == count_before and last_used_after > last_used_before:
                passed_tests += log_test("Same address de-duplication", True, 
                    f"Count unchanged ({count_after}), last_used_at updated")
            else:
                log_test("Same address de-duplication", False, 
                    f"Count: {count_before} -> {count_after}, last_used: {last_used_before} -> {last_used_after}")
        else:
            log_test("Same address de-duplication", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Same address de-duplication", False, str(e))
    
    # ========================================================================
    # USER DATA ENDPOINTS (AUTH REQUIRED)
    # ========================================================================
    
    print("\n" + "="*80)
    print("USER DATA ENDPOINTS (AUTH REQUIRED)")
    print("="*80 + "\n")
    
    # Test 20-23: Verify endpoints require auth
    endpoints = [
        ("/users/me/orders", "GET"),
        ("/users/me/reservations", "GET"),
        ("/users/me/favorites", "GET"),
        ("/users/me/addresses", "GET")
    ]
    
    for endpoint, method in endpoints:
        print(f"\n--- Test: {method} {endpoint} without session ---")
        total_tests += 1
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}")
            else:
                response = requests.post(f"{BASE_URL}{endpoint}", json={})
            
            if response.status_code == 401:
                passed_tests += log_test(f"{method} {endpoint} requires auth", True, "Returns 401")
            else:
                log_test(f"{method} {endpoint} requires auth", False, f"Status {response.status_code}")
        except Exception as e:
            log_test(f"{method} {endpoint} requires auth", False, str(e))
    
    # Test 24: Favorites toggle
    print("\n--- Test 24: Favorites toggle ---")
    total_tests += 1
    try:
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        dish_id = dishes[0]['id']
        
        # Add to favorites
        response1 = claim_session.post(f"{BASE_URL}/users/me/favorites", json={"dish_id": dish_id})
        if response1.status_code == 200:
            data1 = response1.json()
            if data1.get('ok') and data1.get('favorited') == True:
                # Toggle off
                response2 = claim_session.post(f"{BASE_URL}/users/me/favorites", json={"dish_id": dish_id})
                if response2.status_code == 200:
                    data2 = response2.json()
                    if data2.get('ok') and data2.get('favorited') == False:
                        # Toggle back on
                        response3 = claim_session.post(f"{BASE_URL}/users/me/favorites", json={"dish_id": dish_id})
                        if response3.status_code == 200:
                            data3 = response3.json()
                            if data3.get('favorited') == True:
                                # Verify GET returns the dish
                                fav_response = claim_session.get(f"{BASE_URL}/users/me/favorites")
                                if fav_response.status_code == 200:
                                    favorites = fav_response.json()
                                    has_dish = any(f['id'] == dish_id for f in favorites)
                                    if has_dish:
                                        passed_tests += log_test("Favorites toggle", True, 
                                            "Toggle on/off/on works, GET returns dish object")
                                    else:
                                        log_test("Favorites toggle", False, "Dish not in favorites list")
                                else:
                                    log_test("Favorites toggle", False, f"GET favorites failed: {fav_response.status_code}")
                            else:
                                log_test("Favorites toggle", False, "Third toggle didn't set favorited=true")
                        else:
                            log_test("Favorites toggle", False, f"Third toggle failed: {response3.status_code}")
                    else:
                        log_test("Favorites toggle", False, "Second toggle didn't set favorited=false")
                else:
                    log_test("Favorites toggle", False, f"Second toggle failed: {response2.status_code}")
            else:
                log_test("Favorites toggle", False, "First toggle didn't set favorited=true")
        else:
            log_test("Favorites toggle", False, f"First toggle failed: {response1.status_code}")
    except Exception as e:
        log_test("Favorites toggle", False, str(e))
    
    # Test 25: Address CRUD
    print("\n--- Test 25: Address CRUD ---")
    total_tests += 1
    try:
        # POST new address
        new_addr = {
            "address": "Vilniaus g. 1",
            "city": "Kaunas",
            "zip": "44280",
            "label": "Office"
        }
        post_response = claim_session.post(f"{BASE_URL}/users/me/addresses", json=new_addr)
        if post_response.status_code == 200:
            addresses = post_response.json()
            added_addr = next((a for a in addresses if a['label'] == 'Office'), None)
            if added_addr:
                addr_id = added_addr['id']
                # DELETE address
                delete_response = claim_session.delete(f"{BASE_URL}/users/me/addresses/{addr_id}")
                if delete_response.status_code == 200:
                    addresses_after = delete_response.json()
                    still_exists = any(a['id'] == addr_id for a in addresses_after)
                    if not still_exists:
                        passed_tests += log_test("Address CRUD", True, "POST adds, DELETE removes")
                    else:
                        log_test("Address CRUD", False, "Address still exists after DELETE")
                else:
                    log_test("Address CRUD", False, f"DELETE failed: {delete_response.status_code}")
            else:
                log_test("Address CRUD", False, "Address not found after POST")
        else:
            log_test("Address CRUD", False, f"POST failed: {post_response.status_code}")
    except Exception as e:
        log_test("Address CRUD", False, str(e))
    
    # Test 26: PUT /users/me (update profile)
    print("\n--- Test 26: Update profile ---")
    total_tests += 1
    try:
        update_payload = {
            "name": "Updated Name",
            "phone": "+37060099999"
        }
        response = claim_session.put(f"{BASE_URL}/users/me", json=update_payload)
        if response.status_code == 200:
            user_data = response.json()
            if user_data.get('name') == "Updated Name" and user_data.get('phone') == "+37060099999":
                # Verify GET /auth/me reflects change
                me_response = claim_session.get(f"{BASE_URL}/auth/me")
                if me_response.status_code == 200:
                    me_data = me_response.json()
                    if me_data['user']['name'] == "Updated Name":
                        passed_tests += log_test("Update profile", True, "PUT updates, GET /auth/me reflects change")
                    else:
                        log_test("Update profile", False, "GET /auth/me doesn't reflect change")
                else:
                    log_test("Update profile", False, f"GET /auth/me failed: {me_response.status_code}")
            else:
                log_test("Update profile", False, f"Fields not updated: {user_data}")
        else:
            log_test("Update profile", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Update profile", False, str(e))
    
    # ========================================================================
    # REGRESSIONS
    # ========================================================================
    
    print("\n" + "="*80)
    print("REGRESSION CHECKS")
    print("="*80 + "\n")
    
    # Test 27: Admin login still works
    print("\n--- Test 27: Admin login regression ---")
    total_tests += 1
    try:
        response = requests.post(f"{BASE_URL}/admin/login", json={"password": ADMIN_TOKEN})
        if response.status_code == 200:
            data = response.json()
            if data.get('token') == ADMIN_TOKEN:
                passed_tests += log_test("Admin login still works", True)
            else:
                log_test("Admin login", False, f"Wrong token: {data}")
        else:
            log_test("Admin login", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Admin login", False, str(e))
    
    # Test 28: Order lookup by UUID and order_number
    print("\n--- Test 28: Order lookup regression ---")
    total_tests += 1
    try:
        # Create an order
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        
        order_payload = {
            "type": "pickup",
            "items": [{
                "id": dishes[0]['id'],
                "name": dishes[0]['name'],
                "price": dishes[0]['price'],
                "quantity": 1
            }],
            "customer": {
                "name": "Test User",
                "phone": "+37060000000",
                "email": "test@example.com"
            }
        }
        create_response = requests.post(f"{BASE_URL}/orders", json=order_payload)
        if create_response.status_code == 200:
            order_data = create_response.json()
            order_id = order_data['id']
            order_number = order_data['order_number']
            
            # Lookup by UUID
            uuid_response = requests.get(f"{BASE_URL}/orders/{order_id}")
            # Lookup by order_number
            num_response = requests.get(f"{BASE_URL}/orders/{order_number}")
            
            if uuid_response.status_code == 200 and num_response.status_code == 200:
                passed_tests += log_test("Order lookup by UUID and order_number", True)
            else:
                log_test("Order lookup", False, 
                    f"UUID: {uuid_response.status_code}, Number: {num_response.status_code}")
        else:
            log_test("Order lookup", False, f"Failed to create order: {create_response.status_code}")
    except Exception as e:
        log_test("Order lookup", False, str(e))
    
    # Test 29: Delivery order includes prep_time_total and delivery_status
    print("\n--- Test 29: Delivery order fields regression ---")
    total_tests += 1
    try:
        zones = requests.get(f"{BASE_URL}/delivery-zones").json()
        dishes = requests.get(f"{BASE_URL}/dishes").json()
        zone_id = zones[0]['id']
        
        order_payload = {
            "type": "delivery",
            "delivery_zone_id": zone_id,
            "items": [{
                "id": dishes[0]['id'],
                "name": dishes[0]['name'],
                "price": dishes[0]['price'],
                "quantity": 1
            }],
            "customer": {
                "name": "Test User",
                "phone": "+37060000000",
                "email": "test@example.com"
            },
            "address": {
                "address": "Test St. 1",
                "city": "Kaunas",
                "zip": "44280"
            }
        }
        response = requests.post(f"{BASE_URL}/orders", json=order_payload)
        if response.status_code == 200:
            order_data = response.json()
            if (order_data.get('prep_time_total') is not None and 
                order_data.get('delivery_status') == 'pending'):
                passed_tests += log_test("Delivery order includes prep_time_total and delivery_status", True,
                    f"prep_time_total={order_data['prep_time_total']}, delivery_status={order_data['delivery_status']}")
            else:
                log_test("Delivery order fields", False, 
                    f"prep_time_total={order_data.get('prep_time_total')}, delivery_status={order_data.get('delivery_status')}")
        else:
            log_test("Delivery order fields", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Delivery order fields", False, str(e))
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
    print("="*80 + "\n")
    
    return passed_tests == total_tests

if __name__ == "__main__":
    try:
        success = test_customer_authentication()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
