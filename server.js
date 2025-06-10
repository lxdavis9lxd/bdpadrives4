const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { marked } = require('marked');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration (after security headers)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Replace with actual domain in production
    : true, // Allow all origins in development
  credentials: true
}));

// Input sanitization helper
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>'"]/g, '') // Remove potential XSS characters
    .trim();
};

// HTML output sanitization helper  
const sanitizeHTML = (html) => {
  if (typeof html !== 'string') return html;
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Validation middleware
const validateInput = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input data',
        details: errors.array()
      });
    }
    next();
  };
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

// Middleware
app.use(limiter);
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'bdpadrive-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory user storage (replace with database in production)
const users = new Map();
const userSessions = new Map();

// In-memory file system storage (replace with database in production)
const userFiles = new Map();
const userFolders = new Map();

// File locking system (replace with Redis or database in production)
const fileLocks = new Map(); // key: "username:filename", value: { owner, timestamp, expiresAt }

// Authentication security tracking
const authAttempts = new Map(); // key: IP or email, value: { count, lockoutUntil, lastAttempt }
const sessionTokens = new Map(); // key: token, value: { userId, expiresAt }

// CAPTCHA system
const generateCaptcha = () => {
  const operations = ['+', '-', '*'];
  const operation = operations[Math.floor(Math.random() * operations.length)];
  let num1, num2, answer;
  
  switch (operation) {
    case '+':
      num1 = Math.floor(Math.random() * 50) + 1;
      num2 = Math.floor(Math.random() * 50) + 1;
      answer = num1 + num2;
      break;
    case '-':
      num1 = Math.floor(Math.random() * 50) + 25;
      num2 = Math.floor(Math.random() * 25) + 1;
      answer = num1 - num2;
      break;
    case '*':
      num1 = Math.floor(Math.random() * 12) + 1;
      num2 = Math.floor(Math.random() * 12) + 1;
      answer = num1 * num2;
      break;
  }
  
  return {
    question: `${num1} ${operation} ${num2}`,
    answer: answer
  };
};

// Check authentication attempts and lockout
const checkAuthAttempts = (identifier) => {
  const attempts = authAttempts.get(identifier);
  if (!attempts) return { allowed: true, remainingAttempts: 3 };
  
  const now = Date.now();
  
  // Check if locked out
  if (attempts.lockoutUntil && attempts.lockoutUntil > now) {
    const remainingMinutes = Math.ceil((attempts.lockoutUntil - now) / (60 * 1000));
    return { 
      allowed: false, 
      lockedOut: true, 
      remainingMinutes,
      remainingAttempts: 0 
    };
  }
  
  // Reset if lockout expired
  if (attempts.lockoutUntil && attempts.lockoutUntil <= now) {
    authAttempts.delete(identifier);
    return { allowed: true, remainingAttempts: 3 };
  }
  
  const remainingAttempts = Math.max(0, 3 - attempts.count);
  return { 
    allowed: remainingAttempts > 0, 
    remainingAttempts,
    lastAttempt: attempts.lastAttempt 
  };
};

// Record failed authentication attempt
const recordFailedAuth = (identifier) => {
  const now = Date.now();
  const attempts = authAttempts.get(identifier) || { count: 0, lockoutUntil: null };
  
  attempts.count += 1;
  attempts.lastAttempt = now;
  
  // Lock out after 3 failed attempts for 1 hour
  if (attempts.count >= 3) {
    attempts.lockoutUntil = now + (60 * 60 * 1000); // 1 hour
  }
  
  authAttempts.set(identifier, attempts);
};

// Clear successful authentication attempts
const clearAuthAttempts = (identifier) => {
  authAttempts.delete(identifier);
};

// Sample users for demonstration
const initializeUsers = async () => {
  const hashedPassword = await bcrypt.hash('password123', 10);
  users.set('demo@bdpadrive.com', {
    id: uuidv4(),
    email: 'demo@bdpadrive.com',
    password: hashedPassword,
    name: 'Demo User',
    createdAt: new Date(),
    lastLogin: null
  });
  
  users.set('admin@bdpadrive.com', {
    id: uuidv4(),
    email: 'admin@bdpadrive.com',
    password: await bcrypt.hash('admin123', 10),
    name: 'Admin User',
    createdAt: new Date(),
    lastLogin: null
  });
};

initializeUsers();

// Authentication middleware
const requireAuth = (req, res, next) => {
  // Check session first
  if (req.session && req.session.userId) {
    const user = Array.from(users.values()).find(u => u.id === req.session.userId);
    if (user) {
      req.user = user;
      return next();
    }
  }
  
  // Check remember token if no session
  const rememberToken = req.cookies.remember_token;
  if (rememberToken) {
    const tokenData = sessionTokens.get(rememberToken);
    if (tokenData && tokenData.expiresAt > Date.now()) {
      const user = Array.from(users.values()).find(u => u.id === tokenData.userId);
      if (user) {
        // Recreate session
        req.session.userId = user.id;
        req.session.email = user.email;
        req.user = user;
        return next();
      }
    } else if (tokenData) {
      // Clean up expired token
      sessionTokens.delete(rememberToken);
      res.clearCookie('remember_token');
    }
  }
  
  // If it's an API request, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Otherwise redirect to auth page
  res.redirect('/auth');
};

const requireGuest = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
};

// Helper function to get user by session
const getCurrentUser = (req) => {
  if (req.session && req.session.userId) {
    return Array.from(users.values()).find(u => u.id === req.session.userId);
  }
  return null;
};

// Set up layout support for EJS
app.use((req, res, next) => {
  res.locals.user = getCurrentUser(req);
  res.locals.isAuthenticated = !!res.locals.user;
  
  res.locals.renderLayout = (view, data = {}) => {
    return new Promise((resolve, reject) => {
      app.render(view, { ...data, user: res.locals.user, isAuthenticated: res.locals.isAuthenticated }, (err, html) => {
        if (err) return reject(err);
        
        app.render('layout', { 
          ...data, 
          body: html,
          title: data.title || 'BDPADrive',
          user: res.locals.user,
          isAuthenticated: res.locals.isAuthenticated
        }, (err, layoutHtml) => {
          if (err) return reject(err);
          resolve(layoutHtml);
        });
      });
    });
  };
  next();
});

// Routes

// Landing page - redirect based on authentication status
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/auth');
  }
});

