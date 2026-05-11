#!/usr/bin/env python3
"""
Backend test for PATCH /api/waiter/bills/:id endpoint
Tests all scenarios from the review request
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "admin123"
HEADERS_ADMIN = {"x-admin-token": ADMIN_TOKEN}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_auth_and_not_found():
    """A. Auth & not-found"""
    log("\n=== A. AUTH & NOT-FOUND ===")
    
    # 1. PATCH without admin token → 401
    try:
        log("1. PATCH /api/waiter/bills/nonexistent without admin token")
        r = requests.patch(f"{BASE_URL}/waiter/bills/nonexistent", json={})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        log("   ✅ Returns 401 without admin token")
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False
    
    # 2. PATCH with admin token to nonexistent bill → 404
    try:
        log("2. PATCH /api/waiter/bills/nonexistent with admin token")
        r = requests.patch(f"{BASE_URL}/waiter/bills/nonexistent", 
                          json={}, headers=HEADERS_ADMIN)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"
        data = r.json()
        assert data.get('error') == 'Bill not found', f"Expected 'Bill not found', got {data.get('error')}"
        log("   ✅ Returns 404 with error: 'Bill not found'")
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False
    
    log("✅ A. Auth & not-found tests PASSED")
    return True

def setup_bill_in_awaiting_payment():
    """Setup: Create a table with active session, place order, mark ready and served to create bill"""
    log("\n=== SETUP: Creating bill in awaiting_payment ===")
    
    try:
        # Get available table (or clean up an occupied one)
        log("1. Getting available table")
        r = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        tables = r.json()
        available_table = next((t for t in tables if t['status'] == 'available'), None)
        
        # If no available table, clean up an occupied one
        if not available_table:
            occupied_table = next((t for t in tables if t['status'] == 'occupied'), None)
            if occupied_table:
                cleanup_table(occupied_table['id'])
                available_table = occupied_table
        
        if not available_table:
            log("   ❌ No table found")
            return None
        table_id = available_table['id']
        log(f"   ✅ Found available table: {table_id}")
        
        # Create walk-in session
        log("2. Creating walk-in session")
        r = requests.post(f"{BASE_URL}/tables/{table_id}/walkin",
                         json={"guests": 2, "customer_name": "Bill Test Customer"},
                         headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Walk-in failed: {r.status_code}"
        log(f"   ✅ Walk-in session created")
        
        # Get a dish
        log("3. Getting dish for order")
        r = requests.get(f"{BASE_URL}/dishes")
        dishes = r.json()
        dish = dishes[0] if dishes else None
        assert dish, "No dishes found"
        log(f"   ✅ Found dish: {dish['name']}")
        
        # Place dine-in order
        log("4. Placing dine-in order")
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 2}],
            "type": "dine-in"
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        assert r.status_code in [200, 201], f"Order creation failed: {r.status_code}"
        order = r.json()
        order_id = order['id']
        log(f"   ✅ Order created: {order_id}")
        
        # Move order to preparing
        log("5. Moving order to preparing")
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "preparing"},
                        headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Status update failed: {r.status_code}"
        log(f"   ✅ Order status: preparing")
        
        # Move order to ready
        log("6. Moving order to ready")
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "ready"},
                        headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Status update failed: {r.status_code}"
        log(f"   ✅ Order status: ready")
        
        # Get waiter notification (auto-created when order becomes ready)
        log("7. Getting waiter notification")
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=HEADERS_ADMIN)
        notifications = r.json()
        notif = next((n for n in notifications if n['order_id'] == order_id), None)
        assert notif, "Notification not found"
        notif_id = notif['id']
        log(f"   ✅ Notification found: {notif_id}")
        
        # Mark as served (this auto-opens the bill)
        log("8. Marking order as served (auto-opens bill)")
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif_id}/served",
                         headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Served failed: {r.status_code}"
        log(f"   ✅ Order marked as served")
        
        # Get the bill
        log("9. Getting bill from /api/waiter/bills")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['table_id'] == table_id), None)
        assert bill, "Bill not found"
        assert bill['status'] == 'awaiting_payment', f"Expected status 'awaiting_payment', got {bill['status']}"
        log(f"   ✅ Bill found: {bill['id']}, status: {bill['status']}")
        
        return {
            'table_id': table_id,
            'order_id': order_id,
            'bill_id': bill['id'],
            'bill': bill
        }
        
    except Exception as e:
        log(f"   ❌ Setup failed: {e}")
        return None

def test_update_payment_method(setup_data):
    """B. Update payment_method"""
    log("\n=== B. UPDATE PAYMENT_METHOD ===")
    
    bill_id = setup_data['bill_id']
    
    try:
        # 1. Get current bill
        log("1. GET /api/waiter/bills to verify current state")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['id'] == bill_id), None)
        assert bill, "Bill not found"
        current_payment_method = bill.get('payment_method', 'cash')
        log(f"   ✅ Current payment_method: {current_payment_method}")
        
        # 2. PATCH with payment_method:'card' → 200
        log("2. PATCH with payment_method:'card'")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"payment_method": "card"},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('payment_method') == 'card', f"Expected 'card', got {data.get('payment_method')}"
        log(f"   ✅ Response has payment_method: 'card'")
        
        # 3. GET to verify it persisted
        log("3. GET /api/waiter/bills to verify persistence")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['id'] == bill_id), None)
        assert bill, "Bill not found"
        assert bill.get('payment_method') == 'card', f"Expected 'card', got {bill.get('payment_method')}"
        log(f"   ✅ payment_method persisted: 'card'")
        
        # 4. PATCH back to 'cash'
        log("4. PATCH back to payment_method:'cash'")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"payment_method": "cash"},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('payment_method') == 'cash', f"Expected 'cash', got {data.get('payment_method')}"
        log(f"   ✅ Switched back to 'cash'")
        
        # 5. PATCH with invalid value 'crypto' → should ignore
        log("5. PATCH with invalid payment_method:'crypto' (should ignore)")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"payment_method": "crypto"},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        # Should keep previous value (cash)
        assert data.get('payment_method') == 'cash', f"Expected 'cash' (ignored invalid), got {data.get('payment_method')}"
        log(f"   ✅ Invalid value ignored, kept 'cash'")
        
        log("✅ B. Update payment_method tests PASSED")
        return True
        
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False

def test_update_note(setup_data):
    """C. Update note"""
    log("\n=== C. UPDATE NOTE ===")
    
    bill_id = setup_data['bill_id']
    
    try:
        # 1. PATCH with note → 200
        log("1. PATCH with note:'Birthday celebration — gift the dessert'")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"note": "Birthday celebration — gift the dessert"},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('note') == "Birthday celebration — gift the dessert", f"Note mismatch"
        log(f"   ✅ Response has note: 'Birthday celebration — gift the dessert'")
        
        # 2. GET to verify
        log("2. GET /api/waiter/bills to verify note persisted")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['id'] == bill_id), None)
        assert bill, "Bill not found"
        assert bill.get('note') == "Birthday celebration — gift the dessert", f"Note not persisted"
        log(f"   ✅ Note persisted correctly")
        
        # 3. PATCH with empty note to clear
        log("3. PATCH with empty note to clear")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"note": ""},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('note') == "", f"Expected empty note, got {data.get('note')}"
        log(f"   ✅ Note cleared")
        
        log("✅ C. Update note tests PASSED")
        return True
        
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False

def cleanup_table(table_id):
    """Helper to clean up a table after test"""
    try:
        # Try to complete payment if there's an active session
        r = requests.post(f"{BASE_URL}/tables/{table_id}/complete-payment",
                         headers=HEADERS_ADMIN)
        # Ignore errors - table might already be clean
    except:
        pass

def test_cancel_bill_request():
    """D. Cancel bill request"""
    log("\n=== D. CANCEL BILL REQUEST ===")
    
    try:
        # Setup: Create a new table with bill in bill_requested state
        log("Setup: Creating new bill in bill_requested state")
        
        # Get available table (or clean up an occupied one)
        r = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        tables = r.json()
        available_table = next((t for t in tables if t['status'] == 'available'), None)
        
        # If no available table, clean up an occupied one
        if not available_table:
            occupied_table = next((t for t in tables if t['status'] == 'occupied'), None)
            if occupied_table:
                cleanup_table(occupied_table['id'])
                available_table = occupied_table
        
        if not available_table:
            log("   ❌ No table found")
            return False
        table_id = available_table['id']
        log(f"   Found table: {table_id}")
        
        # Create walk-in session
        r = requests.post(f"{BASE_URL}/tables/{table_id}/walkin",
                         json={"guests": 2, "customer_name": "Bill Request Test"},
                         headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Walk-in failed: {r.status_code}"
        
        # Get a dish and place order
        r = requests.get(f"{BASE_URL}/dishes")
        dishes = r.json()
        dish = dishes[0]
        
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "type": "dine-in"
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        order = r.json()
        order_id = order['id']
        
        # Move to ready and serve to create bill
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "preparing"}, headers=HEADERS_ADMIN)
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "ready"}, headers=HEADERS_ADMIN)
        
        # Get notification and mark served
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=HEADERS_ADMIN)
        notifications = r.json()
        notif = next((n for n in notifications if n['order_id'] == order_id), None)
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif['id']}/served",
                         headers=HEADERS_ADMIN)
        
        # 1. Trigger customer "Request Bill"
        log("1. POST /api/guest-requests with request_type:'bill'")
        r = requests.post(f"{BASE_URL}/guest-requests",
                         json={"table_id": table_id, "request_type": "bill"})
        assert r.status_code in [200, 201], f"Guest request failed: {r.status_code}"
        guest_request = r.json()
        log(f"   ✅ Guest request created: {guest_request['id']}")
        
        # 2. Verify bill status is 'bill_requested'
        log("2. GET /api/waiter/bills to verify status='bill_requested'")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['table_id'] == table_id), None)
        assert bill, "Bill not found"
        assert bill['status'] == 'bill_requested', f"Expected 'bill_requested', got {bill['status']}"
        assert bill.get('bill_requested') == True, f"Expected bill_requested=True"
        log(f"   ✅ Bill status: 'bill_requested', bill_requested: True")
        
        bill_id = bill['id']
        
        # 3. PATCH with cancel_request:true → 200
        log("3. PATCH with cancel_request:true")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"cancel_request": True},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('status') == 'awaiting_payment', f"Expected 'awaiting_payment', got {data.get('status')}"
        assert data.get('bill_requested') == False, f"Expected bill_requested=False"
        assert 'bill_request_cancelled_at' in data, "Expected bill_request_cancelled_at field"
        log(f"   ✅ Response: status='awaiting_payment', bill_requested=False, bill_request_cancelled_at set")
        
        # 4. GET to verify status back to 'awaiting_payment'
        log("4. GET /api/waiter/bills to verify status change persisted")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['id'] == bill_id), None)
        assert bill, "Bill not found"
        assert bill['status'] == 'awaiting_payment', f"Expected 'awaiting_payment', got {bill['status']}"
        log(f"   ✅ Bill status back to 'awaiting_payment'")
        
        # 5. Verify guest_request is resolved
        log("5. GET /api/guest-requests to verify request resolved")
        r = requests.get(f"{BASE_URL}/guest-requests", headers=HEADERS_ADMIN)
        pending_requests = r.json()
        # Should not find the bill request in pending list
        bill_request = next((req for req in pending_requests if req['id'] == guest_request['id']), None)
        assert bill_request is None, "Guest request should be resolved (not in pending list)"
        log(f"   ✅ Guest request resolved (not in pending list)")
        
        log("✅ D. Cancel bill request tests PASSED")
        return True
        
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False

def test_reject_when_paid():
    """E. Reject when paid"""
    log("\n=== E. REJECT WHEN PAID ===")
    
    try:
        # Setup: Create a new bill and complete payment
        log("Setup: Creating new bill and completing payment")
        
        # Get available table (or clean up an occupied one)
        r = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        tables = r.json()
        available_table = next((t for t in tables if t['status'] == 'available'), None)
        
        # If no available table, clean up an occupied one
        if not available_table:
            occupied_table = next((t for t in tables if t['status'] == 'occupied'), None)
            if occupied_table:
                cleanup_table(occupied_table['id'])
                available_table = occupied_table
        
        if not available_table:
            log("   ❌ No table found")
            return False
        table_id = available_table['id']
        
        # Create walk-in session
        r = requests.post(f"{BASE_URL}/tables/{table_id}/walkin",
                         json={"guests": 2, "customer_name": "Paid Bill Test"},
                         headers=HEADERS_ADMIN)
        
        # Get a dish and place order
        r = requests.get(f"{BASE_URL}/dishes")
        dishes = r.json()
        dish = dishes[0]
        
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "type": "dine-in"
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        order = r.json()
        order_id = order['id']
        
        # Move to ready and serve to create bill
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "preparing"}, headers=HEADERS_ADMIN)
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "ready"}, headers=HEADERS_ADMIN)
        
        # Get notification and mark served
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=HEADERS_ADMIN)
        notifications = r.json()
        notif = next((n for n in notifications if n['order_id'] == order_id), None)
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif['id']}/served",
                         headers=HEADERS_ADMIN)
        
        # Get the bill
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['table_id'] == table_id), None)
        bill_id = bill['id']
        log(f"   Bill created: {bill_id}")
        
        # 1. Complete payment
        log("1. POST /api/tables/:id/complete-payment")
        r = requests.post(f"{BASE_URL}/tables/{table_id}/complete-payment",
                         headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Payment completion failed: {r.status_code}"
        log(f"   ✅ Payment completed")
        
        # 2. PATCH should return 400 "Bill already paid"
        log("2. PATCH /api/waiter/bills/:id with note (should fail)")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"note": "late note"},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}"
        data = r.json()
        assert data.get('error') == 'Bill already paid', f"Expected 'Bill already paid', got {data.get('error')}"
        log(f"   ✅ Returns 400 with error: 'Bill already paid'")
        
        log("✅ E. Reject when paid tests PASSED")
        return True
        
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False

def test_combined_patch():
    """F. Regression — combined PATCH"""
    log("\n=== F. REGRESSION — COMBINED PATCH ===")
    
    try:
        # Setup: Create a new bill
        log("Setup: Creating new bill")
        
        # Get available table (or clean up an occupied one)
        r = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        tables = r.json()
        available_table = next((t for t in tables if t['status'] == 'available'), None)
        
        # If no available table, clean up an occupied one
        if not available_table:
            occupied_table = next((t for t in tables if t['status'] == 'occupied'), None)
            if occupied_table:
                cleanup_table(occupied_table['id'])
                available_table = occupied_table
        
        if not available_table:
            log("   ❌ No table found")
            return False
        table_id = available_table['id']
        
        # Create walk-in session
        r = requests.post(f"{BASE_URL}/tables/{table_id}/walkin",
                         json={"guests": 2, "customer_name": "Combined Test"},
                         headers=HEADERS_ADMIN)
        
        # Get a dish and place order
        r = requests.get(f"{BASE_URL}/dishes")
        dishes = r.json()
        dish = dishes[0]
        
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "type": "dine-in"
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        order = r.json()
        order_id = order['id']
        
        # Move to ready and serve to create bill
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "preparing"}, headers=HEADERS_ADMIN)
        r = requests.put(f"{BASE_URL}/orders/{order_id}",
                        json={"status": "ready"}, headers=HEADERS_ADMIN)
        
        # Get notification and mark served
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=HEADERS_ADMIN)
        notifications = r.json()
        notif = next((n for n in notifications if n['order_id'] == order_id), None)
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif['id']}/served",
                         headers=HEADERS_ADMIN)
        
        # Get the bill
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['table_id'] == table_id), None)
        bill_id = bill['id']
        log(f"   Bill created: {bill_id}")
        
        # 1. PATCH with both note and payment_method
        log("1. PATCH with both note:'VIP' and payment_method:'card'")
        r = requests.patch(f"{BASE_URL}/waiter/bills/{bill_id}",
                          json={"note": "VIP", "payment_method": "card"},
                          headers=HEADERS_ADMIN)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get('note') == 'VIP', f"Expected note='VIP', got {data.get('note')}"
        assert data.get('payment_method') == 'card', f"Expected payment_method='card', got {data.get('payment_method')}"
        log(f"   ✅ Response has both note='VIP' and payment_method='card'")
        
        # 2. GET to verify both persisted
        log("2. GET /api/waiter/bills to verify both fields persisted")
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=HEADERS_ADMIN)
        bills = r.json()
        bill = next((b for b in bills if b['id'] == bill_id), None)
        assert bill, "Bill not found"
        assert bill.get('note') == 'VIP', f"Note not persisted"
        assert bill.get('payment_method') == 'card', f"Payment method not persisted"
        log(f"   ✅ Both fields persisted correctly")
        
        log("✅ F. Combined PATCH tests PASSED")
        return True
        
    except AssertionError as e:
        log(f"   ❌ FAIL: {e}")
        return False
    except Exception as e:
        log(f"   ❌ ERROR: {e}")
        return False

def main():
    log("=" * 80)
    log("BACKEND TEST: PATCH /api/waiter/bills/:id endpoint")
    log("=" * 80)
    
    results = {
        'A. Auth & not-found': False,
        'B. Update payment_method': False,
        'C. Update note': False,
        'D. Cancel bill request': False,
        'E. Reject when paid': False,
        'F. Combined PATCH': False
    }
    
    # A. Auth & not-found
    results['A. Auth & not-found'] = test_auth_and_not_found()
    
    # Setup for B and C
    setup_data = setup_bill_in_awaiting_payment()
    if setup_data:
        # B. Update payment_method
        results['B. Update payment_method'] = test_update_payment_method(setup_data)
        
        # C. Update note
        results['C. Update note'] = test_update_note(setup_data)
    else:
        log("❌ Setup failed, skipping B and C tests")
    
    # D. Cancel bill request
    results['D. Cancel bill request'] = test_cancel_bill_request()
    
    # E. Reject when paid
    results['E. Reject when paid'] = test_reject_when_paid()
    
    # F. Combined PATCH
    results['F. Combined PATCH'] = test_combined_patch()
    
    # Summary
    log("\n" + "=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status} - {test_name}")
    
    log(f"\nTotal: {passed}/{total} tests passed ({passed*100//total}% success rate)")
    
    if passed == total:
        log("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        log(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
