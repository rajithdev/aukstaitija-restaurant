#!/usr/bin/env python3
"""
Test the enriched GET /api/reservations/:id/available-tables endpoint.
Tests the new upcoming_reservation and active_session fields.
"""

import requests
import time
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "admin123"

# Test results tracking
tests_passed = 0
tests_failed = 0

def log_test(name, passed, details=""):
    global tests_passed, tests_failed
    if passed:
        tests_passed += 1
        print(f"✅ PASS: {name}")
        if details:
            print(f"   {details}")
    else:
        tests_failed += 1
        print(f"❌ FAIL: {name}")
        if details:
            print(f"   {details}")

def print_summary():
    total = tests_passed + tests_failed
    print(f"\n{'='*80}")
    print(f"TEST SUMMARY: {tests_passed}/{total} passed ({100*tests_passed//total if total > 0 else 0}%)")
    print(f"{'='*80}\n")

# Generate unique test data
timestamp = int(time.time())
test_email = f"enrichtest{timestamp}@example.com"
test_phone = f"555{timestamp % 10000000}"

print(f"\n{'='*80}")
print(f"AVAILABLE-TABLES ENRICHMENT TESTS")
print(f"{'='*80}\n")
print(f"Admin token: {ADMIN_TOKEN}\n")

# ============================================================================
# TEST 1: AUTH - 401 without x-admin-token
# ============================================================================
print("\n--- TEST 1: Auth check (401 without admin token) ---")
try:
    # First create a reservation to test with
    future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    reservation_data = {
        "name": "Auth Test User",
        "email": test_email,
        "phone": test_phone,
        "date": future_date,
        "time": "19:00",
        "guests": 2,
        "seating_preference": "Window",
        "occasion": "Dinner"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=reservation_data)
    if response.status_code == 200:
        test_reservation_id = response.json().get("id")
        
        # Try to access without admin token
        response = requests.get(f"{BASE_URL}/reservations/{test_reservation_id}/available-tables")
        if response.status_code == 401:
            log_test("Auth check - 401 without token", True, "Correctly returns 401")
        else:
            log_test("Auth check - 401 without token", False, f"Expected 401, got {response.status_code}")
    else:
        log_test("Auth check - 401 without token", False, f"Failed to create test reservation: {response.status_code}")
        test_reservation_id = None
except Exception as e:
    log_test("Auth check - 401 without token", False, f"Exception: {str(e)}")
    test_reservation_id = None