// Auth page (for guests only)
app.get('/auth', requireGuest, async (req, res) => {
  try {
    const html = await res.locals.renderLayout('auth', { 
      title: 'BDPADrive - Sign In'
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering auth page:', err);
    res.status(500).send('Error rendering page');
  }
});

// Password reset page (accessible via email link)
app.get('/auth/reset-password', requireGuest, async (req, res) => {
  try {
    const html = await res.locals.renderLayout('auth', { 
      title: 'BDPADrive - Reset Password'
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering reset password page:', err);
    res.status(500).send('Error rendering page');
  }
});

// Dashboard (for authenticated users only)
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    // Get user's files and folders
    const userFileList = userFiles.get(req.user.id) || [];
    const userFolderList = userFolders.get(req.user.id) || [];
    
    // Calculate storage usage (excluding symlinks as per requirement)
    const totalBytes = userFileList
      .filter(file => file.type !== 'symlink')
      .reduce((acc, file) => acc + (file.size || 0), 0);
    
    const storageInfo = {
      totalBytes: totalBytes,
      totalKB: Math.round(totalBytes / 1024),
      totalMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
      fileCount: userFileList.length,
      folderCount: userFolderList.length,
      excludedFromStorage: userFileList.filter(f => f.type === 'symlink').length
    };
    
    const html = await res.locals.renderLayout('dashboard', { 
      title: 'BDPADrive - Dashboard',
      files: userFileList,
      folders: userFolderList,
      storage: storageInfo
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    res.status(500).send('Error rendering page');
  }
});

// File system overview (for authenticated users only)
app.get('/files', requireAuth, async (req, res) => {
  try {
    const userFileList = userFiles.get(req.user.id) || [];
    const userFolderList = userFolders.get(req.user.id) || [];
    
    const html = await res.locals.renderLayout('files', { 
      title: 'BDPADrive - My Files',
      files: userFileList,
      folders: userFolderList
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering files page:', err);
    res.status(500).send('Error rendering page');
  }
});

// Search functionality (for authenticated users only)
app.get('/search', requireAuth, async (req, res) => {
  try {
    const { 
      q: query = '', 
      type = 'all', 
      dateRange = '', 
      sortBy = 'relevance', 
      tags = '', 
      owner = '', 
      minSize = '', 
      maxSize = '',
      page = '1',
      limit = '20'
    } = req.query;
    
    // Parse pagination parameters
    const currentPage = Math.max(1, parseInt(page) || 1);
    const itemsPerPage = Math.min(50, Math.max(5, parseInt(limit) || 20)); // Limit between 5-50 items per page
    const offset = (currentPage - 1) * itemsPerPage;
    
    const userFileList = userFiles.get(req.user.id) || [];
    const userFolderList = userFolders.get(req.user.id) || [];
    
    let searchResults = {
      files: [],
      folders: [],
      pagination: {
        currentPage,
        itemsPerPage,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      }
    };
    
    if (query.trim()) {
      // Apply basic text search
      let filteredFiles = userFileList.filter(file => 
        file.name.toLowerCase().includes(query.toLowerCase()) ||
        (file.content && file.content.toLowerCase().includes(query.toLowerCase())) ||
        (file.tags && file.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
      );
      
      let filteredFolders = userFolderList.filter(folder => 
        folder.name.toLowerCase().includes(query.toLowerCase())
      );
      
      // Apply type filter
      if (type === 'files') {
        filteredFolders = [];
      } else if (type === 'folders') {
        filteredFiles = [];
      }
      
      // Apply date range filter
      if (dateRange) {
        const now = new Date();
        let cutoffDate;
        
        switch (dateRange) {
          case 'today':
            cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'year':
            cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
        }
        
        if (cutoffDate) {
          filteredFiles = filteredFiles.filter(file => 
            new Date(file.updatedAt || file.createdAt) >= cutoffDate
          );
          filteredFolders = filteredFolders.filter(folder => 
            new Date(folder.updatedAt || folder.createdAt) >= cutoffDate
          );
        }
      }
      
      // Apply tags filter
      if (tags.trim()) {
        const searchTags = tags.toLowerCase().split(',').map(tag => tag.trim());
        filteredFiles = filteredFiles.filter(file => 
          file.tags && searchTags.some(searchTag => 
            file.tags.some(fileTag => fileTag.toLowerCase().includes(searchTag))
          )
        );
      }
      
      // Apply owner filter
      if (owner.trim()) {
        const ownerLower = owner.toLowerCase();
        filteredFiles = filteredFiles.filter(file => 
          file.owner && file.owner.toLowerCase().includes(ownerLower)
        );
        filteredFolders = filteredFolders.filter(folder => 
          folder.owner && folder.owner.toLowerCase().includes(ownerLower)
        );
      }
      
      // Apply size filters (files only)
      if (minSize || maxSize) {
        const minSizeBytes = minSize ? parseInt(minSize) * 1024 : 0;
        const maxSizeBytes = maxSize ? parseInt(maxSize) * 1024 : Infinity;
        
        filteredFiles = filteredFiles.filter(file => {
          const fileSize = file.size || 0;
          return fileSize >= minSizeBytes && fileSize <= maxSizeBytes;
        });
      }
      
      // Apply sorting
      switch (sortBy) {
        case 'modified':
          filteredFiles.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
          filteredFolders.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
          break;
        case 'created':
          filteredFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          filteredFolders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          break;
        case 'name':
          filteredFiles.sort((a, b) => a.name.localeCompare(b.name));
          filteredFolders.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'size':
          filteredFiles.sort((a, b) => (b.size || 0) - (a.size || 0));
          // Folders don't have size, so keep creation order
          break;
        default: // relevance
          // Already sorted by relevance (text match quality could be improved)
          break;
      }
      
      searchResults = {
        files: filteredFiles,
        folders: filteredFolders
      };
    }
    
    // Apply pagination to search results
    if (searchResults.files.length || searchResults.folders.length) {
      // Combine files and folders for pagination
      const allItems = [...searchResults.folders, ...searchResults.files];
      const totalItems = allItems.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      
      // Apply pagination
      const paginatedItems = allItems.slice(offset, offset + itemsPerPage);
      
      // Separate back into files and folders
      const paginatedFiles = paginatedItems.filter(item => item.content !== undefined);
      const paginatedFolders = paginatedItems.filter(item => item.content === undefined);
      
      searchResults = {
        files: paginatedFiles,
        folders: paginatedFolders,
        pagination: {
          currentPage,
          itemsPerPage,
          totalItems,
          totalPages,
          hasNext: currentPage < totalPages,
          hasPrevious: currentPage > 1,
          startIndex: offset + 1,
          endIndex: Math.min(offset + itemsPerPage, totalItems)
        }
      };
    }
    
    const html = await res.locals.renderLayout('search', { 
      title: 'BDPADrive - Search Results',
      query,
      type,
      dateRange,
      sortBy,
      tags,
      owner,
      minSize,
      maxSize,
      page: currentPage,
      limit: itemsPerPage,
      results: searchResults
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering search page:', err);
    res.status(500).send('Error rendering page');
  }
});

// Document Editor (for authenticated users only)
app.get('/editor/:id?', requireAuth, async (req, res) => {
  try {
    let file = null;
    
    if (req.params.id) {
      const userFileList = userFiles.get(req.user.id) || [];
      file = userFileList.find(f => f.id === req.params.id);
      
      if (!file) {
        return res.status(404).send('File not found');
      }
    }
    
    const html = await res.locals.renderLayout('editor', { 
      title: file ? `${file.name} - BDPADrive Editor` : 'New Document - BDPADrive Editor',
      file
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering editor:', err);
    res.status(500).send('Error rendering page');
  }
});

// API Test page (for authenticated users only)
app.get('/api-test', requireAuth, async (req, res) => {
  try {
    const html = await res.locals.renderLayout('api-test', { 
      title: 'BDPADrive - API Test'
    });
    res.send(html);
  } catch (err) {
    console.error('Error rendering API test page:', err);
    res.status(500).send('Error rendering page');
  }
});

// ================================
// API V1 Routes - BDPADrive REST API
// ================================

// Middleware to extract username from session
const requireUsername = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.username = req.user.email; // Using email as username for simplicity
  next();
};

// Helper function to create filesystem node structure
const createFileNode = (data, owner) => {
  const now = Date.now();
  return {
    node_id: uuidv4(),
    owner: owner,
    createdAt: now,
    modifiedAt: now,
    type: 'file',
    name: data.name,
    size: Buffer.byteLength(data.text || '', 'utf8'),
    text: data.text || '',
    tags: data.tags || [],
    lock: data.lock || null
  };
};

const createMetaNode = (data, owner) => {
  const now = Date.now();
  return {
    node_id: uuidv4(),
    owner: owner,
    createdAt: now,
    type: data.type, // 'directory' or 'symlink'
    name: data.name,
    contents: data.contents || []
  };
};

// ================================
// User Endpoints
// ================================

// GET /api/v1/users
app.get('/api/v1/users', requireAuth, (req, res) => {
  const { after } = req.query;
  let allUsers = Array.from(users.values());
  
  // Sort by creation date (newest first)
  allUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // Handle pagination with 'after'
  if (after) {
    const afterIndex = allUsers.findIndex(user => user.id === after);
    if (afterIndex !== -1) {
      allUsers = allUsers.slice(afterIndex + 1);
    }
  }
  
  // Limit to 100 results
  allUsers = allUsers.slice(0, 100);
  
  const userObjects = allUsers.map(user => ({
    user_id: user.id,
    username: user.email,
    email: user.email,
    salt: '2d6843cfd2ad23906fe33a236ba842a5', // Mock salt for demo
    createdAt: new Date(user.createdAt).getTime()
  }));
  
  res.json({
    success: true,
    users: userObjects
  });
});

// POST /api/v1/users
app.post('/api/v1/users', authLimiter, async (req, res) => {
  try {
    const { username, email, password, fullName, salt, key } = req.body;
    
    // Support both password-based and salt/key based user creation
    if (!username || !email || (!password && (!salt || !key))) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username, email, and either password or (salt and key) are required' 
      });
    }
    
    const emailLower = email.toLowerCase();
    if (users.has(emailLower)) {
      return res.status(409).json({ 
        success: false, 
        error: 'User already exists' 
      });
    }
    
    // Handle password hashing
    let hashedPassword, userSalt;
    if (password) {
      // Hash the password if provided
      userSalt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, userSalt);
    } else {
      // Use provided salt and key
      userSalt = salt;
      hashedPassword = key;
    }
    
    const userId = uuidv4();
    const newUser = {
      id: userId,
      email: emailLower,
      password: hashedPassword,
      name: fullName || username,
      username: username,
      salt: userSalt,
      createdAt: new Date(),
      lastLogin: null
    };
    
    users.set(emailLower, newUser);
    
    // Initialize user's file system
    userFiles.set(userId, []);
    userFolders.set(userId, []);
    
    res.status(201).json({
      success: true,
      user: {
        user_id: userId,
        salt: userSalt,
        username: username,
        email: emailLower,
        createdAt: new Date(newUser.createdAt).getTime()
      }
    });
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/v1/users/:username
app.get('/api/v1/users/:username', requireAuth, (req, res) => {
  const user = users.get(req.params.username.toLowerCase());
  
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  
  res.json({
    success: true,
    user: {
      user_id: user.id,
      salt: user.salt || '2d6843cfd2ad23906fe33a236ba842a5',
      username: user.email,
      email: user.email,
      createdAt: new Date(user.createdAt).getTime()
    }
  });
});

// POST /api/v1/users/:username/auth
app.post('/api/v1/users/:username/auth', authLimiter, async (req, res) => {
  try {
    const { password, key } = req.body;
    const username = req.params.username.toLowerCase();
    
    // Look up user by username or email
    let user = Array.from(users.values()).find(u => 
      u.username?.toLowerCase() === username || u.email?.toLowerCase() === username
    );
    
    if (!user) {
      return res.status(403).json({ success: false, error: 'User not found' });
    }
    
    let isValid = false;
    
    if (password) {
      // Direct password verification
      isValid = await bcrypt.compare(password, user.password);
    } else if (key) {
      // Key-based verification (assuming key is pre-derived)
      isValid = (key === user.password) || await bcrypt.compare(key, user.password);
    }
    
    if (!isValid) {
      return res.status(403).json({ success: false, error: 'Invalid credentials' });
    }
    
    user.lastLogin = new Date();
    res.json({ 
      success: true,
      user: {
        user_id: user.id,
        username: user.username || user.email,
        email: user.email,
        lastLogin: new Date(user.lastLogin).getTime()
      }
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(403).json({ success: false, error: 'Authentication failed' });
  }
});

// PUT /api/v1/users/:username - Update user information
app.put('/api/v1/users/:username', requireAuth, async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const { email, password, name } = req.body;
    
    // Find the user
    let user = Array.from(users.values()).find(u => 
      u.username?.toLowerCase() === username || u.email?.toLowerCase() === username
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if the authenticated user is updating their own account or is admin
    if (req.user.id !== user.id && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }
      
      // Check if email is already taken by another user
      const existingUser = Array.from(users.values()).find(u => 
        u.email.toLowerCase() === email.toLowerCase() && u.id !== user.id
      );
      if (existingUser) {
        return res.status(409).json({ success: false, error: 'Email already in use' });
      }
    }
    
    // Update user fields
    if (email) {
      // Remove old email key and add new one
      users.delete(user.email);
      user.email = email.toLowerCase();
      user.username = user.username || email.toLowerCase();
    }
    
    if (name) {
      user.name = name.trim();
    }
    
    if (password) {
      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({ 
          success: false, 
          error: 'Password must be at least 8 characters long' 
        });
      }
      
      // Hash new password
      const saltRounds = 10;
      user.password = await bcrypt.hash(password, saltRounds);
    }
    
    user.updatedAt = new Date();
    
    // Re-add user with potentially new email key
    users.set(user.email, user);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        updatedAt: user.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/v1/users/:username - Delete user account and all their files
app.delete('/api/v1/users/:username', requireAuth, async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    
    // Find the user
    let user = Array.from(users.values()).find(u => 
      u.username?.toLowerCase() === username || u.email?.toLowerCase() === username
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if the authenticated user is deleting their own account or is admin
    if (req.user.id !== user.id && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Prevent admin from deleting themselves (safety measure)
    if (user.email === 'admin@bdpadrive.com' && req.user.email === 'admin@bdpadrive.com') {
      return res.status(400).json({ 
        success: false, 
        error: 'Admin account cannot be deleted' 
      });
    }
    
    // Delete all user's files and folders
    const userFileList = userFiles.get(user.id) || [];
    const userFolderList = userFolders.get(user.id) || [];
    
    // Release all locks owned by this user
    for (const [lockKey, lock] of fileLocks.entries()) {
      if (lock.owner === user.email) {
        fileLocks.delete(lockKey);
      }
    }
    
    // Remove user's files and folders
    userFiles.delete(user.id);
    userFolders.delete(user.id);
    
    // Remove user sessions
    userSessions.delete(user.id);
    
    // Remove user account
    users.delete(user.email);
    
    // Calculate deleted data stats
    const deletedFilesCount = userFileList.length;
    const deletedFoldersCount = userFolderList.length;
    const deletedStorageBytes = userFileList.reduce((acc, file) => 
      acc + (file.size || 0), 0
    );
    
    res.json({
      success: true,
      message: 'User account deleted successfully',
      deletedData: {
        files: deletedFilesCount,
        folders: deletedFoldersCount,
        storageBytes: deletedStorageBytes,
        storageKB: Math.round(deletedStorageBytes / 1024)
      }
    });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/v1/users/:username/storage - Get user storage statistics
app.get('/api/v1/users/:username/storage', requireAuth, (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    
    // Find the user
    let user = Array.from(users.values()).find(u => 
      u.username?.toLowerCase() === username || u.email?.toLowerCase() === username
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if the authenticated user is accessing their own data or is admin
    if (req.user.id !== user.id && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const userFileList = userFiles.get(user.id) || [];
    const userFolderList = userFolders.get(user.id) || [];
    
    // Calculate storage usage (excluding symlinks as per requirement)
    const totalBytes = userFileList
      .filter(file => file.type !== 'symlink')
      .reduce((acc, file) => acc + (file.size || 0), 0);
    
    const filesByType = {
      document: userFileList.filter(f => f.type === 'document' || !f.type).length,
      symlink: userFileList.filter(f => f.type === 'symlink').length,
      other: userFileList.filter(f => f.type && f.type !== 'document' && f.type !== 'symlink').length
    };
    
    res.json({
      success: true,
      storage: {
        totalBytes: totalBytes,
        totalKB: Math.round(totalBytes / 1024),
        totalMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
        fileCount: userFileList.length,
        folderCount: userFolderList.length,
        filesByType: filesByType,
        excludedFromStorage: userFileList.filter(f => f.type === 'symlink').length
      }
    });
    
  } catch (error) {
    console.error('Get storage error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ================================
// Filesystem Endpoints
// ================================

// GET /api/v1/filesystem/:username/search
app.get('/api/v1/filesystem/:username/search', requireAuth, requireUsername, (req, res) => {
  try {
    const { 
      after, 
      match, 
      regexMatch,
      dateRange,
      sortBy = 'created',
      tags,
      owner,
      minSize,
      maxSize,
      type
    } = req.query;
    const targetUsername = req.params.username;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Convert to filesystem node format
    let allNodes = [
      ...userFileList.map(file => ({
        node_id: file.id,
        owner: targetUsername,
        createdAt: new Date(file.createdAt).getTime(),
        modifiedAt: new Date(file.updatedAt || file.createdAt).getTime(),
        type: 'file',
        name: file.name,
        size: file.size || 0,
        text: file.content || '',
        tags: file.tags || [],
        lock: null
      })),
      ...userFolderList.map(folder => ({
        node_id: folder.id,
        owner: targetUsername,
        createdAt: new Date(folder.createdAt).getTime(),
        modifiedAt: new Date(folder.updatedAt || folder.createdAt).getTime(),
        type: 'directory',
        name: folder.name,
        contents: []
      }))
    ];
    
    // Apply type filter
    if (type) {
      if (type === 'files') {
        allNodes = allNodes.filter(node => node.type === 'file');
      } else if (type === 'folders') {
        allNodes = allNodes.filter(node => node.type === 'directory');
      }
    }
    
    // Apply date range filter
    if (dateRange) {
      const now = Date.now();
      let cutoffTime;
      
      switch (dateRange) {
        case 'today':
          const today = new Date();
          cutoffTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          break;
        case 'week':
          cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          cutoffTime = now - (365 * 24 * 60 * 60 * 1000);
          break;
      }
      
      if (cutoffTime) {
        allNodes = allNodes.filter(node => node.modifiedAt >= cutoffTime);
      }
    }
    
    // Apply size filters (files only)
    if (minSize || maxSize) {
      const minSizeBytes = minSize ? parseInt(minSize) * 1024 : 0;
      const maxSizeBytes = maxSize ? parseInt(maxSize) * 1024 : Infinity;
      
      allNodes = allNodes.filter(node => {
        if (node.type === 'directory') return true; // Don't filter directories by size
        return node.size >= minSizeBytes && node.size <= maxSizeBytes;
      });
    }
    
    // Apply tags filter
    if (tags) {
      const searchTags = tags.toLowerCase().split(',').map(tag => tag.trim());
      allNodes = allNodes.filter(node => {
        if (node.type === 'directory') return true; // Directories don't have tags
        return node.tags && searchTags.some(searchTag => 
          node.tags.some(nodeTag => nodeTag.toLowerCase().includes(searchTag))
        );
      });
    }
    
    // Apply owner filter
    if (owner) {
      const ownerLower = owner.toLowerCase();
      allNodes = allNodes.filter(node => 
        node.owner && node.owner.toLowerCase().includes(ownerLower)
      );
    }
    
    // Apply match filters (enhanced with simple text search)
    if (match) {
      try {
        // Try to parse as JSON query first
        let isJsonQuery = false;
        let matchQuery = null;
        
        try {
          matchQuery = JSON.parse(decodeURIComponent(match));
          isJsonQuery = true;
        } catch (jsonError) {
          // If not valid JSON, treat as simple text search
          isJsonQuery = false;
        }
        
        if (isJsonQuery && matchQuery) {
          // Advanced JSON query
          allNodes = allNodes.filter(node => {
            return Object.keys(matchQuery).every(key => {
              if (key === 'createdAt' && typeof matchQuery[key] === 'object') {
                const query = matchQuery[key];
                if (query.$gt) return node.createdAt > query.$gt;
                if (query.$gte) return node.createdAt >= query.$gte;
                if (query.$lt) return node.createdAt < query.$lt;
                if (query.$lte) return node.createdAt <= query.$lte;
                if (query.$or) {
                  return query.$or.some(orQuery => {
                    if (orQuery.$gt) return node.createdAt > orQuery.$gt;
                    if (orQuery.$gte) return node.createdAt >= orQuery.$gte;
                    if (orQuery.$lt) return node.createdAt < orQuery.$lt;
                    if (orQuery.$lte) return node.createdAt <= orQuery.$lte;
                    return false;
                  });
                }
              }
              if (key === 'name') {
                return node.name.toLowerCase().includes(matchQuery[key].toLowerCase());
              }
              if (key === 'tags' && Array.isArray(matchQuery[key])) {
                return matchQuery[key].some(tag => 
                  node.tags && node.tags.some(nodeTag => 
                    nodeTag.toLowerCase().includes(tag.toLowerCase())
                  )
                );
              }
              if (key === 'owner') {
                return node.owner && node.owner.toLowerCase().includes(matchQuery[key].toLowerCase());
              }
              if (key === 'content' || key === 'text') {
                return node.text && node.text.toLowerCase().includes(matchQuery[key].toLowerCase());
              }
              return node[key] === matchQuery[key];
            });
          });
        } else {
          // Simple text search across name, content, and tags
          const searchTerm = decodeURIComponent(match).toLowerCase();
          allNodes = allNodes.filter(node => {
            // Search in name
            if (node.name.toLowerCase().includes(searchTerm)) return true;
            
            // Search in content/text
            if (node.text && node.text.toLowerCase().includes(searchTerm)) return true;
            
            // Search in tags
            if (node.tags && node.tags.some(tag => tag.toLowerCase().includes(searchTerm))) return true;
            
            // Search in owner
            if (node.owner && node.owner.toLowerCase().includes(searchTerm)) return true;
            
            return false;
          });
        }
      } catch (error) {
        return res.status(400).json({ success: false, error: 'Invalid match query' });
      }
    }
    
    // Apply regex filters
    if (regexMatch) {
      try {
        const regexQuery = JSON.parse(decodeURIComponent(regexMatch));
        allNodes = allNodes.filter(node => {
          return Object.keys(regexQuery).every(key => {
            if (node[key]) {
              const regex = new RegExp(regexQuery[key], 'mi');
              return regex.test(node[key].toString());
            }
            return false;
          });
        });
      } catch (error) {
        return res.status(400).json({ success: false, error: 'Invalid regex query' });
      }
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'modified':
        allNodes.sort((a, b) => b.modifiedAt - a.modifiedAt);
        break;
      case 'name':
        allNodes.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'size':
        allNodes.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      case 'created':
      default:
        allNodes.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    
    // Handle pagination
    if (after) {
      const afterIndex = allNodes.findIndex(node => node.node_id === after);
      if (afterIndex !== -1) {
        allNodes = allNodes.slice(afterIndex + 1);
      }
    }
    
    // Limit results
    allNodes = allNodes.slice(0, 100);
    
    res.json({
      success: true,
      nodes: allNodes
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/v1/filesystem/:username
app.post('/api/v1/filesystem/:username', requireAuth, requireUsername, (req, res) => {
  try {
    const { type, name, contents, text, tags, symlinkTarget, isDirectory, content, mimeType } = req.body;
    const targetUsername = req.params.username;
    
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Determine the actual type based on various request formats
    let actualType = type;
    if (isDirectory === true) {
      actualType = 'directory';
    } else if (isDirectory === false) {
      actualType = 'file';
    } else if (symlinkTarget) {
      actualType = 'symlink';
    } else if (!actualType) {
      actualType = 'file'; // Default to file
    }

    // Get the content from either 'text' or 'content' field
    const fileContent = text || content || '';
    
    // Enforce 10KB content limit for files
    if (actualType === 'file' && fileContent) {
      const contentSize = Buffer.byteLength(fileContent, 'utf8');
      if (contentSize > 10240) { // 10KB limit
        return res.status(400).json({ 
          success: false, 
          error: 'Content exceeds 10KB limit (10,240 bytes)' 
        });
      }
    }

    // Validate tags if provided
    let validatedTags = [];
    if (tags && Array.isArray(tags)) {
      if (tags.length > 5) {
        return res.status(400).json({ 
          success: false, 
          error: 'Maximum 5 tags allowed' 
        });
      }
      
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;
      for (const tag of tags) {
        if (!alphanumericRegex.test(tag)) {
          return res.status(400).json({ 
            success: false, 
            error: `Tag "${tag}" must be alphanumeric only` 
          });
        }
      }
      validatedTags = tags.map(tag => tag.toLowerCase()); // Case-insensitive
    }
    
    let newNode;
    
    if (actualType === 'file') {
      newNode = createFileNode({ 
        name: name.trim(), 
        text: fileContent, 
        tags: validatedTags 
      }, targetUsername);
      
      const userFileList = userFiles.get(targetUser.id) || [];
      
      // Check for duplicate names
      if (userFileList.some(file => file.name === name.trim())) {
        return res.status(409).json({ success: false, error: 'File name already exists' });
      }
      
      // Convert to internal format
      const internalFile = {
        id: newNode.node_id,
        name: newNode.name,
        content: newNode.text,
        type: 'document',
        size: newNode.size,
        createdAt: new Date(newNode.createdAt),
        updatedAt: new Date(newNode.modifiedAt),
        userId: targetUser.id,
        owner: targetUsername,
        tags: newNode.tags,
        mimeType: mimeType || 'text/plain'
      };
      
      userFileList.push(internalFile);
      userFiles.set(targetUser.id, userFileList);
      
    } else if (actualType === 'directory') {
      newNode = createMetaNode({ 
        type: actualType, 
        name: name.trim(), 
        contents: contents || [] 
      }, targetUsername);
      
      const userFolderList = userFolders.get(targetUser.id) || [];
      
      // Check for duplicate names
      if (userFolderList.some(folder => folder.name === name.trim())) {
        return res.status(409).json({ success: false, error: 'Folder name already exists' });
      }
      
      // Convert to internal format
      const internalFolder = {
        id: newNode.node_id,
        name: newNode.name,
        type: newNode.type,
        createdAt: new Date(newNode.createdAt),
        updatedAt: new Date(newNode.createdAt),
        userId: targetUser.id,
        owner: targetUsername,
        contents: newNode.contents
      };
      
      userFolderList.push(internalFolder);
      userFolders.set(targetUser.id, userFolderList);
      
    } else if (actualType === 'symlink') {
      if (!symlinkTarget || !symlinkTarget.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: 'Symlink target is required' 
        });
      }
      
      newNode = createSymlinkNode({ 
        name: name.trim(), 
        target: symlinkTarget.trim() 
      }, targetUsername);
      
      const userFileList = userFiles.get(targetUser.id) || [];
      
      // Check for duplicate names
      if (userFileList.some(file => file.name === name.trim())) {
        return res.status(409).json({ success: false, error: 'Symlink name already exists' });
      }
      
      // Convert to internal format (store symlinks as special files)
      const internalSymlink = {
        id: newNode.node_id,
        name: newNode.name,
        content: '',
        type: 'symlink',
        size: 0,
        createdAt: new Date(newNode.createdAt),
        updatedAt: new Date(newNode.modifiedAt),
        userId: targetUser.id,
        owner: targetUsername,
        symlinkTarget: newNode.target,
        tags: []
      };
      
      userFileList.push(internalSymlink);
      userFiles.set(targetUser.id, userFileList);
      
    } else {
      return res.status(400).json({ success: false, error: 'Invalid node type' });
    }
    
    res.status(201).json({
      success: true,
      node: newNode
    });
  } catch (error) {
    console.error('Node creation error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Helper function to create symlink nodes
const createSymlinkNode = (data, owner) => {
  const now = Date.now();
  return {
    node_id: uuidv4(),
    owner: owner,
    createdAt: now,
    modifiedAt: now,
    type: 'symlink',
    name: data.name,
    target: data.target,
    size: 0
  };
};

// Helper function to check if symlink target exists and is valid
const validateSymlinkTarget = (target, userFileList, userFolderList) => {
  if (!target || !target.trim()) {
    return { valid: false, broken: true, reason: 'Empty target' };
  }
  
  // Check if target exists in user's files or folders
  const targetExists = userFileList.some(file => file.name === target) || 
                      userFolderList.some(folder => folder.name === target);
  
  return {
    valid: targetExists,
    broken: !targetExists,
    reason: targetExists ? null : 'Target not found'
  };
};

// GET /api/v1/filesystem/:username
app.get('/api/v1/filesystem/:username', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Convert to filesystem API format
    const children = [
      ...userFileList.map(file => {
        const node = {
          name: file.name,
          isDirectory: false,
          size: file.size || 0,
          mimeType: file.mimeType || 'text/plain',
          lastModified: new Date(file.updatedAt || file.createdAt).toISOString(),
          content: file.content || '',
          owner: file.owner || targetUsername,
          createdAt: new Date(file.createdAt).toISOString(),
          tags: file.tags || []
        };
        
        // Add symlink-specific properties
        if (file.type === 'symlink') {
          node.isSymlink = true;
          node.symlinkTarget = file.symlinkTarget;
          const validation = validateSymlinkTarget(file.symlinkTarget, userFileList, userFolderList);
          node.symlinkBroken = validation.broken;
          if (validation.broken) {
            node.symlinkError = validation.reason;
          }
        }
        
        return node;
      }),
      ...userFolderList.map(folder => ({
        name: folder.name,
        isDirectory: true,
        lastModified: new Date(folder.updatedAt || folder.createdAt).toISOString(),
        owner: folder.owner || targetUsername,
        createdAt: new Date(folder.createdAt).toISOString(),
        children: [] // For now, flat structure
      }))
    ];
    
    res.json({
      success: true,
      node: {
        name: 'root',
        isDirectory: true,
        lastModified: new Date().toISOString(),
        children: children
      }
    });
  } catch (error) {
    console.error('Get filesystem error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/v1/filesystem/:username/:path
app.get('/api/v1/filesystem/:username/:path', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const path = req.params.path;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Look for file first
    const file = userFileList.find(f => f.name === path);
    if (file) {
      const node = {
        name: file.name,
        isDirectory: false,
        size: file.size || 0,
        mimeType: file.mimeType || 'text/plain',
        lastModified: new Date(file.updatedAt || file.createdAt).toISOString(),
        content: file.content || '',
        owner: file.owner || targetUsername,
        createdAt: new Date(file.createdAt).toISOString(),
        tags: file.tags || []
      };
      
      // Add symlink-specific properties
      if (file.type === 'symlink') {
        node.isSymlink = true;
        node.symlinkTarget = file.symlinkTarget;
        const validation = validateSymlinkTarget(file.symlinkTarget, userFileList, userFolderList);
        node.symlinkBroken = validation.broken;
        if (validation.broken) {
          node.symlinkError = validation.reason;
        }
      }
      
      return res.json({
        success: true,
        node: node
      });
    }
    
    // Look for folder
    const folder = userFolderList.find(f => f.name === path);
    if (folder) {
      return res.json({
        success: true,
        node: {
          name: folder.name,
          isDirectory: true,
          lastModified: new Date(folder.updatedAt || folder.createdAt).toISOString(),
          owner: folder.owner || targetUsername,
          createdAt: new Date(folder.createdAt).toISOString(),
          children: [] // For now, flat structure
        }
      });
    }
    
    res.status(404).json({ success: false, error: 'File or directory not found' });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/v1/filesystem/:username/:path
app.put('/api/v1/filesystem/:username/:path', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const path = req.params.path;
    const { name, content, mimeType, tags, owner, symlinkTarget } = req.body;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Check file lock before allowing modifications
    const lockKey = `${targetUsername}:${path}`;
    cleanupExpiredLocks(); // Clean expired locks first
    const existingLock = fileLocks.get(lockKey);
    
    if (existingLock && existingLock.owner !== req.user.email) {
      return res.status(423).json({ 
        success: false, 
        error: `File is locked by ${existingLock.owner}. Cannot modify.`,
        locked: true,
        lockOwner: existingLock.owner
      });
    }
    
    // Validate tags if provided
    if (tags && Array.isArray(tags)) {
      if (tags.length > 5) {
        return res.status(400).json({ 
          success: false, 
          error: 'Maximum 5 tags allowed' 
        });
      }
      
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;
      for (const tag of tags) {
        if (!alphanumericRegex.test(tag)) {
          return res.status(400).json({ 
            success: false, 
            error: `Tag "${tag}" must be alphanumeric only` 
          });
        }
      }
    }
    
    // Validate content size for files
    if (content !== undefined) {
      const contentSize = Buffer.byteLength(content, 'utf8');
      if (contentSize > 10240) { // 10KB limit
        return res.status(400).json({ 
          success: false, 
          error: 'Content exceeds 10KB limit (10,240 bytes)' 
        });
      }
    }
    
    // Look for file first
    const fileIndex = userFileList.findIndex(f => f.name === path);
    if (fileIndex !== -1) {
      const file = userFileList[fileIndex];
      
      // Update file properties
      if (name && name.trim() !== file.name) {
        // Check if new name already exists
        if (userFileList.some(f => f.name === name.trim() && f !== file)) {
          return res.status(409).json({ success: false, error: 'File name already exists' });
        }
        file.name = name.trim();
      }
      
      if (content !== undefined) {
        file.content = content;
        file.size = newNode.size;
      }
      
      if (mimeType) {
        file.mimeType = mimeType;
      }
      
      if (tags) {
        file.tags = tags.map(tag => tag.toLowerCase());
      }
      
      if (owner) {
        file.owner = owner;
      }
      
      if (symlinkTarget !== undefined && file.type === 'symlink') {
        file.symlinkTarget = symlinkTarget;
      }
      
      file.updatedAt = new Date();
      userFileList[fileIndex] = file;
      userFiles.set(targetUser.id, userFileList);
      
      const responseNode = {
        name: file.name,
        isDirectory: false,
        size: file.size || 0,
        mimeType: file.mimeType || 'text/plain',
        lastModified: new Date(file.updatedAt).toISOString(),
        content: file.content || '',
        owner: file.owner || targetUsername,
        createdAt: new Date(file.createdAt).toISOString(),
        tags: file.tags || []
      };
      
      if (file.type === 'symlink') {
        responseNode.isSymlink = true;
        responseNode.symlinkTarget = file.symlinkTarget;
        const validation = validateSymlinkTarget(file.symlinkTarget, userFileList, userFolderList);
        responseNode.symlinkBroken = validation.broken;
        if (validation.broken) {
          responseNode.symlinkError = validation.reason;
        }
      }
      
      return res.json({
        success: true,
        node: responseNode
      });
    }
    
    // Look for folder
    const folderIndex = userFolderList.findIndex(f => f.name === path);
    if (folderIndex !== -1) {
      const folder = userFolderList[folderIndex];
      
      if (name && name.trim() !== folder.name) {
        // Check if new name already exists
        if (userFolderList.some(f => f.name === name.trim() && f !== folder)) {
          return res.status(409).json({ success: false, error: 'Folder name already exists' });
        }
        folder.name = name.trim();
      }
      
      if (owner) {
        folder.owner = owner;
      }
      
      folder.updatedAt = new Date();
      userFolderList[folderIndex] = folder;
      userFolders.set(targetUser.id, userFolderList);
      
      return res.json({
        success: true,
        node: {
          name: folder.name,
          isDirectory: true,
          lastModified: new Date(folder.updatedAt).toISOString(),
          owner: folder.owner || targetUsername,
          createdAt: new Date(folder.createdAt).toISOString()
        }
      });
    }
    
    res.status(404).json({ success: false, error: 'File or directory not found' });
  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/v1/filesystem/:username/:path - Move file or directory
app.patch('/api/v1/filesystem/:username/:path', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const currentPath = req.params.path;
    const { newPath, newName } = req.body;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!newPath && !newName) {
      return res.status(400).json({ success: false, error: 'Either newPath or newName must be provided' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Check file lock before allowing rename/move
    const lockKey = `${targetUsername}:${currentPath}`;
    cleanupExpiredLocks(); // Clean expired locks first
    const existingLock = fileLocks.get(lockKey);
    
    if (existingLock && existingLock.owner !== req.user.email) {
      return res.status(423).json({ 
        success: false, 
        error: `File is locked by ${existingLock.owner}. Cannot rename/move.`,
        locked: true,
        lockOwner: existingLock.owner
      });
    }
    
    // Look for file first
    const fileIndex = userFileList.findIndex(f => f.name === currentPath);
    if (fileIndex !== -1) {
      const file = userFileList[fileIndex];
      const finalName = newName || (newPath ? newPath.split('/').pop() : file.name);
      
      // Check if new name already exists
      if (userFileList.some(f => f.name === finalName && f !== file)) {
        return res.status(409).json({ success: false, error: 'File name already exists' });
      }
      
      // Update file name/path
      file.name = finalName;
      file.updatedAt = new Date();
      userFileList[fileIndex] = file;
      userFiles.set(targetUser.id, userFileList);
      
      // Migrate lock to new file name if it exists
      const oldLockKey = `${targetUsername}:${currentPath}`;
      const newLockKey = `${targetUsername}:${finalName}`;
      const existingLock = fileLocks.get(oldLockKey);
      if (existingLock) {
        fileLocks.delete(oldLockKey);
        fileLocks.set(newLockKey, existingLock);
      }
      
      return res.json({
        success: true,
        message: 'File moved successfully',
        node: {
          name: file.name,
          isDirectory: false,
          size: file.size || 0,
          mimeType: file.mimeType || 'text/plain',
          lastModified: new Date(file.updatedAt).toISOString(),
          content: file.content || '',
          owner: file.owner || targetUsername,
          createdAt: new Date(file.createdAt).toISOString(),
          tags: file.tags || []
        }
      });
    }
    
    // Look for folder
    const folderIndex = userFolderList.findIndex(f => f.name === currentPath);
    if (folderIndex !== -1) {
      const folder = userFolderList[folderIndex];
      const finalName = newName || (newPath ? newPath.split('/').pop() : folder.name);
      
      // Check if new name already exists
      if (userFolderList.some(f => f.name === finalName && f !== folder)) {
        return res.status(409).json({ success: false, error: 'Folder name already exists' });
      }
      
      // Update folder name/path
      folder.name = finalName;
      folder.updatedAt = new Date();
      userFolderList[folderIndex] = folder;
      userFolders.set(targetUser.id, userFolderList);
      
      // Migrate lock to new folder name if it exists
      const oldLockKey = `${targetUsername}:${currentPath}`;
      const newLockKey = `${targetUsername}:${finalName}`;
      const existingLock = fileLocks.get(oldLockKey);
      if (existingLock) {
        fileLocks.delete(oldLockKey);
        fileLocks.set(newLockKey, existingLock);
      }
      
      return res.json({
        success: true,
        message: 'Directory moved successfully',
        node: {
          name: folder.name,
          isDirectory: true,
          lastModified: new Date(folder.updatedAt).toISOString(),
          owner: folder.owner || targetUsername,
          createdAt: new Date(folder.createdAt).toISOString(),
          children: []
        }
      });
    }
    
    res.status(404).json({ success: false, error: 'File or directory not found' });
  } catch (error) {
    console.error('Move file error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/v1/filesystem/:username/:path
app.delete('/api/v1/filesystem/:username/:path', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const path = req.params.path;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Check file lock before allowing deletion
    const lockKey = `${targetUsername}:${path}`;
    cleanupExpiredLocks(); // Clean expired locks first
    const existingLock = fileLocks.get(lockKey);
    
    if (existingLock && existingLock.owner !== req.user.email) {
      return res.status(423).json({ 
        success: false, 
        error: `File is locked by ${existingLock.owner}. Cannot delete.`,
        locked: true,
        lockOwner: existingLock.owner
      });
    }
    
    // Look for file first
    const fileIndex = userFileList.findIndex(f => f.name === path);
    if (fileIndex !== -1) {
      const deletedFile = userFileList.splice(fileIndex, 1)[0];
      userFiles.set(targetUser.id, userFileList);
      
      // Remove file lock if it exists
      fileLocks.delete(lockKey);
      
      return res.json({
        success: true,
        message: 'File deleted successfully'
      });
    }
    
    // Look for folder
    const folderIndex = userFolderList.findIndex(f => f.name === path);
    if (folderIndex !== -1) {
      const deletedFolder = userFolderList.splice(folderIndex, 1)[0];
      userFolders.set(targetUser.id, userFolderList);
      
      // Remove any locks for files in this folder (if we supported nested files)
      // For now, just remove the folder lock if it exists
      fileLocks.delete(lockKey);
      
      return res.json({
        success: true,
        message: 'Directory deleted successfully'
      });
    }
    
    res.status(404).json({ success: false, error: 'File or directory not found' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ================================
// File Locking Endpoints
// ================================

// Helper function to clean up expired locks
const cleanupExpiredLocks = () => {
  const now = Date.now();
  for (const [key, lock] of fileLocks.entries()) {
    if (lock.expiresAt < now) {
      fileLocks.delete(key);
    }
  }
};

// POST /api/v1/filesystem/:username/:path/lock - Acquire or release file lock
app.post('/api/v1/filesystem/:username/:path/lock', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const path = req.params.path;
    const { action } = req.body; // 'acquire' or 'release'
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Verify file exists
    const userFileList = userFiles.get(targetUser.id) || [];
    const file = userFileList.find(f => f.name === path);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const lockKey = `${targetUsername}:${path}`;
    const currentUser = req.user.email;
    const now = Date.now();
    
    // Clean up expired locks first
    cleanupExpiredLocks();
    
    if (action === 'acquire') {
      const existingLock = fileLocks.get(lockKey);
      
      if (existingLock && existingLock.owner !== currentUser) {
        // File is locked by someone else
        return res.status(409).json({
          success: false,
          error: 'File is locked by another user',
          locked: true,
          lockOwner: existingLock.owner,
          lockedAt: existingLock.timestamp
        });
      }
      
      // Acquire or refresh lock (10 minutes duration)
      const lockExpiry = now + (10 * 60 * 1000); // 10 minutes
      fileLocks.set(lockKey, {
        owner: currentUser,
        timestamp: now,
        expiresAt: lockExpiry
      });
      
      return res.json({
        success: true,
        message: 'Lock acquired successfully',
        locked: true,
        lockOwner: currentUser,
        expiresAt: lockExpiry
      });
      
      
    } else if (action === 'release') {
      const existingLock = fileLocks.get(lockKey);
      
      if (existingLock && existingLock.owner === currentUser) {
        fileLocks.delete(lockKey);
        return res.json({
          success: true,
          message: 'Lock released successfully',
          locked: false
        });
      } else if (existingLock) {
        return res.status(403).json({
          success: false,
          error: 'Cannot release lock owned by another user'
        });
      } else {
        return res.json({
          success: true,
          message: 'No lock to release',
          locked: false
        });
      }
      
    } else if (action === 'force-release') {
      // Force release any existing lock (admin or lock conflict resolution)
      const existingLock = fileLocks.get(lockKey);
      
      if (existingLock) {
        fileLocks.delete(lockKey);
        console.log(`Lock force-released by ${currentUser} from ${existingLock.owner} for file: ${lockKey}`);
        return res.json({
          success: true,
          message: 'Lock force-released successfully',
          locked: false,
          previousOwner: existingLock.owner
        });
      } else {
        return res.json({
          success: true,
          message: 'No lock to force-release',
          locked: false
        });
      }
    }
    
    return res.status(400).json({
      success: false,
      error: 'Invalid action. Use "acquire", "release", or "force-release".'
    });
    
  } catch (error) {
    console.error('File lock error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/v1/filesystem/:username/:path/lock - Check file lock status
app.get('/api/v1/filesystem/:username/:path/lock', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const path = req.params.path;
    
    // Check if user can access this username's files
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Verify file exists
    const userFileList = userFiles.get(targetUser.id) || [];
    const file = userFileList.find(f => f.name === path);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const lockKey = `${targetUsername}:${path}`;
    
    // Clean up expired locks first
    cleanupExpiredLocks();
    
    const existingLock = fileLocks.get(lockKey);
    
    if (existingLock) {
      return res.json({
        success: true,
        locked: true,
        lockOwner: existingLock.owner,
        lockedAt: existingLock.timestamp,
        expiresAt: existingLock.expiresAt
      });
    } else {
      return res.json({
        success: true,
        locked: false
      });
    }
    
  } catch (error) {
    console.error('Lock status check error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Cleanup expired locks every 5 minutes
setInterval(cleanupExpiredLocks, 5 * 60 * 1000);

// ================================
// Authentication Security API Routes
// ================================

// GET /api/auth/captcha - Generate CAPTCHA challenge
app.get('/api/auth/captcha', (req, res) => {
  const captcha = generateCaptcha();
  req.session.captcha = captcha.answer;
  res.json({
    success: true,
    question: captcha.question
  });
});

// POST /api/auth/verify-captcha - Verify CAPTCHA answer
app.post('/api/auth/verify-captcha', (req, res) => {
  const { answer } = req.body;
  const correctAnswer = req.session.captcha;
  
  if (!correctAnswer) {
    return res.status(400).json({
      success: false,
      error: 'No CAPTCHA challenge found'
    });
  }
  
  const isCorrect = parseInt(answer) === correctAnswer;
  if (isCorrect) {
    req.session.captchaVerified = true;
  }
  
  res.json({
    success: true,
    correct: isCorrect
  });
});

// GET /api/auth/status - Check authentication status and rate limiting
app.get('/api/auth/status', (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const { email } = req.query;
  
  // Check rate limiting for IP and email
  const ipStatus = checkAuthAttempts(clientIP);
  const emailStatus = email ? checkAuthAttempts(email.toLowerCase()) : { allowed: true, remainingAttempts: 3 };
  
  const status = {
    ipAllowed: ipStatus.allowed,
    emailAllowed: emailStatus.allowed,
    remainingAttempts: Math.min(ipStatus.remainingAttempts, emailStatus.remainingAttempts),
    requiresCaptcha: ipStatus.remainingAttempts <= 2 || emailStatus.remainingAttempts <= 2,
    lockedOut: ipStatus.lockedOut || emailStatus.lockedOut,
    lockoutMinutes: Math.max(ipStatus.remainingMinutes || 0, emailStatus.remainingMinutes || 0)
  };
  
  res.json({
    success: true,
    ...status
  });
});

// POST /api/auth/check-availability - Check username/email availability
app.post('/api/auth/check-availability', (req, res) => {
  const { username, email } = req.body;
  
  const result = {
    usernameAvailable: true,
    emailAvailable: true
  };
  
  if (username) {
    const usernameLower = username.toLowerCase();
    result.usernameAvailable = !Array.from(users.values()).some(u => 
      u.username?.toLowerCase() === usernameLower
    );
  }
  
  if (email) {
    const emailLower = email.toLowerCase();
    result.emailAvailable = !users.has(emailLower);
  }
  
  res.json({
    success: true,
    ...result
  });
});

// ================================
// Legacy Authentication API Routes (enhanced with security features)
// ================================

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, captchaAnswer, rememberMe } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const emailLower = email.toLowerCase();
    
    // Check rate limiting
    const ipStatus = checkAuthAttempts(clientIP);
    const emailStatus = checkAuthAttempts(emailLower);
    
    if (!ipStatus.allowed || !emailStatus.allowed) {
      const maxMinutes = Math.max(ipStatus.remainingMinutes || 0, emailStatus.remainingMinutes || 0);
      return res.status(429).json({ 
        error: `Too many failed attempts. Try again in ${maxMinutes} minutes.`,
        lockedOut: true,
        lockoutMinutes: maxMinutes
      });
    }
    
    // Check CAPTCHA if required (after 1 failed attempt)
    const requiresCaptcha = ipStatus.remainingAttempts <= 2 || emailStatus.remainingAttempts <= 2;
    if (requiresCaptcha) {
      if (!captchaAnswer) {
        return res.status(400).json({ 
          error: 'CAPTCHA verification required',
          requiresCaptcha: true 
        });
      }
      
      const correctAnswer = req.session.captcha;
      if (!correctAnswer || parseInt(captchaAnswer) !== correctAnswer) {
        recordFailedAuth(clientIP);
        recordFailedAuth(emailLower);
        return res.status(400).json({ 
          error: 'Invalid CAPTCHA answer',
          requiresCaptcha: true 
        });
      }
    }
    
    const user = users.get(emailLower);
    if (!user) {
      recordFailedAuth(clientIP);
      recordFailedAuth(emailLower);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      recordFailedAuth(clientIP);
      recordFailedAuth(emailLower);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Clear failed attempts on successful login
    clearAuthAttempts(clientIP);
    clearAuthAttempts(emailLower);
    
    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    
    // Handle "Remember Me" functionality
    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      // Generate remember token
      const rememberToken = uuidv4();
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
      sessionTokens.set(rememberToken, { userId: user.id, expiresAt });
      
      res.cookie('remember_token', rememberToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'strict'
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    
    // Initialize user's file system if not exists
    if (!userFiles.has(user.id)) {
      userFiles.set(user.id, []);
    }
    if (!userFolders.has(user.id)) {
      userFolders.set(user.id, []);
    }
    
    // Clear CAPTCHA session data
    delete req.session.captcha;
    delete req.session.captchaVerified;
    
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name 
      },
      redirectUrl: '/dashboard'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name, username, captchaAnswer } = req.body;
    
    if (!email || !password || !name || !username) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Verify CAPTCHA
    const correctAnswer = req.session.captcha;
    if (!correctAnswer || !captchaAnswer || parseInt(captchaAnswer) !== correctAnswer) {
      return res.status(400).json({ error: 'Invalid CAPTCHA answer' });
    }
    
    // Validate input formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ 
 
        error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores' 
      });
    }
    
    if (name.trim().length < 2 || name.trim().length > 50) {
      return res.status(400).json({ error: 'Name must be 2-50 characters long' });
    }
    
    // Enhanced password validation
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters long' });
    }
    
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({ 
        error: 'Password must contain uppercase, lowercase, number, and special character' 
      });
    }
    
    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();
    
    // Check email uniqueness
    if (users.has(emailLower)) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Check username uniqueness
    const usernameExists = Array.from(users.values()).some(u => 
      u.username?.toLowerCase() === usernameLower
    );
    if (usernameExists) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    const newUser = {
      id: userId,
      email: emailLower,
      username: usernameLower,
      password: hashedPassword,
      name: name.trim(),
      salt: '2d6843cfd2ad23906fe33a236ba842a5', // Mock salt for demo
      createdAt: new Date(),
      lastLogin: null
    };
    
    users.set(emailLower, newUser);
    
    // Initialize user's file system
    userFiles.set(userId, []);
    userFolders.set(userId, []);
    
    // Create session
    req.session.userId = userId;
    req.session.email = emailLower;
    
    // Clear CAPTCHA session data
    delete req.session.captcha;
    delete req.session.captchaVerified;
    
    res.status(201).json({ 
      success: true, 
      user: { 
        id: userId, 
        email: emailLower,
        username: usernameLower,
        name: name.trim() 
      },
      redirectUrl: '/dashboard'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const userEmail = req.user.email;
  
  // Clean up remember token if exists
  const rememberToken = req.cookies.remember_token;
  if (rememberToken) {
    sessionTokens.delete(rememberToken);
    res.clearCookie('remember_token');
  }
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Could not log out' });
    }
    
    // Release all locks owned by this user
    for (const [lockKey, lock] of fileLocks.entries()) {
      if (lock.owner === userEmail) {
        fileLocks.delete(lockKey);
      }
    }
    
    res.json({ success: true, redirectUrl: '/auth' });
  });
});

// ================================
// Password Recovery System
// ================================

const passwordResetTokens = new Map(); // key: token, value: { email, expiresAt, used }

// Generate password reset token
const generateResetToken = () => {
  return require('crypto').randomBytes(32).toString('hex');
};

// Simulate email sending (console output)
const sendPasswordResetEmail = (email, token) => {
  const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;
  
  console.log('\n' + '='.repeat(80));
  console.log('📧 SIMULATED EMAIL SENT');
  console.log('='.repeat(80));
  console.log(`To: ${email}`);
  console.log(`Subject: Password Reset Request - BDPADrive`);
  console.log(`\nBody:`);
  console.log(`Hello,`);
  console.log(`\nWe received a request to reset your password for your BDPADrive account.`);
  console.log(`\nClick the link below to reset your password:`);
  console.log(`${resetLink}`);
  console.log(`\nThis link will expire in 1 hour.`);
  console.log(`\nIf you didn't request this password reset, please ignore this email.`);
  console.log(`\nBest regards,`);
  console.log(`The BDPADrive Team`);
  console.log('='.repeat(80) + '\n');
  
  return true; // Simulate successful email sending
};

// Clean up expired reset tokens
const cleanupExpiredResetTokens = () => {
  const now = Date.now();
  for (const [token, data] of passwordResetTokens.entries()) {
    if (data.expiresAt < now) {
      passwordResetTokens.delete(token);
    }
  }
};

// Password Recovery API Endpoints

// POST /api/auth/forgot-password - Request password reset
app.post('/api/auth/forgot-password', authLimiter, (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email address is required' 
      });
    }
    
    const emailLower = email.toLowerCase().trim();
    const user = users.get(emailLower);
    
    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (user) {
      const resetToken = generateResetToken();
      const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
      
      passwordResetTokens.set(resetToken, {
        email: emailLower,
        expiresAt: expiresAt,
        used: false
      });
      
      // Simulate sending email
      sendPasswordResetEmail(emailLower, resetToken);
    }
    
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// GET /api/auth/reset-password/:token - Verify reset token
app.get('/api/auth/reset-password/:token', (req, res) => {
  try {
    const { token } = req.params;
    
    cleanupExpiredResetTokens();
    
    const tokenData = passwordResetTokens.get(token);
    
    if (!tokenData || tokenData.used || tokenData.expiresAt < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }
    
    res.json({
      success: true,
      email: tokenData.email,
      expiresAt: tokenData.expiresAt
    });
    
  } catch (error) {
    console.error('Reset token verification error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// POST /api/auth/reset-password - Reset password using token
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token and new password are required' 
      });
    }
    
    cleanupExpiredResetTokens();
    
    const tokenData = passwordResetTokens.get(token);
    
    if (!tokenData || tokenData.used || tokenData.expiresAt < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }
    
    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters long' 
      });
    }
    
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must contain uppercase, lowercase, number, and special character' 
      });
    }
    
    // Update user password
    const user = users.get(tokenData.email);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.updatedAt = new Date();
    
    // Mark token as used
    tokenData.used = true;
    
    console.log(`Password reset successful for user: ${tokenData.email}`);
    
    res.json({
      success: true,
      message: 'Password reset successful. You can now sign in with your new password.'
    });
    
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Clean up expired reset tokens every 30 minutes
setInterval(cleanupExpiredResetTokens, 30 * 60 * 1000);

// ================================
// Enhanced Error Handling and 404 Handler
// ================================

// API endpoint that randomly returns 555 errors for testing error handling
app.get('/api/test/random-error', requireAuth, (req, res) => {
  // 10% chance of returning 555 error
  if (Math.random() < 0.1) {
    return res.status(555).json({ 
      success: false, 
      error: 'Random server error for testing',
      code: 555
    });
  }
  
  res.json({ 
    success: true, 
    message: 'API is working normally',
    timestamp: new Date().toISOString()
  });
});

// Enhanced 404 handler
app.use(async (req, res, next) => {
  try {
    // For API requests, return JSON 404
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ 
        success: false, 
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
      });
    }
    
    // For web requests, render 404 page
    const html = await res.locals.renderLayout('404', { 
      title: 'Page Not Found - BDPADrive',
      requestedPath: req.path
    });
    res.status(404).send(html);
  } catch (err) {
    console.error('Error rendering 404 page:', err);
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>404 - Page Not Found</title></head>
      <body>
        <h1>404 - Page Not Found</h1>
        <p>The requested page could not be found.</p>
        <a href="/">Go Home</a>
      </body>
      </html>
    `);
  }
});

// Enhanced global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (req.path.startsWith('/api/')) {
    // API error response
    const errorResponse = {
      success: false,
      error: isDevelopment ? err.message : 'Internal server error',
      timestamp: new Date().toISOString()
    };
    
    if (isDevelopment) {
      errorResponse.stack = err.stack;
    }
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        ...errorResponse,
        error: 'Validation failed',
        details: err.details
      });
    }
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ...errorResponse,
        error: 'File too large'
      });
    }
    
    res.status(err.status || 500).json(errorResponse);
  } else {
    // Web page error response
    try {
      res.status(err.status || 500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error - BDPADrive</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="bg-light">
          <div class="container mt-5">
            <div class="row justify-content-center">
              <div class="col-md-6 text-center">
                <div class="card">
                  <div class="card-body">
                    <h1 class="text-danger">⚠️ Error</h1>
                    <p class="text-muted">${isDevelopment ? sanitizeHTML(err.message) : 'Something went wrong. Please try again.'}</p>
                    <a href="/" class="btn btn-primary">Go Home</a>
                    <button onclick="history.back()" class="btn btn-secondary">Go Back</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
    } catch (renderErr) {
      console.error('Error rendering error page:', renderErr);
      res.status(500).send('Internal Server Error');
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 BDPADrive server is running on http://localhost:${PORT}`);
  console.log(`📁 File management and word processing application`);
  console.log(`👤 Demo users:`);
  console.log(`   📧 demo@bdpadrive.com / password123`);
  console.log(`   📧 admin@bdpadrive.com / admin123`);
});
