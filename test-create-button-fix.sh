#!/bin/bash

echo "=== Create Button Functionality Test ==="
echo "Testing the fixed create button implementation..."
echo

# Test 1: Check if server is running
echo "1. Checking server status..."
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server is not running"
    exit 1
fi

# Test 2: Login to get session
echo "2. Testing authentication..."
LOGIN_RESPONSE=$(curl -s -c test_session.txt -X POST -H "Content-Type: application/json" \
    -d '{"username":"testuser", "password":"password123"}' \
    http://localhost:3000/api/auth/login)

if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
    echo "✅ Authentication successful"
else
    echo "❌ Authentication failed: $LOGIN_RESPONSE"
    # Try to create test user
    echo "   Attempting to create test user..."
    SIGNUP_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"username":"testuser", "password":"password123", "email":"test@example.com", "name":"Test User"}' \
        http://localhost:3000/api/auth/register)
    
    if echo "$SIGNUP_RESPONSE" | grep -q "success.*true"; then
        echo "✅ Test user created successfully"
        # Try login again
        LOGIN_RESPONSE=$(curl -s -c test_session.txt -X POST -H "Content-Type: application/json" \
            -d '{"username":"testuser", "password":"password123"}' \
            http://localhost:3000/api/auth/login)
        
        if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
            echo "✅ Authentication successful after user creation"
        else
            echo "❌ Authentication still failed after user creation"
            exit 1
        fi
    else
        echo "❌ Failed to create test user: $SIGNUP_RESPONSE"
        exit 1
    fi
fi

# Test 3: Check user info endpoint
echo "3. Testing user info endpoint..."
USER_INFO=$(curl -s -b test_session.txt http://localhost:3000/api/user/me)
if echo "$USER_INFO" | grep -q "username.*testuser"; then
    echo "✅ User info endpoint working"
else
    echo "❌ User info endpoint failed: $USER_INFO"
    exit 1
fi

# Test 4: Test file creation endpoints
echo "4. Testing file creation..."

# Test document creation
echo "   Testing document creation..."
DOC_RESPONSE=$(curl -s -b test_session.txt -X POST -H "Content-Type: application/json" \
    -d '{"name":"test-document-'$(date +%s)'", "type":"document", "content":"Test content from create button fix test"}' \
    http://localhost:3000/api/v1/filesystem/testuser)

if echo "$DOC_RESPONSE" | grep -q "success.*true"; then
    echo "✅ Document creation endpoint working"
else
    echo "❌ Document creation failed: $DOC_RESPONSE"
fi

# Test folder creation
echo "   Testing folder creation..."
FOLDER_RESPONSE=$(curl -s -b test_session.txt -X POST -H "Content-Type: application/json" \
    -d '{"name":"test-folder-'$(date +%s)'", "type":"folder"}' \
    http://localhost:3000/api/v1/filesystem/testuser)

if echo "$FOLDER_RESPONSE" | grep -q "success.*true"; then
    echo "✅ Folder creation endpoint working"
else
    echo "❌ Folder creation failed: $FOLDER_RESPONSE"
fi

# Test 5: Check JavaScript files
echo "5. Checking JavaScript files..."
if curl -s http://localhost:3000/js/app.js | grep -q "showCreateForm"; then
    echo "✅ app.js contains showCreateForm function"
else
    echo "❌ app.js missing showCreateForm function"
fi

if curl -s http://localhost:3000/js/app.js | grep -q "createItem"; then
    echo "✅ app.js contains createItem function"
else
    echo "❌ app.js missing createItem function"
fi

if curl -s http://localhost:3000/js/app.js | grep -q "showToast"; then
    echo "✅ app.js contains showToast function"
else
    echo "❌ app.js missing showToast function"
fi

# Test 6: Check dashboard page
echo "6. Testing dashboard page..."
DASHBOARD_HTML=$(curl -s -b test_session.txt http://localhost:3000/dashboard)
if echo "$DASHBOARD_HTML" | grep -q "create-option.*data-type"; then
    echo "✅ Dashboard contains create option elements"
else
    echo "❌ Dashboard missing create option elements"
fi

if echo "$DASHBOARD_HTML" | grep -q "createModal"; then
    echo "✅ Dashboard contains create modal"
else
    echo "❌ Dashboard missing create modal"
fi

# Cleanup
rm -f test_session.txt

echo
echo "=== Test Summary ==="
echo "All critical components have been tested."
echo "If all tests passed with ✅, the create button should be working."
echo
echo "To manually test:"
echo "1. Go to http://localhost:3000/auth"
echo "2. Sign in with username: testuser, password: password123"
echo "3. Click the 'Create New' button on the dashboard"
echo "4. Click on Document, Folder, or Symlink options"
echo "5. Fill in the form and click Create"
echo
echo "For debugging, check:"
echo "- Browser console for JavaScript errors"
echo "- http://localhost:3000/create-button-final-test.html for comprehensive testing"
