#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build a complete restaurant operating system and customer-facing website for "Aukstaitija" — a
  Modern Lithuanian fine-dining restaurant in Kaunas. Phase 1 MVP: luxury homepage, dynamic menu
  with search/filters/dietary tags, dish detail page, cart, guest checkout (cash on delivery only),
  table reservation with double-booking prevention, live order tracking, simple admin password
  dashboard (menu CRUD, orders, reservations, analytics), EN/LT toggle, EUR pricing, dark mode.
  Skipped for MVP: Stripe/PayPal/Revolut, AI recommendations, multi-role auth, email notifications.

backend:
  - task: "Categories API (GET /api/categories)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Auto-seeds 5 categories on first request. Manual curl shows correct response."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Returns 5 categories with order field (1-5), correctly sorted by order. Response structure verified."

  - task: "Dishes API: list, get-by-id, search/filter/sort"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/dishes supports search, category, dietary, sort=popular|price_asc|price_desc. GET /api/dishes/:id returns single dish or 404. Auto-seeds 10 Lithuanian dishes."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All filters working: search (cepelinai found), category (mains=5 dishes), dietary (veg=4 dishes), sort price_asc/desc verified. GET /dishes/cepelinai returns dish, /dishes/nonexistent returns 404."

  - task: "Dishes Admin CRUD (POST/PUT/DELETE)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Requires x-admin-token header matching ADMIN_PASSWORD env (admin123). Returns 401 without token."
        - working: true
          agent: "testing"
          comment: "✅ PASS - POST without token returns 401. POST with token creates dish with generated ID. PUT updates price correctly. DELETE returns ok:true. All auth checks working."

  - task: "Orders API (POST create, GET by id, PUT status, GET list admin)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST creates with subtotal+VAT(21%)+delivery fee. Returns generated order_number. PUT /orders/:id updates status (admin-only). GET /api/orders is admin-only."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Order created with correct calculations: subtotal €29.00, tax €6.09 (21%), delivery €3.50, total €38.59. Order number starts with 'AK'. GET by ID works. GET list requires admin token (401 without). PUT status update works."

  - task: "Reservations API (POST, GET availability, GET list admin, PUT)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/reservations/availability?date=YYYY-MM-DD returns 30-min slots 12:00–22:00 with available count. POST creates reservation; returns 409 when slot fully booked (double-booking prevention). 10 tables seeded."
        - working: true
          agent: "testing"
          comment: "✅ PASS - POST creates reservation with confirmation field (RES prefix). GET availability shows correct slot data (19:00 has 9 available after 1 booking). Double-booking prevention works: 10 reservations succeed, 11th returns 409 'Slot fully booked'. GET list requires admin token. PUT status update works."

  - task: "Admin login (POST /api/admin/login)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Returns token if password matches ADMIN_PASSWORD env. Default password admin123."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Wrong password returns 401. Correct password (admin123) returns 200 with token: 'admin123'."

  - task: "Admin analytics (GET /api/admin/analytics)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Returns total/today revenue, order counts, avg order value, top 5 dishes by units sold."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All required fields present: total_revenue, today_revenue, total_orders, today_orders, avg_order_value (number), top_dishes (array). Data calculations verified with test orders."

  - task: "Newsletter (POST /api/newsletter)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Stores email with upsert."
        - working: true
          agent: "testing"
          comment: "✅ PASS - With email returns ok:true. Without email returns 400 error. Validation working correctly."

  - task: "Kitchen orders endpoint (GET /api/kitchen/orders)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Returns orders with status in ['received','preparing','ready'], sorted priority desc + created_at asc. Admin-only (401 without x-admin-token)."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All scenarios verified: (1) Without x-admin-token returns 401 ✅ (2) With valid token returns 200 + array ✅ (3) Correctly filters only active orders (received/preparing/ready) - delivered orders excluded ✅ (4) Sorting verified: priority=true orders appear first, then sorted by created_at ascending (oldest first) ✅"

  - task: "Order status timestamps + priority flag (PUT /api/orders/:id)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:

  - task: "Tables list/detail endpoints (GET /api/tables, GET /api/tables/:id, GET /api/tables/:id/info)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/tables returns all 10 seeded tables enriched with active_session, active_orders count, upcoming_reservation. GET /api/tables/:id returns table + session + orders + upcoming_reservations. GET /api/tables/:id/info is PUBLIC (no auth) for QR code landing — returns id, number, capacity, section, status. PUT /api/tables/:id (admin) updates status/capacity/section/x/y/number."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All scenarios verified: (1) GET /api/tables returns 10 tables with all required fields (id, number, capacity, status, section, x, y, active_session, active_orders, upcoming_reservation) ✅ (2) GET /api/tables/t1 returns detail with active_session and orders ✅ (3) GET /api/tables/nope returns 404 ✅ (4) GET /api/tables/t1/info PUBLIC endpoint works without auth, returns only public fields ✅ (5) PUT /api/tables/t1 without admin returns 401 ✅ (6) PUT /api/tables/t1 with admin updates status correctly ✅"

  - task: "Walk-in seating (POST /api/tables/:id/walkin)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Admin-only. body { guests, customer_name? } creates an active table_session with origin='walkin' and sets table.status='occupied'. Returns 409 if table already has an active session."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All scenarios verified: (1) POST without admin token returns 401 ✅ (2) POST with admin creates session with origin='walkin', session_status='active' ✅ (3) Table status becomes 'occupied' after walk-in ✅ (4) Second walk-in on same table returns 409 ✅ (5) Close + cleaned flow works, table returns to 'available' ✅"

  - task: "Reservation check-in (POST /api/reservations/:id/checkin)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Admin-only. body { table_id }. Creates session linked to reservation, updates reservation.status='checked_in' with checked_in_at, sets table.status='occupied'. Returns 409 if table has active session, 400 if no table_id."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All scenarios verified: (1) Check-in without admin returns 401 ✅ (2) Check-in with admin creates session with origin='reservation' ✅ (3) Reservation status becomes 'checked_in' with checked_in_at timestamp and table_id set ✅ (4) Table status becomes 'occupied' ✅ (5) Second check-in returns 409 ✅ (6) Check-in without table_id returns 400 ✅"

  - task: "Table close + cleaned + bill + pay flow"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "All admin-only. POST /api/tables/:id/close ends session + sets status=cleaning. POST /api/tables/:id/cleaned sets status=available. GET /api/tables/:id/bill computes subtotal + 21% VAT + total from session orders, returns invoice_number. POST /api/tables/:id/pay marks all session orders paid+delivered, closes session, sets status=cleaning, completes linked reservation."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Complete bill+pay flow verified: (1) Walk-in creates session ✅ (2) Multiple orders placed on table ✅ (3) GET bill without admin returns 401 ✅ (4) GET bill with admin returns correct calculations: subtotal €40.50, tax €8.50 (21%), total €49.00, invoice_number starts with 'INV' ✅ (5) POST pay marks all orders as paid+delivered with correct payment_method ✅ (6) Table status becomes 'cleaning' after pay ✅ (7) Session completed (no active session) ✅ (8) POST cleaned returns table to 'available' ✅"

  - task: "QR-based dine-in order auto-creates session + occupies table (POST /api/orders with table_id)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/orders with body.table_id auto-creates a walk-in session if none exists, sets table.status=occupied, links the order to session_id and stores table_number on order. Order_type is set to 'dine_in'."
        - working: true
          agent: "testing"
          comment: "✅ PASS - QR order flow verified: (1) POST /api/orders with table_id auto-creates session with origin='qr_order' ✅ (2) Order has order_type='dine_in', table_id, table_number, session_id, type='dine-in' ✅ (3) Table status becomes 'occupied' ✅ (4) Second order on same table reuses existing session (same session_id) ✅"

  - task: "Reservation status upgrades (PUT /api/reservations/:id) + auto no-show"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "PUT /api/reservations/:id now accepts {status, table_id}. Status can be pending/confirmed/checked_in/completed/no_show/cancelled. Sets no_show_at when status=no_show, completed_at when completed. autoUpdateTableStatuses() runs on GET /api/tables and auto-marks reservations as no_show if their date+time is more than 30 min in the past and they were not checked in. Tables with assigned reservation in next 2hrs are auto-marked 'reserved'."
        - working: "NA"
          agent: "main"
          comment: "PUT /api/orders/:id now sets accepted_at when status=preparing, ready_at when status=ready, out_at when status=out, delivered_at when status=delivered. Also accepts {priority: true|false} flag for urgent orders. Used by Kitchen Dashboard."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All timestamp and priority scenarios verified: (1) PUT without admin token returns 401 ✅ (2) PUT status='preparing' sets accepted_at field ✅ (3) PUT status='ready' sets ready_at field ✅ (4) PUT status='out' sets out_at field ✅ (5) PUT status='delivered' sets delivered_at field ✅ (6) PUT priority=true sets priority to true ✅ (7) PUT priority=false sets priority to false ✅"
        - working: true
          agent: "testing"
          comment: "✅ PASS - Reservation status updates + auto no-show verified: (1) PUT without admin returns 401 ✅ (2) PUT status='cancelled' works ✅ (3) PUT status='no_show' sets no_show_at timestamp ✅ (4) PUT status='completed' sets completed_at timestamp ✅ (5) Future reservation (now+1h) with assigned table auto-marks table as 'reserved' ✅ (6) Past reservation (now-2h) with assigned table auto-marks as 'no_show' when GET /api/tables triggers autoUpdateTableStatuses ✅"


  - task: "Order creation stores prep_time_total field"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/orders now computes prep_time_total = max prep_time across all items (parallel cooking). Stored for delivery orders."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Order creation verified: (1) GET /api/dishes returns dish with prep_time ✅ (2) GET /api/delivery-zones returns zone with eta_minutes ✅ (3) POST /api/orders with type='delivery' creates order with prep_time_total > 0 (number, minutes) ✅ (4) delivery_status='pending', courier_requested_at=null, courier_eta=zone.eta_minutes ✅"

  - task: "Predictive courier dispatch (POST /api/orders/:id/dispatch during preparing/ready)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/orders/:id/dispatch now allows dispatch during 'preparing' OR 'ready' status. Sets delivery_status='courier_requested', courier_requested_at=now. Does NOT advance order.status (food may still be cooking). Returns 400 if courier already requested or if status not in ['preparing','ready']. Requires admin auth."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All dispatch scenarios verified: (1) Dispatch during PREPARING: status stays 'preparing', delivery_status='courier_requested', courier_requested_at set, out_at=null ✅ (2) Dispatch during READY: status stays 'ready', delivery_status='courier_requested', courier_requested_at set ✅ (3) Double-dispatch prevention: second dispatch returns 400 'Courier already requested' ✅ (4) Dispatch from RECEIVED returns 400 'Order must be Preparing or Ready' ✅ (5) Dispatch on pickup order returns 400 'Not a delivery order' ✅ (6) Dispatch without admin token returns 401 ✅"

  - task: "Picked-up endpoint NEW behavior (POST /api/orders/:id/picked-up)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/orders/:id/picked-up now sets delivery_status='picked_up' AND status='out' AND picked_up_at + out_at timestamps. This is the moment courier actually leaves with food. Admin-only."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Picked-up endpoint verified: (1) POST /picked-up on dispatched order advances status to 'out' ✅ (2) delivery_status='picked_up' ✅ (3) picked_up_at and out_at both set with ISO timestamps ✅ (4) POST /picked-up without admin token returns 401 ✅"

  - task: "Delivered endpoint (POST /api/orders/:id/delivered)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/orders/:id/delivered unchanged - sets status='delivered', delivery_status='delivered', delivered_at timestamp. Admin-only."
        - working: true
          agent: "testing"
          comment: "✅ PASS - Delivered endpoint verified: (1) POST /delivered on picked-up order sets status='delivered' ✅ (2) delivery_status='delivered' ✅ (3) delivered_at timestamp set ✅"

  - task: "Regression sanity checks (categories, dishes, admin login, kitchen orders, reservations)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Existing endpoints should not be affected by predictive dispatch changes."
        - working: true
          agent: "testing"
          comment: "✅ PASS - All regression tests passed: (1) GET /api/categories returns 5 ✅ (2) GET /api/dishes returns array of 10 dishes ✅ (3) POST /api/admin/login with password 'admin123' returns token ✅ (4) GET /api/kitchen/orders with admin returns array (6 active orders) ✅ (5) POST /api/reservations with valid body creates reservation with RES prefix ✅"

