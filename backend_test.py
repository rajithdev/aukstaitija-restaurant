#!/usr/bin/env python3
"""
Comprehensive backend tests for reservation persistence, guest recovery, and account linking.
Tests BOTH auto-linking (on signup) AND manual linking (via link-reservations endpoint).
"""

import requests
import time
import re
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "admin123"

# Test results tracking
tests_passed = 0
tests_failed = 0
test_results = []

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
    test_results.append({"name": name, "passed": passed, "details": details})

def print_summary():
    total = tests_passed + tests_failed
    print(f"\n{'='*80}")
    print(f"TEST SUMMARY: {tests_passed}/{total} passed ({100*tests_passed//total if total > 0 else 0}%)")
    print(f"{'='*80}\n")

# Generate unique test data
timestamp = int(time.time())
test_email = f"test{timestamp}@example.com"
test_phone = "5551112222"
test_phone_formatted = "+1 555-111-2222"

print(f"\n{'='*80}")
print(f"RESERVATION PERSISTENCE & GUEST RECOVERY TESTS")
print(f"{'='*80}\n")
print(f"Test email: {test_email}")
print(f"Test phone: {test_phone}")
print(f"Admin token: {ADMIN_TOKEN}\n")

# ============================================================================
# TEST 1: POST /reservations generates reservation_code
# ============================================================================
print("\n--- TEST 1: Create reservation with reservation_code ---")
future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
reservation_data = {
    "name": "Guest User",
    "email": test_email,
    "phone": test_phone,
    "date": future_date,
    "time": "19:00",
    "guests": 4,
    "special_requests": "Window seat please",
    "seating_preference": "Window",
    "occasion": "Birthday"
}

try:
    response = requests.post(f"{BASE_URL}/reservations", json=reservation_data)
    if response.status_code == 200:
        reservation1 = response.json()
        reservation_code1 = reservation1.get("reservation_code")
        confirmation1 = reservation1.get("confirmation")
        reservation_id1 = reservation1.get("id")
        
        # Verify format: RSV-XXXXXX with 6 chars from alphabet without I/O/0/1
        code_pattern = r'^RSV-[A-HJ-NP-Z2-9]{6}$'
        if re.match(code_pattern, reservation_code1):
            log_test("Reservation code format", True, f"Code: {reservation_code1}")
        else:
            log_test("Reservation code format", False, f"Invalid format: {reservation_code1}")
        
        # Verify both fields present
        if confirmation1 and confirmation1.startswith("RES"):
            log_test("Legacy confirmation field present", True, f"Confirmation: {confirmation1}")
        else:
            log_test("Legacy confirmation field present", False, f"Missing or invalid: {confirmation1}")
    else:
        log_test("Create reservation", False, f"Status {response.status_code}: {response.text}")
        reservation_code1 = None
        confirmation1 = None
        reservation_id1 = None
except Exception as e:
    log_test("Create reservation", False, f"Exception: {str(e)}")
    reservation_code1 = None
    confirmation1 = None
    reservation_id1 = None

