# BDPADrive

A modern, web-based word processing and file management system with comprehensive REST API support.

## Features

### ✅ Completed Features

1. **User Authentication System**
   - Secure registration and login with bcrypt password hashing
   - Session-based authentication with proper middleware
   - Guest vs authenticated user access control
   - Rate limiting for security
   - Demo accounts available

2. **REST API v1**
   - Complete user management endpoints
   - Comprehensive filesystem operations
   - Search functionality with regex support
   - Proper authentication and authorization
   - Rate limiting and error handling
   - Following OpenAPI/RESTful conventions

3. **File Management System**
   - Create, read, update, delete files and folders
   - File browsing with grid and list views
   - File operations (rename, delete) with UI integration
   - Search functionality across files and content

4. **Document Editor**
   - Rich text editor with comprehensive formatting toolbar
   - Bold, italic, underline, alignment, lists
   - Auto-save functionality every 30 seconds
   - Real-time save status indicators
   - Print and export functionality
   - Keyboard shortcuts (Ctrl+S, Ctrl+B, Ctrl+I, Ctrl+U)

5. **Modern Web Interface**
   - Responsive Bootstrap 5 design
   - Clean, professional UI
   - Real-time notifications and feedback
   - Intuitive navigation and breadcrumbs

## Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd bdpadrives4

# Install dependencies
npm install

# Start the server
npm start
```

### Demo Access

Visit `http://localhost:3000` and use these demo accounts:

- **demo@bdpadrive.com** / password123
- **admin@bdpadrive.com** / admin123

## API Documentation

Comprehensive REST API v1 is available. See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for complete endpoint documentation.

### Quick API Test

1. Navigate to `/api-test` (login required)
2. Test all endpoints with the interactive interface
3. Or use the command line test script: `./test-api.sh`

### Example API Usage

```bash
# Create a new user
curl -X POST "http://localhost:3000/api/v1/users" \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","email":"user@example.com","password":"password123","fullName":"New User"}'

# Authenticate user
curl -X POST "http://localhost:3000/api/v1/users/newuser/auth" \
  -H "Content-Type: application/json" \
  -d '{"password":"password123"}'

# Create a file (requires authentication)
curl -X POST "http://localhost:3000/api/v1/filesystem/newuser" \
  -H "Content-Type: application/json" \
  -d '{"name":"document.txt","content":"Hello World!","isDirectory":false,"mimeType":"text/plain"}'
```

## Project Structure

```
bdpadrives4/
├── server.js                 # Main Express server with API endpoints
├── package.json              # Dependencies and scripts
├── public/                   # Static frontend assets
│   ├── css/style.css         # Custom styling
│   ├── js/app.js             # Main frontend JavaScript
│   └── js/editor.js          # Document editor functionality
├── views/                    # EJS templates
│   ├── layout.ejs            # Main layout template
│   ├── auth.ejs              # Authentication page
│   ├── dashboard.ejs         # User dashboard
│   ├── files.ejs             # File management interface
│   ├── editor.ejs            # Document editor
│   ├── search.ejs            # Search results
│   └── api-test.ejs          # API testing interface
├── API_DOCUMENTATION.md      # Complete API documentation
└── test-api.sh              # API integration test script
```

## Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript (ES6+), Bootstrap 5
- **Authentication**: bcrypt, express-session
- **Security**: express-rate-limit, CORS
- **Template Engine**: EJS
- **Storage**: In-memory (development) - ready for database integration

## Development Features

- **Hot Reload**: Server auto-restarts on changes
- **Error Handling**: Comprehensive error responses
- **Logging**: Request and error logging
- **Security**: Rate limiting, session security
- **Testing**: API test interface and CLI tools

## Production Considerations

This is a development/demo version. For production deployment:

1. **Database Integration**: Replace in-memory storage with PostgreSQL/MongoDB
2. **File Storage**: Implement proper file storage (filesystem/S3)
3. **Security**: Add HTTPS, enhanced session security
4. **Scalability**: Add Redis for session storage, clustering
5. **Monitoring**: Add logging, analytics, error tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues:
- Check the API documentation
- Use the `/api-test` interface for debugging
- Review the console logs for detailed error information