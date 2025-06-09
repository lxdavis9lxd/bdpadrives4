# BDPADrive REST API v1 Documentation

## Overview

BDPADrive now includes a comprehensive REST API v1 that follows the filesystem API specification. The API provides both user management and filesystem operations with proper authentication and error handling.

## Base URL

```
http://localhost:3000/api/v1
```

## Authentication

The API uses session-based authentication. Most endpoints require authentication via session cookies.

## Rate Limiting

- General endpoints: 100 requests per 15 minutes per IP
- Authentication endpoints: 5 requests per 15 minutes per IP

## User Management Endpoints

### GET /api/v1/users

Get all users (requires authentication).

**Query Parameters:**
- `after` (optional): Pagination cursor

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "user_id": "uuid",
      "username": "user@example.com",
      "email": "user@example.com", 
      "salt": "bcrypt_salt",
      "createdAt": 1749438765017
    }
  ]
}
```

### GET /api/v1/users/:username

Get specific user info (requires authentication).

**Response:**
```json
{
  "success": true,
  "user": {
    "user_id": "uuid",
    "salt": "bcrypt_salt", 
    "username": "username",
    "email": "user@example.com",
    "createdAt": 1749438765017
  }
}
```

### POST /api/v1/users

Create a new user.

**Request Body:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "fullName": "Full Name"
}
```

**Alternative (salt/key based):**
```json
{
  "username": "newuser", 
  "email": "user@example.com",
  "salt": "bcrypt_salt",
  "key": "hashed_password"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "user_id": "uuid",
    "salt": "bcrypt_salt",
    "username": "newuser", 
    "email": "user@example.com",
    "createdAt": 1749438765017
  }
}
```

### POST /api/v1/users/:username/auth

Authenticate a user.

**Request Body:**
```json
{
  "password": "password123"
}
```

**Alternative (key-based):**
```json
{
  "key": "derived_key"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "user_id": "uuid",
    "username": "username",
    "email": "user@example.com", 
    "lastLogin": 1749438784916
  }
}
```

## Filesystem Endpoints

All filesystem endpoints require authentication and proper username ownership.

### GET /api/v1/filesystem/:username

Get root directory contents for user.

**Response:**
```json
{
  "success": true,
  "node": {
    "name": "root",
    "isDirectory": true,
    "children": [
      {
        "name": "document.txt",
        "isDirectory": false,
        "size": 1234,
        "mimeType": "text/plain",
        "lastModified": "2025-06-09T...",
        "content": "file content"
      }
    ]
  }
}
```

### GET /api/v1/filesystem/:username/:path

Get specific file or directory.

**Response (File):**
```json
{
  "success": true, 
  "node": {
    "name": "document.txt",
    "isDirectory": false,
    "size": 1234,
    "mimeType": "text/plain",
    "lastModified": "2025-06-09T...",
    "content": "file content"
  }
}
```

**Response (Directory):**
```json
{
  "success": true,
  "node": {
    "name": "folder",
    "isDirectory": true,
    "lastModified": "2025-06-09T...", 
    "children": [...]
  }
}
```

### POST /api/v1/filesystem/:username

Create a new file or directory.

**Request Body (File):**
```json
{
  "name": "new-document.txt",
  "content": "File content",
  "isDirectory": false,
  "mimeType": "text/plain"
}
```

**Request Body (Directory):**
```json
{
  "name": "new-folder", 
  "isDirectory": true
}
```

**Response:**
```json
{
  "success": true,
  "node": {
    "name": "new-document.txt",
    "isDirectory": false,
    "size": 12,
    "mimeType": "text/plain",
    "lastModified": "2025-06-09T...",
    "content": "File content"
  }
}
```

### PUT /api/v1/filesystem/:username/:path

Update an existing file or directory.

**Request Body:**
```json
{
  "name": "renamed-file.txt",
  "content": "Updated content",
  "mimeType": "text/plain"
}
```

**Response:**
```json
{
  "success": true,
  "node": {
    "name": "renamed-file.txt", 
    "isDirectory": false,
    "size": 15,
    "mimeType": "text/plain",
    "lastModified": "2025-06-09T...",
    "content": "Updated content"
  }
}
```

### PATCH /api/v1/filesystem/:username/:path

Move or rename a file or directory.

**Request Body:**
```json
{
  "newPath": "new-filename.txt"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File moved successfully",
  "node": {
    "name": "new-filename.txt",
    "isDirectory": false,
    "size": 15,
    "mimeType": "text/plain",
    "lastModified": "2025-06-09T...",
    "content": "File content",
    "owner": "username",
    "createdAt": "2025-06-09T...",
    "tags": ["tag1", "tag2"]
  }
}
```

### DELETE /api/v1/filesystem/:username/:path

Delete a file or directory.

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

### GET /api/v1/filesystem/:username/search

Search files and directories.

**Query Parameters:**
- `match`: Text to search for in file names and content
- `regexMatch`: Regex pattern to search with

**Example:**
```
GET /api/v1/filesystem/demo/search?match=document
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "name": "my-document.txt",
      "isDirectory": false,
      "size": 1234,
      "mimeType": "text/plain", 
      "lastModified": "2025-06-09T...",
      "path": "my-document.txt"
    }
  ]
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

Common HTTP status codes:
- `400`: Bad Request (missing required fields)
- `401`: Unauthorized (not authenticated)
- `403`: Forbidden (access denied)
- `404`: Not Found (resource doesn't exist)
- `409`: Conflict (resource already exists)
- `500`: Internal Server Error

## Demo Users

The system includes pre-configured demo users:

- **demo@bdpadrive.com** / password123
- **admin@bdpadrive.com** / admin123

## Frontend Integration

The frontend JavaScript has been updated to use the v1 API:

- User registration and authentication
- File and folder operations
- Search functionality
- Document editor save/load

## Testing

1. **API Test Interface**: Navigate to `/api-test` (requires login)
2. **Command Line**: Use the provided `test-api.sh` script
3. **Manual cURL**: See examples throughout this documentation

## Implementation Notes

- Uses bcrypt for password hashing
- In-memory storage (replace with database in production)
- Session-based authentication with express-session
- Rate limiting with express-rate-limit
- Comprehensive error handling and validation
- CORS support for API access
- Follows RESTful conventions

## Next Steps

1. **Database Integration**: Replace in-memory storage with PostgreSQL/MongoDB
2. **File Storage**: Implement proper file storage (filesystem/S3)
3. **Real-time Features**: Add WebSocket support for collaboration
4. **API Versioning**: Implement proper API versioning strategy
5. **Advanced Search**: Enhanced search with indexing
6. **File Sharing**: Implement file sharing and permissions
7. **Backup/Sync**: Add data backup and synchronization features
