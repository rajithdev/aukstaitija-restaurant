#!/usr/bin/env python3
"""
Backend test suite for Aukstaitija Restaurant Table Lifecycle
Tests all 7 scenarios from the review request
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://277842d5-3eca-4a9e-bbec-aeb8b56bce5e.preview.emergentagent.com/api"
ADMIN_TOKEN = "admin123"
HEADERS_ADMIN = {"x-admin-token": ADMIN_TOKEN, "Content-Type": "application/json"}
HEADERS_NO_AUTH = {"Content-Type": "application/json"}

def log_test(test_name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"  Details: {details}")
    return passed

def cleanup_table(table_id):
    """Helper to reset table state: close session + mark cleaned"""
    try:
        requests.post(f"{BASE_URL}/tables/{table_id}/close", headers=HEADERS_ADMIN)
        requests.post(f"{BASE_URL}/tables/{table_id}/cleaned", headers=HEADERS_ADMIN)
    except:
        pass

# ============================================================
# TEST 1: Tables list/detail endpoints
# ============================================================
def test_tables_endpoints():
    print("\n=== TEST 1: Tables list/detail endpoints ===")
    results = []
    
    # 1.1: GET /api/tables → 200, array length 10
    try:
        resp = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        data = resp.json()
        passed = resp.status_code == 200 and isinstance(data, list) and len(data) == 10
        results.append(log_test("GET /api/tables returns 10 tables", passed, 
                               f"Status: {resp.status_code}, Count: {len(data) if isinstance(data, list) else 'N/A'}"))
        
        # Check fields
        if passed and len(data) > 0:
            t = data[0]
            has_fields = all(k in t for k in ['id', 'number', 'capacity', 'status', 'section', 'x', 'y', 'active_session', 'active_orders', 'upcoming_reservation'])
            results.append(log_test("Table has all required fields", has_fields, 
                                   f"Fields: {list(t.keys())}"))
    except Exception as e:
        results.append(log_test("GET /api/tables", False, str(e)))
    
    # 1.2: GET /api/tables/t1 → 200, has active_session and orders
    try:
        resp = requests.get(f"{BASE_URL}/tables/t1", headers=HEADERS_ADMIN)
        data = resp.json()
        passed = resp.status_code == 200 and 'active_session' in data and 'orders' in data
        results.append(log_test("GET /api/tables/t1 returns detail", passed, 
                               f"Status: {resp.status_code}, Has active_session: {'active_session' in data}"))
    except Exception as e:
        results.append(log_test("GET /api/tables/t1", False, str(e)))
    
    # 1.3: GET /api/tables/nope → 404
    try:
        resp = requests.get(f"{BASE_URL}/tables/nope", headers=HEADERS_ADMIN)
        passed = resp.status_code == 404
        results.append(log_test("GET /api/tables/nope returns 404", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("GET /api/tables/nope", False, str(e)))
    
    # 1.4: GET /api/tables/t1/info → 200, PUBLIC (no auth)
    try:
        resp = requests.get(f"{BASE_URL}/tables/t1/info", headers=HEADERS_NO_AUTH)
        data = resp.json()
        passed = resp.status_code == 200 and all(k in data for k in ['id', 'number', 'capacity', 'section', 'status'])
        results.append(log_test("GET /api/tables/t1/info (PUBLIC) works", passed, 
                               f"Status: {resp.status_code}, Fields: {list(data.keys()) if isinstance(data, dict) else 'N/A'}"))
    except Exception as e:
        results.append(log_test("GET /api/tables/t1/info", False, str(e)))
    
    # 1.5: PUT /api/tables/t1 without admin → 401
    try:
        resp = requests.put(f"{BASE_URL}/tables/t1", 
                           headers=HEADERS_NO_AUTH, 
                           json={"status": "out_of_service"})
        passed = resp.status_code == 401
        results.append(log_test("PUT /api/tables/t1 without admin returns 401", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("PUT /api/tables/t1 no auth", False, str(e)))
    
    # 1.6: PUT /api/tables/t1 with admin → 200, status updated
    try:
        resp = requests.put(f"{BASE_URL}/tables/t1", 
                           headers=HEADERS_ADMIN, 
                           json={"status": "out_of_service"})
        data = resp.json()
        passed = resp.status_code == 200 and data.get('status') == 'out_of_service'
        results.append(log_test("PUT /api/tables/t1 with admin updates status", passed, 
                               f"Status: {resp.status_code}, New status: {data.get('status')}"))
        
        # Reset back to available
        requests.put(f"{BASE_URL}/tables/t1", headers=HEADERS_ADMIN, json={"status": "available"})
    except Exception as e:
        results.append(log_test("PUT /api/tables/t1 with admin", False, str(e)))
    
    return all(results)

# ============================================================
# TEST 2: Walk-in seating
# ============================================================
def test_walkin_seating():
    print("\n=== TEST 2: Walk-in seating ===")
    results = []
    cleanup_table('t5')
    
    # 2.1: Without admin token → 401
    try:
        resp = requests.post(f"{BASE_URL}/tables/t5/walkin", 
                            headers=HEADERS_NO_AUTH, 
                            json={"guests": 4, "customer_name": "Petras Kazlauskas"})
        passed = resp.status_code == 401
        results.append(log_test("POST /api/tables/t5/walkin without admin returns 401", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Walk-in without auth", False, str(e)))
    
    # 2.2: With admin token → 200, creates session
    try:
        resp = requests.post(f"{BASE_URL}/tables/t5/walkin", 
                            headers=HEADERS_ADMIN, 
                            json={"guests": 4, "customer_name": "Petras Kazlauskas"})
        data = resp.json()
        passed = resp.status_code == 200 and data.get('ok') == True and 'session' in data
        session_data = data.get('session', {})
        session_checks = (
            session_data.get('session_status') == 'active' and
            session_data.get('origin') == 'walkin' and
            session_data.get('customer_name') == 'Petras Kazlauskas'
        )
        results.append(log_test("POST /api/tables/t5/walkin creates session", passed and session_checks, 
                               f"Status: {resp.status_code}, Session status: {session_data.get('session_status')}, Origin: {session_data.get('origin')}"))
    except Exception as e:
        results.append(log_test("Walk-in with admin", False, str(e)))
    
    # 2.3: Verify table status is 'occupied'
    try:
        resp = requests.get(f"{BASE_URL}/tables/t5", headers=HEADERS_ADMIN)
        data = resp.json()
        passed = data.get('status') == 'occupied' and data.get('active_session') is not None
        results.append(log_test("Table t5 status is 'occupied' after walk-in", passed, 
                               f"Status: {data.get('status')}, Has session: {data.get('active_session') is not None}"))
    except Exception as e:
        results.append(log_test("Verify t5 occupied", False, str(e)))
    
    # 2.4: Try walk-in again on same table → 409
    try:
        resp = requests.post(f"{BASE_URL}/tables/t5/walkin", 
                            headers=HEADERS_ADMIN, 
                            json={"guests": 2, "customer_name": "Jonas Petraitis"})
        passed = resp.status_code == 409
        results.append(log_test("Second walk-in on t5 returns 409", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Second walk-in", False, str(e)))
    
    # 2.5: Cleanup - close and clean
    try:
        resp1 = requests.post(f"{BASE_URL}/tables/t5/close", headers=HEADERS_ADMIN)
        resp2 = requests.post(f"{BASE_URL}/tables/t5/cleaned", headers=HEADERS_ADMIN)
        passed = resp1.status_code == 200 and resp2.status_code == 200
        results.append(log_test("Cleanup t5 (close + cleaned)", passed, 
                               f"Close: {resp1.status_code}, Cleaned: {resp2.status_code}"))
        
        # Verify available
        resp = requests.get(f"{BASE_URL}/tables/t5", headers=HEADERS_ADMIN)
        data = resp.json()
        passed = data.get('status') == 'available'
        results.append(log_test("Table t5 status is 'available' after cleanup", passed, 
                               f"Status: {data.get('status')}"))
    except Exception as e:
        results.append(log_test("Cleanup t5", False, str(e)))
    
    return all(results)

# ============================================================
# TEST 3: QR/dine-in order auto-creates session
# ============================================================
def test_qr_order_session():
    print("\n=== TEST 3: QR/dine-in order auto-creates session ===")
    results = []
    cleanup_table('t2')
    
    # 3.1: POST /api/orders with table_id → creates session, occupies table
    try:
        order_data = {
            "items": [
                {"id": "cepelinai", "name": "Cepelinai", "price": 14.5, "quantity": 1}
            ],
            "table_id": "t2",
            "customer": {"name": "Gintarė Jankauskas"}
        }
        resp = requests.post(f"{BASE_URL}/orders", headers=HEADERS_NO_AUTH, json=order_data)
        data = resp.json()
        passed = (
            resp.status_code == 200 and
            data.get('order_type') == 'dine_in' and
            data.get('table_id') == 't2' and
            data.get('table_number') == 2 and
            data.get('session_id') is not None and
            data.get('type') == 'dine-in'
        )
        first_session_id = data.get('session_id')
        results.append(log_test("POST /api/orders with table_id creates session", passed, 
                               f"Status: {resp.status_code}, Order type: {data.get('order_type')}, Session ID: {first_session_id}"))
    except Exception as e:
        results.append(log_test("QR order creates session", False, str(e)))
        first_session_id = None
    
    # 3.2: Verify table t2 is occupied with session origin='qr_order'
    try:
        resp = requests.get(f"{BASE_URL}/tables/t2", headers=HEADERS_ADMIN)
        data = resp.json()
        session = data.get('active_session', {})
        passed = (
            data.get('status') == 'occupied' and
            session.get('origin') == 'qr_order' and
            len(data.get('orders', [])) > 0
        )
        results.append(log_test("Table t2 occupied with origin='qr_order'", passed, 
                               f"Status: {data.get('status')}, Origin: {session.get('origin')}, Orders: {len(data.get('orders', []))}"))
    except Exception as e:
        results.append(log_test("Verify t2 occupied", False, str(e)))
    
    # 3.3: POST second order for same table → reuses session
    try:
        order_data2 = {
            "items": [
                {"id": "kibinai", "name": "Kibinai", "price": 6.5, "quantity": 2}
            ],
            "table_id": "t2",
            "customer": {"name": "Gintarė Jankauskas"}
        }
        resp = requests.post(f"{BASE_URL}/orders", headers=HEADERS_NO_AUTH, json=order_data2)
        data = resp.json()
        second_session_id = data.get('session_id')
        passed = (
            resp.status_code == 200 and
            second_session_id == first_session_id
        )
        results.append(log_test("Second order reuses same session", passed, 
                               f"Status: {resp.status_code}, Same session: {second_session_id == first_session_id}"))
    except Exception as e:
        results.append(log_test("Second QR order", False, str(e)))
    
    # 3.4: Cleanup
    cleanup_table('t2')
    results.append(log_test("Cleanup t2", True))
    
    return all(results)

# ============================================================
# TEST 4: Reservation check-in
# ============================================================
def test_reservation_checkin():
    print("\n=== TEST 4: Reservation check-in ===")
    results = []
    cleanup_table('t1')
    
    # 4.1: Create a reservation
    reservation_id = None
    try:
        res_data = {
            "date": "2099-12-30",
            "time": "19:30",
            "guests": 2,
            "name": "Ona Petraitė",
            "phone": "+37061234567"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data)
        data = resp.json()
        reservation_id = data.get('id')
        passed = resp.status_code == 200 and reservation_id is not None
        results.append(log_test("Create reservation", passed, 
                               f"Status: {resp.status_code}, ID: {reservation_id}"))
    except Exception as e:
        results.append(log_test("Create reservation", False, str(e)))
        return False
    
    # 4.2: Check-in without admin → 401
    try:
        resp = requests.post(f"{BASE_URL}/reservations/{reservation_id}/checkin", 
                            headers=HEADERS_NO_AUTH, 
                            json={"table_id": "t1"})
        passed = resp.status_code == 401
        results.append(log_test("Check-in without admin returns 401", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Check-in no auth", False, str(e)))
    
    # 4.3: Check-in with admin → 200, creates session
    try:
        resp = requests.post(f"{BASE_URL}/reservations/{reservation_id}/checkin", 
                            headers=HEADERS_ADMIN, 
                            json={"table_id": "t1"})
        data = resp.json()
        session = data.get('session', {})
        passed = (
            resp.status_code == 200 and
            data.get('ok') == True and
            session.get('origin') == 'reservation'
        )
        results.append(log_test("Check-in with admin creates session", passed, 
                               f"Status: {resp.status_code}, Origin: {session.get('origin')}"))
    except Exception as e:
        results.append(log_test("Check-in with admin", False, str(e)))
    
    # 4.4: Verify reservation status is 'checked_in'
    try:
        resp = requests.get(f"{BASE_URL}/reservations", headers=HEADERS_ADMIN)
        data = resp.json()
        res = next((r for r in data if r.get('id') == reservation_id), None)
        passed = res and res.get('status') == 'checked_in' and 'checked_in_at' in res and res.get('table_id') == 't1'
        results.append(log_test("Reservation status is 'checked_in'", passed, 
                               f"Status: {res.get('status') if res else 'N/A'}, Table: {res.get('table_id') if res else 'N/A'}"))
    except Exception as e:
        results.append(log_test("Verify reservation checked_in", False, str(e)))
    
    # 4.5: Verify table t1 is occupied
    try:
        resp = requests.get(f"{BASE_URL}/tables/t1", headers=HEADERS_ADMIN)
        data = resp.json()
        passed = data.get('status') == 'occupied'
        results.append(log_test("Table t1 status is 'occupied'", passed, 
                               f"Status: {data.get('status')}"))
    except Exception as e:
        results.append(log_test("Verify t1 occupied", False, str(e)))
    
    # 4.6: Try check-in again → 409
    try:
        resp = requests.post(f"{BASE_URL}/reservations/{reservation_id}/checkin", 
                            headers=HEADERS_ADMIN, 
                            json={"table_id": "t1"})
        passed = resp.status_code == 409
        results.append(log_test("Second check-in returns 409", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Second check-in", False, str(e)))
    
    # 4.7: Test check-in without table_id (should fail if reservation has no preassigned table)
    # First create another reservation without table_id
    try:
        res_data2 = {
            "date": "2099-12-31",
            "time": "20:00",
            "guests": 4,
            "name": "Vytautas Žemaitis",
            "phone": "+37062345678"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data2)
        res_id2 = resp.json().get('id')
        
        # Try check-in without table_id
        resp = requests.post(f"{BASE_URL}/reservations/{res_id2}/checkin", 
                            headers=HEADERS_ADMIN, 
                            json={})
        passed = resp.status_code == 400
        results.append(log_test("Check-in without table_id returns 400", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Check-in without table_id", False, str(e)))
    
    # 4.8: Cleanup
    cleanup_table('t1')
    results.append(log_test("Cleanup t1", True))
    
    return all(results)

# ============================================================
# TEST 5: Bill + pay flow
# ============================================================
def test_bill_pay_flow():
    print("\n=== TEST 5: Bill + pay flow ===")
    results = []
    cleanup_table('t8')
    
    # 5.1: Walk-in t8
    try:
        resp = requests.post(f"{BASE_URL}/tables/t8/walkin", 
                            headers=HEADERS_ADMIN, 
                            json={"guests": 2, "customer_name": "Rūta Balčiūnaitė"})
        passed = resp.status_code == 200
        results.append(log_test("Walk-in t8", passed, f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Walk-in t8", False, str(e)))
        return False
    
    # 5.2: Place 2 orders totaling ~€40
    order_ids = []
    try:
        # Order 1: 2x Cepelinai (€14.50 each) = €29.00
        order1 = {
            "items": [
                {"id": "cepelinai", "name": "Cepelinai", "price": 14.50, "quantity": 2}
            ],
            "table_id": "t8",
            "customer": {"name": "Rūta Balčiūnaitė"}
        }
        resp1 = requests.post(f"{BASE_URL}/orders", headers=HEADERS_NO_AUTH, json=order1)
        order_ids.append(resp1.json().get('id'))
        
        # Order 2: 1x Kibinai (€6.50) + 1x Rye Bread (€5.00) = €11.50
        order2 = {
            "items": [
                {"id": "kibinai", "name": "Kibinai", "price": 6.50, "quantity": 1},
                {"id": "rye-bread", "name": "Rye Bread", "price": 5.00, "quantity": 1}
            ],
            "table_id": "t8",
            "customer": {"name": "Rūta Balčiūnaitė"}
        }
        resp2 = requests.post(f"{BASE_URL}/orders", headers=HEADERS_NO_AUTH, json=order2)
        order_ids.append(resp2.json().get('id'))
        
        passed = resp1.status_code == 200 and resp2.status_code == 200
        results.append(log_test("Place 2 orders on t8", passed, 
                               f"Order 1: {resp1.status_code}, Order 2: {resp2.status_code}"))
    except Exception as e:
        results.append(log_test("Place orders", False, str(e)))
    
    # 5.3: GET /api/tables/t8/bill without admin → 401
    try:
        resp = requests.get(f"{BASE_URL}/tables/t8/bill", headers=HEADERS_NO_AUTH)
        passed = resp.status_code == 401
        results.append(log_test("GET bill without admin returns 401", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("GET bill no auth", False, str(e)))
    
    # 5.4: GET /api/tables/t8/bill with admin → 200, verify calculations
    try:
        resp = requests.get(f"{BASE_URL}/tables/t8/bill", headers=HEADERS_ADMIN)
        data = resp.json()
        
        # Expected: subtotal = 29.00 + 11.50 = 40.50
        # tax = 40.50 * 0.21 = 8.505 → 8.51
        # total = 40.50 + 8.51 = 49.01
        expected_subtotal = 40.50
        expected_tax = 8.51
        expected_total = 49.01
        
        passed = (
            resp.status_code == 200 and
            abs(data.get('subtotal', 0) - expected_subtotal) < 0.01 and
            abs(data.get('tax', 0) - expected_tax) < 0.01 and
            abs(data.get('total', 0) - expected_total) < 0.01 and
            data.get('invoice_number', '').startswith('INV') and
            'table' in data and
            'session' in data
        )
        results.append(log_test("GET bill with admin returns correct calculations", passed, 
                               f"Subtotal: {data.get('subtotal')}, Tax: {data.get('tax')}, Total: {data.get('total')}, Invoice: {data.get('invoice_number')}"))
    except Exception as e:
        results.append(log_test("GET bill with admin", False, str(e)))
    
    # 5.5: POST /api/tables/t8/pay with admin → 200, marks orders paid
    try:
        resp = requests.post(f"{BASE_URL}/tables/t8/pay", 
                            headers=HEADERS_ADMIN, 
                            json={"payment_method": "card"})
        data = resp.json()
        passed = resp.status_code == 200 and data.get('ok') == True
        results.append(log_test("POST pay with admin", passed, 
                               f"Status: {resp.status_code}, OK: {data.get('ok')}"))
    except Exception as e:
        results.append(log_test("POST pay", False, str(e)))
    
    # 5.6: Verify table status is 'cleaning'
    try:
        resp = requests.get(f"{BASE_URL}/tables/t8", headers=HEADERS_ADMIN)
        data = resp.json()
        passed = data.get('status') == 'cleaning'
        results.append(log_test("Table t8 status is 'cleaning' after pay", passed, 
                               f"Status: {data.get('status')}"))
    except Exception as e:
        results.append(log_test("Verify t8 cleaning", False, str(e)))
    
    # 5.7: Verify orders are paid and delivered
    try:
        all_paid = True
        for oid in order_ids:
            resp = requests.get(f"{BASE_URL}/orders/{oid}", headers=HEADERS_ADMIN)
            order = resp.json()
            if order.get('payment_status') != 'paid' or order.get('payment_method') != 'card' or order.get('status') != 'delivered':
                all_paid = False
                break
        results.append(log_test("All orders marked paid and delivered", all_paid))
    except Exception as e:
        results.append(log_test("Verify orders paid", False, str(e)))
    
    # 5.8: Verify session is completed
    try:
        resp = requests.get(f"{BASE_URL}/tables/t8", headers=HEADERS_ADMIN)
        data = resp.json()
        # After pay, session should be completed, so active_session should be null
        passed = data.get('active_session') is None
        results.append(log_test("Session is completed (no active session)", passed, 
                               f"Active session: {data.get('active_session')}"))
    except Exception as e:
        results.append(log_test("Verify session completed", False, str(e)))
    
    # 5.9: POST /api/tables/t8/cleaned → status='available'
    try:
        resp = requests.post(f"{BASE_URL}/tables/t8/cleaned", headers=HEADERS_ADMIN)
        passed = resp.status_code == 200
        
        resp2 = requests.get(f"{BASE_URL}/tables/t8", headers=HEADERS_ADMIN)
        data = resp2.json()
        passed = passed and data.get('status') == 'available'
        results.append(log_test("Table t8 cleaned and available", passed, 
                               f"Status: {data.get('status')}"))
    except Exception as e:
        results.append(log_test("Clean t8", False, str(e)))
    
    return all(results)

# ============================================================
# TEST 6: Auto no-show + reserved status
# ============================================================
def test_auto_status_updates():
    print("\n=== TEST 6: Auto no-show + reserved status ===")
    results = []
    cleanup_table('t4')
    
    # 6.1: Create future reservation (now + 1 hour)
    future_res_id = None
    try:
        now = datetime.now()
        future_time = now + timedelta(hours=1)
        res_data = {
            "date": future_time.strftime("%Y-%m-%d"),
            "time": future_time.strftime("%H:%M"),
            "guests": 2,
            "name": "Darius Mockus",
            "phone": "+37063456789"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data)
        data = resp.json()
        future_res_id = data.get('id')
        passed = resp.status_code == 200
        results.append(log_test("Create future reservation (now+1h)", passed, 
                               f"Status: {resp.status_code}, ID: {future_res_id}"))
    except Exception as e:
        results.append(log_test("Create future reservation", False, str(e)))
    
    # 6.2: Assign table to future reservation
    try:
        resp = requests.put(f"{BASE_URL}/reservations/{future_res_id}", 
                           headers=HEADERS_ADMIN, 
                           json={"table_id": "t4"})
        passed = resp.status_code == 200
        results.append(log_test("Assign table t4 to future reservation", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("Assign table", False, str(e)))
    
    # 6.3: GET /api/tables → t4 should be 'reserved' (auto-set by autoUpdateTableStatuses)
    try:
        resp = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        data = resp.json()
        t4 = next((t for t in data if t.get('id') == 't4'), None)
        passed = t4 and t4.get('status') == 'reserved'
        results.append(log_test("Table t4 auto-marked as 'reserved'", passed, 
                               f"Status: {t4.get('status') if t4 else 'N/A'}"))
    except Exception as e:
        results.append(log_test("Verify t4 reserved", False, str(e)))
    
    # 6.4: Create past reservation (now - 2 hours) for no-show test
    past_res_id = None
    try:
        now = datetime.now()
        past_time = now - timedelta(hours=2)
        res_data = {
            "date": past_time.strftime("%Y-%m-%d"),
            "time": past_time.strftime("%H:%M"),
            "guests": 4,
            "name": "Jurgita Navickaitė",
            "phone": "+37064567890"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data)
        data = resp.json()
        past_res_id = data.get('id')
        passed = resp.status_code == 200
        results.append(log_test("Create past reservation (now-2h)", passed, 
                               f"Status: {resp.status_code}, ID: {past_res_id}"))
        
        # Assign a table to the past reservation so it can be checked by autoUpdateTableStatuses
        if past_res_id:
            requests.put(f"{BASE_URL}/reservations/{past_res_id}", 
                        headers=HEADERS_ADMIN, 
                        json={"table_id": "t3"})
    except Exception as e:
        results.append(log_test("Create past reservation", False, str(e)))
    
    # 6.5: Trigger autoUpdateTableStatuses by calling GET /api/tables
    try:
        resp = requests.get(f"{BASE_URL}/tables", headers=HEADERS_ADMIN)
        passed = resp.status_code == 200
        results.append(log_test("Trigger autoUpdateTableStatuses", passed))
    except Exception as e:
        results.append(log_test("Trigger auto update", False, str(e)))
    
    # 6.6: Verify past reservation is marked as 'no_show'
    try:
        resp = requests.get(f"{BASE_URL}/reservations", headers=HEADERS_ADMIN)
        data = resp.json()
        past_res = next((r for r in data if r.get('id') == past_res_id), None)
        passed = past_res and past_res.get('status') == 'no_show' and 'no_show_at' in past_res
        results.append(log_test("Past reservation auto-marked as 'no_show'", passed, 
                               f"Status: {past_res.get('status') if past_res else 'N/A'}, Has no_show_at: {'no_show_at' in past_res if past_res else False}"))
    except Exception as e:
        results.append(log_test("Verify no_show", False, str(e)))
    
    # Cleanup: cancel future reservation to free t4
    try:
        requests.put(f"{BASE_URL}/reservations/{future_res_id}", 
                    headers=HEADERS_ADMIN, 
                    json={"status": "cancelled"})
    except:
        pass
    
    return all(results)

# ============================================================
# TEST 7: Reservation status updates
# ============================================================
def test_reservation_status_updates():
    print("\n=== TEST 7: Reservation status updates ===")
    results = []
    
    # 7.1: Create a test reservation
    res_id = None
    try:
        res_data = {
            "date": "2099-12-25",
            "time": "18:00",
            "guests": 6,
            "name": "Audrius Stankevičius",
            "phone": "+37065678901"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data)
        data = resp.json()
        res_id = data.get('id')
        passed = resp.status_code == 200
        results.append(log_test("Create test reservation", passed, 
                               f"Status: {resp.status_code}, ID: {res_id}"))
    except Exception as e:
        results.append(log_test("Create reservation", False, str(e)))
        return False
    
    # 7.2: PUT without admin → 401
    try:
        resp = requests.put(f"{BASE_URL}/reservations/{res_id}", 
                           headers=HEADERS_NO_AUTH, 
                           json={"status": "cancelled"})
        passed = resp.status_code == 401
        results.append(log_test("PUT reservation without admin returns 401", passed, 
                               f"Status: {resp.status_code}"))
    except Exception as e:
        results.append(log_test("PUT no auth", False, str(e)))
    
    # 7.3: PUT status='cancelled' with admin → 200
    try:
        resp = requests.put(f"{BASE_URL}/reservations/{res_id}", 
                           headers=HEADERS_ADMIN, 
                           json={"status": "cancelled"})
        data = resp.json()
        passed = resp.status_code == 200 and data.get('status') == 'cancelled'
        results.append(log_test("PUT status='cancelled'", passed, 
                               f"Status: {resp.status_code}, New status: {data.get('status')}"))
    except Exception as e:
        results.append(log_test("PUT cancelled", False, str(e)))
    
    # 7.4: Create another reservation for no_show test
    res_id2 = None
    try:
        res_data = {
            "date": "2099-12-26",
            "time": "19:00",
            "guests": 3,
            "name": "Laima Žukauskas",
            "phone": "+37066789012"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data)
        res_id2 = resp.json().get('id')
        passed = resp.status_code == 200
        results.append(log_test("Create second reservation", passed))
    except Exception as e:
        results.append(log_test("Create second reservation", False, str(e)))
    
    # 7.5: PUT status='no_show' → sets no_show_at
    try:
        resp = requests.put(f"{BASE_URL}/reservations/{res_id2}", 
                           headers=HEADERS_ADMIN, 
                           json={"status": "no_show"})
        data = resp.json()
        passed = resp.status_code == 200 and data.get('status') == 'no_show' and 'no_show_at' in data
        results.append(log_test("PUT status='no_show' sets no_show_at", passed, 
                               f"Status: {data.get('status')}, Has no_show_at: {'no_show_at' in data}"))
    except Exception as e:
        results.append(log_test("PUT no_show", False, str(e)))
    
    # 7.6: Create third reservation for completed test
    res_id3 = None
    try:
        res_data = {
            "date": "2099-12-27",
            "time": "20:00",
            "guests": 5,
            "name": "Mindaugas Rimkus",
            "phone": "+37067890123"
        }
        resp = requests.post(f"{BASE_URL}/reservations", headers=HEADERS_NO_AUTH, json=res_data)
        res_id3 = resp.json().get('id')
        passed = resp.status_code == 200
        results.append(log_test("Create third reservation", passed))
    except Exception as e:
        results.append(log_test("Create third reservation", False, str(e)))
    
    # 7.7: PUT status='completed' → sets completed_at
    try:
        resp = requests.put(f"{BASE_URL}/reservations/{res_id3}", 
                           headers=HEADERS_ADMIN, 
                           json={"status": "completed"})
        data = resp.json()
        passed = resp.status_code == 200 and data.get('status') == 'completed' and 'completed_at' in data
        results.append(log_test("PUT status='completed' sets completed_at", passed, 
                               f"Status: {data.get('status')}, Has completed_at: {'completed_at' in data}"))
    except Exception as e:
        results.append(log_test("PUT completed", False, str(e)))
    
    return all(results)

# ============================================================
# MAIN TEST RUNNER
# ============================================================
def main():
    print("=" * 60)
    print("AUKSTAITIJA RESTAURANT - TABLE LIFECYCLE BACKEND TESTS")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print(f"Admin Token: {ADMIN_TOKEN}")
    print("=" * 60)
    
    test_results = {
        "Test 1: Tables list/detail endpoints": test_tables_endpoints(),
        "Test 2: Walk-in seating": test_walkin_seating(),
        "Test 3: QR/dine-in order auto-creates session": test_qr_order_session(),
        "Test 4: Reservation check-in": test_reservation_checkin(),
        "Test 5: Bill + pay flow": test_bill_pay_flow(),
        "Test 6: Auto no-show + reserved status": test_auto_status_updates(),
        "Test 7: Reservation status updates": test_reservation_status_updates(),
    }
    
    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)
    
    passed_count = sum(1 for v in test_results.values() if v)
    total_count = len(test_results)
    
    for test_name, passed in test_results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("=" * 60)
    print(f"TOTAL: {passed_count}/{total_count} tests passed ({passed_count*100//total_count}%)")
    print("=" * 60)
    
    return passed_count == total_count

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