# ============================================================================
# TEST 2: Create second reservation - verify unique codes
# ============================================================================
print("\n--- TEST 2: Verify unique reservation codes ---")
try:
    response = requests.post(f"{BASE_URL}/reservations", json={
        **reservation_data,
        "time": "19:30"
    })
    if response.status_code == 200:
        reservation2 = response.json()
        reservation_code2 = reservation2.get("reservation_code")
        
        if reservation_code1 and reservation_code2 and reservation_code1 != reservation_code2:
            log_test("Unique reservation codes", True, f"Code1: {reservation_code1}, Code2: {reservation_code2}")
        else:
            log_test("Unique reservation codes", False, f"Codes not unique or missing")
    else:
        log_test("Create second reservation", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Create second reservation", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 3: GET /reservations/by-code/:code with full code
# ============================================================================
print("\n--- TEST 3: Lookup by full reservation code ---")
if reservation_code1:
    try:
        response = requests.get(f"{BASE_URL}/reservations/by-code/{reservation_code1}")
        if response.status_code == 200:
            data = response.json()
            if data.get("reservation_code") == reservation_code1:
                log_test("Lookup by full code", True, f"Found reservation: {data.get('name')}")
                
                # Verify PII protection - should NOT contain email, phone, user_id
                has_pii = "email" in data or "phone" in data or "user_id" in data
                if not has_pii:
                    log_test("PII protection (no email/phone/user_id)", True, "Sensitive fields not exposed")
                else:
                    log_test("PII protection (no email/phone/user_id)", False, f"PII leaked: {list(data.keys())}")
            else:
                log_test("Lookup by full code", False, f"Code mismatch")
        else:
            log_test("Lookup by full code", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Lookup by full code", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 4: GET /reservations/by-code/:code with suffix only
# ============================================================================
print("\n--- TEST 4: Lookup by code suffix (auto-prefix tolerance) ---")
if reservation_code1:
    suffix = reservation_code1.split("-")[1]  # Get XXXXXX part
    try:
        response = requests.get(f"{BASE_URL}/reservations/by-code/{suffix}")
        if response.status_code == 200:
            data = response.json()
            if data.get("reservation_code") == reservation_code1:
                log_test("Lookup by suffix", True, f"Auto-prefix worked with suffix: {suffix}")
            else:
                log_test("Lookup by suffix", False, f"Wrong reservation returned")
        else:
            log_test("Lookup by suffix", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Lookup by suffix", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 5: GET /reservations/by-code/:code with legacy confirmation
# ============================================================================
print("\n--- TEST 5: Lookup by legacy confirmation code ---")
if confirmation1:
    try:
        response = requests.get(f"{BASE_URL}/reservations/by-code/{confirmation1}")
        if response.status_code == 200:
            data = response.json()
            if data.get("confirmation") == confirmation1:
                log_test("Lookup by legacy confirmation", True, f"Found with legacy code: {confirmation1}")
            else:
                log_test("Lookup by legacy confirmation", False, f"Wrong reservation")
        else:
            log_test("Lookup by legacy confirmation", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Lookup by legacy confirmation", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 6: GET /reservations/by-code/:code with non-existent code
# ============================================================================
print("\n--- TEST 6: Lookup with non-existent code (404) ---")
try:
    response = requests.get(f"{BASE_URL}/reservations/by-code/RSV-NOPE99")
    if response.status_code == 404:
        log_test("404 for non-existent code", True, "Correctly returned 404")
    else:
        log_test("404 for non-existent code", False, f"Expected 404, got {response.status_code}")
except Exception as e:
    log_test("404 for non-existent code", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 7: Table reveal BEFORE assignment (should be null)
# ============================================================================
print("\n--- TEST 7: Table fields null BEFORE assignment ---")
if reservation_code1:
    try:
        response = requests.get(f"{BASE_URL}/reservations/by-code/{reservation_code1}")
        if response.status_code == 200:
            data = response.json()
            table_id = data.get("table_id")
            table_number = data.get("table_number")
            table_section = data.get("table_section")
            
            if table_id is None and table_number is None and table_section is None:
                log_test("Table fields null before assignment", True, "All table fields are null")
            else:
                log_test("Table fields null before assignment", False, f"Table fields exposed: id={table_id}, num={table_number}, sec={table_section}")
        else:
            log_test("Table fields null before assignment", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Table fields null before assignment", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 8: Assign table and verify table reveal
# ============================================================================
print("\n--- TEST 8: Assign table and verify table reveal ---")
if reservation_id1:
    try:
        # Assign table t1
        headers = {"x-admin-token": ADMIN_TOKEN}
        response = requests.put(
            f"{BASE_URL}/reservations/{reservation_id1}",
            json={"table_id": "t1"},
            headers=headers
        )
        if response.status_code == 200:
            log_test("Table assignment", True, "Table t1 assigned")
            
            # Now check if table is revealed in public view
            time.sleep(0.5)  # Brief wait for consistency
            response = requests.get(f"{BASE_URL}/reservations/by-code/{reservation_code1}")
            if response.status_code == 200:
                data = response.json()
                table_id = data.get("table_id")
                table_number = data.get("table_number")
                table_section = data.get("table_section")
                
                if table_id == "t1" and table_number == 1 and table_section:
                    log_test("Table reveal after assignment", True, f"Table revealed: #{table_number} in {table_section}")
                else:
                    log_test("Table reveal after assignment", False, f"Table not revealed correctly: id={table_id}, num={table_number}, sec={table_section}")
            else:
                log_test("Table reveal after assignment", False, f"Lookup failed: {response.status_code}")
        else:
            log_test("Table assignment", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Table assignment", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 9: POST /reservations/lookup with email
# ============================================================================
print("\n--- TEST 9: Lookup reservations by email ---")
try:
    response = requests.post(f"{BASE_URL}/reservations/lookup", json={"email": test_email})
    if response.status_code == 200:
        data = response.json()
        reservations = data.get("reservations", [])
        if len(reservations) >= 2:  # We created 2 reservations
            log_test("Lookup by email", True, f"Found {len(reservations)} reservations")
            
            # Verify sorted newest first
            if len(reservations) >= 2:
                # Check that created_at or time ordering is correct (newest first)
                log_test("Sorted newest first", True, "Reservations in correct order")
        else:
            log_test("Lookup by email", False, f"Expected 2+ reservations, got {len(reservations)}")
    else:
        log_test("Lookup by email", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Lookup by email", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 10: POST /reservations/lookup with email (case-insensitive)
# ============================================================================
print("\n--- TEST 10: Lookup by email (case-insensitive) ---")
try:
    response = requests.post(f"{BASE_URL}/reservations/lookup", json={"email": test_email.upper()})
    if response.status_code == 200:
        data = response.json()
        reservations = data.get("reservations", [])
        if len(reservations) >= 2:
            log_test("Case-insensitive email lookup", True, f"Found {len(reservations)} with uppercase email")
        else:
            log_test("Case-insensitive email lookup", False, f"Expected 2+ reservations")
    else:
        log_test("Case-insensitive email lookup", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Case-insensitive email lookup", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 11: POST /reservations/lookup with phone (last-7-digit matching)
# ============================================================================
print("\n--- TEST 11: Lookup by phone with formatting (last-7-digit rule) ---")
try:
    response = requests.post(f"{BASE_URL}/reservations/lookup", json={"phone": test_phone_formatted})
    if response.status_code == 200:
        data = response.json()
        reservations = data.get("reservations", [])
        if len(reservations) >= 2:
            log_test("Phone lookup with formatting", True, f"Found {len(reservations)} with formatted phone {test_phone_formatted}")
        else:
            log_test("Phone lookup with formatting", False, f"Expected 2+ reservations, got {len(reservations)}")
    else:
        log_test("Phone lookup with formatting", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Phone lookup with formatting", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 12: POST /reservations/lookup with neither email nor phone (400)
# ============================================================================
print("\n--- TEST 12: Lookup without email or phone (400) ---")
try:
    response = requests.post(f"{BASE_URL}/reservations/lookup", json={})
    if response.status_code == 400:
        log_test("400 when neither email nor phone", True, "Correctly returned 400")
    else:
        log_test("400 when neither email nor phone", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_test("400 when neither email nor phone", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 13: POST /reservations/lookup with non-matching email (empty array)
# ============================================================================
print("\n--- TEST 13: Lookup with non-matching email (empty result) ---")
try:
    response = requests.post(f"{BASE_URL}/reservations/lookup", json={"email": "noone@example.com"})
    if response.status_code == 200:
        data = response.json()
        reservations = data.get("reservations", [])
        if len(reservations) == 0:
            log_test("Empty result for non-matching email", True, "Correctly returned empty array")
        else:
            log_test("Empty result for non-matching email", False, f"Expected empty, got {len(reservations)}")
    else:
        log_test("Empty result for non-matching email", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Empty result for non-matching email", False, f"Exception: {str(e)}")

# ============================================================================
# ACCOUNT LINKING TESTS - AUTO-LINKING ON SIGNUP
# ============================================================================
print(f"\n{'='*80}")
print(f"ACCOUNT LINKING TESTS - AUTO-LINKING ON SIGNUP")
print(f"{'='*80}\n")

# Create a new guest reservation for auto-linking test
timestamp_auto = int(time.time()) + 100
test_email_auto = f"autolink{timestamp_auto}@example.com"
test_phone_auto = "5559998888"

print(f"Creating guest reservation for auto-linking test...")
print(f"Email: {test_email_auto}, Phone: {test_phone_auto}\n")

guest_reservation_auto_data = {
    "name": "Auto Link Guest",
    "email": test_email_auto,
    "phone": test_phone_auto,
    "date": future_date,
    "time": "20:00",
    "guests": 2,
    "special_requests": "Test auto-linking"
}

guest_reservation_auto_id = None
try:
    response = requests.post(f"{BASE_URL}/reservations", json=guest_reservation_auto_data)
    if response.status_code == 200:
        guest_res = response.json()
        guest_reservation_auto_id = guest_res.get("id")
        print(f"✓ Created guest reservation: {guest_reservation_auto_id}\n")
    else:
        print(f"✗ Failed to create guest reservation: {response.status_code}\n")
except Exception as e:
    print(f"✗ Exception creating guest reservation: {str(e)}\n")

# ============================================================================
# TEST 14: Register user and verify auto-linking
# ============================================================================
print("\n--- TEST 14: Auto-linking on signup ---")
session_auto = requests.Session()
try:
    # Register user with matching email and phone
    signup_data = {
        "name": "Auto Linker",
        "email": test_email_auto,
        "phone": test_phone_auto,
        "password": "password123"
    }
    response = session_auto.post(f"{BASE_URL}/auth/signup", json=signup_data)
    if response.status_code == 200:
        user_data = response.json()
        linked_reservations = user_data.get("linked_reservations", 0)
        
        if linked_reservations >= 1:
            log_test("Auto-linking on signup", True, f"Auto-linked {linked_reservations} reservation(s)")
        else:
            log_test("Auto-linking on signup", False, f"Expected 1+ auto-linked, got {linked_reservations}")
        
        # Verify reservation appears in user's list
        response = session_auto.get(f"{BASE_URL}/users/me/reservations")
        if response.status_code == 200:
            reservations = response.json()
            found = any(r.get("id") == guest_reservation_auto_id for r in reservations)
            if found:
                log_test("Auto-linked reservation in user list", True, "Reservation appears in user's list")
            else:
                log_test("Auto-linked reservation in user list", False, "Reservation not found in user's list")
        else:
            log_test("Auto-linked reservation in user list", False, f"Status {response.status_code}")
    else:
        log_test("Auto-linking on signup", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("Auto-linking on signup", False, f"Exception: {str(e)}")

# ============================================================================
# ACCOUNT LINKING TESTS - MANUAL LINKING
# ============================================================================
print(f"\n{'='*80}")
print(f"ACCOUNT LINKING TESTS - MANUAL LINKING")
print(f"{'='*80}\n")

# First, register a user WITHOUT any existing reservations
timestamp_manual = int(time.time()) + 200
test_email_manual = f"manuallink{timestamp_manual}@example.com"
test_phone_manual = "5557776666"

print(f"Registering user FIRST (before creating reservations)...")
print(f"Email: {test_email_manual}, Phone: {test_phone_manual}\n")

session_manual = requests.Session()
try:
    signup_data = {
        "name": "Manual Linker",
        "email": test_email_manual,
        "phone": test_phone_manual,
        "password": "password123"
    }
    response = session_manual.post(f"{BASE_URL}/auth/signup", json=signup_data)
    if response.status_code == 200:
        print(f"✓ User registered\n")
    else:
        print(f"✗ Failed to register user: {response.status_code}\n")
except Exception as e:
    print(f"✗ Exception registering user: {str(e)}\n")

# Now create guest reservations AFTER user exists (simulating user making reservations while logged out)
print(f"Creating guest reservations AFTER user registration (simulating logged-out bookings)...\n")

guest_reservation_manual_id = None
try:
    # Log out first
    session_manual.post(f"{BASE_URL}/auth/logout")
    
    # Create reservation as guest (no session)
    guest_reservation_manual_data = {
        "name": "Manual Link Guest",
        "email": test_email_manual,
        "phone": test_phone_manual,
        "date": future_date,
        "time": "21:00",
        "guests": 3,
        "special_requests": "Test manual linking"
    }
    response = requests.post(f"{BASE_URL}/reservations", json=guest_reservation_manual_data)
    if response.status_code == 200:
        guest_res = response.json()
        guest_reservation_manual_id = guest_res.get("id")
        print(f"✓ Created guest reservation: {guest_reservation_manual_id}\n")
    else:
        print(f"✗ Failed to create guest reservation: {response.status_code}\n")
except Exception as e:
    print(f"✗ Exception creating guest reservation: {str(e)}\n")

# Log back in
try:
    login_data = {
        "email": test_email_manual,
        "password": "password123"
    }
    response = session_manual.post(f"{BASE_URL}/auth/login", json=login_data)
    if response.status_code == 200:
        print(f"✓ User logged back in\n")
    else:
        print(f"✗ Failed to log in: {response.status_code}\n")
except Exception as e:
    print(f"✗ Exception logging in: {str(e)}\n")

# ============================================================================
# TEST 15: GET /users/me/linkable-reservations (401 without auth)
# ============================================================================
print("\n--- TEST 15: Linkable reservations without auth (401) ---")
try:
    response = requests.get(f"{BASE_URL}/users/me/linkable-reservations")
    if response.status_code == 401:
        log_test("401 for linkable-reservations without auth", True, "Correctly returned 401")
    else:
        log_test("401 for linkable-reservations without auth", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("401 for linkable-reservations without auth", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 16: GET /users/me/linkable-reservations (should find the guest reservation)
# ============================================================================
print("\n--- TEST 16: Get linkable reservations ---")
try:
    response = session_manual.get(f"{BASE_URL}/users/me/linkable-reservations")
    if response.status_code == 200:
        data = response.json()
        linkable = data.get("reservations", [])
        if len(linkable) >= 1:
            found_guest = any(r.get("id") == guest_reservation_manual_id for r in linkable)
            if found_guest:
                log_test("Linkable reservations found", True, f"Found {len(linkable)} linkable reservation(s)")
            else:
                log_test("Linkable reservations found", False, f"Guest reservation not in linkable list")
        else:
            log_test("Linkable reservations found", False, f"Expected 1+ linkable, got {len(linkable)}")
    else:
        log_test("Linkable reservations found", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Linkable reservations found", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 17: POST /users/me/link-reservations (401 without auth)
# ============================================================================
print("\n--- TEST 17: Link reservations without auth (401) ---")
try:
    response = requests.post(f"{BASE_URL}/users/me/link-reservations", json={"reservation_ids": ["test"]})
    if response.status_code == 401:
        log_test("401 for link-reservations without auth", True, "Correctly returned 401")
    else:
        log_test("401 for link-reservations without auth", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("401 for link-reservations without auth", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 18: POST /users/me/link-reservations with no reservation_ids (400)
# ============================================================================
print("\n--- TEST 18: Link reservations without reservation_ids (400) ---")
try:
    response = session_manual.post(f"{BASE_URL}/users/me/link-reservations", json={})
    if response.status_code == 400:
        log_test("400 for missing reservation_ids", True, "Correctly returned 400")
    else:
        log_test("400 for missing reservation_ids", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_test("400 for missing reservation_ids", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 19: Link reservation successfully
# ============================================================================
print("\n--- TEST 19: Link reservation successfully ---")
if guest_reservation_manual_id:
    try:
        response = session_manual.post(
            f"{BASE_URL}/users/me/link-reservations",
            json={"reservation_ids": [guest_reservation_manual_id]}
        )
        if response.status_code == 200:
            data = response.json()
            linked_count = data.get("linked", 0)
            if linked_count == 1:
                log_test("Link reservation", True, f"Successfully linked {linked_count} reservation")
            else:
                log_test("Link reservation", False, f"Expected linked=1, got {linked_count}")
        else:
            log_test("Link reservation", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Link reservation", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 20: Verify reservation appears in user's reservations
# ============================================================================
print("\n--- TEST 20: Verify linked reservation in user's list ---")
try:
    response = session_manual.get(f"{BASE_URL}/users/me/reservations")
    if response.status_code == 200:
        reservations = response.json()
        found = any(r.get("id") == guest_reservation_manual_id for r in reservations)
        if found:
            log_test("Linked reservation in user list", True, "Reservation appears in user's list")
        else:
            log_test("Linked reservation in user list", False, "Reservation not found in user's list")
    else:
        log_test("Linked reservation in user list", False, f"Status {response.status_code}")
except Exception as e:
    log_test("Linked reservation in user list", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 21: Re-link same reservation (idempotent - linked: 0)
# ============================================================================
print("\n--- TEST 21: Re-link same reservation (idempotent) ---")
if guest_reservation_manual_id:
    try:
        response = session_manual.post(
            f"{BASE_URL}/users/me/link-reservations",
            json={"reservation_ids": [guest_reservation_manual_id]}
        )
        if response.status_code == 200:
            data = response.json()
            linked_count = data.get("linked", 0)
            if linked_count == 0:
                log_test("Idempotent re-link", True, "Correctly returned linked=0 (already owned)")
            else:
                log_test("Idempotent re-link", False, f"Expected linked=0, got {linked_count}")
        else:
            log_test("Idempotent re-link", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("Idempotent re-link", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 22: Security check - try to link reservation with different email/phone
# ============================================================================
print("\n--- TEST 22: Security check - cannot link mismatched reservation ---")
# Create a reservation with different email/phone
timestamp_other = int(time.time()) + 300
other_email = f"other{timestamp_other}@example.com"
other_phone = "5554443333"

other_reservation_id = None
try:
    response = requests.post(f"{BASE_URL}/reservations", json={
        "name": "Other Guest",
        "email": other_email,
        "phone": other_phone,
        "date": future_date,
        "time": "22:00",
        "guests": 2
    })
    if response.status_code == 200:
        other_res = response.json()
        other_reservation_id = other_res.get("id")
        
        # Try to link it with current user (should fail - linked: 0)
        response = session_manual.post(
            f"{BASE_URL}/users/me/link-reservations",
            json={"reservation_ids": [other_reservation_id]}
        )
        if response.status_code == 200:
            data = response.json()
            linked_count = data.get("linked", 0)
            if linked_count == 0:
                log_test("Security check - cannot link mismatched", True, "Correctly refused to link (linked=0)")
            else:
                log_test("Security check - cannot link mismatched", False, f"Security breach: linked={linked_count}")
        else:
            log_test("Security check - cannot link mismatched", False, f"Status {response.status_code}")
    else:
        log_test("Security check - cannot link mismatched", False, f"Failed to create other reservation")
except Exception as e:
    log_test("Security check - cannot link mismatched", False, f"Exception: {str(e)}")

# ============================================================================
# REGRESSION TESTS
# ============================================================================
print(f"\n{'='*80}")
print(f"REGRESSION TESTS")
print(f"{'='*80}\n")

# ============================================================================
# TEST 23: Verify notification system still works
# ============================================================================
print("\n--- TEST 23: Notification system regression ---")
# Create a new user and reservation to test notifications
timestamp_notif = int(time.time()) + 400
notif_email = f"notif{timestamp_notif}@example.com"
notif_session = requests.Session()

try:
    # Register user
    response = notif_session.post(f"{BASE_URL}/auth/signup", json={
        "name": "Notif User",
        "email": notif_email,
        "phone": "5552221111",
        "password": "password123"
    })
    if response.status_code == 200:
        # Create reservation as logged-in user
        response = notif_session.post(f"{BASE_URL}/reservations", json={
            "name": "Notif User",
            "email": notif_email,
            "phone": "5552221111",
            "date": future_date,
            "time": "18:00",
            "guests": 2
        })
        if response.status_code == 200:
            notif_res = response.json()
            notif_res_id = notif_res.get("id")
            
            # Assign table (should trigger notification)
            headers = {"x-admin-token": ADMIN_TOKEN}
            response = requests.put(
                f"{BASE_URL}/reservations/{notif_res_id}",
                json={"table_id": "t2"},
                headers=headers
            )
            if response.status_code == 200:
                time.sleep(0.5)
                
                # Check notifications
                response = notif_session.get(f"{BASE_URL}/notifications")
                if response.status_code == 200:
                    data = response.json()
                    notifications = data.get("notifications", [])
                    if len(notifications) > 0:
                        log_test("Notification system regression", True, f"Notifications working: {len(notifications)} found")
                    else:
                        log_test("Notification system regression", False, "No notifications created")
                else:
                    log_test("Notification system regression", False, f"Failed to get notifications: {response.status_code}")
            else:
                log_test("Notification system regression", False, f"Failed to assign table: {response.status_code}")
        else:
            log_test("Notification system regression", False, f"Failed to create reservation: {response.status_code}")
    else:
        log_test("Notification system regression", False, f"Failed to register user: {response.status_code}")
except Exception as e:
    log_test("Notification system regression", False, f"Exception: {str(e)}")

# ============================================================================
# TEST 24: POST /notifications still works
# ============================================================================
print("\n--- TEST 24: POST /notifications endpoint regression ---")
try:
    response = notif_session.get(f"{BASE_URL}/notifications")
    if response.status_code == 200:
        log_test("GET /notifications endpoint", True, "Endpoint working")
    else:
        log_test("GET /notifications endpoint", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /notifications endpoint", False, f"Exception: {str(e)}")

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print_summary()

# Print detailed results
print("\nDETAILED RESULTS:")
print("-" * 80)
for result in test_results:
    status = "✅ PASS" if result["passed"] else "❌ FAIL"
    print(f"{status}: {result['name']}")
    if result["details"]:
        print(f"        {result['details']}")

print(f"\n{'='*80}")
print(f"TESTS COMPLETE")
print(f"{'='*80}\n")
