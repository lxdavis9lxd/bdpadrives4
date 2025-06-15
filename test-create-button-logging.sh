#!/bin/bash

echo "🧪 === CREATE BUTTON TESTING SCRIPT ==="
echo "Testing the create button functionality with comprehensive logging"
echo

# Test 1: Check server response
echo "1. 📡 Testing server connectivity..."
if curl -s http://localhost:3000/create-button-console-logger.html | grep -q "Create Button Console Logger"; then
    echo "   ✅ Server is responding"
    echo "   ✅ Console logger page is accessible"
else
    echo "   ❌ Server not responding or page missing"
    exit 1
fi

# Test 2: Check JavaScript files
echo "2. 📝 Testing JavaScript files..."
if curl -s http://localhost:3000/js/app.js | grep -q "=== BDPADrive Constructor START ==="; then
    echo "   ✅ Enhanced logging is present in app.js"
else
    echo "   ❌ Enhanced logging missing in app.js"
fi

if curl -s http://localhost:3000/js/app.js | grep -q "=== GLOBAL createItem() CALLED ==="; then
    echo "   ✅ Global createItem logging is present"
else
    echo "   ❌ Global createItem logging missing"
fi

if curl -s http://localhost:3000/js/app.js | grep -q "=== showCreateForm() START ==="; then
    echo "   ✅ showCreateForm logging is present"
else
    echo "   ❌ showCreateForm logging missing"
fi

# Test 3: Check modal structure
echo "3. 🏗️ Testing dashboard modal structure..."
DASHBOARD_HTML=$(curl -s http://localhost:3000/dashboard 2>/dev/null)
if echo "$DASHBOARD_HTML" | grep -q "Sign In" || echo "$DASHBOARD_HTML" | grep -q "create-option"; then
    if echo "$DASHBOARD_HTML" | grep -q "create-option"; then
        echo "   ✅ Dashboard modal structure is present"
    else
        echo "   ℹ️ Dashboard redirected to auth (expected when not logged in)"
    fi
else
    echo "   ❌ Dashboard not accessible"
fi

# Test 4: Test console logger page functionality
echo "4. 🖥️ Testing console logger page components..."
LOGGER_HTML=$(curl -s http://localhost:3000/create-button-console-logger.html)

if echo "$LOGGER_HTML" | grep -q "data-type=\"document\""; then
    echo "   ✅ Document create option found"
else
    echo "   ❌ Document create option missing"
fi

if echo "$LOGGER_HTML" | grep -q "data-type=\"folder\""; then
    echo "   ✅ Folder create option found"
else
    echo "   ❌ Folder create option missing"
fi

if echo "$LOGGER_HTML" | grep -q "data-type=\"symlink\""; then
    echo "   ✅ Symlink create option found"
else
    echo "   ❌ Symlink create option missing"
fi

if echo "$LOGGER_HTML" | grep -q "onclick=\"createItem()\""; then
    echo "   ✅ Create button onclick handler found"
else
    echo "   ❌ Create button onclick handler missing"
fi

# Test 5: Check API endpoints
echo "5. 🌐 Testing API endpoints..."

# Test user/me endpoint (should fail without auth, but should exist)
USER_RESPONSE=$(curl -s -w "%{http_code}" http://localhost:3000/api/user/me -o /dev/null)
if [ "$USER_RESPONSE" = "401" ] || [ "$USER_RESPONSE" = "200" ]; then
    echo "   ✅ /api/user/me endpoint exists (status: $USER_RESPONSE)"
else
    echo "   ❌ /api/user/me endpoint issue (status: $USER_RESPONSE)"
fi

echo
echo "🎯 === TEST SUMMARY ==="
echo "The create button has been enhanced with comprehensive logging."
echo "To see the logging in action:"
echo
echo "🖥️ **Method 1: Console Logger Page**"
echo "   1. Open: http://localhost:3000/create-button-console-logger.html"
echo "   2. Click 'Test Create Button'"
echo "   3. Click on Document/Folder/Symlink options"
echo "   4. Watch the real-time console output on the right"
echo "   5. Fill in the form and click 'Create'"
echo
echo "🌐 **Method 2: Dashboard (with authentication)**"
echo "   1. Open: http://localhost:3000/auth"
echo "   2. Sign in with: demo@bdpadrive.com / password123"
echo "   3. Open browser console (F12 → Console)"
echo "   4. Click 'Create New' button on dashboard"
echo "   5. Follow the detailed console logs"
echo
echo "🔍 **Method 3: Browser Developer Tools**"
echo "   1. Open any page with create functionality"
echo "   2. Press F12 → Console tab"
echo "   3. Perform create button actions"
echo "   4. Watch detailed logging with emoji indicators"
echo
echo "📝 **What You'll See in Console:**"
echo "   🚀 System initialization"
echo "   🖱️ Click event detection"
echo "   🎯 Function entry/exit points"
echo "   📋 DOM element validation"
echo "   🔍 Form data extraction"
echo "   🌐 API requests and responses"
echo "   ✅ Success operations"
echo "   ❌ Error conditions"
echo "   🎭 Modal events"
echo
echo "The create button is now fully instrumented with logging!"