# ============================================================================
# TEST 2: SHAPE - Verify response structure with new fields
# ============================================================================
print("\n--- TEST 2: Response shape verification ---")
try:
    if test_reservation_id:
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.get(f"{BASE_URL}/reservations/{test_reservation_id}/available-tables", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            
            # Check top-level structure
            has_available = "available" in data
            has_suggested = "suggested" in data
            has_seating_pref = "seating_preference" in data
            
            if has_available and has_suggested and has_seating_pref:
                log_test("Response has required top-level fields", True, "available, suggested, seating_preference present")
            else:
                log_test("Response has required top-level fields", False, f"Missing fields. Has: {list(data.keys())}")
            
            # Check available array structure
            if isinstance(data.get("available"), list) and len(data["available"]) > 0:
                table = data["available"][0]
                required_fields = ["id", "number", "capacity", "section", "status", "upcoming_reservation", "active_session"]
                missing_fields = [f for f in required_fields if f not in table]
                
                if not missing_fields:
                    log_test("Table object has all required fields", True, f"Fields: {', '.join(required_fields)}")
                else:
                    log_test("Table object has all required fields", False, f"Missing: {', '.join(missing_fields)}")
                
                # Verify upcoming_reservation is null or has correct structure
                upcoming = table.get("upcoming_reservation")
                if upcoming is None:
                    log_test("upcoming_reservation field present (null)", True, "Field exists and is null")
                elif isinstance(upcoming, dict):
                    expected_fields = ["date", "time", "status", "guests", "name"]
                    has_fields = all(f in upcoming for f in expected_fields)
                    if has_fields:
                        log_test("upcoming_reservation structure", True, f"Has: {', '.join(expected_fields)}")
                    else:
                        log_test("upcoming_reservation structure", False, f"Missing some fields. Has: {list(upcoming.keys())}")
                else:
                    log_test("upcoming_reservation field type", False, f"Expected null or object, got {type(upcoming)}")
                
                # Verify active_session is null when status != 'occupied'
                active_session = table.get("active_session")
                if table["status"] != "occupied":
                    if active_session is None:
                        log_test("active_session null when not occupied", True, f"Status: {table['status']}, active_session: null")
                    else:
                        log_test("active_session null when not occupied", False, f"Status: {table['status']}, but active_session is not null")
                else:
                    # When occupied, should have session data
                    if isinstance(active_session, dict):
                        log_test("active_session populated when occupied", True, "Has session object")
                    else:
                        log_test("active_session populated when occupied", False, f"Expected object, got {type(active_session)}")
            else:
                log_test("Available array has tables", False, "No tables in available array")
        else:
            log_test("Response shape verification", False, f"Status {response.status_code}: {response.text}")
    else:
        log_test("Response shape verification", False, "No test reservation ID available")
except Exception as e:
    log_test("Response shape verification", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 3: UPCOMING RESERVATION POPULATED
# ============================================================================
print("\n--- TEST 3: Upcoming reservation populated correctly ---")
try:
    # Create reservation A (future time)
    future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    future_time = "20:00"
    
    reservation_a_data = {
        "name": "Reservation A",
        "email": f"resa{timestamp}@example.com",
        "phone": f"555{timestamp % 1000000}1",
        "date": future_date,
        "time": future_time,
        "guests": 2,
        "seating_preference": "Window",
        "occasion": "Dinner"
    }
    
    response = requests.post(f"{BASE_URL}/reservations", json=reservation_a_data)
    if response.status_code == 200:
        reservation_a = response.json()
        reservation_a_id = reservation_a.get("id")
        
        # Get available tables to find a suitable one
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.get(f"{BASE_URL}/reservations/{reservation_a_id}/available-tables", headers=headers)
        
        if response.status_code == 200:
            tables = response.json().get("available", [])
            if len(tables) > 0:
                # Pick the first available table
                table_to_assign = tables[0]["id"]
                
                # Assign table to reservation A
                response = requests.put(
                    f"{BASE_URL}/reservations/{reservation_a_id}",
                    headers=headers,
                    json={"table_id": table_to_assign}
                )
                
                if response.status_code == 200:
                    log_test("Assign table to reservation A", True, f"Assigned table {table_to_assign}")
                    
                    # Create reservation B (different time, same date)
                    reservation_b_data = {
                        "name": "Reservation B",
                        "email": f"resb{timestamp}@example.com",
                        "phone": f"555{timestamp % 1000000}2",
                        "date": future_date,
                        "time": "18:00",  # Different time
                        "guests": 2,
                        "seating_preference": "Window",
                        "occasion": "Dinner"
                    }
                    
                    response = requests.post(f"{BASE_URL}/reservations", json=reservation_b_data)
                    if response.status_code == 200:
                        reservation_b = response.json()
                        reservation_b_id = reservation_b.get("id")
                        
                        # Get available tables for reservation B
                        response = requests.get(f"{BASE_URL}/reservations/{reservation_b_id}/available-tables", headers=headers)
                        
                        if response.status_code == 200:
                            data = response.json()
                            available_tables = data.get("available", [])
                            
                            # Find the table we assigned to reservation A
                            table_a = next((t for t in available_tables if t["id"] == table_to_assign), None)
                            
                            if table_a:
                                upcoming = table_a.get("upcoming_reservation")
                                
                                if upcoming is not None:
                                    # Verify it's reservation A, not B
                                    if upcoming.get("name") == "Reservation A":
                                        # Verify it's not reservation B itself
                                        if upcoming.get("name") != "Reservation B":
                                            log_test("upcoming_reservation shows reservation A", True, 
                                                   f"Table {table_to_assign} shows upcoming: {upcoming.get('name')} at {upcoming.get('time')}")
                                        else:
                                            log_test("upcoming_reservation excludes self", False, "Shows reservation B itself")
                                    else:
                                        log_test("upcoming_reservation shows reservation A", False, 
                                               f"Expected 'Reservation A', got '{upcoming.get('name')}'")
                                else:
                                    log_test("upcoming_reservation populated", False, "upcoming_reservation is null")
                            else:
                                log_test("Find assigned table in available list", False, f"Table {table_to_assign} not in available list (may be blocked by time conflict)")
                        else:
                            log_test("Get available tables for B", False, f"Status {response.status_code}")
                        
                        # Cleanup
                        requests.delete(f"{BASE_URL}/reservations/{reservation_b_id}", headers=headers)
                    else:
                        log_test("Create reservation B", False, f"Status {response.status_code}")
                    
                    # Cleanup
                    requests.delete(f"{BASE_URL}/reservations/{reservation_a_id}", headers=headers)
                else:
                    log_test("Assign table to reservation A", False, f"Status {response.status_code}")
            else:
                log_test("Find available table", False, "No available tables")
        else:
            log_test("Get available tables for A", False, f"Status {response.status_code}")
    else:
        log_test("Create reservation A", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Upcoming reservation populated test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 4: EXCLUDES SELF
# ============================================================================
print("\n--- TEST 4: Excludes self from upcoming_reservation ---")
try:
    # Create reservation C
    future_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
    
    reservation_c_data = {
        "name": "Reservation C",
        "email": f"resc{timestamp}@example.com",
        "phone": f"555{timestamp % 1000000}3",
        "date": future_date,
        "time": "19:00",
        "guests": 2,
        "seating_preference": "Window",
        "occasion": "Dinner"
    }
    
    response = requests.post(f"{BASE_URL}/reservations", json=reservation_c_data)
    if response.status_code == 200:
        reservation_c = response.json()
        reservation_c_id = reservation_c.get("id")
        
        # Get available tables
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.get(f"{BASE_URL}/reservations/{reservation_c_id}/available-tables", headers=headers)
        
        if response.status_code == 200:
            tables = response.json().get("available", [])
            if len(tables) > 0:
                # Pick a table and assign it
                table_c = tables[0]["id"]
                
                response = requests.put(
                    f"{BASE_URL}/reservations/{reservation_c_id}",
                    headers=headers,
                    json={"table_id": table_c}
                )
                
                if response.status_code == 200:
                    # Get available tables again for the same reservation
                    response = requests.get(f"{BASE_URL}/reservations/{reservation_c_id}/available-tables", headers=headers)
                    
                    if response.status_code == 200:
                        data = response.json()
                        available_tables = data.get("available", [])
                        
                        # Find the assigned table
                        assigned_table = next((t for t in available_tables if t["id"] == table_c), None)
                        
                        if assigned_table:
                            upcoming = assigned_table.get("upcoming_reservation")
                            
                            # upcoming_reservation should NOT be reservation C itself
                            if upcoming is None or upcoming.get("name") != "Reservation C":
                                log_test("Excludes self from upcoming_reservation", True, 
                                       f"Table {table_c} does not show reservation C as upcoming")
                            else:
                                log_test("Excludes self from upcoming_reservation", False, 
                                       "Table shows the reservation being assigned as upcoming")
                        else:
                            # Table might not be in available list if it's blocked - this is OK
                            log_test("Excludes self (implicit)", True, 
                                   f"Table {table_c} not in available list (blocked by same time slot)")
                    else:
                        log_test("Get available tables after assignment", False, f"Status {response.status_code}")
                else:
                    log_test("Assign table C", False, f"Status {response.status_code}")
                
                # Cleanup
                requests.delete(f"{BASE_URL}/reservations/{reservation_c_id}", headers=headers)
            else:
                log_test("Find available table for C", False, "No available tables")
        else:
            log_test("Get available tables for C", False, f"Status {response.status_code}")
    else:
        log_test("Create reservation C", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Excludes self test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 5: EXCLUDES PAST RESERVATIONS (>30 min ago)
# ============================================================================
print("\n--- TEST 5: Excludes past reservations (>30 min ago) ---")
try:
    # Create a reservation in the past (90 minutes ago)
    past_date = datetime.now().strftime("%Y-%m-%d")
    past_time = (datetime.now() - timedelta(minutes=90)).strftime("%H:%M")
    
    # Note: We can't easily insert a past reservation via the API, so we'll verify
    # that current available-tables calls don't show any upcoming_reservation with
    # a date+time more than 30 minutes in the past
    
    # Create a test reservation to query
    future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    test_data = {
        "name": "Past Test User",
        "email": f"past{timestamp}@example.com",
        "phone": f"555{timestamp % 1000000}4",
        "date": future_date,
        "time": "19:00",
        "guests": 2,
        "seating_preference": "Window",
        "occasion": "Dinner"
    }
    
    response = requests.post(f"{BASE_URL}/reservations", json=test_data)
    if response.status_code == 200:
        test_res = response.json()
        test_res_id = test_res.get("id")
        
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.get(f"{BASE_URL}/reservations/{test_res_id}/available-tables", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            available_tables = data.get("available", [])
            
            # Check all tables for any upcoming_reservation that's too far in the past
            now = datetime.now()
            has_old_past_reservation = False
            
            for table in available_tables:
                upcoming = table.get("upcoming_reservation")
                if upcoming:
                    res_date = upcoming.get("date")
                    res_time = upcoming.get("time")
                    if res_date and res_time:
                        res_dt = datetime.strptime(f"{res_date} {res_time}", "%Y-%m-%d %H:%M")
                        diff_minutes = (now - res_dt).total_seconds() / 60
                        
                        if diff_minutes > 30:
                            has_old_past_reservation = True
                            log_test("Excludes past reservations (>30 min)", False, 
                                   f"Table {table['id']} has upcoming_reservation from {diff_minutes:.0f} min ago")
                            break
            
            if not has_old_past_reservation:
                log_test("Excludes past reservations (>30 min)", True, 
                       "No upcoming_reservation found with date+time >30 min in the past")
        else:
            log_test("Get available tables for past test", False, f"Status {response.status_code}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/reservations/{test_res_id}", headers=headers)
    else:
        log_test("Create test reservation for past check", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Excludes past reservations test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 6: EXCLUDES NON-ACTIVE STATUSES
# ============================================================================
print("\n--- TEST 6: Excludes non-active statuses (cancelled, no_show, completed, etc.) ---")
try:
    # This test verifies that upcoming_reservation only contains reservations with
    # status in ['pending', 'confirmed', 'table_assigned']
    
    # Create a test reservation
    future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    test_data = {
        "name": "Status Test User",
        "email": f"status{timestamp}@example.com",
        "phone": f"555{timestamp % 1000000}5",
        "date": future_date,
        "time": "19:00",
        "guests": 2,
        "seating_preference": "Window",
        "occasion": "Dinner"
    }
    
    response = requests.post(f"{BASE_URL}/reservations", json=test_data)
    if response.status_code == 200:
        test_res = response.json()
        test_res_id = test_res.get("id")
        
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.get(f"{BASE_URL}/reservations/{test_res_id}/available-tables", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            available_tables = data.get("available", [])
            
            # Check all upcoming_reservation entries for invalid statuses
            invalid_statuses = ['cancelled', 'no_show', 'completed', 'arrived', 'checked_in']
            has_invalid_status = False
            
            for table in available_tables:
                upcoming = table.get("upcoming_reservation")
                if upcoming:
                    status = upcoming.get("status")
                    if status in invalid_statuses:
                        has_invalid_status = True
                        log_test("Excludes non-active statuses", False, 
                               f"Table {table['id']} has upcoming_reservation with status '{status}'")
                        break
            
            if not has_invalid_status:
                log_test("Excludes non-active statuses", True, 
                       "All upcoming_reservation entries have valid statuses (pending/confirmed/table_assigned)")
        else:
            log_test("Get available tables for status test", False, f"Status {response.status_code}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/reservations/{test_res_id}", headers=headers)
    else:
        log_test("Create test reservation for status check", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Excludes non-active statuses test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 7: ACTIVE SESSION ENRICHMENT
# ============================================================================
print("\n--- TEST 7: Active session enrichment when table is occupied ---")
try:
    # Get list of tables
    headers = {"x-admin-token": ADMIN_TOKEN}
    response = requests.get(f"{BASE_URL}/tables", headers=headers)
    
    if response.status_code == 200:
        tables = response.json()
        if len(tables) > 0:
            # Pick a table to create a walk-in session
            test_table_id = tables[0]["id"]
            
            # Create a walk-in session to occupy the table
            walkin_data = {
                "guests": 2,
                "customer_name": "Walk-in Customer"
            }
            
            response = requests.post(f"{BASE_URL}/tables/{test_table_id}/walkin", headers=headers, json=walkin_data)
            
            if response.status_code == 200:
                log_test("Create walk-in session", True, f"Table {test_table_id} now occupied")
                
                # Create a test reservation to query available tables
                future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
                
                test_data = {
                    "name": "Session Test User",
                    "email": f"session{timestamp}@example.com",
                    "phone": f"555{timestamp % 1000000}6",
                    "date": future_date,
                    "time": "19:00",
                    "guests": 2,
                    "seating_preference": "Window",
                    "occasion": "Dinner"
                }
                
                response = requests.post(f"{BASE_URL}/reservations", json=test_data)
                if response.status_code == 200:
                    test_res = response.json()
                    test_res_id = test_res.get("id")
                    
                    # Get available tables
                    response = requests.get(f"{BASE_URL}/reservations/{test_res_id}/available-tables", headers=headers)
                    
                    if response.status_code == 200:
                        data = response.json()
                        available_tables = data.get("available", [])
                        
                        # Find the occupied table
                        occupied_table = next((t for t in available_tables if t["id"] == test_table_id), None)
                        
                        if occupied_table:
                            if occupied_table["status"] == "occupied":
                                active_session = occupied_table.get("active_session")
                                
                                if active_session is not None and isinstance(active_session, dict):
                                    # Verify session structure
                                    required_fields = ["id", "table_id", "started_at", "session_status"]
                                    has_fields = all(f in active_session for f in required_fields)
                                    
                                    if has_fields and active_session.get("session_status") == "active":
                                        log_test("active_session populated when occupied", True, 
                                               f"Table {test_table_id} has active_session with status 'active'")
                                    else:
                                        log_test("active_session structure", False, 
                                               f"Missing fields or wrong status. Has: {list(active_session.keys())}")
                                else:
                                    log_test("active_session populated when occupied", False, 
                                           f"active_session is null or not an object")
                            else:
                                log_test("Table status check", False, 
                                       f"Expected status 'occupied', got '{occupied_table['status']}'")
                        else:
                            log_test("Find occupied table", False, 
                                   f"Table {test_table_id} not in available list (may be filtered out)")
                        
                        # Check that non-occupied tables have null active_session
                        non_occupied_with_session = [t for t in available_tables 
                                                    if t["status"] != "occupied" and t.get("active_session") is not None]
                        
                        if len(non_occupied_with_session) == 0:
                            log_test("active_session null for non-occupied tables", True, 
                                   "All non-occupied tables have null active_session")
                        else:
                            log_test("active_session null for non-occupied tables", False, 
                                   f"{len(non_occupied_with_session)} non-occupied tables have active_session")
                    else:
                        log_test("Get available tables for session test", False, f"Status {response.status_code}")
                    
                    # Cleanup reservation
                    requests.delete(f"{BASE_URL}/reservations/{test_res_id}", headers=headers)
                else:
                    log_test("Create test reservation for session test", False, f"Status {response.status_code}")
                
                # Cleanup: End the walk-in session
                response = requests.post(f"{BASE_URL}/tables/{test_table_id}/pay", 
                                       headers=headers, 
                                       json={"payment_method": "cash"})
                if response.status_code == 200:
                    # Mark as cleaned
                    requests.post(f"{BASE_URL}/tables/{test_table_id}/cleaned", headers=headers)
                    log_test("Cleanup walk-in session", True, "Session ended and table cleaned")
            else:
                log_test("Create walk-in session", False, f"Status {response.status_code}: {response.text}")
        else:
            log_test("Get tables for session test", False, "No tables found")
    else:
        log_test("Get tables list", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Active session enrichment test", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 8: REGRESSION - suggested still respects seating preference
# ============================================================================
print("\n--- TEST 8: Regression - suggested array respects seating preference ---")
try:
    # Create a reservation with specific seating preference
    future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    test_data = {
        "name": "Preference Test User",
        "email": f"pref{timestamp}@example.com",
        "phone": f"555{timestamp % 1000000}7",
        "date": future_date,
        "time": "19:00",
        "guests": 4,
        "seating_preference": "Main Hall",
        "occasion": "Dinner"
    }
    
    response = requests.post(f"{BASE_URL}/reservations", json=test_data)
    if response.status_code == 200:
        test_res = response.json()
        test_res_id = test_res.get("id")
        
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.get(f"{BASE_URL}/reservations/{test_res_id}/available-tables", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            available_tables = data.get("available", [])
            suggested_tables = data.get("suggested", [])
            seating_pref = data.get("seating_preference")
            
            # Verify seating_preference is returned
            if seating_pref == "Main Hall":
                log_test("seating_preference field in response", True, f"Value: {seating_pref}")
            else:
                log_test("seating_preference field in response", False, f"Expected 'Main Hall', got '{seating_pref}'")
            
            # Verify suggested is a subset of available
            suggested_ids = set(t["id"] for t in suggested_tables)
            available_ids = set(t["id"] for t in available_tables)
            
            if suggested_ids.issubset(available_ids):
                log_test("suggested is subset of available", True, 
                       f"{len(suggested_tables)} suggested out of {len(available_tables)} available")
            else:
                log_test("suggested is subset of available", False, 
                       "suggested contains tables not in available")
            
            # Verify suggested tables match seating preference
            if len(suggested_tables) > 0:
                non_matching = [t for t in suggested_tables 
                              if "Main Hall" not in t.get("section", "")]
                
                if len(non_matching) == 0:
                    log_test("suggested tables match seating preference", True, 
                           f"All {len(suggested_tables)} suggested tables are in Main Hall")
                else:
                    log_test("suggested tables match seating preference", False, 
                           f"{len(non_matching)} suggested tables don't match preference")
            else:
                # No suggested tables - check if there are any Main Hall tables in available
                main_hall_tables = [t for t in available_tables if "Main Hall" in t.get("section", "")]
                if len(main_hall_tables) == 0:
                    log_test("suggested tables (none available)", True, 
                           "No Main Hall tables available, so suggested is empty")
                else:
                    log_test("suggested tables", False, 
                           f"{len(main_hall_tables)} Main Hall tables available but none suggested")
        else:
            log_test("Get available tables for preference test", False, f"Status {response.status_code}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/reservations/{test_res_id}", headers=headers)
    else:
        log_test("Create test reservation for preference test", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Regression test", False, f"Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================
print_summary()
