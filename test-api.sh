#!/bin/bash

echo "=== BDPADrive v1 API Integration Test ==="
echo ""

BASE_URL="http://localhost:3000"
USERNAME="testapi$(date +%s)"
EMAIL="${USERNAME}@example.com"
PASSWORD="testpass123"

echo "1. Creating new user: $USERNAME"
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/users" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"Test API User\"}")

echo "Response: $CREATE_RESPONSE"
echo ""

# Extract user_id from response (basic parsing)
USER_ID=$(echo $CREATE_RESPONSE | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
echo "Created user ID: $USER_ID"
echo ""

echo "2. Authenticating user: $USERNAME"
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/users/$USERNAME/auth" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASSWORD\"}")

echo "Response: $AUTH_RESPONSE"
echo ""

echo "3. Testing with demo user (demo@bdpadrive.com)"
DEMO_AUTH=$(curl -s -X POST "$BASE_URL/api/v1/users/demo@bdpadrive.com/auth" \
  -H "Content-Type: application/json" \
  -d '{"password":"password123"}')

echo "Demo auth response: $DEMO_AUTH"
echo ""

echo "4. Testing user lookup by username"
USER_LOOKUP=$(curl -s -X GET "$BASE_URL/api/v1/users/$USERNAME")
echo "User lookup response: $USER_LOOKUP"
echo ""

echo "=== Test completed ==="
echo ""
echo "Next steps:"
echo "- Open http://localhost:3000/api-test in browser"
echo "- Login with demo@bdpadrive.com / password123"
echo "- Test filesystem operations in the API Test interface"
