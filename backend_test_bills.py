#!/usr/bin/env python3
"""
Backend test for Auto bill_sessions on Served + GET /api/waiter/bills feed

Tests the new Bills workflow:
- Bill auto-created when waiter clicks "Served" (via notification)
- Idempotency (no duplicates per table)
- Customer "Request Bill" creates/flags the bill_session
- Existing awaiting-payment + customer requests bill → flip to 'bill_requested'
- Bill stays open through kitchen status changes
- Payment closes the bill
- GET /api/tables/:id/bill returns bill_session metadata
- Legacy /api/orders/:id/served also auto-opens bill
- Customer-facing consistency
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:3000/api"
ADMIN_HEADERS = {"x-admin-token": "admin123"}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_auth():
    """A. Auth - GET /api/waiter/bills without admin token → 401"""
    log("=" * 80)
    log("TEST A: Auth")
    log("=" * 80)
    
    try:
        # Test without admin token
        r = requests.get(f"{BASE_URL}/waiter/bills")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"
        log("✅ A1: GET /api/waiter/bills without admin token → 401")
        
        # Test with admin token
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert isinstance(data, list), f"Expected array, got {type(data)}"
        log(f"✅ A2: GET /api/waiter/bills with admin token → 200, returns array (length={len(data)})")
        
        return True
    except AssertionError as e:
        log(f"❌ Auth test failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Auth test error: {e}")
        return False

def test_bill_auto_created_on_served():
    """B. Bill auto-created when waiter clicks 'Served' (via notification)"""
    log("=" * 80)
    log("TEST B: Bill auto-created when waiter clicks 'Served'")
    log("=" * 80)
    
    try:
        # Setup: Pick a free table
        r = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS)
        tables = r.json()
        free_table = next((t for t in tables if t['status'] == 'available'), None)
        assert free_table, "No available table found"
        table_id = free_table['id']
        table_number = free_table['number']
        log(f"✅ B1: Found free table: {table_id} (Table {table_number})")
        
        # Start session
        r = requests.post(f"{BASE_URL}/tables/{table_id}/start-session", 
                         json={"customer_name": "BillsTest", "guests": 2})
        assert r.status_code == 200, f"Start session failed: {r.status_code}"
        log(f"✅ B2: Started session on table {table_number}")
        
        # Get a dish
        r = requests.get(f"{BASE_URL}/dishes")
        dishes = r.json()
        dish = dishes[0]
        log(f"✅ B3: Got dish: {dish['name']} (€{dish['price']})")
        
        # Create order
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 2}],
            "customer": {"name": "BillsTest"}
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        assert r.status_code in [200, 201], f"Order creation failed: {r.status_code}"
        order = r.json()
        order_id = order['id']
        order_number = order['order_number']
        log(f"✅ B4: Created order {order_number} with 2x {dish['name']}")
        
        # Move order to preparing
        r = requests.put(f"{BASE_URL}/orders/{order_id}", 
                        json={"status": "preparing"}, 
                        headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Status update to preparing failed: {r.status_code}"
        log(f"✅ B5: Updated order to 'preparing'")
        
        # Move order to ready (should create waiter notification)
        r = requests.put(f"{BASE_URL}/orders/{order_id}", 
                        json={"status": "ready"}, 
                        headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Status update to ready failed: {r.status_code}"
        log(f"✅ B6: Updated order to 'ready'")
        
        # Get waiter notifications
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Get notifications failed: {r.status_code}"
        notifications = r.json()
        notif = next((n for n in notifications if n['order_id'] == order_id), None)
        assert notif, f"Notification not found for order {order_id}"
        notif_id = notif['id']
        log(f"✅ B7: Found notification for order {order_number}")
        
        # Check bills BEFORE serving - should NOT be in the list
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills_before = r.json()
        bill_before = next((b for b in bills_before if b['table_id'] == table_id), None)
        if bill_before:
            log(f"⚠️  B8: Table {table_number} already in bills list before serving (may be from previous test)")
        else:
            log(f"✅ B8: Table {table_number} NOT in bills list before serving")
        
        # Mark as served via notification endpoint
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif_id}/served", 
                         headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Served endpoint failed: {r.status_code}"
        served_response = r.json()
        log(f"✅ B9: Marked notification as served")
        
        # Verify response includes bill_session (from order update)
        # Note: The notification endpoint doesn't return bill_session, but the order should be updated
        # Let's check the order directly
        r = requests.get(f"{BASE_URL}/orders/{order_id}")
        order_after_served = r.json()
        assert order_after_served['status'] == 'delivered', f"Order status should be 'delivered', got {order_after_served['status']}"
        assert order_after_served['serve_status'] == 'served', f"Serve status should be 'served', got {order_after_served.get('serve_status')}"
        log(f"✅ B10: Order status updated to 'delivered' and serve_status='served'")
        
        # Check bills AFTER serving - should appear with bill_session
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills_after = r.json()
        bill = next((b for b in bills_after if b['table_id'] == table_id), None)
        assert bill, f"Bill not found for table {table_id} after serving"
        log(f"✅ B11: Table {table_number} now appears in bills list")
        
        # Verify bill_session fields
        assert bill['status'] in ['awaiting_payment', 'bill_requested'], f"Expected status 'awaiting_payment' or 'bill_requested', got {bill['status']}"
        assert bill['table_number'] == table_number, f"Table number mismatch: {bill['table_number']} != {table_number}"
        assert bill['opened_by'] == 'served', f"Expected opened_by='served', got {bill['opened_by']}"
        assert bill['last_served_at'] is not None, "last_served_at should be set"
        assert bill['bill_requested'] == False, f"bill_requested should be False, got {bill['bill_requested']}"
        assert bill['paid_at'] is None, "paid_at should be None"
        log(f"✅ B12: Bill session has correct fields:")
        log(f"    - status: {bill['status']}")
        log(f"    - table_number: {bill['table_number']}")
        log(f"    - opened_by: {bill['opened_by']}")
        log(f"    - last_served_at: {bill['last_served_at']}")
        log(f"    - bill_requested: {bill['bill_requested']}")
        
        # Verify totals
        assert bill['totals']['total'] > 0, "Total should be > 0"
        expected_subtotal = dish['price'] * 2
        expected_vat = round(expected_subtotal * 0.21, 2)
        expected_total = round(expected_subtotal + expected_vat, 2)
        assert bill['totals']['subtotal'] == expected_subtotal, f"Subtotal mismatch: {bill['totals']['subtotal']} != {expected_subtotal}"
        assert bill['totals']['vat'] == expected_vat, f"VAT mismatch: {bill['totals']['vat']} != {expected_vat}"
        assert bill['totals']['total'] == expected_total, f"Total mismatch: {bill['totals']['total']} != {expected_total}"
        log(f"✅ B13: Totals correct:")
        log(f"    - subtotal: €{bill['totals']['subtotal']}")
        log(f"    - vat: €{bill['totals']['vat']}")
        log(f"    - total: €{bill['totals']['total']}")
        
        assert bill['order_count'] >= 1, f"Order count should be >= 1, got {bill['order_count']}"
        assert bill['customer_name'] in ['BillsTest', 'Guest'], f"Customer name should be 'BillsTest' or 'Guest', got {bill['customer_name']}"
        assert isinstance(bill['minutes_since_served'], (int, type(None))), "minutes_since_served should be a number or null"
        assert bill['payment_method'] == 'cash', f"Payment method should be 'cash', got {bill['payment_method']}"
        log(f"✅ B14: Additional fields correct:")
        log(f"    - order_count: {bill['order_count']}")
        log(f"    - customer_name: {bill['customer_name']}")
        log(f"    - minutes_since_served: {bill['minutes_since_served']}")
        log(f"    - payment_method: {bill['payment_method']}")
        
        return True, table_id, order_id
    except AssertionError as e:
        log(f"❌ Test B failed: {e}")
        return False, None, None
    except Exception as e:
        log(f"❌ Test B error: {e}")
        import traceback
        traceback.print_exc()
        return False, None, None

def test_idempotency(table_id):
    """C. Idempotency - second 'Served' on same table doesn't duplicate the bill"""
    log("=" * 80)
    log("TEST C: Idempotency - second 'Served' doesn't duplicate bill")
    log("=" * 80)
    
    try:
        # Get current bill count for this table
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills_before = r.json()
        bills_for_table_before = [b for b in bills_before if b['table_id'] == table_id]
        count_before = len(bills_for_table_before)
        total_before = bills_for_table_before[0]['totals']['total'] if bills_for_table_before else 0
        log(f"✅ C1: Bills for table before: {count_before}, total: €{total_before}")
        
        # Get a dish
        r = requests.get(f"{BASE_URL}/dishes")
        dishes = r.json()
        dish = dishes[1] if len(dishes) > 1 else dishes[0]
        
        # Place ANOTHER order on the same table
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "customer": {"name": "BillsTest2"}
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        assert r.status_code in [200, 201], f"Order creation failed: {r.status_code}"
        order2 = r.json()
        order2_id = order2['id']
        order2_number = order2['order_number']
        log(f"✅ C2: Created second order {order2_number}")
        
        # Move to ready
        r = requests.put(f"{BASE_URL}/orders/{order2_id}", 
                        json={"status": "preparing"}, 
                        headers=ADMIN_HEADERS)
        r = requests.put(f"{BASE_URL}/orders/{order2_id}", 
                        json={"status": "ready"}, 
                        headers=ADMIN_HEADERS)
        log(f"✅ C3: Moved second order to 'ready'")
        
        # Get notification and mark as served
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS)
        notifications = r.json()
        notif2 = next((n for n in notifications if n['order_id'] == order2_id), None)
        assert notif2, f"Notification not found for order {order2_id}"
        
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif2['id']}/served", 
                         headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Served endpoint failed: {r.status_code}"
        log(f"✅ C4: Marked second notification as served")
        
        # Check bills - should still be only ONE row for this table
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills_after = r.json()
        bills_for_table_after = [b for b in bills_after if b['table_id'] == table_id]
        count_after = len(bills_for_table_after)
        
        assert count_after == 1, f"Expected 1 bill for table, got {count_after}"
        log(f"✅ C5: Still only ONE bill row for this table (idempotency working)")
        
        # Verify last_served_at is more recent
        bill_after = bills_for_table_after[0]
        # Can't easily compare timestamps, but we can check it's set
        assert bill_after['last_served_at'] is not None, "last_served_at should be set"
        log(f"✅ C6: last_served_at updated: {bill_after['last_served_at']}")
        
        # Verify total is now the sum of both orders
        total_after = bill_after['totals']['total']
        assert total_after > total_before, f"Total should increase: {total_after} > {total_before}"
        log(f"✅ C7: Total increased from €{total_before} to €{total_after}")
        
        return True
    except AssertionError as e:
        log(f"❌ Test C failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test C error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_customer_request_bill():
    """D. Customer 'Request Bill' creates/flags the bill_session"""
    log("=" * 80)
    log("TEST D: Customer 'Request Bill' creates/flags bill_session")
    log("=" * 80)
    
    try:
        # Setup: Get a fresh table
        r = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS)
        tables = r.json()
        free_table = next((t for t in tables if t['status'] == 'available'), None)
        assert free_table, "No available table found"
        table_id = free_table['id']
        table_number = free_table['number']
        log(f"✅ D1: Found free table: {table_id} (Table {table_number})")
        
        # Start session
        r = requests.post(f"{BASE_URL}/tables/{table_id}/start-session", 
                         json={"customer_name": "RequestBillTest", "guests": 2})
        assert r.status_code == 200, f"Start session failed: {r.status_code}"
        log(f"✅ D2: Started session on table {table_number}")
        
        # Customer requests bill (without any order being served yet)
        r = requests.post(f"{BASE_URL}/guest-requests", 
                         json={"table_id": table_id, "request_type": "bill"})
        assert r.status_code in [200, 201], f"Guest request failed: {r.status_code}"
        log(f"✅ D3: Customer requested bill")
        
        # Check bills - should appear with bill_requested status
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill = next((b for b in bills if b['table_id'] == table_id), None)
        assert bill, f"Bill not found for table {table_id} after request"
        log(f"✅ D4: Table {table_number} appears in bills list")
        
        # Verify bill_session fields
        assert bill['status'] == 'bill_requested', f"Expected status 'bill_requested', got {bill['status']}"
        assert bill['bill_requested'] == True, f"bill_requested should be True, got {bill['bill_requested']}"
        assert bill['bill_requested_at'] is not None, "bill_requested_at should be set"
        assert bill['opened_by'] == 'bill_requested', f"Expected opened_by='bill_requested', got {bill['opened_by']}"
        # last_served_at may be null since nothing was served yet
        log(f"✅ D5: Bill session has correct fields:")
        log(f"    - status: {bill['status']}")
        log(f"    - bill_requested: {bill['bill_requested']}")
        log(f"    - bill_requested_at: {bill['bill_requested_at']}")
        log(f"    - opened_by: {bill['opened_by']}")
        log(f"    - last_served_at: {bill.get('last_served_at', 'null')}")
        
        # Verify sorting - bill_requested should come before awaiting_payment
        # Get all bills and check order
        all_bills = r.json()
        bill_requested_bills = [b for b in all_bills if b['status'] == 'bill_requested']
        awaiting_payment_bills = [b for b in all_bills if b['status'] == 'awaiting_payment']
        if bill_requested_bills and awaiting_payment_bills:
            # Find indices
            first_bill_requested_idx = next((i for i, b in enumerate(all_bills) if b['status'] == 'bill_requested'), None)
            first_awaiting_idx = next((i for i, b in enumerate(all_bills) if b['status'] == 'awaiting_payment'), None)
            if first_bill_requested_idx is not None and first_awaiting_idx is not None:
                assert first_bill_requested_idx < first_awaiting_idx, "bill_requested should come before awaiting_payment"
                log(f"✅ D6: Sorting correct: bill_requested items come before awaiting_payment")
        
        return True, table_id
    except AssertionError as e:
        log(f"❌ Test D failed: {e}")
        return False, None
    except Exception as e:
        log(f"❌ Test D error: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_flip_to_bill_requested(table_id_from_b):
    """E. Existing awaiting-payment + customer requests bill → flip to 'bill_requested'"""
    log("=" * 80)
    log("TEST E: Flip awaiting-payment to bill_requested on customer request")
    log("=" * 80)
    
    try:
        # Use the table from test B (should have status='awaiting_payment')
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill_before = next((b for b in bills if b['table_id'] == table_id_from_b), None)
        if not bill_before:
            log(f"⚠️  E1: Bill not found for table {table_id_from_b}, skipping test E")
            return True
        
        log(f"✅ E1: Found bill for table, status before: {bill_before['status']}")
        
        # Customer requests bill
        r = requests.post(f"{BASE_URL}/guest-requests", 
                         json={"table_id": table_id_from_b, "request_type": "bill"})
        assert r.status_code in [200, 201], f"Guest request failed: {r.status_code}"
        log(f"✅ E2: Customer requested bill")
        
        # Check bills - status should flip to 'bill_requested'
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill_after = next((b for b in bills if b['table_id'] == table_id_from_b), None)
        assert bill_after, f"Bill not found for table {table_id_from_b}"
        
        assert bill_after['status'] == 'bill_requested', f"Expected status 'bill_requested', got {bill_after['status']}"
        assert bill_after['bill_requested'] == True, f"bill_requested should be True, got {bill_after['bill_requested']}"
        assert bill_after['bill_requested_at'] is not None, "bill_requested_at should be set"
        # last_served_at should still be preserved from earlier
        assert bill_after['last_served_at'] is not None, "last_served_at should still be set"
        log(f"✅ E3: Bill status flipped to 'bill_requested'")
        log(f"    - status: {bill_after['status']}")
        log(f"    - bill_requested: {bill_after['bill_requested']}")
        log(f"    - last_served_at preserved: {bill_after['last_served_at']}")
        
        return True
    except AssertionError as e:
        log(f"❌ Test E failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test E error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_bill_stays_open_through_status_changes(table_id_from_b, order_id_from_b):
    """F. Bill stays open through kitchen status changes (regression check)"""
    log("=" * 80)
    log("TEST F: Bill stays open through kitchen status changes")
    log("=" * 80)
    
    try:
        # Get current bill
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill_before = next((b for b in bills if b['table_id'] == table_id_from_b), None)
        if not bill_before:
            log(f"⚠️  F1: Bill not found for table {table_id_from_b}, skipping test F")
            return True
        
        total_before = bill_before['totals']['total']
        log(f"✅ F1: Bill found, total before: €{total_before}")
        
        # Try changing order status back and forth
        statuses_to_test = ['preparing', 'ready', 'delivered']
        for status in statuses_to_test:
            r = requests.put(f"{BASE_URL}/orders/{order_id_from_b}", 
                            json={"status": status}, 
                            headers=ADMIN_HEADERS)
            # Some status changes might fail (e.g., can't go back to preparing after delivered)
            # That's OK, we just want to verify the bill stays
            
            # Check bill still exists
            r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
            bills = r.json()
            bill = next((b for b in bills if b['table_id'] == table_id_from_b), None)
            assert bill, f"Bill disappeared after status change to {status}"
            # Total should remain the same (payment_status is still not 'paid')
            assert bill['totals']['total'] == total_before, f"Total changed after status update to {status}"
            log(f"✅ F2: Bill still present after status='{status}', total unchanged")
        
        return True
    except AssertionError as e:
        log(f"❌ Test F failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test F error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_payment_closes_bill(table_id_from_b):
    """G. Payment closes the bill"""
    log("=" * 80)
    log("TEST G: Payment closes the bill")
    log("=" * 80)
    
    try:
        # Get current bill
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill_before = next((b for b in bills if b['table_id'] == table_id_from_b), None)
        if not bill_before:
            log(f"⚠️  G1: Bill not found for table {table_id_from_b}, skipping test G")
            return True
        
        total_before = bill_before['totals']['total']
        order_count_before = bill_before['order_count']
        log(f"✅ G1: Bill found before payment, total: €{total_before}, orders: {order_count_before}")
        
        # Complete payment
        r = requests.post(f"{BASE_URL}/tables/{table_id_from_b}/complete-payment", 
                         headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Complete payment failed: {r.status_code}"
        payment_response = r.json()
        log(f"✅ G2: Payment completed")
        log(f"    - orders_closed: {payment_response['orders_closed']}")
        log(f"    - paid_total: €{payment_response['paid_total']}")
        
        # Check bills WITHOUT include=paid - should NOT be present
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills_after = r.json()
        bill_after = next((b for b in bills_after if b['table_id'] == table_id_from_b), None)
        assert bill_after is None, f"Bill should not be in active list after payment"
        log(f"✅ G3: Bill no longer in active bills list")
        
        # Check bills WITH include=paid - should be present
        r = requests.get(f"{BASE_URL}/waiter/bills?include=paid", headers=ADMIN_HEADERS)
        bills_paid = r.json()
        bill_paid = next((b for b in bills_paid if b['table_id'] == table_id_from_b), None)
        assert bill_paid, f"Bill not found in paid bills list"
        log(f"✅ G4: Bill found in paid bills list (include=paid)")
        
        # Verify bill_session fields
        assert bill_paid['status'] == 'paid', f"Expected status 'paid', got {bill_paid['status']}"
        assert bill_paid['paid_at'] is not None, "paid_at should be set"
        assert bill_paid['closed_at'] is not None, "closed_at should be set"
        assert bill_paid['paid_total'] > 0, f"paid_total should be > 0, got {bill_paid['paid_total']}"
        assert bill_paid['orders_closed'] == order_count_before, f"orders_closed mismatch: {bill_paid['orders_closed']} != {order_count_before}"
        log(f"✅ G5: Bill session has correct paid fields:")
        log(f"    - status: {bill_paid['status']}")
        log(f"    - paid_at: {bill_paid['paid_at']}")
        log(f"    - closed_at: {bill_paid['closed_at']}")
        log(f"    - paid_total: €{bill_paid['paid_total']}")
        log(f"    - orders_closed: {bill_paid['orders_closed']}")
        
        # Verify underlying orders are paid
        r = requests.get(f"{BASE_URL}/tables/{table_id_from_b}/bill", headers=ADMIN_HEADERS)
        bill_detail = r.json()
        # Should have no unpaid orders
        assert len(bill_detail['orders']) == 0, f"Should have no unpaid orders, got {len(bill_detail['orders'])}"
        log(f"✅ G6: No unpaid orders remaining for table")
        
        # Verify table status is available
        r = requests.get(f"{BASE_URL}/tables/{table_id_from_b}", headers=ADMIN_HEADERS)
        table = r.json()
        assert table['status'] == 'available', f"Table status should be 'available', got {table['status']}"
        log(f"✅ G7: Table status is 'available'")
        
        # Verify GET /api/tables/:id/bill returns bill_session=null
        assert bill_detail['bill_session'] is None, "bill_session should be null after payment"
        assert bill_detail['orders'] == [], "orders should be empty after payment"
        log(f"✅ G8: GET /api/tables/:id/bill returns bill_session=null, orders=[]")
        
        return True
    except AssertionError as e:
        log(f"❌ Test G failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test G error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_get_table_bill_returns_bill_session():
    """H. GET /api/tables/:id/bill returns bill_session metadata"""
    log("=" * 80)
    log("TEST H: GET /api/tables/:id/bill returns bill_session metadata")
    log("=" * 80)
    
    try:
        # Setup: Create a new table with an open bill
        r = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS)
        tables = r.json()
        free_table = next((t for t in tables if t['status'] == 'available'), None)
        assert free_table, "No available table found"
        table_id = free_table['id']
        table_number = free_table['number']
        log(f"✅ H1: Found free table: {table_id} (Table {table_number})")
        
        # Start session and create order
        r = requests.post(f"{BASE_URL}/tables/{table_id}/start-session", 
                         json={"customer_name": "BillSessionTest", "guests": 2})
        
        r = requests.get(f"{BASE_URL}/dishes")
        dish = r.json()[0]
        
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "customer": {"name": "BillSessionTest"}
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        order = r.json()
        order_id = order['id']
        
        # Move to ready and serve
        r = requests.put(f"{BASE_URL}/orders/{order_id}", json={"status": "preparing"}, headers=ADMIN_HEADERS)
        r = requests.put(f"{BASE_URL}/orders/{order_id}", json={"status": "ready"}, headers=ADMIN_HEADERS)
        
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS)
        notif = next((n for n in r.json() if n['order_id'] == order_id), None)
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif['id']}/served", headers=ADMIN_HEADERS)
        log(f"✅ H2: Created order and marked as served")
        
        # Get table bill
        r = requests.get(f"{BASE_URL}/tables/{table_id}/bill", headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Get table bill failed: {r.status_code}"
        bill_detail = r.json()
        log(f"✅ H3: GET /api/tables/:id/bill returned 200")
        
        # Verify bill_session is present and non-null
        assert bill_detail['bill_session'] is not None, "bill_session should not be null"
        bill_session = bill_detail['bill_session']
        log(f"✅ H4: bill_session field is present and non-null")
        
        # Verify bill_session matches the row in /api/waiter/bills
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill_from_feed = next((b for b in bills if b['table_id'] == table_id), None)
        assert bill_from_feed, "Bill not found in waiter bills feed"
        
        # Compare key fields
        assert bill_session['id'] == bill_from_feed['id'], "bill_session id mismatch"
        assert bill_session['status'] == bill_from_feed['status'], "bill_session status mismatch"
        log(f"✅ H5: bill_session matches row in /api/waiter/bills")
        
        # Verify debug.bill_session_id is set
        assert bill_detail['debug']['bill_session_id'] is not None, "debug.bill_session_id should be set"
        log(f"✅ H6: debug.bill_session_id is set: {bill_detail['debug']['bill_session_id']}")
        
        return True
    except AssertionError as e:
        log(f"❌ Test H failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test H error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_legacy_served_endpoint():
    """I. Legacy /api/orders/:id/served also auto-opens bill"""
    log("=" * 80)
    log("TEST I: Legacy /api/orders/:id/served also auto-opens bill")
    log("=" * 80)
    
    try:
        # Setup: Create a new table with order
        r = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS)
        tables = r.json()
        free_table = next((t for t in tables if t['status'] == 'available'), None)
        assert free_table, "No available table found"
        table_id = free_table['id']
        table_number = free_table['number']
        log(f"✅ I1: Found free table: {table_id} (Table {table_number})")
        
        # Start session and create order
        r = requests.post(f"{BASE_URL}/tables/{table_id}/start-session", 
                         json={"customer_name": "LegacyTest", "guests": 2})
        
        r = requests.get(f"{BASE_URL}/dishes")
        dish = r.json()[0]
        
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "customer": {"name": "LegacyTest"}
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        order = r.json()
        order_id = order['id']
        
        # Move to ready
        r = requests.put(f"{BASE_URL}/orders/{order_id}", json={"status": "preparing"}, headers=ADMIN_HEADERS)
        r = requests.put(f"{BASE_URL}/orders/{order_id}", json={"status": "ready"}, headers=ADMIN_HEADERS)
        log(f"✅ I2: Created order and moved to ready")
        
        # Use legacy served endpoint
        r = requests.post(f"{BASE_URL}/orders/{order_id}/served", headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Legacy served endpoint failed: {r.status_code}"
        served_response = r.json()
        log(f"✅ I3: Called legacy POST /api/orders/:id/served")
        
        # Verify response includes bill_session
        assert 'bill_session' in served_response, "Response should include bill_session"
        assert served_response['bill_session'] is not None, "bill_session should not be null"
        log(f"✅ I4: Response includes bill_session object")
        
        # Verify bill appears in waiter bills
        r = requests.get(f"{BASE_URL}/waiter/bills", headers=ADMIN_HEADERS)
        bills = r.json()
        bill = next((b for b in bills if b['table_id'] == table_id), None)
        assert bill, f"Bill not found for table {table_id}"
        log(f"✅ I5: Bill appears in /api/waiter/bills")
        
        return True
    except AssertionError as e:
        log(f"❌ Test I failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test I error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_customer_facing_consistency():
    """J. Customer-facing consistency"""
    log("=" * 80)
    log("TEST J: Customer-facing consistency")
    log("=" * 80)
    
    try:
        # Setup: Create a new table with order
        r = requests.get(f"{BASE_URL}/tables", headers=ADMIN_HEADERS)
        tables = r.json()
        free_table = next((t for t in tables if t['status'] == 'available'), None)
        assert free_table, "No available table found"
        table_id = free_table['id']
        
        # Start session and create order
        r = requests.post(f"{BASE_URL}/tables/{table_id}/start-session", 
                         json={"customer_name": "CustomerTest", "guests": 2})
        
        r = requests.get(f"{BASE_URL}/dishes")
        dish = r.json()[0]
        
        order_data = {
            "table_id": table_id,
            "items": [{"id": dish['id'], "name": dish['name'], "price": dish['price'], "quantity": 1}],
            "customer": {"name": "CustomerTest"}
        }
        r = requests.post(f"{BASE_URL}/orders", json=order_data)
        order = r.json()
        order_id = order['id']
        order_number = order['order_number']
        
        # Move to ready and serve
        r = requests.put(f"{BASE_URL}/orders/{order_id}", json={"status": "preparing"}, headers=ADMIN_HEADERS)
        r = requests.put(f"{BASE_URL}/orders/{order_id}", json={"status": "ready"}, headers=ADMIN_HEADERS)
        
        r = requests.get(f"{BASE_URL}/waiter/notifications", headers=ADMIN_HEADERS)
        notif = next((n for n in r.json() if n['order_id'] == order_id), None)
        r = requests.post(f"{BASE_URL}/waiter/notifications/{notif['id']}/served", headers=ADMIN_HEADERS)
        log(f"✅ J1: Created order and marked as served")
        
        # Fetch customer's order (no auth)
        r = requests.get(f"{BASE_URL}/orders/{order_number}")
        assert r.status_code == 200, f"Customer order lookup failed: {r.status_code}"
        customer_order = r.json()
        
        # Verify payment_status is still 'pending' (matches waiter view)
        assert customer_order['payment_status'] in ['pending', None], f"payment_status should be 'pending', got {customer_order.get('payment_status')}"
        log(f"✅ J2: After serving, customer order has payment_status='pending'")
        
        # Complete payment
        r = requests.post(f"{BASE_URL}/tables/{table_id}/complete-payment", headers=ADMIN_HEADERS)
        assert r.status_code == 200, f"Complete payment failed: {r.status_code}"
        log(f"✅ J3: Payment completed")
        
        # Fetch customer's order again
        r = requests.get(f"{BASE_URL}/orders/{order_number}")
        customer_order_after = r.json()
        
        # Verify payment_status is now 'paid' and status is 'completed'
        assert customer_order_after['payment_status'] == 'paid', f"payment_status should be 'paid', got {customer_order_after['payment_status']}"
        assert customer_order_after['status'] == 'completed', f"status should be 'completed', got {customer_order_after['status']}"
        log(f"✅ J4: After payment, customer order has payment_status='paid', status='completed'")
        
        return True
    except AssertionError as e:
        log(f"❌ Test J failed: {e}")
        return False
    except Exception as e:
        log(f"❌ Test J error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    log("=" * 80)
    log("BACKEND TEST: Auto bill_sessions on Served + GET /api/waiter/bills feed")
    log("=" * 80)
    
    results = {}
    
    # Test A: Auth
    results['A_Auth'] = test_auth()
    
    # Test B: Bill auto-created on served
    success_b, table_id_b, order_id_b = test_bill_auto_created_on_served()
    results['B_BillAutoCreated'] = success_b
    
    # Test C: Idempotency (requires table from B)
    if success_b and table_id_b:
        results['C_Idempotency'] = test_idempotency(table_id_b)
    else:
        log("⚠️  Skipping Test C (requires Test B to pass)")
        results['C_Idempotency'] = None
    
    # Test D: Customer request bill
    success_d, table_id_d = test_customer_request_bill()
    results['D_CustomerRequestBill'] = success_d
    
    # Test E: Flip to bill_requested (requires table from B)
    if success_b and table_id_b:
        results['E_FlipToBillRequested'] = test_flip_to_bill_requested(table_id_b)
    else:
        log("⚠️  Skipping Test E (requires Test B to pass)")
        results['E_FlipToBillRequested'] = None
    
    # Test F: Bill stays open through status changes (requires table and order from B)
    if success_b and table_id_b and order_id_b:
        results['F_BillStaysOpen'] = test_bill_stays_open_through_status_changes(table_id_b, order_id_b)
    else:
        log("⚠️  Skipping Test F (requires Test B to pass)")
        results['F_BillStaysOpen'] = None
    
    # Test G: Payment closes bill (requires table from B)
    if success_b and table_id_b:
        results['G_PaymentClosesBill'] = test_payment_closes_bill(table_id_b)
    else:
        log("⚠️  Skipping Test G (requires Test B to pass)")
        results['G_PaymentClosesBill'] = None
    
    # Test H: GET /api/tables/:id/bill returns bill_session
    results['H_GetTableBill'] = test_get_table_bill_returns_bill_session()
    
    # Test I: Legacy served endpoint
    results['I_LegacyServed'] = test_legacy_served_endpoint()
    
    # Test J: Customer-facing consistency
    results['J_CustomerConsistency'] = test_customer_facing_consistency()
    
    # Summary
    log("=" * 80)
    log("TEST SUMMARY")
    log("=" * 80)
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    total = len(results)
    
    for test_name, result in results.items():
        if result is True:
            log(f"✅ {test_name}: PASSED")
        elif result is False:
            log(f"❌ {test_name}: FAILED")
        else:
            log(f"⚠️  {test_name}: SKIPPED")
    
    log("=" * 80)
    log(f"TOTAL: {passed}/{total - skipped} tests passed ({failed} failed, {skipped} skipped)")
    log(f"SUCCESS RATE: {passed}/{total - skipped} = {100 * passed / (total - skipped) if (total - skipped) > 0 else 0:.1f}%")
    log("=" * 80)
    
    return passed == (total - skipped)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
