const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(cors());
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
  if (req.session && req.session.userId) {
    const user = Array.from(users.values()).find(u => u.id === req.session.userId);
    if (user) {
      req.user = user;
      return next();
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

// Dashboard (for authenticated users only)
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    // Get user's files and folders
    const userFileList = userFiles.get(req.user.id) || [];
    const userFolderList = userFolders.get(req.user.id) || [];
    
    const html = await res.locals.renderLayout('dashboard', { 
      title: 'BDPADrive - Dashboard',
      files: userFileList,
      folders: userFolderList
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
    const query = req.query.q || '';
    const userFileList = userFiles.get(req.user.id) || [];
    const userFolderList = userFolders.get(req.user.id) || [];
    
    // Simple search implementation
    const searchResults = {
      files: userFileList.filter(file => 
        file.name.toLowerCase().includes(query.toLowerCase()) ||
        file.content.toLowerCase().includes(query.toLowerCase())
      ),
      folders: userFolderList.filter(folder => 
        folder.name.toLowerCase().includes(query.toLowerCase())
      )
    };
    
    const html = await res.locals.renderLayout('search', { 
      title: 'BDPADrive - Search Results',
      query,
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

// ================================
// Filesystem Endpoints
// ================================

// GET /api/v1/filesystem/:username/search
app.get('/api/v1/filesystem/:username/search', requireAuth, requireUsername, (req, res) => {
  try {
    const { after, match, regexMatch } = req.query;
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
        type: 'directory',
        name: folder.name,
        contents: []
      }))
    ];
    
    // Apply match filters
    if (match) {
      try {
        const matchQuery = JSON.parse(decodeURIComponent(match));
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
            return node[key] === matchQuery[key];
          });
        });
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
    
    // Sort by creation date (newest first)
    allNodes.sort((a, b) => b.createdAt - a.createdAt);
    
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
    const { type, name, contents, text, tags } = req.body;
    const targetUsername = req.params.username;
    
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    if (!type || !name) {
      return res.status(400).json({ success: false, error: 'Type and name are required' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    let newNode;
    
    if (type === 'file') {
      newNode = createFileNode({ name, text, tags }, targetUsername);
      const userFileList = userFiles.get(targetUser.id) || [];
      
      // Check for duplicate names
      if (userFileList.some(file => file.name === name)) {
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
        tags: newNode.tags
      };
      
      userFileList.push(internalFile);
      userFiles.set(targetUser.id, userFileList);
    } else if (type === 'directory' || type === 'symlink') {
      newNode = createMetaNode({ type, name, contents }, targetUsername);
      const userFolderList = userFolders.get(targetUser.id) || [];
      
      // Check for duplicate names
      if (userFolderList.some(folder => folder.name === name)) {
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
        contents: newNode.contents
      };
      
      userFolderList.push(internalFolder);
      userFolders.set(targetUser.id, userFolderList);
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

// GET /api/v1/filesystem/:username/:node_id(/:node_id)*
app.get('/api/v1/filesystem/:username/:node_ids(*)', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const nodeIds = req.params.node_ids.split('/').filter(id => id);
    
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    const foundNodes = [];
    
    nodeIds.forEach(nodeId => {
      // Search files
      const file = userFileList.find(f => f.id === nodeId);
      if (file) {
        foundNodes.push({
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
        });
        return;
      }
      
      // Search folders
      const folder = userFolderList.find(f => f.id === nodeId);
      if (folder) {
        foundNodes.push({
          node_id: folder.id,
          owner: targetUsername,
          createdAt: new Date(folder.createdAt).getTime(),
          type: folder.type || 'directory',
          name: folder.name,
          contents: folder.contents || []
        });
      }
    });
    
    if (foundNodes.length === 0) {
      return res.status(404).json({ success: false, error: 'Node(s) not found' });
    }
    
    res.json({
      success: true,
      nodes: foundNodes
    });
  } catch (error) {
    console.error('Node retrieval error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/v1/filesystem/:username/:node_id
app.put('/api/v1/filesystem/:username/:node_id', requireAuth, requireUsername, (req, res) => {
  try {
    const { name, owner, contents, text, tags, lock } = req.body;
    const targetUsername = req.params.username;
    const nodeId = req.params.node_id;
    
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    // Try to find and update file
    const fileIndex = userFileList.findIndex(f => f.id === nodeId);
    if (fileIndex !== -1) {
      const file = userFileList[fileIndex];
      
      if (name && name !== file.name) {
        if (userFileList.some(f => f.name === name && f.id !== nodeId)) {
          return res.status(409).json({ success: false, error: 'File name already exists' });
        }
        file.name = name;
      }
      
      if (text !== undefined) {
        file.content = text;
        file.size = Buffer.byteLength(text, 'utf8');
      }
      
      if (tags !== undefined) {
        file.tags = tags;
      }
      
      file.updatedAt = new Date();
      userFileList[fileIndex] = file;
      userFiles.set(targetUser.id, userFileList);
      
      return res.json({ success: true });
    }
    
    // Try to find and update folder
    const folderIndex = userFolderList.findIndex(f => f.id === nodeId);
    if (folderIndex !== -1) {
      const folder = userFolderList[folderIndex];
      
      if (name && name !== folder.name) {
        if (userFolderList.some(f => f.name === name && f.id !== nodeId)) {
          return res.status(409).json({ success: false, error: 'Folder name already exists' });
        }
        folder.name = name;
      }
      
      if (contents !== undefined) {
        folder.contents = contents;
      }
      
      folder.updatedAt = new Date();
      userFolderList[folderIndex] = folder;
      userFolders.set(targetUser.id, userFolderList);
      
      return res.json({ success: true });
    }
    
    res.status(404).json({ success: false, error: 'Node not found' });
  } catch (error) {
    console.error('Node update error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/v1/filesystem/:username/:node_id(/:node_id)*
app.delete('/api/v1/filesystem/:username/:node_ids(*)', requireAuth, requireUsername, (req, res) => {
  try {
    const targetUsername = req.params.username;
    const nodeIds = req.params.node_ids.split('/').filter(id => id);
    
    if (targetUsername !== req.username && req.user.email !== 'admin@bdpadrive.com') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const targetUser = Array.from(users.values()).find(u => u.email === targetUsername);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const userFileList = userFiles.get(targetUser.id) || [];
    const userFolderList = userFolders.get(targetUser.id) || [];
    
    let deletedCount = 0;
    
    nodeIds.forEach(nodeId => {
      // Try to delete file
      const fileIndex = userFileList.findIndex(f => f.id === nodeId);
      if (fileIndex !== -1) {
        userFileList.splice(fileIndex, 1);
        deletedCount++;
        return;
      }
      
      // Try to delete folder
      const folderIndex = userFolderList.findIndex(f => f.id === nodeId);
      if (folderIndex !== -1) {
        userFolderList.splice(folderIndex, 1);
        deletedCount++;
      }
    });
    
    userFiles.set(targetUser.id, userFileList);
    userFolders.set(targetUser.id, userFolderList);
    
    if (deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Node(s) not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Node deletion error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ================================
// Legacy Authentication API Routes (for backward compatibility)
// ================================

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = users.get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.email = user.email;
    
    // Update last login
    user.lastLogin = new Date();
    
    // Initialize user's file system if not exists
    if (!userFiles.has(user.id)) {
      userFiles.set(user.id, []);
    }
    if (!userFolders.has(user.id)) {
      userFolders.set(user.id, []);
    }
    
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
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const emailLower = email.toLowerCase();
    if (users.has(emailLower)) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    const newUser = {
      id: userId,
      email: emailLower,
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
    
    res.status(201).json({ 
      success: true, 
      user: { 
        id: userId, 
        email: emailLower, 
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
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true, redirectUrl: '/auth' });
  });
});

// ================================
// Legacy File Management API (for backward compatibility)
// ================================

// User info API (for authenticated users only)
app.get('/api/user/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    createdAt: req.user.createdAt,
    lastLogin: req.user.lastLogin
  });
});

// Get all files and folders for user
app.get('/api/files', requireAuth, (req, res) => {
  const userFileList = userFiles.get(req.user.id) || [];
  const userFolderList = userFolders.get(req.user.id) || [];
  
  res.json({
    files: userFileList,
    folders: userFolderList
  });
});

// Create a new file
app.post('/api/files', requireAuth, (req, res) => {
  try {
    const { name, content = '', type = 'document' } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'File name is required' });
    }
    
    const userFileList = userFiles.get(req.user.id) || [];
    
    // Check if file name already exists
    if (userFileList.some(file => file.name === name.trim())) {
      return res.status(409).json({ error: 'File name already exists' });
    }
    
    const newFile = {
      id: uuidv4(),
      name: name.trim(),
      content: content,
      type: type,
      size: Buffer.byteLength(content, 'utf8'),
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: req.user.id
    };
    
    userFileList.push(newFile);
    userFiles.set(req.user.id, userFileList);
    
    res.status(201).json(newFile);
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific file
app.get('/api/files/:id', requireAuth, (req, res) => {
  try {
    const userFileList = userFiles.get(req.user.id) || [];
    const file = userFileList.find(f => f.id === req.params.id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json(file);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a file
app.put('/api/files/:id', requireAuth, (req, res) => {
  try {
    const { name, content } = req.body;
    const userFileList = userFiles.get(req.user.id) || [];
    const fileIndex = userFileList.findIndex(f => f.id === req.params.id);
    
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = userFileList[fileIndex];
    
    // Update file properties
    if (name && name.trim() !== file.name) {
      // Check if new name already exists
      if (userFileList.some(f => f.name === name.trim() && f.id !== file.id)) {
        return res.status(409).json({ error: 'File name already exists' });
      }
      file.name = name.trim();
    }
    
    if (content !== undefined) {
      file.content = content;
      file.size = Buffer.byteLength(content, 'utf8');
    }
    
    file.updatedAt = new Date();
    
    userFileList[fileIndex] = file;
    userFiles.set(req.user.id, userFileList);
    
    res.json(file);
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a file
app.delete('/api/files/:id', requireAuth, (req, res) => {
  try {
    const userFileList = userFiles.get(req.user.id) || [];
    const fileIndex = userFileList.findIndex(f => f.id === req.params.id);
    
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const deletedFile = userFileList.splice(fileIndex, 1)[0];
    userFiles.set(req.user.id, userFileList);
    
    res.json({ message: 'File deleted successfully', file: deletedFile });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Folder Management API Routes

// Create a new folder
app.post('/api/folders', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    
    const userFolderList = userFolders.get(req.user.id) || [];
    
    // Check if folder name already exists
    if (userFolderList.some(folder => folder.name === name.trim())) {
      return res.status(409).json({ error: 'Folder name already exists' });
    }
    
    const newFolder = {
      id: uuidv4(),
      name: name.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: req.user.id
    };
    
    userFolderList.push(newFolder);
    userFolders.set(req.user.id, userFolderList);
    
    res.status(201).json(newFolder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a folder
app.put('/api/folders/:id', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    const userFolderList = userFolders.get(req.user.id) || [];
    const folderIndex = userFolderList.findIndex(f => f.id === req.params.id);
    
    if (folderIndex === -1) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const folder = userFolderList[folderIndex];
    
    if (name && name.trim() !== folder.name) {
      // Check if new name already exists
      if (userFolderList.some(f => f.name === name.trim() && f.id !== folder.id)) {
        return res.status(409).json({ error: 'Folder name already exists' });
      }
      folder.name = name.trim();
      folder.updatedAt = new Date();
    }
    
    userFolderList[folderIndex] = folder;
    userFolders.set(req.user.id, userFolderList);
    
    res.json(folder);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a folder
app.delete('/api/folders/:id', requireAuth, (req, res) => {
  try {
    const userFolderList = userFolders.get(req.user.id) || [];
    const folderIndex = userFolderList.findIndex(f => f.id === req.params.id);
    
    if (folderIndex === -1) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const deletedFolder = userFolderList.splice(folderIndex, 1)[0];
    userFolders.set(req.user.id, userFolderList);
    
    res.json({ message: 'Folder deleted successfully', folder: deletedFolder });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use(async (req, res) => {
  try {
    const html = await res.locals.renderLayout('404', { 
      title: 'Page Not Found - BDPADrive'
    });
    res.status(404).send(html);
  } catch (err) {
    console.error('Error rendering 404 page:', err);
    res.status(404).send('Page Not Found');
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).send('Something went wrong!');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 BDPADrive server is running on http://localhost:${PORT}`);
  console.log(`📁 File management and word processing application`);
  console.log(`👤 Demo users:`);
  console.log(`   📧 demo@bdpadrive.com / password123`);
  console.log(`   📧 admin@bdpadrive.com / admin123`);
});
