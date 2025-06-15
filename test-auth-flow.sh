#!/bin/bash

# Test Registration and Login with Fixed API Key
# This script tests the BDPADrive authentication flow

echo "🧪 Testing BDPADrive Registration and Login"
echo "==========================================="

API_BASE_URL="https://private-anon-38123c6eda-hsccebun98j2.apiary-mock.com/v1"
API_KEY="aaa96136-492f-4435-8177-714d8d64cf93"

# Test 1: Check if external API is accessible
echo ""
echo "1️⃣ Testing External API Connectivity..."
response=$(curl -s -w "%{http_code}" -o /dev/null -H "X-API-Key: $API_KEY" "$API_BASE_URL/users")
if [ "$response" -eq 200 ] || [ "$response" -eq 201 ] || [ "$response" -eq 405 ]; then
    echo "✅ External API is accessible (HTTP $response)"
else
    echo "❌ External API connection failed (HTTP $response)"
fi

# Test 2: Test user creation endpoint
echo ""
echo "2️⃣ Testing User Creation Endpoint..."
test_user_data='{
    "username": "testuser123",
    "email": "testuser123@example.com",
    "salt": "abcd1234567890abcd1234567890abcd",
    "key": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
}'

response=$(curl -s -w "%{http_code}" -o /tmp/create_response.json \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -X POST \
    -d "$test_user_data" \
    "$API_BASE_URL/users")

echo "HTTP Response: $response"
echo "Response Body:"
cat /tmp/create_response.json | jq . 2>/dev/null || cat /tmp/create_response.json
echo ""

# Test 3: Test user authentication endpoint
echo ""
echo "3️⃣ Testing User Authentication Endpoint..."
auth_data='{
    "key": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
}'

response=$(curl -s -w "%{http_code}" -o /tmp/auth_response.json \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -X POST \
    -d "$auth_data" \
    "$API_BASE_URL/users/testuser123/auth")

echo "HTTP Response: $response"
echo "Response Body:"
cat /tmp/auth_response.json | jq . 2>/dev/null || cat /tmp/auth_response.json
echo ""

# Test 4: Test getting user info
echo ""
echo "4️⃣ Testing Get User Info Endpoint..."
response=$(curl -s -w "%{http_code}" -o /tmp/user_response.json \
    -H "X-API-Key: $API_KEY" \
    "$API_BASE_URL/users/testuser123")

echo "HTTP Response: $response"
echo "Response Body:"
cat /tmp/user_response.json | jq . 2>/dev/null || cat /tmp/user_response.json
echo ""

# Test 5: Test filesystem operations
echo ""
echo "5️⃣ Testing Filesystem Operations..."
folder_data='{
    "name": "test-folder",
    "isDirectory": true,
    "type": "folder"
}'

response=$(curl -s -w "%{http_code}" -o /tmp/folder_response.json \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -X POST \
    -d "$folder_data" \
    "$API_BASE_URL/filesystem/testuser123")

echo "HTTP Response: $response"
echo "Response Body:"
cat /tmp/folder_response.json | jq . 2>/dev/null || cat /tmp/folder_response.json
echo ""

# Test 6: Check local server status
echo ""
echo "6️⃣ Testing Local Server Status..."
local_response=$(curl -s -w "%{http_code}" -o /tmp/local_response.json "http://localhost:3000/api/status" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Local server is running (HTTP $local_response)"
    if [ -f /tmp/local_response.json ]; then
        cat /tmp/local_response.json
    fi
else
    echo "❌ Local server connection failed"
fi

echo ""
echo "🏁 Test Complete!"
echo "==================="
echo ""
echo "📋 Summary:"
echo "- External API URL: $API_BASE_URL"
echo "- API Key: $API_KEY"
echo "- Test user: testuser123@example.com"
echo ""
echo "Next Steps:"
echo "1. Open http://localhost:3000/auth to test registration"
echo "2. Open http://localhost:3000/pbkdf2-auth-test.html for detailed testing"
echo "3. Check console logs in browser developer tools"

# Cleanup
rm -f /tmp/create_response.json /tmp/auth_response.json /tmp/user_response.json /tmp/folder_response.json /tmp/local_response.json
