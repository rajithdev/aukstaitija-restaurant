#!/usr/bin/env python3
"""
Backend API Testing for Aukstaitija Restaurant Reservation System
Tests the upgraded reservation endpoints with locking system and conflict prevention
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://reservation-alerts.preview.emergentagent.com/api"
ADMIN_TOKEN = "admin123"
HEADERS = {"Content-Type": "application/json"}
ADMIN_HEADERS = {"Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN}

def print_test(test_name):
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print('='*80)

def print_pass(message):
    print(f"✅ PASS: {message}")

def print_fail(message):
    print(f"❌ FAIL: {message}")

def print_info(message):
    print(f"ℹ️  INFO: {message}")

# Test 1: Basic Reservation Creation with new fields
def test_basic_reservation_creation():
    print_test("1. Basic Reservation Creation with new fields")
    
    try:
        # Get a future date (tomorrow)
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        payload = {
            "name": "Elena Petrova",
            "phone": "+37060012345",
            "email": "elena.petrova@example.com",
            "date": tomorrow,
            "time": "19:00",
            "guests": 2,
            "seating_preference": "Window side",
            "occasion": "Romantic dinner",
            "notes": "Anniversary celebration - please prepare a special table"
        }
        
        print_info(f"Creating reservation for {tomorrow} at 19:00")
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        
        if response.status_code != 200:
            print_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return None
        
        data = response.json()
        print_pass(f"Reservation created with ID: {data.get('id')}")
        
        # Verify all fields
        if data.get('status') != 'pending':
            print_fail(f"Expected status='pending', got '{data.get('status')}'")
            return None
        print_pass("Status is 'pending'")
        
        if data.get('table_id') is not None:
            print_fail(f"Expected table_id=null, got '{data.get('table_id')}'")
            return None
        print_pass("table_id is null (not assigned yet)")
        
        if not data.get('confirmation') or not data.get('confirmation').startswith('RES'):
            print_fail(f"Expected confirmation code starting with 'RES', got '{data.get('confirmation')}'")
            return None
        print_pass(f"Confirmation code generated: {data.get('confirmation')}")
        
        if data.get('seating_preference') != 'Window side':
            print_fail(f"Expected seating_preference='Window side', got '{data.get('seating_preference')}'")
            return None
        print_pass("seating_preference='Window side'")
        
        if data.get('occasion') != 'Romantic dinner':
            print_fail(f"Expected occasion='Romantic dinner', got '{data.get('occasion')}'")
            return None
        print_pass("occasion='Romantic dinner'")
        
        if data.get('notes') != 'Anniversary celebration - please prepare a special table':
            print_fail(f"Expected notes to match, got '{data.get('notes')}'")
            return None
        print_pass("notes field stored correctly")
        
        print_pass("✅ TEST 1 PASSED - Basic reservation creation with all new fields working")
        return data
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return None

# Test 2: Double-Booking Prevention
def test_double_booking_prevention():
    print_test("2. Double-Booking Prevention")
    
    try:
        # Get a future date
        tomorrow = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
        
        # Create first reservation
        payload1 = {
            "name": "John Smith",
            "phone": "+37060011111",
            "email": "john@example.com",
            "date": tomorrow,
            "time": "18:00",
            "guests": 2,
            "seating_preference": "Main hall",
            "occasion": "Business meeting"
        }
        
        print_info("Creating first reservation...")
        response1 = requests.post(f"{BASE_URL}/reservations", json=payload1, headers=HEADERS)
        if response1.status_code != 200:
            print_fail(f"Failed to create first reservation: {response1.status_code}")
            return False
        
        res1 = response1.json()
        print_pass(f"First reservation created: {res1.get('id')}")
        
        # Assign table 't1' to first reservation
        print_info("Assigning table 't1' to first reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{res1.get('id')}", 
            json={"table_id": "t1"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        
        updated_res1 = update_response.json()
        if updated_res1.get('table_id') != 't1':
            print_fail(f"Table assignment failed, table_id={updated_res1.get('table_id')}")
            return False
        print_pass("Table 't1' assigned to first reservation")
        
        # Create second reservation for same date/time
        payload2 = {
            "name": "Maria Garcia",
            "phone": "+37060022222",
            "email": "maria@example.com",
            "date": tomorrow,
            "time": "18:00",
            "guests": 2,
            "seating_preference": "Window side",
            "occasion": "Casual dining"
        }
        
        print_info("Creating second reservation for same time slot...")
        response2 = requests.post(f"{BASE_URL}/reservations", json=payload2, headers=HEADERS)
        if response2.status_code != 200:
            print_fail(f"Failed to create second reservation: {response2.status_code}")
            return False
        
        res2 = response2.json()
        print_pass(f"Second reservation created: {res2.get('id')}")
        
        # Try to assign same table 't1' to second reservation
        print_info("Attempting to assign table 't1' to second reservation (should fail)...")
        conflict_response = requests.put(
            f"{BASE_URL}/reservations/{res2.get('id')}", 
            json={"table_id": "t1"}, 
            headers=ADMIN_HEADERS
        )
        
        if conflict_response.status_code != 409:
            print_fail(f"Expected 409 conflict, got {conflict_response.status_code}: {conflict_response.text}")
            return False
        
        error_data = conflict_response.json()
        if 'error' not in error_data or 'already reserved' not in error_data['error'].lower():
            print_fail(f"Expected conflict error message, got: {error_data}")
            return False
        print_pass(f"Double-booking prevented with 409 error: {error_data.get('error')}")
        
        # Verify first reservation still has the table
        print_info("Verifying first reservation still has table 't1'...")
        verify_response = requests.get(f"{BASE_URL}/reservations", headers=ADMIN_HEADERS)
        if verify_response.status_code != 200:
            print_fail(f"Failed to get reservations: {verify_response.status_code}")
            return False
        
        all_reservations = verify_response.json()
        first_res = next((r for r in all_reservations if r.get('id') == res1.get('id')), None)
        
        if not first_res or first_res.get('table_id') != 't1':
            print_fail(f"First reservation lost table assignment: {first_res}")
            return False
        print_pass("First reservation still has table 't1' assigned")
        
        print_pass("✅ TEST 2 PASSED - Double-booking prevention working correctly")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test 3: Table Assignment and Instant Status Sync
def test_table_assignment_status_sync():
    print_test("3. Table Assignment and Instant Status Sync")
    
    try:
        # Get a future date
        tomorrow = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        
        # Create reservation
        payload = {
            "name": "Sophie Laurent",
            "phone": "+37060033333",
            "email": "sophie@example.com",
            "date": tomorrow,
            "time": "20:00",
            "guests": 4,
            "seating_preference": "Private room",
            "occasion": "Birthday celebration"
        }
        
        print_info("Creating reservation...")
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Get initial table status
        print_info("Getting initial status of table 't9'...")
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        if table_response.status_code != 200:
            print_fail(f"Failed to get tables: {table_response.status_code}")
            return False
        
        tables = table_response.json()
        table_t9 = next((t for t in tables if t.get('id') == 't9'), None)
        if not table_t9:
            print_fail("Table 't9' not found")
            return False
        
        initial_status = table_t9.get('status')
        print_info(f"Table 't9' initial status: {initial_status}")
        
        # Assign table to reservation
        print_info("Assigning table 't9' to reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"table_id": "t9"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        
        updated_reservation = update_response.json()
        if updated_reservation.get('table_id') != 't9':
            print_fail(f"Table assignment failed: {updated_reservation}")
            return False
        print_pass("Table 't9' assigned to reservation")
        
        # Verify table status changed to 'reserved'
        print_info("Verifying table status changed to 'reserved'...")
        table_response2 = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        if table_response2.status_code != 200:
            print_fail(f"Failed to get tables: {table_response2.status_code}")
            return False
        
        tables2 = table_response2.json()
        table_t9_updated = next((t for t in tables2 if t.get('id') == 't9'), None)
        
        if not table_t9_updated:
            print_fail("Table 't9' not found after update")
            return False
        
        if table_t9_updated.get('status') != 'reserved':
            print_fail(f"Expected table status='reserved', got '{table_t9_updated.get('status')}'")
            return False
        print_pass("Table status instantly changed to 'reserved'")
        
        # Verify table shows reservation details
        if not table_t9_updated.get('upcoming_reservation'):
            print_fail("Table does not show upcoming_reservation")
            return False
        
        upcoming = table_t9_updated.get('upcoming_reservation')
        if upcoming.get('name') != 'Sophie Laurent':
            print_fail(f"Expected name='Sophie Laurent', got '{upcoming.get('name')}'")
            return False
        print_pass(f"Table shows reservation name: {upcoming.get('name')}")
        
        if upcoming.get('time') != '20:00':
            print_fail(f"Expected time='20:00', got '{upcoming.get('time')}'")
            return False
        print_pass(f"Table shows reservation time: {upcoming.get('time')}")
        
        if upcoming.get('guests') != 4:
            print_fail(f"Expected guests=4, got {upcoming.get('guests')}")
            return False
        print_pass(f"Table shows guest count: {upcoming.get('guests')}")
        
        print_pass("✅ TEST 3 PASSED - Table assignment and instant status sync working")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test 4: Arrival Status Handling
def test_arrival_status_handling():
    print_test("4. Arrival Status Handling")
    
    try:
        # Get a future date
        tomorrow = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
        
        # Create reservation
        payload = {
            "name": "David Chen",
            "phone": "+37060044444",
            "email": "david@example.com",
            "date": tomorrow,
            "time": "19:30",
            "guests": 2,
            "seating_preference": "Quiet area",
            "occasion": "Anniversary"
        }
        
        print_info("Creating reservation...")
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Assign table
        print_info("Assigning table 't5' to reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"table_id": "t5"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        print_pass("Table 't5' assigned")
        
        # Verify table is 'reserved'
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        tables = table_response.json()
        table_t5 = next((t for t in tables if t.get('id') == 't5'), None)
        
        if table_t5.get('status') != 'reserved':
            print_fail(f"Expected table status='reserved', got '{table_t5.get('status')}'")
            return False
        print_pass("Table status is 'reserved'")
        
        # Update status to 'arrived'
        print_info("Updating reservation status to 'arrived'...")
        arrived_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"status": "arrived"}, 
            headers=ADMIN_HEADERS
        )
        
        if arrived_response.status_code != 200:
            print_fail(f"Failed to update status: {arrived_response.status_code}")
            return False
        
        arrived_reservation = arrived_response.json()
        if arrived_reservation.get('status') != 'arrived':
            print_fail(f"Expected status='arrived', got '{arrived_reservation.get('status')}'")
            return False
        print_pass("Reservation status updated to 'arrived'")
        
        # Verify table status changed to 'occupied'
        print_info("Verifying table status changed to 'occupied'...")
        table_response2 = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        tables2 = table_response2.json()
        table_t5_updated = next((t for t in tables2 if t.get('id') == 't5'), None)
        
        if table_t5_updated.get('status') != 'occupied':
            print_fail(f"Expected table status='occupied', got '{table_t5_updated.get('status')}'")
            return False
        print_pass("Table status changed from 'reserved' to 'occupied'")
        
        print_pass("✅ TEST 4 PASSED - Arrival status handling working correctly")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test 5: Cancellation and Table Release
def test_cancellation_table_release():
    print_test("5. Cancellation and Table Release")
    
    try:
        # Get a future date
        tomorrow = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
        
        # Create reservation
        payload = {
            "name": "Anna Kowalski",
            "phone": "+37060055555",
            "email": "anna@example.com",
            "date": tomorrow,
            "time": "18:30",
            "guests": 4,
            "seating_preference": "Main hall",
            "occasion": "Special event"
        }
        
        print_info("Creating reservation...")
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Assign table
        print_info("Assigning table 't6' to reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"table_id": "t6"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        print_pass("Table 't6' assigned")
        
        # Verify table is 'reserved'
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        tables = table_response.json()
        table_t6 = next((t for t in tables if t.get('id') == 't6'), None)
        
        if table_t6.get('status') != 'reserved':
            print_fail(f"Expected table status='reserved', got '{table_t6.get('status')}'")
            return False
        print_pass("Table status is 'reserved'")
        
        # Cancel reservation
        print_info("Cancelling reservation...")
        cancel_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"status": "cancelled"}, 
            headers=ADMIN_HEADERS
        )
        
        if cancel_response.status_code != 200:
            print_fail(f"Failed to cancel reservation: {cancel_response.status_code}")
            return False
        
        cancelled_reservation = cancel_response.json()
        if cancelled_reservation.get('status') != 'cancelled':
            print_fail(f"Expected status='cancelled', got '{cancelled_reservation.get('status')}'")
            return False
        print_pass("Reservation cancelled")
        
        # Verify table status changed to 'available'
        print_info("Verifying table status changed to 'available'...")
        table_response2 = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        tables2 = table_response2.json()
        table_t6_updated = next((t for t in tables2 if t.get('id') == 't6'), None)
        
        if table_t6_updated.get('status') != 'available':
            print_fail(f"Expected table status='available', got '{table_t6_updated.get('status')}'")
            return False
        print_pass("Table status changed to 'available' after cancellation")
        
        print_pass("✅ TEST 5 PASSED - Cancellation and table release working correctly")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test 6: Available Tables Endpoint
def test_available_tables_endpoint():
    print_test("6. Available Tables Endpoint")
    
    try:
        # Get a future date
        tomorrow = (datetime.now() + timedelta(days=6)).strftime('%Y-%m-%d')
        
        # Create reservation for 6 guests
        payload = {
            "name": "Michael Brown",
            "phone": "+37060066666",
            "email": "michael@example.com",
            "date": tomorrow,
            "time": "19:00",
            "guests": 6,
            "seating_preference": "Private room",
            "occasion": "Business meeting"
        }
        
        print_info("Creating reservation for 6 guests...")
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Create a conflicting reservation and assign a table
        conflict_payload = {
            "name": "Conflict User",
            "phone": "+37060099999",
            "email": "conflict@example.com",
            "date": tomorrow,
            "time": "19:00",
            "guests": 2,
            "seating_preference": "Window side",
            "occasion": "Casual dining"
        }
        
        print_info("Creating conflicting reservation...")
        conflict_response = requests.post(f"{BASE_URL}/reservations", json=conflict_payload, headers=HEADERS)
        if conflict_response.status_code != 200:
            print_fail(f"Failed to create conflict reservation: {conflict_response.status_code}")
            return False
        
        conflict_reservation = conflict_response.json()
        
        # Assign table 't10' to conflict reservation
        print_info("Assigning table 't10' to conflicting reservation...")
        requests.put(
            f"{BASE_URL}/reservations/{conflict_reservation.get('id')}", 
            json={"table_id": "t10"}, 
            headers=ADMIN_HEADERS
        )
        
        # Call available-tables endpoint
        print_info("Calling available-tables endpoint...")
        available_response = requests.get(
            f"{BASE_URL}/reservations/{reservation.get('id')}/available-tables", 
            headers=ADMIN_HEADERS
        )
        
        if available_response.status_code != 200:
            print_fail(f"Failed to get available tables: {available_response.status_code}")
            return False
        
        available_data = available_response.json()
        print_pass("Available tables endpoint returned successfully")
        
        # Verify response structure
        if 'available' not in available_data:
            print_fail("Response missing 'available' field")
            return False
        print_pass("Response contains 'available' field")
        
        if 'suggested' not in available_data:
            print_fail("Response missing 'suggested' field")
            return False
        print_pass("Response contains 'suggested' field")
        
        available_tables = available_data.get('available', [])
        print_info(f"Found {len(available_tables)} available tables")
        
        # Verify tables can accommodate party size (6 guests)
        for table in available_tables:
            if table.get('capacity', 0) < 6:
                print_fail(f"Table {table.get('id')} has capacity {table.get('capacity')} < 6 guests")
                return False
        print_pass("All available tables can accommodate party size (6 guests)")
        
        # Verify conflicting table 't10' is excluded
        conflicting_ids = [t.get('id') for t in available_tables]
        if 't10' in conflicting_ids:
            print_fail("Table 't10' should be excluded (already assigned to conflicting reservation)")
            return False
        print_pass("Conflicting table 't10' is correctly excluded")
        
        # Verify suggested tables based on seating preference
        suggested_tables = available_data.get('suggested', [])
        print_info(f"Found {len(suggested_tables)} suggested tables for 'Private room' preference")
        
        if len(suggested_tables) > 0:
            for table in suggested_tables:
                section = table.get('section', '').lower()
                if 'private' not in section:
                    print_fail(f"Suggested table {table.get('id')} section '{table.get('section')}' doesn't match 'Private room' preference")
                    return False
            print_pass("Suggested tables match seating preference")
        else:
            print_info("No suggested tables (acceptable if no exact match)")
        
        print_pass("✅ TEST 6 PASSED - Available tables endpoint working correctly")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test 7: Multiple Reservations Same Time Different Tables
def test_multiple_reservations_same_time():
    print_test("7. Multiple Reservations Same Time Different Tables")
    
    try:
        # Get a future date
        tomorrow = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        time_slot = "20:30"
        
        reservations = []
        tables_to_assign = ['t1', 't2', 't3']
        
        # Create 3 reservations for the same time slot
        for i, table_id in enumerate(tables_to_assign):
            payload = {
                "name": f"Guest {i+1}",
                "phone": f"+3706007777{i}",
                "email": f"guest{i+1}@example.com",
                "date": tomorrow,
                "time": time_slot,
                "guests": 2,
                "seating_preference": "Window side",
                "occasion": "Casual dining"
            }
            
            print_info(f"Creating reservation {i+1}...")
            response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
            if response.status_code != 200:
                print_fail(f"Failed to create reservation {i+1}: {response.status_code}")
                return False
            
            reservation = response.json()
            reservations.append(reservation)
            print_pass(f"Reservation {i+1} created: {reservation.get('id')}")
        
        # Assign different tables to each reservation
        for i, (reservation, table_id) in enumerate(zip(reservations, tables_to_assign)):
            print_info(f"Assigning table '{table_id}' to reservation {i+1}...")
            update_response = requests.put(
                f"{BASE_URL}/reservations/{reservation.get('id')}", 
                json={"table_id": table_id}, 
                headers=ADMIN_HEADERS
            )
            
            if update_response.status_code != 200:
                print_fail(f"Failed to assign table '{table_id}': {update_response.status_code}")
                return False
            
            updated = update_response.json()
            if updated.get('table_id') != table_id:
                print_fail(f"Table assignment failed for reservation {i+1}")
                return False
            print_pass(f"Table '{table_id}' assigned to reservation {i+1}")
        
        # Verify all 3 tables show as 'reserved'
        print_info("Verifying all 3 tables show as 'reserved'...")
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        if table_response.status_code != 200:
            print_fail(f"Failed to get tables: {table_response.status_code}")
            return False
        
        tables = table_response.json()
        
        for table_id in tables_to_assign:
            table = next((t for t in tables if t.get('id') == table_id), None)
            if not table:
                print_fail(f"Table '{table_id}' not found")
                return False
            
            if table.get('status') != 'reserved':
                print_fail(f"Table '{table_id}' status is '{table.get('status')}', expected 'reserved'")
                return False
            print_pass(f"Table '{table_id}' status is 'reserved'")
        
        print_pass("✅ TEST 7 PASSED - Multiple reservations at same time with different tables working")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Test 8: No-Show Handling (Edge Case)
def test_no_show_handling():
    print_test("8. No-Show Handling (Edge Case)")
    
    try:
        # Get a date 1 hour in the past
        past_time = datetime.now() - timedelta(hours=1)
        past_date = past_time.strftime('%Y-%m-%d')
        past_time_str = past_time.strftime('%H:%M')
        
        # Create reservation in the past
        payload = {
            "name": "Late Guest",
            "phone": "+37060088888",
            "email": "late@example.com",
            "date": past_date,
            "time": past_time_str,
            "guests": 2,
            "seating_preference": "Window side",
            "occasion": "Casual dining"
        }
        
        print_info(f"Creating reservation for {past_date} at {past_time_str} (1 hour in the past)...")
        response = requests.post(f"{BASE_URL}/reservations", json=payload, headers=HEADERS)
        if response.status_code != 200:
            print_fail(f"Failed to create reservation: {response.status_code}")
            return False
        
        reservation = response.json()
        print_pass(f"Reservation created: {reservation.get('id')}")
        
        # Assign table
        print_info("Assigning table 't7' to reservation...")
        update_response = requests.put(
            f"{BASE_URL}/reservations/{reservation.get('id')}", 
            json={"table_id": "t7"}, 
            headers=ADMIN_HEADERS
        )
        
        if update_response.status_code != 200:
            print_fail(f"Failed to assign table: {update_response.status_code}")
            return False
        print_pass("Table 't7' assigned")
        
        # Call GET /api/tables to trigger autoUpdateTableStatuses
        print_info("Calling GET /api/tables to trigger auto no-show detection...")
        table_response = requests.get(f"{BASE_URL}/tables", headers=HEADERS)
        if table_response.status_code != 200:
            print_fail(f"Failed to get tables: {table_response.status_code}")
            return False
        
        tables = table_response.json()
        table_t7 = next((t for t in tables if t.get('id') == 't7'), None)
        
        if not table_t7:
            print_fail("Table 't7' not found")
            return False
        
        # Verify table status is 'available' (released after no-show)
        if table_t7.get('status') != 'available':
            print_fail(f"Expected table status='available', got '{table_t7.get('status')}'")
            return False
        print_pass("Table status is 'available' (released after no-show)")
        
        # Verify reservation is marked as 'no_show'
        print_info("Verifying reservation is marked as 'no_show'...")
        res_response = requests.get(f"{BASE_URL}/reservations", headers=ADMIN_HEADERS)
        if res_response.status_code != 200:
            print_fail(f"Failed to get reservations: {res_response.status_code}")
            return False
        
        all_reservations = res_response.json()
        updated_reservation = next((r for r in all_reservations if r.get('id') == reservation.get('id')), None)
        
        if not updated_reservation:
            print_fail("Reservation not found")
            return False
        
        if updated_reservation.get('status') != 'no_show':
            print_fail(f"Expected reservation status='no_show', got '{updated_reservation.get('status')}'")
            return False
        print_pass("Reservation status is 'no_show'")
        
        if not updated_reservation.get('no_show_at'):
            print_fail("Expected no_show_at timestamp to be set")
            return False
        print_pass(f"no_show_at timestamp set: {updated_reservation.get('no_show_at')}")
        
        print_pass("✅ TEST 8 PASSED - No-show handling working correctly")
        return True
        
    except Exception as e:
        print_fail(f"Exception: {str(e)}")
        return False

# Main test runner
def main():
    print("\n" + "="*80)
    print("AUKSTAITIJA RESTAURANT - RESERVATION SYSTEM BACKEND TESTS")
    print("Testing upgraded reservation endpoints with locking and conflict prevention")
    print("="*80)
    
    results = {
        "Test 1: Basic Reservation Creation": False,
        "Test 2: Double-Booking Prevention": False,
        "Test 3: Table Assignment and Status Sync": False,
        "Test 4: Arrival Status Handling": False,
        "Test 5: Cancellation and Table Release": False,
        "Test 6: Available Tables Endpoint": False,
        "Test 7: Multiple Reservations Same Time": False,
        "Test 8: No-Show Handling": False
    }
    
    # Run all tests
    test1_result = test_basic_reservation_creation()
    results["Test 1: Basic Reservation Creation"] = test1_result is not None
    
    results["Test 2: Double-Booking Prevention"] = test_double_booking_prevention()
    results["Test 3: Table Assignment and Status Sync"] = test_table_assignment_status_sync()
    results["Test 4: Arrival Status Handling"] = test_arrival_status_handling()
    results["Test 5: Cancellation and Table Release"] = test_cancellation_table_release()
    results["Test 6: Available Tables Endpoint"] = test_available_tables_endpoint()
    results["Test 7: Multiple Reservations Same Time"] = test_multiple_reservations_same_time()
    results["Test 8: No-Show Handling"] = test_no_show_handling()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results.items():
        if result:
            print(f"✅ {test_name}")
            passed += 1
        else:
            print(f"❌ {test_name}")
            failed += 1
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed} passed, {failed} failed out of {len(results)} tests")
    print(f"SUCCESS RATE: {(passed/len(results)*100):.1f}%")
    print("="*80 + "\n")
    
    return passed == len(results)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
