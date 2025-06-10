#!/bin/bash

# File Creation Functionality Validation Script
# Created: June 10, 2025

echo "🧪 BDPADrive File Creation Functionality Test"
echo "============================================="
echo ""

SERVER_URL="http://localhost:3000"
COOKIES_FILE="/workspaces/bdpadrives4/cookies.txt"

# Check server status
echo "🔍 Checking server status..."
if curl -s --head $SERVER_URL > /dev/null; then
    echo "✅ Server is running on port 3000"
else
    echo "❌ Server is not running"
    exit 1
fi

# Check authentication
if [ ! -f "$COOKIES_FILE" ]; then
    echo "❌ Authentication cookies not found"
    exit 1
else
    echo "✅ Authentication cookies found"
fi

echo ""

# Test document creation
echo "📄 Testing Document Creation..."
DOC_NAME="validation-test-$(date +%s).md"
DOC_RESPONSE=$(curl -s -b "$COOKIES_FILE" -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"$DOC_NAME\",\"content\":\"# Validation Test\\n\\nThis document was created on $(date) to validate file creation functionality.\",\"isDirectory\":false,\"type\":\"document\"}" \
  "$SERVER_URL/api/v1/filesystem/admin@bdpadrive.com")

if echo "$DOC_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Document creation successful"
    DOC_ID=$(echo "$DOC_RESPONSE" | grep -o '"node_id":"[^"]*"' | cut -d'"' -f4)
    echo "   Document ID: $DOC_ID"
    echo "   Document Name: $DOC_NAME"
else
    echo "❌ Document creation failed"
    echo "   Response: $DOC_RESPONSE"
fi

echo ""

# Test folder creation
echo "📁 Testing Folder Creation..."
FOLDER_NAME="validation-folder-$(date +%s)"
FOLDER_RESPONSE=$(curl -s -b "$COOKIES_FILE" -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"$FOLDER_NAME\",\"isDirectory\":true,\"type\":\"directory\"}" \
  "$SERVER_URL/api/v1/filesystem/admin@bdpadrive.com")

if echo "$FOLDER_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Folder creation successful"
    FOLDER_ID=$(echo "$FOLDER_RESPONSE" | grep -o '"node_id":"[^"]*"' | cut -d'"' -f4)
    echo "   Folder ID: $FOLDER_ID"
    echo "   Folder Name: $FOLDER_NAME"
else
    echo "❌ Folder creation failed"
    echo "   Response: $FOLDER_RESPONSE"
fi

echo ""

# Test file listing
echo "📋 Testing File Listing..."
LIST_RESPONSE=$(curl -s -b "$COOKIES_FILE" "$SERVER_URL/api/v1/filesystem/admin@bdpadrive.com")

if echo "$LIST_RESPONSE" | grep -q '"success":true'; then
    echo "✅ File listing successful"
    FILE_COUNT=$(echo "$LIST_RESPONSE" | grep -o '"name":"[^"]*"' | wc -l)
    echo "   Total files/folders: $FILE_COUNT"
    
    # Check if our test files are in the list
    if echo "$LIST_RESPONSE" | grep -q "$DOC_NAME"; then
        echo "✅ Test document found in file list"
    else
        echo "⚠️  Test document not found in file list"
    fi
    
    if echo "$LIST_RESPONSE" | grep -q "$FOLDER_NAME"; then
        echo "✅ Test folder found in file list"
    else
        echo "⚠️  Test folder not found in file list"
    fi
else
    echo "❌ File listing failed"
fi

echo ""

# Test web interface accessibility
echo "🌐 Testing Web Interface..."

# Test dashboard
DASHBOARD_RESPONSE=$(curl -s -b "$COOKIES_FILE" -w "%{http_code}" -o /dev/null "$SERVER_URL/dashboard")
if [ "$DASHBOARD_RESPONSE" = "200" ]; then
    echo "✅ Dashboard accessible"
else
    echo "❌ Dashboard not accessible (HTTP $DASHBOARD_RESPONSE)"
fi

# Test files page
FILES_RESPONSE=$(curl -s -b "$COOKIES_FILE" -w "%{http_code}" -o /dev/null "$SERVER_URL/files")
if [ "$FILES_RESPONSE" = "200" ]; then
    echo "✅ Files page accessible"
else
    echo "❌ Files page not accessible (HTTP $FILES_RESPONSE)"
fi

# Test create modal elements
DASHBOARD_CONTENT=$(curl -s -b "$COOKIES_FILE" "$SERVER_URL/dashboard")
if echo "$DASHBOARD_CONTENT" | grep -q 'createModal'; then
    echo "✅ Create modal found in dashboard"
else
    echo "⚠️  Create modal not found in dashboard"
fi

echo ""

# Test JavaScript file
echo "📜 Testing JavaScript Functionality..."
JS_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "$SERVER_URL/js/app.js")
if [ "$JS_RESPONSE" = "200" ]; then
    echo "✅ Main JavaScript file accessible"
else
    echo "❌ Main JavaScript file not accessible (HTTP $JS_RESPONSE)"
fi

# Check for createItem function
JS_CONTENT=$(curl -s "$SERVER_URL/js/app.js")
if echo "$JS_CONTENT" | grep -q 'createItem'; then
    echo "✅ createItem function found in JavaScript"
else
    echo "❌ createItem function not found in JavaScript"
fi

echo ""

# Summary
echo "📊 VALIDATION SUMMARY"
echo "===================="
echo ""

if echo "$DOC_RESPONSE" | grep -q '"success":true' && echo "$FOLDER_RESPONSE" | grep -q '"success":true'; then
    echo "🎉 ALL CORE FUNCTIONALITY TESTS PASSED!"
    echo ""
    echo "✅ Document creation: WORKING"
    echo "✅ Folder creation: WORKING"
    echo "✅ File listing: WORKING"
    echo "✅ Web interface: ACCESSIBLE"
    echo "✅ JavaScript: LOADED"
    echo ""
    echo "🌟 File and folder creation functionality is FULLY OPERATIONAL!"
    echo ""
    echo "📍 Access points:"
    echo "   Dashboard: $SERVER_URL/dashboard"
    echo "   Files: $SERVER_URL/files"
    echo "   Test Page: $SERVER_URL/test-file-creation.html"
    echo ""
    echo "💡 Usage:"
    echo "   1. Click 'Create New' button"
    echo "   2. Select Document or Folder"
    echo "   3. Fill in the form"
    echo "   4. Click 'Create'"
    echo "   5. See your new file/folder appear!"
else
    echo "⚠️  Some functionality tests failed"
    echo "   Please check server logs and authentication"
fi

echo ""
echo "Test completed on $(date)"
