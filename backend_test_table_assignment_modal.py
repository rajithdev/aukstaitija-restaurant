#!/usr/bin/env python3
"""
Test the table assignment modal backend endpoint with focus on:
1. Reservation timing visibility (upcoming_reservation, active_session)
2. Assignable table filtering (90-minute overlap detection)
3. Edge cases (back-to-back bookings, occupied tables, etc.)

PRIMARY ENDPOINT: GET /api/reservations/:id/available-tables
"""

import requests
import time
from datetime import datetime, timedelta

# Configuration - Use public URL from .env
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
test_email_base = f"tableassign{timestamp}"

print(f"\n{'='*80}")
print(f"TABLE ASSIGNMENT MODAL BACKEND TESTS")
print(f"{'='*80}\n")
print(f"Admin token: {ADMIN_TOKEN}")
print(f"Testing endpoint: GET /api/reservations/:id/available-tables\n")

# Use future date (7+ days ahead) to avoid time-of-day flakiness
test_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
print(f"Test date: {test_date} (7 days in future)\n")

# ============================================================================
# SETUP: Get all tables to understand the baseline
# ============================================================================
print("\n--- SETUP: Get baseline table data ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    response = requests.get(f"{BASE_URL}/tables", headers=headers)
    if response.status_code == 200:
        all_tables = response.json()
        print(f"Total tables in system: {len(all_tables)}")
        
        # Find tables by capacity
        cap2_tables = [t for t in all_tables if t['capacity'] == 2]
        cap4_tables = [t for t in all_tables if t['capacity'] == 4]
        cap8_tables = [t for t in all_tables if t['capacity'] == 8]
        
        print(f"  - Capacity 2: {len(cap2_tables)} tables")
        print(f"  - Capacity 4: {len(cap4_tables)} tables")
        print(f"  - Capacity 8: {len(cap8_tables)} tables")
        
        # Pick specific tables for testing
        test_table_t1 = cap2_tables[0]['id'] if cap2_tables else None
        test_table_t2 = cap2_tables[1]['id'] if len(cap2_tables) > 1 else None
        test_table_t3 = cap4_tables[0]['id'] if cap4_tables else None
        test_table_t4 = cap8_tables[0]['id'] if cap8_tables else None
        
        print(f"\nTest tables selected:")
        print(f"  - T1 (cap 2): {test_table_t1}")
        print(f"  - T2 (cap 2): {test_table_t2}")
        print(f"  - T3 (cap 4): {test_table_t3}")
        print(f"  - T4 (cap 8): {test_table_t4}")
    else:
        print(f"❌ Failed to get tables: {response.status_code}")
        test_table_t1 = test_table_t2 = test_table_t3 = test_table_t4 = None
        all_tables = []
except Exception as e:
    print(f"❌ Exception getting tables: {str(e)}")
    test_table_t1 = test_table_t2 = test_table_t3 = test_table_t4 = None
    all_tables = []

# ============================================================================
# TEST 1: Authentication check
# ============================================================================
print("\n--- TEST 1: Authentication (401 without admin token) ---")
try:
    # Create a test reservation first
    reservation_data = {
        "name": "Auth Test",
        "email": f"{test_email_base}_auth@example.com",
        "phone": "5551234567",
        "date": test_date,
        "time": "19:00",
        "guests": 2,
        "seating_preference": "No preference"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=reservation_data)
    if response.status_code == 200:
        auth_test_res_id = response.json().get("id")
        
        # Try without admin token
        response = requests.get(f"{BASE_URL}/reservations/{auth_test_res_id}/available-tables")
        if response.status_code == 401:
            log_test("Auth check - 401 without token", True, "Correctly returns 401")
        else:
            log_test("Auth check - 401 without token", False, f"Expected 401, got {response.status_code}")
    else:
        log_test("Auth check - 401 without token", False, f"Failed to create test reservation: {response.status_code}")
        auth_test_res_id = None
except Exception as e:
    log_test("Auth check - 401 without token", False, f"Exception: {str(e)}")
    auth_test_res_id = None

# ============================================================================
# TEST 2: Response enrichment - upcoming_reservation and active_session fields
# ============================================================================
print("\n--- TEST 2: Response enrichment (upcoming_reservation, active_session) ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    
    # Create a reservation to query for
    reservation_data = {
        "name": "Enrichment Test",
        "email": f"{test_email_base}_enrich@example.com",
        "phone": "5551234568",
        "date": test_date,
        "time": "19:00",
        "guests": 2,
        "seating_preference": "No preference"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=reservation_data)
    if response.status_code == 200:
        enrich_test_res_id = response.json().get("id")
        
        # Query available tables
        response = requests.get(f"{BASE_URL}/reservations/{enrich_test_res_id}/available-tables", headers=headers)
        if response.status_code == 200:
            data = response.json()
            
            # Check structure
            has_available = "available" in data
            has_suggested = "suggested" in data
            has_seating_pref = "seating_preference" in data
            
            if has_available and has_suggested and has_seating_pref:
                log_test("Response has required top-level fields", True, "available, suggested, seating_preference present")
                
                # Check each table has enrichment fields
                if len(data['available']) > 0:
                    sample_table = data['available'][0]
                    has_upcoming = "upcoming_reservation" in sample_table
                    has_active_session = "active_session" in sample_table
                    
                    if has_upcoming and has_active_session:
                        log_test("Tables have enrichment fields", True, "upcoming_reservation and active_session present")
                        
                        # Verify structure of upcoming_reservation (if not null)
                        upcoming_found = False
                        for table in data['available']:
                            if table['upcoming_reservation'] is not None:
                                upcoming_found = True
                                upcoming = table['upcoming_reservation']
                                has_date = "date" in upcoming
                                has_time = "time" in upcoming
                                has_status = "status" in upcoming
                                has_guests = "guests" in upcoming
                                has_name = "name" in upcoming
                                
                                if has_date and has_time and has_status and has_guests and has_name:
                                    log_test("upcoming_reservation structure correct", True, 
                                           f"Has date, time, status, guests, name")
                                else:
                                    log_test("upcoming_reservation structure correct", False, 
                                           f"Missing fields: date={has_date}, time={has_time}, status={has_status}, guests={has_guests}, name={has_name}")
                                break
                        
                        if not upcoming_found:
                            print("   ℹ️  No tables with upcoming_reservation found (expected if no other reservations)")
                    else:
                        log_test("Tables have enrichment fields", False, 
                               f"Missing fields: upcoming_reservation={has_upcoming}, active_session={has_active_session}")
                else:
                    log_test("Tables have enrichment fields", False, "No available tables returned")
            else:
                log_test("Response has required top-level fields", False, 
                       f"Missing fields: available={has_available}, suggested={has_suggested}, seating_preference={has_seating_pref}")
        else:
            log_test("Response enrichment", False, f"Failed to get available tables: {response.status_code}")
    else:
        log_test("Response enrichment", False, f"Failed to create test reservation: {response.status_code}")
except Exception as e:
    log_test("Response enrichment", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 3: 90-minute overlap detection - CRITICAL TEST
# ============================================================================
print("\n--- TEST 3: 90-minute overlap detection (CRITICAL) ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    
    # Create reservation A at 14:00, assign to table T1
    print("\nStep 1: Create reservation A at 14:00, assign to table T1")
    res_a_data = {
        "name": "Overlap Test A",
        "email": f"{test_email_base}_overlap_a@example.com",
        "phone": "5551234569",
        "date": test_date,
        "time": "14:00",
        "guests": 2,
        "seating_preference": "No preference"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=res_a_data)
    if response.status_code == 200:
        res_a_id = response.json().get("id")
        print(f"   Created reservation A: {res_a_id}")
        
        # Assign to table T1
        if test_table_t1:
            assign_response = requests.put(
                f"{BASE_URL}/reservations/{res_a_id}",
                headers=headers,
                json={"table_id": test_table_t1}
            )
            if assign_response.status_code == 200:
                print(f"   Assigned to table {test_table_t1}")
                
                # Create reservation B at 14:00 + 30min = 14:30 (should overlap - within 90 min)
                print("\nStep 2: Create reservation B at 14:30 (30 min after A - should overlap)")
                res_b_data = {
                    "name": "Overlap Test B",
                    "email": f"{test_email_base}_overlap_b@example.com",
                    "phone": "5551234570",
                    "date": test_date,
                    "time": "14:30",
                    "guests": 2,
                    "seating_preference": "No preference"
                }
                response = requests.post(f"{BASE_URL}/reservations", json=res_b_data)
                if response.status_code == 200:
                    res_b_id = response.json().get("id")
                    print(f"   Created reservation B: {res_b_id}")
                    
                    # Query available tables for B - T1 should be EXCLUDED (overlap)
                    response = requests.get(f"{BASE_URL}/reservations/{res_b_id}/available-tables", headers=headers)
                    if response.status_code == 200:
                        data = response.json()
                        available_table_ids = [t['id'] for t in data['available']]
                        
                        if test_table_t1 not in available_table_ids:
                            log_test("90-min overlap detection - T1 excluded at 14:30", True, 
                                   f"Table {test_table_t1} correctly excluded (14:00 + 90min = 15:30, overlaps 14:30)")
                        else:
                            log_test("90-min overlap detection - T1 excluded at 14:30", False, 
                                   f"Table {test_table_t1} should be excluded but was available")
                        
                        # Create reservation C at 14:00 + 90min = 15:30 (back-to-back - should NOT overlap)
                        print("\nStep 3: Create reservation C at 15:30 (90 min after A - back-to-back OK)")
                        res_c_data = {
                            "name": "Overlap Test C",
                            "email": f"{test_email_base}_overlap_c@example.com",
                            "phone": "5551234571",
                            "date": test_date,
                            "time": "15:30",
                            "guests": 2,
                            "seating_preference": "No preference"
                        }
                        response = requests.post(f"{BASE_URL}/reservations", json=res_c_data)
                        if response.status_code == 200:
                            res_c_id = response.json().get("id")
                            print(f"   Created reservation C: {res_c_id}")
                            
                            # Query available tables for C - T1 should be INCLUDED (back-to-back OK)
                            response = requests.get(f"{BASE_URL}/reservations/{res_c_id}/available-tables", headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                available_table_ids = [t['id'] for t in data['available']]
                                
                                if test_table_t1 in available_table_ids:
                                    log_test("90-min overlap detection - T1 included at 15:30 (back-to-back)", True, 
                                           f"Table {test_table_t1} correctly available (14:00 + 90min = 15:30, no overlap)")
                                else:
                                    log_test("90-min overlap detection - T1 included at 15:30 (back-to-back)", False, 
                                           f"Table {test_table_t1} should be available but was excluded")
                            else:
                                log_test("90-min overlap detection - T1 included at 21:00 (back-to-back)", False, 
                                       f"Failed to get available tables for C: {response.status_code}")
                        else:
                            log_test("90-min overlap detection - T1 included at 21:00 (back-to-back)", False, 
                                   f"Failed to create reservation C: {response.status_code}")
                    else:
                        log_test("90-min overlap detection - T1 excluded at 20:00", False, 
                               f"Failed to get available tables for B: {response.status_code}")
                else:
                    log_test("90-min overlap detection", False, f"Failed to create reservation B: {response.status_code}")
            else:
                log_test("90-min overlap detection", False, f"Failed to assign table to A: {assign_response.status_code}")
        else:
            log_test("90-min overlap detection", False, "No test table T1 available")
    else:
        log_test("90-min overlap detection", False, f"Failed to create reservation A: {response.status_code}")
except Exception as e:
    log_test("90-min overlap detection", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 4: Occupied tables should be excluded
# ============================================================================
print("\n--- TEST 4: Occupied tables excluded from available tables ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    
    # Create a walk-in session to occupy a table
    if test_table_t2:
        print(f"\nStep 1: Create walk-in session on table {test_table_t2}")
        walkin_data = {
            "customer_name": "Walk-in Guest",
            "guests": 2
        }
        response = requests.post(f"{BASE_URL}/tables/{test_table_t2}/walkin", headers=headers, json=walkin_data)
        if response.status_code == 200:
            session_id = response.json().get("id")
            print(f"   Created session: {session_id}")
            
            # Create a reservation to query for
            print("\nStep 2: Create reservation and check available tables")
            res_data = {
                "name": "Occupied Test",
                "email": f"{test_email_base}_occupied@example.com",
                "phone": "5551234572",
                "date": test_date,
                "time": "19:00",
                "guests": 2,
                "seating_preference": "No preference"
            }
            response = requests.post(f"{BASE_URL}/reservations", json=res_data)
            if response.status_code == 200:
                res_id = response.json().get("id")
                
                # Query available tables - T2 should be EXCLUDED (occupied)
                response = requests.get(f"{BASE_URL}/reservations/{res_id}/available-tables", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    available_table_ids = [t['id'] for t in data['available']]
                    
                    if test_table_t2 not in available_table_ids:
                        log_test("Occupied tables excluded", True, 
                               f"Table {test_table_t2} correctly excluded (occupied by walk-in)")
                    else:
                        log_test("Occupied tables excluded", False, 
                               f"Table {test_table_t2} should be excluded but was available")
                    
                    # Check if any table has active_session populated
                    has_active_session = any(t.get('active_session') is not None for t in data['available'])
                    if has_active_session:
                        print("   ℹ️  Some tables have active_session data (expected if occupied tables are shown)")
                else:
                    log_test("Occupied tables excluded", False, f"Failed to get available tables: {response.status_code}")
            else:
                log_test("Occupied tables excluded", False, f"Failed to create reservation: {response.status_code}")
            
            # Cleanup: End the session
            requests.post(f"{BASE_URL}/tables/{test_table_t2}/pay", headers=headers, json={"payment_method": "cash", "amount": 0})
        else:
            log_test("Occupied tables excluded", False, f"Failed to create walk-in session: {response.status_code}")
    else:
        log_test("Occupied tables excluded", False, "No test table T2 available")
except Exception as e:
    log_test("Occupied tables excluded", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 5: upcoming_reservation populated correctly
# ============================================================================
print("\n--- TEST 5: upcoming_reservation data populated correctly ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    
    # Create reservation D at 18:00, assign to table T3
    print(f"\nStep 1: Create reservation D at 18:00, assign to table {test_table_t3}")
    res_d_data = {
        "name": "Upcoming Test D",
        "email": f"{test_email_base}_upcoming_d@example.com",
        "phone": "5551234573",
        "date": test_date,
        "time": "18:00",
        "guests": 4,
        "seating_preference": "No preference"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=res_d_data)
    if response.status_code == 200:
        res_d_id = response.json().get("id")
        print(f"   Created reservation D: {res_d_id}")
        
        # Assign to table T3
        if test_table_t3:
            assign_response = requests.put(
                f"{BASE_URL}/reservations/{res_d_id}",
                headers=headers,
                json={"table_id": test_table_t3}
            )
            if assign_response.status_code == 200:
                print(f"   Assigned to table {test_table_t3}")
                
                # Create reservation E at 20:00 (different time, same capacity)
                print("\nStep 2: Create reservation E at 20:00, query available tables")
                res_e_data = {
                    "name": "Upcoming Test E",
                    "email": f"{test_email_base}_upcoming_e@example.com",
                    "phone": "5551234574",
                    "date": test_date,
                    "time": "20:00",
                    "guests": 4,
                    "seating_preference": "No preference"
                }
                response = requests.post(f"{BASE_URL}/reservations", json=res_e_data)
                if response.status_code == 200:
                    res_e_id = response.json().get("id")
                    print(f"   Created reservation E: {res_e_id}")
                    
                    # Query available tables for E - T3 should show D in upcoming_reservation
                    response = requests.get(f"{BASE_URL}/reservations/{res_e_id}/available-tables", headers=headers)
                    if response.status_code == 200:
                        data = response.json()
                        
                        # Find T3 in available tables
                        t3_data = next((t for t in data['available'] if t['id'] == test_table_t3), None)
                        
                        if t3_data:
                            if t3_data.get('upcoming_reservation') is not None:
                                upcoming = t3_data['upcoming_reservation']
                                if upcoming.get('name') == "Upcoming Test D" and upcoming.get('time') == "18:00":
                                    log_test("upcoming_reservation populated correctly", True, 
                                           f"Table {test_table_t3} shows reservation D (18:00, Upcoming Test D)")
                                else:
                                    log_test("upcoming_reservation populated correctly", False, 
                                           f"upcoming_reservation data incorrect: name={upcoming.get('name')}, time={upcoming.get('time')}")
                            else:
                                log_test("upcoming_reservation populated correctly", False, 
                                       f"Table {test_table_t3} has null upcoming_reservation (expected reservation D)")
                        else:
                            log_test("upcoming_reservation populated correctly", False, 
                                   f"Table {test_table_t3} not found in available tables")
                    else:
                        log_test("upcoming_reservation populated correctly", False, 
                               f"Failed to get available tables for E: {response.status_code}")
                else:
                    log_test("upcoming_reservation populated correctly", False, 
                           f"Failed to create reservation E: {response.status_code}")
            else:
                log_test("upcoming_reservation populated correctly", False, 
                       f"Failed to assign table to D: {assign_response.status_code}")
        else:
            log_test("upcoming_reservation populated correctly", False, "No test table T3 available")
    else:
        log_test("upcoming_reservation populated correctly", False, 
               f"Failed to create reservation D: {response.status_code}")
except Exception as e:
    log_test("upcoming_reservation populated correctly", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 6: Self-exclusion - reservation should not see itself in upcoming_reservation
# ============================================================================
print("\n--- TEST 6: Self-exclusion (reservation doesn't see itself) ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    
    # Create reservation F, assign to table T4
    print(f"\nStep 1: Create reservation F, assign to table {test_table_t4}")
    res_f_data = {
        "name": "Self Exclusion Test F",
        "email": f"{test_email_base}_self_f@example.com",
        "phone": "5551234575",
        "date": test_date,
        "time": "19:00",
        "guests": 8,
        "seating_preference": "No preference"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=res_f_data)
    if response.status_code == 200:
        res_f_id = response.json().get("id")
        print(f"   Created reservation F: {res_f_id}")
        
        # Assign to table T4
        if test_table_t4:
            assign_response = requests.put(
                f"{BASE_URL}/reservations/{res_f_id}",
                headers=headers,
                json={"table_id": test_table_t4}
            )
            if assign_response.status_code == 200:
                print(f"   Assigned to table {test_table_t4}")
                
                # Query available tables for F itself - T4 should NOT show F in upcoming_reservation
                print("\nStep 2: Query available tables for F - should not see itself")
                response = requests.get(f"{BASE_URL}/reservations/{res_f_id}/available-tables", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    
                    # Find T4 in available tables
                    t4_data = next((t for t in data['available'] if t['id'] == test_table_t4), None)
                    
                    if t4_data:
                        upcoming = t4_data.get('upcoming_reservation')
                        if upcoming is None or upcoming.get('id') != res_f_id:
                            log_test("Self-exclusion working", True, 
                                   f"Table {test_table_t4} does not show reservation F in upcoming_reservation")
                        else:
                            log_test("Self-exclusion working", False, 
                                   f"Table {test_table_t4} incorrectly shows itself in upcoming_reservation")
                    else:
                        log_test("Self-exclusion working", False, 
                               f"Table {test_table_t4} not found in available tables")
                else:
                    log_test("Self-exclusion working", False, 
                           f"Failed to get available tables for F: {response.status_code}")
            else:
                log_test("Self-exclusion working", False, 
                       f"Failed to assign table to F: {assign_response.status_code}")
        else:
            log_test("Self-exclusion working", False, "No test table T4 available")
    else:
        log_test("Self-exclusion working", False, 
               f"Failed to create reservation F: {response.status_code}")
except Exception as e:
    log_test("Self-exclusion working", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 7: Only active statuses in upcoming_reservation
# ============================================================================
print("\n--- TEST 7: Only active statuses in upcoming_reservation ---")
try:
    headers = {"x-admin-token": ADMIN_TOKEN}
    
    # Create reservation G, assign to a table, then cancel it
    print("\nStep 1: Create reservation G, assign, then cancel")
    res_g_data = {
        "name": "Status Test G",
        "email": f"{test_email_base}_status_g@example.com",
        "phone": "5551234576",
        "date": test_date,
        "time": "17:00",
        "guests": 2,
        "seating_preference": "No preference"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=res_g_data)
    if response.status_code == 200:
        res_g_id = response.json().get("id")
        print(f"   Created reservation G: {res_g_id}")
        
        # Assign to table T1
        if test_table_t1:
            assign_response = requests.put(
                f"{BASE_URL}/reservations/{res_g_id}",
                headers=headers,
                json={"table_id": test_table_t1}
            )
            if assign_response.status_code == 200:
                print(f"   Assigned to table {test_table_t1}")
                
                # Cancel the reservation
                cancel_response = requests.put(
                    f"{BASE_URL}/reservations/{res_g_id}",
                    headers=headers,
                    json={"status": "cancelled"}
                )
                if cancel_response.status_code == 200:
                    print(f"   Cancelled reservation G")
                    
                    # Create reservation H at different time, query available tables
                    print("\nStep 2: Create reservation H, query available tables")
                    res_h_data = {
                        "name": "Status Test H",
                        "email": f"{test_email_base}_status_h@example.com",
                        "phone": "5551234577",
                        "date": test_date,
                        "time": "18:30",
                        "guests": 2,
                        "seating_preference": "No preference"
                    }
                    response = requests.post(f"{BASE_URL}/reservations", json=res_h_data)
                    if response.status_code == 200:
                        res_h_id = response.json().get("id")
                        print(f"   Created reservation H: {res_h_id}")
                        
                        # Query available tables for H - T1 should NOT show cancelled G
                        response = requests.get(f"{BASE_URL}/reservations/{res_h_id}/available-tables", headers=headers)
                        if response.status_code == 200:
                            data = response.json()
                            
                            # Find T1 in available tables
                            t1_data = next((t for t in data['available'] if t['id'] == test_table_t1), None)
                            
                            if t1_data:
                                upcoming = t1_data.get('upcoming_reservation')
                                if upcoming is None or upcoming.get('status') != 'cancelled':
                                    log_test("Only active statuses in upcoming_reservation", True, 
                                           f"Table {test_table_t1} does not show cancelled reservation G")
                                else:
                                    log_test("Only active statuses in upcoming_reservation", False, 
                                           f"Table {test_table_t1} incorrectly shows cancelled reservation")
                            else:
                                log_test("Only active statuses in upcoming_reservation", False, 
                                       f"Table {test_table_t1} not found in available tables")
                        else:
                            log_test("Only active statuses in upcoming_reservation", False, 
                                   f"Failed to get available tables for H: {response.status_code}")
                    else:
                        log_test("Only active statuses in upcoming_reservation", False, 
                               f"Failed to create reservation H: {response.status_code}")
                else:
                    log_test("Only active statuses in upcoming_reservation", False, 
                           f"Failed to cancel reservation G: {cancel_response.status_code}")
            else:
                log_test("Only active statuses in upcoming_reservation", False, 
                       f"Failed to assign table to G: {assign_response.status_code}")
        else:
            log_test("Only active statuses in upcoming_reservation", False, "No test table T1 available")
    else:
        log_test("Only active statuses in upcoming_reservation", False, 
               f"Failed to create reservation G: {response.status_code}")
except Exception as e:
    log_test("Only active statuses in upcoming_reservation", False, f"Exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================
print_summary()

# Exit with appropriate code
exit(0 if tests_failed == 0 else 1)
