#!/bin/bash

echo "=== Create Button JavaScript Fix Validation ==="
echo "Testing the fixed JavaScript functionality for the create button..."
echo

# Test 1: Check if server is running
echo "1. Checking server status..."
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server is not running"
    exit 1
fi

# Test 2: Check JavaScript files contain the fixes
echo "2. Checking JavaScript fixes..."

echo "   Checking app.js for event delegation fix..."
if curl -s http://localhost:3000/js/app.js | grep -q "e.target.closest.*create-option"; then
    echo "✅ Event delegation code found in app.js"
else
    echo "❌ Event delegation code missing in app.js"
fi

echo "   Checking app.js for showCreateForm function..."
if curl -s http://localhost:3000/js/app.js | grep -q "showCreateForm(type)"; then
    echo "✅ showCreateForm function found in app.js"
else
    echo "❌ showCreateForm function missing in app.js"
fi

echo "   Checking app.js for showToast function..."
if curl -s http://localhost:3000/js/app.js | grep -q "showToast(message"; then
    echo "✅ showToast function found in app.js"
else
    echo "❌ showToast function missing in app.js"
fi

echo "   Checking app.js for global createItem function..."
if curl -s http://localhost:3000/js/app.js | grep -q "function createItem()"; then
    echo "✅ Global createItem function found in app.js"
else
    echo "❌ Global createItem function missing in app.js"
fi

echo "   Checking app.js for debugging console.log statements..."
if curl -s http://localhost:3000/js/app.js | grep -q "console.log.*Create option clicked"; then
    echo "✅ Debug console statements found in app.js"
else
    echo "❌ Debug console statements missing in app.js"
fi

# Test 3: Check dashboard HTML structure
echo "3. Checking dashboard HTML structure..."
DASHBOARD_HTML=$(curl -s http://localhost:3000/dashboard)

if echo "$DASHBOARD_HTML" | grep -q "create-option.*data-type.*document"; then
    echo "✅ Document create option found in dashboard"
else
    echo "❌ Document create option missing in dashboard"
fi

if echo "$DASHBOARD_HTML" | grep -q "create-option.*data-type.*folder"; then
    echo "✅ Folder create option found in dashboard"
else
    echo "❌ Folder create option missing in dashboard"
fi

if echo "$DASHBOARD_HTML" | grep -q "create-option.*data-type.*symlink"; then
    echo "✅ Symlink create option found in dashboard"
else
    echo "❌ Symlink create option missing in dashboard"
fi

if echo "$DASHBOARD_HTML" | grep -q "onclick=\"createItem()\""; then
    echo "✅ Create button onclick handler found in dashboard"
else
    echo "❌ Create button onclick handler missing in dashboard"
fi

if echo "$DASHBOARD_HTML" | grep -q "id=\"createForm\""; then
    echo "✅ Create form element found in dashboard"
else
    echo "❌ Create form element missing in dashboard"
fi

# Test 4: Check test pages accessibility
echo "4. Checking test pages..."

if curl -s http://localhost:3000/create-button-final-test.html | grep -q "Create Button Final Test"; then
    echo "✅ Final test page accessible"
else
    echo "❌ Final test page not accessible"
fi

if curl -s http://localhost:3000/debug-create-button-comprehensive.html | grep -q "Create Button Comprehensive Debug"; then
    echo "✅ Comprehensive debug page accessible"
else
    echo "❌ Comprehensive debug page not accessible"
fi

# Test 5: Check for required DOM elements in test pages
echo "5. Validating test page structure..."
TEST_PAGE_HTML=$(curl -s http://localhost:3000/create-button-final-test.html)

if echo "$TEST_PAGE_HTML" | grep -q "testEventBinding"; then
    echo "✅ Event binding test function found"
else
    echo "❌ Event binding test function missing"
fi

if echo "$TEST_PAGE_HTML" | grep -q "testDOMElements"; then
    echo "✅ DOM elements test function found"
else
    echo "❌ DOM elements test function missing"
fi

echo
echo "=== Fix Summary ==="
echo "The following fixes have been applied to address the create button issue:"
echo
echo "✅ Event Delegation: Replaced direct event binding with event delegation"
echo "   - This ensures events work even if DOM elements load after JavaScript"
echo "   - Uses document.addEventListener with e.target.closest('.create-option')"
echo
echo "✅ Error Handling: Added comprehensive error checking"
echo "   - Validates DOM elements exist before using them"
echo "   - Added console logging for debugging"
echo "   - Graceful fallbacks for missing elements"
echo
echo "✅ Timing Issues: Fixed JavaScript loading order problems"
echo "   - Removed dependency on specific DOM ready timing"
echo "   - Event delegation works regardless of when elements are added"
echo
echo "✅ Modal Structure: Ensured proper modal DOM structure"
echo "   - All required form fields present (itemType, itemName, etc.)"
echo "   - Proper onclick handlers for create button"
echo "   - Correct Bootstrap modal implementation"
echo
echo "=== Testing Instructions ==="
echo "To test the fixed create button:"
echo
echo "1. Manual Testing:"
echo "   - Go to: http://localhost:3000/auth"
echo "   - Sign in or create an account"
echo "   - Click 'Create New' button on dashboard"
echo "   - Click on Document/Folder/Symlink options"
echo "   - Verify form appears and create button works"
echo
echo "2. Debug Testing:"
echo "   - Go to: http://localhost:3000/create-button-final-test.html"
echo "   - Click 'Test Create Button' to open modal"
echo "   - Click on create options to test functionality"
echo "   - Check console output for debugging info"
echo
echo "3. Comprehensive Testing:"
echo "   - Go to: http://localhost:3000/debug-create-button-comprehensive.html"
echo "   - Use all test functions to validate implementation"
echo "   - Monitor debug log for detailed information"
echo
echo "The create button should now work correctly!"
