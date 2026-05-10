#!/usr/bin/env python3
"""
Backend test suite for automatic waiter notification flow.
Tests all scenarios from the review request.
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://dine-in-plus.preview.emergentagent.com/api"
ADMIN_TOKEN = "admin123"
ADMIN_HEADERS = {"x-admin-token": ADMIN_TOKEN, "Content-Type": "application/json"}
HEADERS = {"Content-Type": "application/json"}

# Test counters
tests_passed = 0
tests_failed = 0
test_results = []

def log_test(name, passed, message=""):
    global tests_passed, tests_failed
    if passed:
        tests_passed += 1
        status = "✅ PASS"
    else:
        tests_failed += 1
        status = "❌ FAIL"
    result = f"{status} - {name}"
    if message:
        result += f": {message}"
    print(result)
    test_results.append({"name": name, "passed": passed, "message": message})

def get_free_table():
    """Get a free table (available or cleaning status)"""
    try:
        resp = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS, timeout=10)
        if resp.status_code == 200:
            tables = resp.json()
            for t in tables:
                if t.get('status') in ['available', 'cleaning']:
                    # If cleaning, mark as cleaned first
                    if t.get('status') == 'cleaning':
                        requests.post(f"{BASE_URL}/tables/{t['id']}/cleaned", headers=ADMIN_HEADERS, timeout=10)
                    return t['id']
        return 't1'  # fallback
    except Exception as e:
        print(f"Error getting free table: {e}")
        return 't1'

def close_and_clean_table(table_id):
    """Close and clean a table"""
    try:
        requests.post(f"{BASE_URL}/tables/{table_id}/close", headers=ADMIN_HEADERS, timeout=10)
        requests.post(f"{BASE_URL}/tables/{table_id}/cleaned", headers=ADMIN_HEADERS, timeout=10)
    except Exception as e:
        print(f"Error closing/cleaning table: {e}")

def get_dish():
    """Get a dish for testing"""
    try:
        resp = requests.get(f"{BASE_URL}/dishes", timeout=10)
        if resp.status_code == 200:
            dishes = resp.json()
            if dishes:
                return dishes[0]
        return None
    except Exception as e:
        print(f"Error getting dish: {e}")
        return None

def get_delivery_zone():
    """Get a delivery zone for testing"""
    try:
        resp = requests.get(f"{BASE_URL}/delivery-zones", timeout=10)
        if resp.status_code == 200:
            zones = resp.json()
            if zones:
                return zones[0]
        return None
    except Exception as e:
        print(f"Error getting delivery zone: {e}")
        return None

print("=" * 80)
print("WAITER NOTIFICATION FLOW - BACKEND TESTS")
print("=" * 80)
print()

# ============================================================================
# SCENARIO A: AUTH CHECKS
# ============================================================================
print("SCENARIO A: AUTH CHECKS")
print("-" * 80)

try:
    # A1: GET /api/waiter/notifications without admin header → 401
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=HEADERS, timeout=10)
    log_test("A1: GET /waiter/notifications without admin token", 
             resp.status_code == 401, 
             f"Expected 401, got {resp.status_code}")
except Exception as e:
    log_test("A1: GET /waiter/notifications without admin token", False, str(e))

try:
    # A2: POST /api/waiter/notifications/<bogus>/pickup without header → 401
    resp = requests.post(f"{BASE_URL}/waiter/notifications/bogus-id/pickup", headers=HEADERS, timeout=10)
    log_test("A2: POST /waiter/notifications/:id/pickup without admin token", 
             resp.status_code == 401, 
             f"Expected 401, got {resp.status_code}")
except Exception as e:
    log_test("A2: POST /waiter/notifications/:id/pickup without admin token", False, str(e))

try:
    # A3: POST /api/waiter/notifications/<bogus>/served without header → 401
    resp = requests.post(f"{BASE_URL}/waiter/notifications/bogus-id/served", headers=HEADERS, timeout=10)
    log_test("A3: POST /waiter/notifications/:id/served without admin token", 
             resp.status_code == 401, 
             f"Expected 401, got {resp.status_code}")
except Exception as e:
    log_test("A3: POST /waiter/notifications/:id/served without admin token", False, str(e))

print()

# ============================================================================
# SCENARIO B: AUTO-CREATE ON READY (happy path)
# ============================================================================
print("SCENARIO B: AUTO-CREATE ON READY (happy path)")
print("-" * 80)

b_order_id = None
b_order_number = None
b_table_id = None

try:
    # B1: Get a free table
    b_table_id = get_free_table()
    log_test("B1: Got free table", True, f"Table ID: {b_table_id}")
except Exception as e:
    log_test("B1: Got free table", False, str(e))

try:
    # B2: Create dine-in order with table_id
    dish = get_dish()
    if not dish:
        raise Exception("No dishes available")
    
    order_body = {
        "items": [
            {"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 2},
            {"id": dish['id'], "name": "Beer", "price": 5, "quantity": 1}
        ],
        "type": "dine-in",
        "table_id": b_table_id,
        "customer": {"name": "Auto Diner"},
        "payment_method": "pay_at_table"
    }
    
    resp = requests.post(f"{BASE_URL}/orders", headers=HEADERS, json=order_body, timeout=10)
    if resp.status_code == 200:
        order = resp.json()
        b_order_id = order['id']
        b_order_number = order['order_number']
        log_test("B2: Created dine-in order", True, f"Order: {b_order_number}")
    else:
        log_test("B2: Created dine-in order", False, f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_test("B2: Created dine-in order", False, str(e))

try:
    # B3: PUT status='preparing'
    resp = requests.put(f"{BASE_URL}/orders/{b_order_id}", 
                       headers=ADMIN_HEADERS, 
                       json={"status": "preparing"}, 
                       timeout=10)
    log_test("B3: Updated order to 'preparing'", 
             resp.status_code == 200, 
             f"Status {resp.status_code}")
except Exception as e:
    log_test("B3: Updated order to 'preparing'", False, str(e))

try:
    # B4: PUT status='ready'
    resp = requests.put(f"{BASE_URL}/orders/{b_order_id}", 
                       headers=ADMIN_HEADERS, 
                       json={"status": "ready"}, 
                       timeout=10)
    log_test("B4: Updated order to 'ready'", 
             resp.status_code == 200, 
             f"Status {resp.status_code}")
except Exception as e:
    log_test("B4: Updated order to 'ready'", False, str(e))

try:
    # B5: GET /api/waiter/notifications - verify notification was created
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('order_id') == b_order_id]
        
        if len(matching) == 1:
            notif = matching[0]
            checks = []
            
            # Check status
            if notif.get('status') == 'pending':
                checks.append("status='pending' ✓")
            else:
                checks.append(f"status='{notif.get('status')}' ✗")
            
            # Check table_name
            if notif.get('table_name') and 'Table' in notif.get('table_name'):
                checks.append(f"table_name='{notif.get('table_name')}' ✓")
            else:
                checks.append(f"table_name='{notif.get('table_name')}' ✗")
            
            # Check order_number
            if notif.get('order_number') == b_order_number:
                checks.append(f"order_number matches ✓")
            else:
                checks.append(f"order_number mismatch ✗")
            
            # Check items_summary
            items_summary = notif.get('items_summary', '')
            if '2×' in items_summary and '1×' in items_summary:
                checks.append(f"items_summary contains quantities ✓")
            else:
                checks.append(f"items_summary='{items_summary}' ✗")
            
            # Check customer_name
            if notif.get('customer_name') == 'Auto Diner':
                checks.append("customer_name='Auto Diner' ✓")
            else:
                checks.append(f"customer_name='{notif.get('customer_name')}' ✗")
            
            # Check timestamps
            if notif.get('picked_up_at') is None and notif.get('served_at') is None:
                checks.append("timestamps null ✓")
            else:
                checks.append("timestamps not null ✗")
            
            # Check priority
            if isinstance(notif.get('priority'), bool):
                checks.append("priority is boolean ✓")
            else:
                checks.append("priority not boolean ✗")
            
            all_passed = all('✓' in c for c in checks)
            log_test("B5: Notification created with correct fields", 
                    all_passed, 
                    "; ".join(checks))
        else:
            log_test("B5: Notification created with correct fields", 
                    False, 
                    f"Expected 1 notification, found {len(matching)}")
    else:
        log_test("B5: Notification created with correct fields", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("B5: Notification created with correct fields", False, str(e))

print()

# ============================================================================
# SCENARIO C: NOT CREATED FOR NON-DINE-IN
# ============================================================================
print("SCENARIO C: NOT CREATED FOR NON-DINE-IN")
print("-" * 80)

c_delivery_order_id = None
c_pickup_order_id = None

try:
    # C1: Create delivery order
    dish = get_dish()
    zone = get_delivery_zone()
    
    if dish and zone:
        delivery_body = {
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "type": "delivery",
            "delivery_zone_id": zone['id'],
            "customer": {"name": "Delivery Customer", "phone": "1234567890"},
            "address": {"address": "Test St 1", "city": "Kaunas", "zip": "44280"},
            "payment_method": "cash"
        }
        
        resp = requests.post(f"{BASE_URL}/orders", headers=HEADERS, json=delivery_body, timeout=10)
        if resp.status_code == 200:
            order = resp.json()
            c_delivery_order_id = order['id']
            
            # Move to ready
            requests.put(f"{BASE_URL}/orders/{c_delivery_order_id}", 
                        headers=ADMIN_HEADERS, 
                        json={"status": "preparing"}, 
                        timeout=10)
            requests.put(f"{BASE_URL}/orders/{c_delivery_order_id}", 
                        headers=ADMIN_HEADERS, 
                        json={"status": "ready"}, 
                        timeout=10)
            
            log_test("C1: Created delivery order and moved to ready", True, f"Order: {order['order_number']}")
        else:
            log_test("C1: Created delivery order and moved to ready", False, f"Status {resp.status_code}")
    else:
        log_test("C1: Created delivery order and moved to ready", False, "No dish or zone available")
except Exception as e:
    log_test("C1: Created delivery order and moved to ready", False, str(e))

try:
    # C2: Create pickup order
    dish = get_dish()
    
    if dish:
        pickup_body = {
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "type": "pickup",
            "customer": {"name": "Pickup Customer", "phone": "9876543210"},
            "payment_method": "cash"
        }
        
        resp = requests.post(f"{BASE_URL}/orders", headers=HEADERS, json=pickup_body, timeout=10)
        if resp.status_code == 200:
            order = resp.json()
            c_pickup_order_id = order['id']
            
            # Move to ready
            requests.put(f"{BASE_URL}/orders/{c_pickup_order_id}", 
                        headers=ADMIN_HEADERS, 
                        json={"status": "preparing"}, 
                        timeout=10)
            requests.put(f"{BASE_URL}/orders/{c_pickup_order_id}", 
                        headers=ADMIN_HEADERS, 
                        json={"status": "ready"}, 
                        timeout=10)
            
            log_test("C2: Created pickup order and moved to ready", True, f"Order: {order['order_number']}")
        else:
            log_test("C2: Created pickup order and moved to ready", False, f"Status {resp.status_code}")
    else:
        log_test("C2: Created pickup order and moved to ready", False, "No dish available")
except Exception as e:
    log_test("C2: Created pickup order and moved to ready", False, str(e))

try:
    # C3: Verify notifications do NOT include delivery or pickup orders
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        delivery_notifs = [n for n in notifications if n.get('order_id') == c_delivery_order_id]
        pickup_notifs = [n for n in notifications if n.get('order_id') == c_pickup_order_id]
        
        if len(delivery_notifs) == 0 and len(pickup_notifs) == 0:
            log_test("C3: Notifications do NOT include delivery/pickup orders", 
                    True, 
                    "Correctly excluded non-dine-in orders")
        else:
            log_test("C3: Notifications do NOT include delivery/pickup orders", 
                    False, 
                    f"Found {len(delivery_notifs)} delivery + {len(pickup_notifs)} pickup notifications")
    else:
        log_test("C3: Notifications do NOT include delivery/pickup orders", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("C3: Notifications do NOT include delivery/pickup orders", False, str(e))

print()

# ============================================================================
# SCENARIO D: IDEMPOTENCY / NO DUPLICATES
# ============================================================================
print("SCENARIO D: IDEMPOTENCY / NO DUPLICATES")
print("-" * 80)

try:
    # D1: Toggle order status multiple times
    if b_order_id:
        # Set to preparing
        requests.put(f"{BASE_URL}/orders/{b_order_id}", 
                    headers=ADMIN_HEADERS, 
                    json={"status": "preparing"}, 
                    timeout=10)
        
        # Set to ready again
        requests.put(f"{BASE_URL}/orders/{b_order_id}", 
                    headers=ADMIN_HEADERS, 
                    json={"status": "ready"}, 
                    timeout=10)
        
        # Set to preparing again
        requests.put(f"{BASE_URL}/orders/{b_order_id}", 
                    headers=ADMIN_HEADERS, 
                    json={"status": "preparing"}, 
                    timeout=10)
        
        # Set to ready again
        requests.put(f"{BASE_URL}/orders/{b_order_id}", 
                    headers=ADMIN_HEADERS, 
                    json={"status": "ready"}, 
                    timeout=10)
        
        log_test("D1: Toggled order status multiple times", True, "preparing → ready → preparing → ready")
    else:
        log_test("D1: Toggled order status multiple times", False, "No order ID from scenario B")
except Exception as e:
    log_test("D1: Toggled order status multiple times", False, str(e))

try:
    # D2: Verify still exactly ONE notification for this order
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('order_id') == b_order_id]
        
        if len(matching) == 1:
            log_test("D2: Still exactly ONE notification (idempotent)", 
                    True, 
                    "No duplicates created")
        else:
            log_test("D2: Still exactly ONE notification (idempotent)", 
                    False, 
                    f"Expected 1 notification, found {len(matching)}")
    else:
        log_test("D2: Still exactly ONE notification (idempotent)", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("D2: Still exactly ONE notification (idempotent)", False, str(e))

print()

# ============================================================================
# SCENARIO E: PICKUP ENDPOINT
# ============================================================================
print("SCENARIO E: PICKUP ENDPOINT")
print("-" * 80)

e_notif_id = None

try:
    # E1: Get the notification ID from scenario B
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('order_id') == b_order_id]
        if matching:
            e_notif_id = matching[0]['id']
            log_test("E1: Got notification ID", True, f"Notification ID: {e_notif_id}")
        else:
            log_test("E1: Got notification ID", False, "No matching notification found")
    else:
        log_test("E1: Got notification ID", False, f"Status {resp.status_code}")
except Exception as e:
    log_test("E1: Got notification ID", False, str(e))

try:
    # E2: POST /api/waiter/notifications/:id/pickup
    if e_notif_id:
        resp = requests.post(f"{BASE_URL}/waiter/notifications/{e_notif_id}/pickup", 
                           headers=ADMIN_HEADERS, 
                           timeout=10)
        if resp.status_code == 200:
            notif = resp.json()
            checks = []
            
            if notif.get('status') == 'picked_up':
                checks.append("status='picked_up' ✓")
            else:
                checks.append(f"status='{notif.get('status')}' ✗")
            
            if notif.get('picked_up_at') is not None:
                checks.append("picked_up_at set ✓")
            else:
                checks.append("picked_up_at null ✗")
            
            all_passed = all('✓' in c for c in checks)
            log_test("E2: POST /waiter/notifications/:id/pickup", 
                    all_passed, 
                    "; ".join(checks))
        else:
            log_test("E2: POST /waiter/notifications/:id/pickup", 
                    False, 
                    f"Status {resp.status_code}")
    else:
        log_test("E2: POST /waiter/notifications/:id/pickup", False, "No notification ID")
except Exception as e:
    log_test("E2: POST /waiter/notifications/:id/pickup", False, str(e))

try:
    # E3: Verify order was updated
    if b_order_id:
        resp = requests.get(f"{BASE_URL}/orders/{b_order_id}", timeout=10)
        if resp.status_code == 200:
            order = resp.json()
            checks = []
            
            if order.get('serve_status') == 'picked_up_by_waiter':
                checks.append("serve_status='picked_up_by_waiter' ✓")
            else:
                checks.append(f"serve_status='{order.get('serve_status')}' ✗")
            
            if order.get('waiter_picked_up_at') is not None:
                checks.append("waiter_picked_up_at set ✓")
            else:
                checks.append("waiter_picked_up_at null ✗")
            
            if order.get('status') == 'ready':
                checks.append("status STILL 'ready' ✓")
            else:
                checks.append(f"status='{order.get('status')}' ✗")
            
            all_passed = all('✓' in c for c in checks)
            log_test("E3: Order updated correctly", 
                    all_passed, 
                    "; ".join(checks))
        else:
            log_test("E3: Order updated correctly", False, f"Status {resp.status_code}")
    else:
        log_test("E3: Order updated correctly", False, "No order ID")
except Exception as e:
    log_test("E3: Order updated correctly", False, str(e))

try:
    # E4: Verify notification still in active feed (picked_up is active)
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('id') == e_notif_id]
        
        if len(matching) == 1 and matching[0].get('status') == 'picked_up':
            log_test("E4: Notification still in active feed (picked_up)", 
                    True, 
                    "Correctly included in active feed")
        else:
            log_test("E4: Notification still in active feed (picked_up)", 
                    False, 
                    f"Expected 1 picked_up notification, found {len(matching)}")
    else:
        log_test("E4: Notification still in active feed (picked_up)", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("E4: Notification still in active feed (picked_up)", False, str(e))

print()

# ============================================================================
# SCENARIO F: SERVED ENDPOINT
# ============================================================================
print("SCENARIO F: SERVED ENDPOINT")
print("-" * 80)

try:
    # F1: POST /api/waiter/notifications/:id/served
    if e_notif_id:
        resp = requests.post(f"{BASE_URL}/waiter/notifications/{e_notif_id}/served", 
                           headers=ADMIN_HEADERS, 
                           timeout=10)
        if resp.status_code == 200:
            notif = resp.json()
            checks = []
            
            if notif.get('status') == 'served':
                checks.append("status='served' ✓")
            else:
                checks.append(f"status='{notif.get('status')}' ✗")
            
            if notif.get('served_at') is not None:
                checks.append("served_at set ✓")
            else:
                checks.append("served_at null ✗")
            
            all_passed = all('✓' in c for c in checks)
            log_test("F1: POST /waiter/notifications/:id/served", 
                    all_passed, 
                    "; ".join(checks))
        else:
            log_test("F1: POST /waiter/notifications/:id/served", 
                    False, 
                    f"Status {resp.status_code}")
    else:
        log_test("F1: POST /waiter/notifications/:id/served", False, "No notification ID")
except Exception as e:
    log_test("F1: POST /waiter/notifications/:id/served", False, str(e))

try:
    # F2: Verify order was finalized
    if b_order_id:
        resp = requests.get(f"{BASE_URL}/orders/{b_order_id}", timeout=10)
        if resp.status_code == 200:
            order = resp.json()
            checks = []
            
            if order.get('status') == 'delivered':
                checks.append("status='delivered' ✓")
            else:
                checks.append(f"status='{order.get('status')}' ✗")
            
            if order.get('serve_status') == 'served':
                checks.append("serve_status='served' ✓")
            else:
                checks.append(f"serve_status='{order.get('serve_status')}' ✗")
            
            if order.get('served_at') is not None:
                checks.append("served_at set ✓")
            else:
                checks.append("served_at null ✗")
            
            if order.get('delivered_at') is not None:
                checks.append("delivered_at set ✓")
            else:
                checks.append("delivered_at null ✗")
            
            all_passed = all('✓' in c for c in checks)
            log_test("F2: Order finalized correctly", 
                    all_passed, 
                    "; ".join(checks))
        else:
            log_test("F2: Order finalized correctly", False, f"Status {resp.status_code}")
    else:
        log_test("F2: Order finalized correctly", False, "No order ID")
except Exception as e:
    log_test("F2: Order finalized correctly", False, str(e))

try:
    # F3: Verify notification NOT in active feed anymore
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('id') == e_notif_id]
        
        if len(matching) == 0:
            log_test("F3: Notification NOT in active feed (served)", 
                    True, 
                    "Correctly excluded from active feed")
        else:
            log_test("F3: Notification NOT in active feed (served)", 
                    False, 
                    f"Expected 0 notifications, found {len(matching)}")
    else:
        log_test("F3: Notification NOT in active feed (served)", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("F3: Notification NOT in active feed (served)", False, str(e))

print()

# ============================================================================
# SCENARIO G: LEGACY ENDPOINTS SYNC
# ============================================================================
print("SCENARIO G: LEGACY ENDPOINTS SYNC")
print("-" * 80)

g_order_id = None
g_order_number = None
g_table_id = None
g_notif_id = None

try:
    # G1: Create another dine-in order
    g_table_id = get_free_table()
    dish = get_dish()
    
    if dish:
        order_body = {
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "type": "dine-in",
            "table_id": g_table_id,
            "customer": {"name": "Legacy Test"},
            "payment_method": "pay_at_table"
        }
        
        resp = requests.post(f"{BASE_URL}/orders", headers=HEADERS, json=order_body, timeout=10)
        if resp.status_code == 200:
            order = resp.json()
            g_order_id = order['id']
            g_order_number = order['order_number']
            
            # Move to ready
            requests.put(f"{BASE_URL}/orders/{g_order_id}", 
                        headers=ADMIN_HEADERS, 
                        json={"status": "preparing"}, 
                        timeout=10)
            requests.put(f"{BASE_URL}/orders/{g_order_id}", 
                        headers=ADMIN_HEADERS, 
                        json={"status": "ready"}, 
                        timeout=10)
            
            log_test("G1: Created another dine-in order and moved to ready", 
                    True, 
                    f"Order: {g_order_number}")
        else:
            log_test("G1: Created another dine-in order and moved to ready", 
                    False, 
                    f"Status {resp.status_code}")
    else:
        log_test("G1: Created another dine-in order and moved to ready", False, "No dish available")
except Exception as e:
    log_test("G1: Created another dine-in order and moved to ready", False, str(e))

try:
    # G2: Verify notification was created
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('order_id') == g_order_id]
        
        if len(matching) == 1 and matching[0].get('status') == 'pending':
            g_notif_id = matching[0]['id']
            log_test("G2: Notification created (pending)", 
                    True, 
                    f"Notification ID: {g_notif_id}")
        else:
            log_test("G2: Notification created (pending)", 
                    False, 
                    f"Expected 1 pending notification, found {len(matching)}")
    else:
        log_test("G2: Notification created (pending)", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("G2: Notification created (pending)", False, str(e))

try:
    # G3: POST /api/orders/:id/waiter-pickup (legacy)
    if g_order_id:
        resp = requests.post(f"{BASE_URL}/orders/{g_order_id}/waiter-pickup", 
                           headers=ADMIN_HEADERS, 
                           timeout=10)
        if resp.status_code == 200:
            log_test("G3: POST /orders/:id/waiter-pickup (legacy)", 
                    True, 
                    "Legacy endpoint works")
        else:
            log_test("G3: POST /orders/:id/waiter-pickup (legacy)", 
                    False, 
                    f"Status {resp.status_code}")
    else:
        log_test("G3: POST /orders/:id/waiter-pickup (legacy)", False, "No order ID")
except Exception as e:
    log_test("G3: POST /orders/:id/waiter-pickup (legacy)", False, str(e))

try:
    # G4: Verify notification became 'picked_up'
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('id') == g_notif_id]
        
        if len(matching) == 1 and matching[0].get('status') == 'picked_up':
            log_test("G4: Notification synced to 'picked_up'", 
                    True, 
                    "Legacy endpoint synced notification")
        else:
            status = matching[0].get('status') if matching else 'not found'
            log_test("G4: Notification synced to 'picked_up'", 
                    False, 
                    f"Expected 'picked_up', got '{status}'")
    else:
        log_test("G4: Notification synced to 'picked_up'", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("G4: Notification synced to 'picked_up'", False, str(e))

try:
    # G5: POST /api/orders/:id/served (legacy)
    if g_order_id:
        resp = requests.post(f"{BASE_URL}/orders/{g_order_id}/served", 
                           headers=ADMIN_HEADERS, 
                           timeout=10)
        if resp.status_code == 200:
            log_test("G5: POST /orders/:id/served (legacy)", 
                    True, 
                    "Legacy endpoint works")
        else:
            log_test("G5: POST /orders/:id/served (legacy)", 
                    False, 
                    f"Status {resp.status_code}")
    else:
        log_test("G5: POST /orders/:id/served (legacy)", False, "No order ID")
except Exception as e:
    log_test("G5: POST /orders/:id/served (legacy)", False, str(e))

try:
    # G6: Verify notification became 'served' and disappeared from active feed
    resp = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        notifications = resp.json()
        matching = [n for n in notifications if n.get('id') == g_notif_id]
        
        if len(matching) == 0:
            log_test("G6: Notification synced to 'served' and removed from feed", 
                    True, 
                    "Legacy endpoint synced notification")
        else:
            log_test("G6: Notification synced to 'served' and removed from feed", 
                    False, 
                    f"Expected 0 notifications, found {len(matching)}")
    else:
        log_test("G6: Notification synced to 'served' and removed from feed", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("G6: Notification synced to 'served' and removed from feed", False, str(e))

print()

# ============================================================================
# SCENARIO H: REGRESSIONS
# ============================================================================
print("SCENARIO H: REGRESSIONS")
print("-" * 80)

try:
    # H1: GET /api/waiter/orders still works
    resp = requests.get(f"{BASE_URL}/waiter/orders", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        orders = resp.json()
        log_test("H1: GET /waiter/orders still works", 
                True, 
                f"Returns {len(orders)} orders")
    else:
        log_test("H1: GET /waiter/orders still works", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("H1: GET /waiter/orders still works", False, str(e))

try:
    # H2: GET /api/admin/analytics still has waiter.* block
    resp = requests.get(f"{BASE_URL}/admin/analytics", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        analytics = resp.json()
        waiter = analytics.get('waiter', {})
        
        checks = []
        
        if 'served_count' in waiter:
            checks.append(f"served_count={waiter['served_count']} ✓")
        else:
            checks.append("served_count missing ✗")
        
        if 'served_today' in waiter:
            checks.append(f"served_today={waiter['served_today']} ✓")
        else:
            checks.append("served_today missing ✗")
        
        # Check that served_count increased (we served 2 orders in E/F and G)
        if waiter.get('served_count', 0) >= 2:
            checks.append("served_count increased ✓")
        else:
            checks.append(f"served_count={waiter.get('served_count')} (expected >= 2) ✗")
        
        all_passed = all('✓' in c for c in checks)
        log_test("H2: GET /admin/analytics has waiter.* block", 
                all_passed, 
                "; ".join(checks))
    else:
        log_test("H2: GET /admin/analytics has waiter.* block", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("H2: GET /admin/analytics has waiter.* block", False, str(e))

try:
    # H3: GET /api/kitchen/orders still works
    resp = requests.get(f"{BASE_URL}/kitchen/orders", headers=ADMIN_HEADERS, timeout=10)
    if resp.status_code == 200:
        orders = resp.json()
        log_test("H3: GET /kitchen/orders still works", 
                True, 
                f"Returns {len(orders)} orders")
    else:
        log_test("H3: GET /kitchen/orders still works", 
                False, 
                f"Status {resp.status_code}")
except Exception as e:
    log_test("H3: GET /kitchen/orders still works", False, str(e))

print()

# ============================================================================
# CLEANUP
# ============================================================================
print("CLEANUP")
print("-" * 80)

try:
    # Clean up tables
    if b_table_id:
        close_and_clean_table(b_table_id)
        log_test("Cleanup: Table B", True, f"Closed and cleaned {b_table_id}")
except Exception as e:
    log_test("Cleanup: Table B", False, str(e))

try:
    if g_table_id and g_table_id != b_table_id:
        close_and_clean_table(g_table_id)
        log_test("Cleanup: Table G", True, f"Closed and cleaned {g_table_id}")
except Exception as e:
    log_test("Cleanup: Table G", False, str(e))

print()

# ============================================================================
# SUMMARY
# ============================================================================
print("=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"Total tests: {tests_passed + tests_failed}")
print(f"Passed: {tests_passed} ✅")
print(f"Failed: {tests_failed} ❌")
print(f"Success rate: {(tests_passed / (tests_passed + tests_failed) * 100):.1f}%")
print()

if tests_failed > 0:
    print("FAILED TESTS:")
    for result in test_results:
        if not result['passed']:
            print(f"  ❌ {result['name']}: {result['message']}")
    print()

print("=" * 80)