frontend:
  - task: "Customer pages (home, menu, dish detail, cart, checkout, reservations, order tracking, admin)"
    implemented: true
    working: "NA"
    file: "app/page.js, app/menu/*, app/cart/page.js, app/checkout/page.js, app/reservations/page.js, app/order/[id]/page.js, app/admin/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Built. Will request user permission before frontend testing."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 4
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      ## Predictive Courier Dispatch — Backend changes (please test)

      Implemented predictive courier dispatch so couriers can be called while food
      is still cooking, eliminating wait time at the pass.

      Backend changes in /app/app/api/[[...path]]/route.js:

      1) POST /api/orders
         - When type='delivery', the order now stores `prep_time_total` = max
           prep_time across all items (parallel cooking assumption). Falls back
           to 15 if dishes can't be resolved.
         - New initial field `courier_requested_at: null`.

      2) POST /api/orders/:id/dispatch  (BEHAVIOR CHANGED)
         - Previously only allowed when status='ready' and set status='out'.
         - Now allowed when status IN ['preparing', 'ready'].
         - Sets delivery_status='courier_requested', courier_requested_at=now,
           courier_assigned_at=now (kept for back-compat).
         - Does NOT advance order.status (food may still be cooking).
         - Returns 400 if courier already requested ('courier_requested',
           'picked_up', 'on_the_way', 'delivered').
         - Still requires admin auth (401 without token).
         - Still requires order.type='delivery' (400 otherwise).

      3) POST /api/orders/:id/picked-up  (BEHAVIOR CHANGED)
         - Previously: set delivery_status='on_the_way'.
         - Now: sets delivery_status='picked_up' AND status='out' AND
           picked_up_at + out_at timestamps. This is the moment the courier
           actually leaves the restaurant with the food.
         - Admin-only.

      4) POST /api/orders/:id/delivered — unchanged (sets status=delivered,
         delivery_status='delivered', delivered_at).

      Please test the following scenarios end-to-end:

      A) Order creation:
         - Create a delivery order with delivery_zone_id and at least 1 item ->
           expect order.prep_time_total > 0, courier_requested_at === null,
           delivery_status === 'pending'.

      B) Dispatch during preparing (NEW happy path):
         - Create delivery order, PUT status='preparing', then
           POST /orders/:id/dispatch with admin token & {provider:'in_house'}.
         - Expect 200 ok:true, order.delivery_status==='courier_requested',
           order.courier_requested_at set, order.status STILL 'preparing'.

      C) Dispatch during ready:
         - Create delivery order, PUT status='preparing' then 'ready', then
           POST /dispatch -> same behavior, status stays 'ready', delivery_status
           becomes 'courier_requested'.

      D) Double-dispatch prevention:
         - After C, calling /dispatch again returns 400 'Courier already requested'.

      E) Dispatch from received returns 400 ('Order must be Preparing or Ready
         before dispatch').

      F) Picked-up flow:
         - After dispatch (state=preparing+courier_requested), POST /picked-up ->
           order.status='out', delivery_status='picked_up', picked_up_at + out_at
           set.

      G) Auth: /dispatch and /picked-up without admin token -> 401.

      H) Non-delivery order /dispatch -> 400.

      Admin endpoints require header `x-admin-token: admin123`.
      Database auto-seeds 5 categories, 10 Lithuanian dishes, and 10 tables on first call.
      All endpoints prefixed with /api. Currency EUR, VAT 21%, delivery fee €3.50 when type=delivery.
      Reservation slots are 30-min between 12:00–22:00; total tables = 10.
      Please test all backend endpoints listed in test_plan, including:
        - happy paths (create dish, create order, create reservation)
        - admin auth (401 without token, 200 with valid token)
        - reservation double-booking prevention (book same slot 11+ times → 409)
        - search/filter/sort on dishes
        - order status updates and analytics calculation
  - agent: "testing"
    message: |
      ✅ ALL BACKEND TESTS PASSED (39/39 - 100% success rate)
      
      Comprehensive testing completed for all 8 backend tasks:
      1. Categories API - Returns 5 categories sorted by order ✅
      2. Dishes API - List, search, filters (category, dietary), sorting all working ✅
      3. Dishes by ID - Single dish retrieval and 404 handling ✅
      4. Dishes Admin CRUD - POST/PUT/DELETE with proper auth (401 without token) ✅
      5. Orders API - Correct calculations (subtotal, 21% VAT, €3.50 delivery), order number with AK prefix ✅
      6. Reservations API - Creation, availability, double-booking prevention (11th returns 409) ✅
      7. Admin Login - Wrong password 401, correct password returns token ✅
      8. Admin Analytics - All required fields present with correct types ✅
      9. Newsletter - Email validation working (400 without email) ✅
      
      All financial calculations verified:
      - Subtotal: €29.00 (14.50 × 2) ✅
      - Tax: €6.09 (21% VAT) ✅
      - Delivery: €3.50 ✅
      - Total: €38.59 ✅
      
      Double-booking prevention confirmed: 10 reservations succeed, 11th returns 409 "Slot fully booked" ✅
      
      Backend is production-ready. No issues found.
  - agent: "testing"
    message: |
      ✅ NEW KITCHEN DASHBOARD ENDPOINTS TESTED - ALL PASSED (17/17 tests)
      
      Test Run 2 - Kitchen Dashboard Features:
      
      1. GET /api/kitchen/orders (9 tests):
         - Without x-admin-token → 401 Unauthorized ✅
         - With valid token → 200 + array of orders ✅
         - Filtering verified: Only orders with status in ['received', 'preparing', 'ready'] returned ✅
         - Delivered orders correctly excluded ✅
         - Sorting verified: priority=true orders appear first ✅
         - Within same priority, sorted by created_at ascending (oldest first) ✅
      
      2. PUT /api/orders/:id - Timestamps + Priority (8 tests):
         - Without admin token → 401 Unauthorized ✅
         - PUT status='preparing' → accepted_at field set with ISO timestamp ✅
         - PUT status='ready' → ready_at field set with ISO timestamp ✅
         - PUT status='out' → out_at field set with ISO timestamp ✅
         - PUT status='delivered' → delivered_at field set with ISO timestamp ✅
         - PUT priority=true → priority field set to true ✅
         - PUT priority=false → priority field set to false ✅
      
      All scenarios from review request verified and working correctly.
      Backend implementation is complete and production-ready.
  - agent: "testing"
    message: |
      ✅ TABLE LIFECYCLE BACKEND TESTS - ALL PASSED (7/7 - 100% success rate)
      
      Test Run 3 - Table Lifecycle Features:
      
      1. Tables list/detail endpoints (7 tests):
         - GET /api/tables returns 10 tables with all required fields ✅
         - GET /api/tables/:id returns detail with active_session and orders ✅
         - GET /api/tables/nope returns 404 ✅
         - GET /api/tables/:id/info PUBLIC endpoint works without auth ✅
         - PUT /api/tables/:id without admin returns 401 ✅
         - PUT /api/tables/:id with admin updates status correctly ✅
      
      2. Walk-in seating (6 tests):
         - POST without admin returns 401 ✅
         - POST with admin creates session with origin='walkin' ✅
         - Table status becomes 'occupied' ✅
         - Second walk-in returns 409 ✅
         - Close + cleaned flow works ✅
      
      3. QR/dine-in order auto-creates session (4 tests):
         - POST /api/orders with table_id auto-creates session with origin='qr_order' ✅
         - Order has correct fields (order_type='dine_in', table_id, session_id) ✅
         - Table status becomes 'occupied' ✅
         - Second order reuses same session ✅
      
      4. Reservation check-in (8 tests):
         - Check-in without admin returns 401 ✅
         - Check-in with admin creates session with origin='reservation' ✅
         - Reservation status becomes 'checked_in' with timestamp ✅
         - Table status becomes 'occupied' ✅
  - agent: "testing"
    message: |
      ✅ PREDICTIVE COURIER DISPATCH TESTS - ALL PASSED (27/27 - 100% success rate)
      
      Test Run 4 - Predictive Courier Dispatch Feature:
      
      **NEW FEATURES TESTED:**
      
      1. Order creation stores prep_time_total (3 tests):
         - GET /api/dishes returns dish with prep_time field ✅
         - GET /api/delivery-zones returns zone with eta_minutes ✅
         - POST /api/orders with type='delivery' creates order with prep_time_total=25 minutes (number) ✅
         - Initial state: delivery_status='pending', courier_requested_at=null, courier_eta=zone.eta_minutes ✅
      
      2. Predictive dispatch during PREPARING (6 tests):
         - Created delivery order and updated status to 'preparing' ✅
         - POST /api/orders/:id/dispatch with provider='in_house' returns 200 ✅
         - Response: ok=true, manual=true, order object included ✅
         - delivery_status='courier_requested', courier_requested_at set ✅
         - status STAYS 'preparing' (NOT advanced to 'out') ✅
         - out_at remains null/undefined ✅
         - delivery_method='in_house', delivery_provider='in_house' ✅
      
      3. Dispatch during READY (4 tests):
         - Created delivery order, updated to 'preparing' then 'ready' ✅
         - POST /dispatch with provider='wolt' returns 200 ✅
         - delivery_status='courier_requested', courier_requested_at set ✅
         - status STAYS 'ready' (NOT advanced to 'out') ✅
      
      4. Double-dispatch prevention (1 test):
         - Second POST /dispatch on same order returns 400 ✅
         - Error message: "Courier already requested for this order" ✅
      
      5. Dispatch validation (5 tests):
         - Dispatch from 'received' status returns 400 "Order must be Preparing or Ready before dispatch" ✅
         - Dispatch on pickup order returns 400 "Not a delivery order" ✅
         - Dispatch without admin token returns 401 ✅
      
      6. Picked-up endpoint NEW behavior (3 tests):
         - POST /api/orders/:id/picked-up on dispatched order returns 200 ✅
         - status advanced to 'out' ✅
         - delivery_status='picked_up' ✅
         - picked_up_at and out_at both set with ISO timestamps ✅
         - Picked-up without admin token returns 401 ✅
      
      7. Delivered endpoint (2 tests):
         - POST /api/orders/:id/delivered on picked-up order returns 200 ✅
         - status='delivered', delivery_status='delivered', delivered_at set ✅
      
      8. Regression sanity checks (5 tests):
         - GET /api/categories returns 5 categories ✅
         - GET /api/dishes returns array of 10 dishes ✅
         - POST /api/admin/login with password 'admin123' returns token ✅
         - GET /api/kitchen/orders with admin returns array (6 active orders) ✅
         - POST /api/reservations creates reservation with RES prefix ✅
      
      **CRITICAL VERIFICATION:**
      - ✅ NO REGRESSIONS: All existing endpoints working correctly
      - ✅ Dispatch during PREPARING does NOT advance status (predictive behavior)
      - ✅ Dispatch during READY does NOT advance status
      - ✅ Picked-up endpoint NOW advances status to 'out' (new behavior)
      - ✅ Double-dispatch prevention working
      - ✅ Auth checks working (401 without admin token)
      - ✅ Validation working (400 for invalid states)
      
      All predictive courier dispatch features implemented correctly and production-ready.
      No issues found. Backend is stable.

         - Second check-in returns 409 ✅
         - Check-in without table_id returns 400 ✅
      
      5. Bill + pay flow (9 tests):
         - GET bill without admin returns 401 ✅
         - GET bill with admin returns correct calculations (subtotal €40.50, tax €8.50, total €49.00) ✅
         - POST pay marks all orders as paid+delivered ✅
         - Table status becomes 'cleaning' after pay ✅
         - Session completed ✅
         - POST cleaned returns table to 'available' ✅
      
      6. Auto no-show + reserved status (6 tests):
         - Future reservation (now+1h) with assigned table auto-marks table as 'reserved' ✅
         - Past reservation (now-2h) with assigned table auto-marks as 'no_show' ✅
         - autoUpdateTableStatuses triggered by GET /api/tables ✅
      
      7. Reservation status updates (7 tests):
         - PUT without admin returns 401 ✅
         - PUT status='cancelled' works ✅
         - PUT status='no_show' sets no_show_at timestamp ✅
         - PUT status='completed' sets completed_at timestamp ✅
      
      All table lifecycle features working correctly. Backend is production-ready.
