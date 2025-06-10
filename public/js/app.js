// BDPADrive Frontend JavaScript

class BDPADrive {
    constructor() {
        this.currentUser = null;
        this.files = [];
        this.folders = [];
        this.selectedItems = new Set();
        this.currentItemProperties = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadUserData();
        this.initializeSearch();
        this.initializePreviewMode();
        this.startHealthCheck(); // Start the health check for server connectivity
    }

    bindEvents() {
        // Authentication forms
        document.getElementById('signinForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.signin();
        });

        document.getElementById('signupForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.signup();
        });

        // Create item modal
        document.querySelectorAll('.create-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                this.showCreateForm(type);
            });
        });

        // File management
        document.getElementById('newItemForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createItem();
        });

        // View mode toggles
        document.querySelectorAll('input[name="viewMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleViewMode(e.target.id);
            });
        });

        // Sorting and filtering
        document.getElementById('sortBy')?.addEventListener('change', () => {
            this.sortItems();
        });

        document.getElementById('filterType')?.addEventListener('change', () => {
            this.filterItems();
        });

        // Modal events
        const createModal = document.getElementById('createModal');
        if (createModal) {
            createModal.addEventListener('hidden.bs.modal', () => {
                this.resetCreateForm();
            });
        }

        // File operation buttons (using event delegation)
        document.addEventListener('click', (e) => {
            if (e.target.matches('.btn-delete-file, .btn-delete-file *')) {
                const btn = e.target.closest('.btn-delete-file');
                const fileName = btn.dataset.fileName;
                const fileElement = btn.closest('.file-item, .folder-item');
                this.handleDeleteFile(fileName, fileElement);
            }
            
            if (e.target.matches('.btn-rename-file, .btn-rename-file *')) {
                const btn = e.target.closest('.btn-rename-file');
                const fileName = btn.dataset.fileName;
                const fileElement = btn.closest('.file-item, .folder-item');
                this.handleRenameFile(fileName, fileElement);
            }
        });

        // Content size monitoring for new documents
        document.getElementById('itemDescription')?.addEventListener('input', (e) => {
            this.enforceContentLimit(e.target);
        });

        // Dashboard-specific initialization
        this.initializeDashboard();
    }

    initializeDashboard() {
        // Load storage information on dashboard
        if (document.getElementById('storageUsed')) {
            this.updateStorageDisplay();
        }

        // Delete confirmation input validation
        const deleteConfirmInput = document.getElementById('deleteConfirmation');
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        
        if (deleteConfirmInput && confirmDeleteBtn) {
            deleteConfirmInput.addEventListener('input', (e) => {
                confirmDeleteBtn.disabled = e.target.value !== 'DELETE';
            });
        }

        // Load storage info when delete modal is opened
        const deleteModal = document.getElementById('deleteAccountModal');
        if (deleteModal) {
            deleteModal.addEventListener('show.bs.modal', () => {
                this.updateStorageDisplay();
            });
        }

        // Clear password form when modal is closed
        const passwordModal = document.getElementById('changePasswordModal');
        if (passwordModal) {
            passwordModal.addEventListener('hidden.bs.modal', () => {
                document.getElementById('changePasswordForm')?.reset();
                document.getElementById('passwordError')?.classList.add('d-none');
            });
        }
    }

    async loadUserData() {
        try {
            // Use legacy endpoint to get session info
            const response = await fetch('/api/user/me');
            if (response.ok) {
                const userData = await response.json();
                this.currentUser = userData;
                
                // Also try to get additional user info from v1 API
                if (userData.username) {
                    try {
                        const v1Response = await fetch(`/api/v1/users/${userData.username}`);
                        if (v1Response.ok) {
                            const v1Data = await v1Response.json();
                            this.currentUser = { ...userData, ...v1Data };
                        }
                    } catch (error) {
                        console.log('V1 user data not available:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async signin() {
        const email = document.getElementById('signinEmail').value.trim();
        const password = document.getElementById('signinPassword').value;
        const submitBtn = document.getElementById('signinSubmit');

        if (!email || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        try {
            this.showLoading('signinSubmit', true);
            
            const data = await this.apiCall('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            }, false);

            if (data.success) {
                this.showSuccess('Sign in successful!');
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/dashboard';
                }, 1000);
            } else {
                this.showError(data.error || 'Sign in failed');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            this.showError('Sign in failed. Please check your credentials and try again.');
        } finally {
            this.showLoading('signinSubmit', false);
        }
    }

    async signup() {
        const name = document.getElementById('signupName').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;

        if (!name || !email || !password) {
            this.showToast('Please fill in all fields', 'warning');
            return;
        }

        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters long', 'warning');
            return;
        }

        try {
            // Generate username from email (before @ symbol)
            const username = email.split('@')[0].toLowerCase();
            
            // Use v1 API for user creation
            const response = await fetch('/api/v1/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    username,
                    email, 
                    password,
                    fullName: name
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Account created successfully!', 'success');
                
                // Now authenticate the user
                const authResponse = await fetch(`/api/v1/users/${username}/auth`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ password })
                });

                if (authResponse.ok) {
                    // Set session using legacy endpoint for compatibility
                    await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email, password })
                    });
                    
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1000);
                }
            } else {
                this.showToast(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('Registration failed. Please try again.', 'error');
        }
    }

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Signed out successfully', 'success');
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/auth';
                }, 1000);
            } else {
                this.showToast('Sign out failed', 'error');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Sign out failed', 'error');
        }
    }

    showCreateForm(type) {
        document.getElementById('itemType').value = type;
        document.getElementById('createForm').style.display = 'block';
        document.getElementById('createBtn').style.display = 'inline-block';
        
        // Show/hide relevant fields
        const descriptionField = document.getElementById('descriptionField');
        const symlinkTargetField = document.getElementById('symlinkTargetField');
        const tagsField = document.getElementById('tagsField');
        
        descriptionField.style.display = type === 'document' ? 'block' : 'none';
        symlinkTargetField.style.display = type === 'symlink' ? 'block' : 'none';
        tagsField.style.display = type === 'document' ? 'block' : 'none';
        
        // Update modal title
        const typeNames = {
            document: 'Document',
            folder: 'Folder',
            symlink: 'Symbolic Link'
        };
        document.querySelector('#createModal .modal-title').textContent = `Create New ${typeNames[type]}`;
    }

    enforceContentLimit(textarea) {
        const maxBytes = 10240; // 10KB
        const content = textarea.value;
        const byteLength = new Blob([content]).size;
        
        if (byteLength > maxBytes) {
            // Truncate content to fit within limit
            let truncated = content;
            while (new Blob([truncated]).size > maxBytes) {
                truncated = truncated.slice(0, -1);
            }
            textarea.value = truncated;
            this.showToast('Content truncated to 10KB limit', 'warning');
        }
        
        // Update byte counter if element exists
        const counter = document.getElementById('contentCounter');
        if (counter) {
            counter.textContent = `${byteLength}/${maxBytes} bytes`;
            counter.className = byteLength > maxBytes ? 'text-danger' : 'text-muted';
        }
    }

    async createItem() {
        const type = document.getElementById('itemType').value;
        const name = document.getElementById('itemName').value.trim();
        const description = document.getElementById('itemDescription')?.value.trim() || '';
        const symlinkTarget = document.getElementById('symlinkTarget')?.value.trim() || '';
        const tagsInput = document.getElementById('itemTags')?.value.trim() || '';

        if (!name) {
            this.showToast('Name is required', 'warning');
            return;
        }

        // Validate and parse tags
        let tags = [];
        if (tagsInput) {
            tags = this.parseTags(tagsInput);
            if (tags === null) return; // Validation failed
        }

        // Enforce content limit for documents
        if (type === 'document' && description) {
            const byteLength = new Blob([description]).size;
            if (byteLength > 10240) {
                this.showToast('Content exceeds 10KB limit', 'error');
                return;
            }
        }

        try {
            // Get current user info to get username
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return;
            }

            const itemData = {
                name: name,
                isDirectory: type === 'folder',
                content: type === 'document' ? description : undefined,
                mimeType: type === 'document' ? 'text/plain' : undefined,
                type: type,
                tags: tags.length > 0 ? tags : undefined,
                symlinkTarget: type === 'symlink' ? symlinkTarget : undefined
            };

            // Use v1 API to create file/folder
            const response = await fetch(`/api/v1/filesystem/${userData.username}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(itemData)
            });

            if (response.ok) {
                this.showToast(`${type === 'folder' ? 'Folder' : type === 'symlink' ? 'Symlink' : 'Document'} created successfully!`, 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                const error = await response.json();
                this.showToast(error.error || `Failed to create ${type}`, 'error');
            }
        } catch (error) {
            console.error('Create item error:', error);
            this.showToast(`Failed to create ${type}`, 'error');
        }

        // Hide modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('createModal'));
        modal.hide();
    }

    parseTags(tagsInput) {
        const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
        
        if (tags.length > 5) {
            this.showToast('Maximum 5 tags allowed', 'warning');
            return null;
        }
        
        // Validate alphanumeric tags
        const alphanumericRegex = /^[a-zA-Z0-9]+$/;
        for (const tag of tags) {
            if (!alphanumericRegex.test(tag)) {
                this.showToast(`Tag "${tag}" must be alphanumeric only`, 'warning');
                return null;
            }
        }
        
        // Convert to lowercase for case-insensitive handling
        return tags.map(tag => tag.toLowerCase());
    }

    toggleViewMode(viewMode) {
        const gridView = document.getElementById('gridViewContainer');
        const listView = document.getElementById('listViewContainer');
        const previewView = document.getElementById('previewViewContainer');

        // Hide all views
        gridView.style.display = 'none';
        listView.style.display = 'none';
        previewView.style.display = 'none';

        // Show selected view
        switch(viewMode) {
            case 'gridView':
                gridView.style.display = 'block';
                break;
            case 'listView':
                listView.style.display = 'block';
                break;
            case 'previewView':
                previewView.style.display = 'block';
                this.loadPreviewView();
                break;
        }
    }

    sortItems() {
        const sortBy = document.getElementById('sortBy').value;
        const gridItems = document.querySelectorAll('#filesGrid .item-card');
        const listItems = document.querySelectorAll('#filesTable .item-row');

        [gridItems, listItems].forEach(items => {
            const itemsArray = Array.from(items);
            const parent = itemsArray[0]?.parentNode;
            
            if (!parent) return;

            itemsArray.sort((a, b) => {
                switch (sortBy) {
                    case 'name':
                        return a.dataset.name.localeCompare(b.dataset.name);
                    case 'createdAt':
                        return new Date(parseInt(b.dataset.created)) - new Date(parseInt(a.dataset.created));
                    case 'modifiedAt':
                        return new Date(parseInt(b.dataset.modified)) - new Date(parseInt(a.dataset.modified));
                    case 'size':
                        return (parseInt(b.dataset.size) || 0) - (parseInt(a.dataset.size) || 0);
                    case 'type':
                        return a.dataset.type.localeCompare(b.dataset.type);
                    default:
                        return 0;
                }
            });

            itemsArray.forEach(item => parent.appendChild(item));
        });
    }

    filterItems() {
        const filterType = document.getElementById('filterType').value;
        const gridItems = document.querySelectorAll('#filesGrid .item-card');
        const listItems = document.querySelectorAll('#filesTable .item-row');

        [gridItems, listItems].forEach(items => {
            items.forEach(item => {
                const itemType = item.dataset.type;
                const show = filterType === 'all' || 
                           (filterType === 'document' && (itemType === 'document' || itemType === 'file')) ||
                           (filterType === 'folder' && itemType === 'folder') ||
                           (filterType === 'symlink' && itemType === 'symlink');
                
                item.style.display = show ? '' : 'none';
            });
        });
    }

    initializePreviewMode() {
        // Initialize file preview functionality
        this.previewCache = new Map();
    }

    async loadPreviewView() {
        const previewGrid = document.getElementById('previewGrid');
        if (!previewGrid) return;

        previewGrid.innerHTML = '<div class="col-12 text-center"><div class="spinner-border" role="status"></div><p>Loading previews...</p></div>';

        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                previewGrid.innerHTML = '<div class="col-12 alert alert-warning">Authentication required</div>';
                return;
            }

            // Get all files for preview
            const response = await fetch(`/api/v1/filesystem/${userData.username}`);
            if (!response.ok) {
                throw new Error('Failed to load files');
            }

            const data = await response.json();
            const files = data.nodes || [];
            
            let html = '';
            for (const file of files.filter(f => f.type === 'file')) {
                const preview = await this.generateFilePreview(file);
                html += this.renderPreviewCard(file, preview);
            }

            previewGrid.innerHTML = html || '<div class="col-12 alert alert-info">No files to preview</div>';
        } catch (error) {
            console.error('Preview loading error:', error);
            previewGrid.innerHTML = '<div class="col-12 alert alert-danger">Failed to load previews</div>';
        }
    }

    async generateFilePreview(file) {
        if (this.previewCache.has(file.node_id)) {
            return this.previewCache.get(file.node_id);
        }

        try {
            // Get file content for preview
            const content = file.text || '';
            const preview = {
                type: 'text',
                content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
                hasMoreContent: content.length > 200
            };

            this.previewCache.set(file.node_id, preview);
            return preview;
        } catch (error) {
            console.error('Preview generation error:', error);
            return { type: 'error', content: 'Preview unavailable' };
        }
    }

    renderPreviewCard(file, preview) {
        const tags = file.tags ? file.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('') : '';
        const sizeWarning = file.size > 10240 ? '<i class="bi bi-exclamation-triangle text-warning" title="Exceeds 10KB limit"></i>' : '';
        
        return `
            <div class="col-lg-4 col-md-6 mb-4">
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 text-truncate">${file.name} ${sizeWarning}</h6>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary btn-sm" onclick="editFile('${file.node_id}')">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="preview-content mb-3" style="height: 120px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 0.85rem;">
                            ${preview.content}
                        </div>
                        ${tags ? `<div class="mb-2">${tags}</div>` : ''}
                        <small class="text-muted">
                            <div>Size: ${Math.round((file.size || 0) / 1024)}KB</div>
                            <div>Modified: ${new Date(file.modifiedAt).toLocaleDateString()}</div>
                        </small>
                    </div>
                </div>
            </div>
        `;
    }

    // V1 API Methods for File Management
    
    async loadFilesV1(path = '') {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return [];
            }

            const url = path 
                ? `/api/v1/filesystem/${userData.username}/${path}`
                : `/api/v1/filesystem/${userData.username}`;
                
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                return data.children || [data];
            } else {
                console.error('Failed to load files:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Error loading files:', error);
            return [];
        }
    }

    async deleteFileV1(fileName) {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return false;
            }

            const response = await fetch(`/api/v1/filesystem/${userData.username}/${fileName}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showToast('File deleted successfully', 'success');
                return true;
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to delete file', 'error');
                return false;
            }
        } catch (error) {
            console.error('Delete file error:', error);
            this.showToast('Failed to delete file', 'error');
            return false;
        }
    }

    async renameFileV1(oldName, newName) {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return false;
            }

            const response = await fetch(`/api/v1/filesystem/${userData.username}/${oldName}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newName })
            });

            if (response.ok) {
                this.showToast('File renamed successfully', 'success');
                return true;
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to rename file', 'error');
                return false;
            }
        } catch (error) {
            console.error('Rename file error:', error);
            this.showToast('Failed to rename file', 'error');
            return false;
        }
    }

    async searchFilesV1(query, useRegex = false) {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return [];
            }

            const searchParams = new URLSearchParams();
            if (useRegex) {
                searchParams.append('regexMatch', query);
            } else {
                searchParams.append('match', query);
            }

            const response = await fetch(`/api/v1/filesystem/${userData.username}/search?${searchParams}`);
            
            if (response.ok) {
                const data = await response.json();
                return data.results || [];
            } else {
                console.error('Search failed:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    async getFileContentV1(fileName) {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return null;
            }

            const response = await fetch(`/api/v1/filesystem/${userData.username}/${fileName}`);
            
            if (response.ok) {
                const data = await response.json();
                return data.content || '';
            } else {
                console.error('Failed to get file content:', response.status);
                return null;
            }
        } catch (error) {
            console.error('Get file content error:', error);
            return null;
        }
    }

    async saveFileContentV1(fileName, content, mimeType = 'text/plain') {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return false;
            }

            const response = await fetch(`/api/v1/filesystem/${userData.username}/${fileName}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    content: content,
                    mimeType: mimeType
                })
            });

            if (response.ok) {
                return true;
            } else {
                const error = await response.json();
                console.error('Failed to save file:', error);
                return false;
            }
        } catch (error) {
            console.error('Save file error:', error);
            return false;
        }
    }

    // Enhanced file operations with UI integration
    
    async handleDeleteFile(fileName, elementToRemove) {
        if (confirm(`Are you sure you want to delete "${fileName}"?`)) {
            const success = await this.deleteFileV1(fileName);
            if (success && elementToRemove) {
                elementToRemove.remove();
            }
        }
    }

    async handleRenameFile(oldName, elementToUpdate) {
        const newName = prompt('Enter new name:', oldName);
        if (newName && newName !== oldName) {
            const success = await this.renameFileV1(oldName, newName);
            if (success && elementToUpdate) {
                // Update the UI element with new name
                const nameElement = elementToUpdate.querySelector('.file-name, .folder-name');
                if (nameElement) {
                    nameElement.textContent = newName;
                }
                // Update any data attributes
                elementToUpdate.dataset.fileName = newName;
            }
        }
    }

    async performSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput || !searchResults) return;
        
        const query = searchInput.value.trim();
        if (!query) {
            searchResults.innerHTML = '';
            return;
        }

        try {
            const results = await this.searchFilesV1(query);
            this.displaySearchResults(results, searchResults);
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<div class="alert alert-danger">Search failed</div>';
        }
    }

    displaySearchResults(results, container) {
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No files found</div>';
            return;
        }

        const html = results.map(file => `
            <div class="search-result-item mb-2 p-2 border rounded">
                <div class="d-flex align-items-center">
                    <i class="bi ${file.isDirectory ? 'bi-folder' : 'bi-file-earmark-text'} me-2"></i>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${file.name}</div>
                        <small class="text-muted">
                            ${file.isDirectory ? 'Folder' : 'File'} • 
                            ${new Date(file.lastModified).toLocaleDateString()}
                        </small>
                    </div>
                    <div class="btn-group btn-group-sm">
                        ${!file.isDirectory ? `
                            <button class="btn btn-outline-primary" onclick="window.open('/editor/${file.name}', '_blank')">
                                <i class="bi bi-pencil"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-danger" onclick="bdpaDrive.handleDeleteFile('${file.name}', this.closest('.search-result-item'))">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    // Initialize search functionality
    initializeSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.performSearch();
                }, 300); // Debounce search
            });
        }
    }

    // Account Management Methods
    
    async loadStorageInfo() {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                return null;
            }

            const response = await fetch(`/api/v1/users/${userData.username}/storage`);
            if (response.ok) {
                const data = await response.json();
                return data.storage;
            } else {
                console.error('Failed to load storage info:', response.status);
                return null;
            }
        } catch (error) {
            console.error('Storage info error:', error);
            return null;
        }
    }

    async updateStorageDisplay() {
        const storageElement = document.getElementById('storageUsed');
        const deleteStorageElement = document.getElementById('deleteStorageInfo');
        
        if (!storageElement && !deleteStorageElement) return;
        
        const storage = await this.loadStorageInfo();
        if (storage) {
            const storageText = `${storage.totalKB} KB (${storage.fileCount} files, ${storage.folderCount} folders)`;
            if (storageElement) storageElement.textContent = storageText;
            if (deleteStorageElement) deleteStorageElement.textContent = storageText;
        } else {
            if (storageElement) storageElement.textContent = 'Unable to load';
            if (deleteStorageElement) deleteStorageElement.textContent = 'Unable to load';
        }
    }

    async updateProfile() {
        const name = document.getElementById('profileName').value.trim();
        const email = document.getElementById('profileEmail').value.trim();
        
        if (!name || !email) {
            this.showToast('Please fill in all fields', 'warning');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showToast('Please enter a valid email address', 'warning');
            return;
        }

        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return;
            }

            const response = await fetch(`/api/v1/users/${userData.username}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email })
            });

            if (response.ok) {
                this.showToast('Profile updated successfully!', 'success');
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('updateProfileModal'));
                modal.hide();
                
                // Check if email changed - if so, we need to logout and re-login
                if (email !== userData.email) {
                    this.showToast('Email changed. Please log in again.', 'info');
                    setTimeout(() => {
                        this.logout();
                    }, 2000);
                } else {
                    // Just reload the page to show updated info
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to update profile', 'error');
            }
        } catch (error) {
            console.error('Update profile error:', error);
            this.showToast('Failed to update profile', 'error');
        }
    }

    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorDiv = document.getElementById('passwordError');
        
        // Clear previous errors
        errorDiv.classList.add('d-none');
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            errorDiv.textContent = 'Please fill in all fields';
            errorDiv.classList.remove('d-none');
            return;
        }

        if (newPassword.length < 8) {
            errorDiv.textContent = 'New password must be at least 8 characters long';
            errorDiv.classList.remove('d-none');
            return;
        }

        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'New passwords do not match';
            errorDiv.classList.remove('d-none');
            return;
        }

        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return;
            }

            // First verify current password
            const authResponse = await fetch(`/api/v1/users/${userData.username}/auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: currentPassword })
            });

            if (!authResponse.ok) {
                errorDiv.textContent = 'Current password is incorrect';
                errorDiv.classList.remove('d-none');
                return;
            }

            // Update password
            const response = await fetch(`/api/v1/users/${userData.username}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: newPassword })
            });

            if (response.ok) {
                this.showToast('Password changed successfully!', 'success');
                
                // Close modal and clear form
                const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
                modal.hide();
                document.getElementById('changePasswordForm').reset();
                
            } else {
                const error = await response.json();
                errorDiv.textContent = error.error || 'Failed to change password';
                errorDiv.classList.remove('d-none');
            }
        } catch (error) {
            console.error('Change password error:', error);
            errorDiv.textContent = 'Failed to change password';
            errorDiv.classList.remove('d-none');
        }
    }

    async deleteAccount() {
        const confirmation = document.getElementById('deleteConfirmation').value.trim();
        
        if (confirmation !== 'DELETE') {
            this.showToast('Please type DELETE to confirm', 'warning');
            return;
        }

        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                this.showToast('User not authenticated', 'error');
                return;
            }

            const response = await fetch(`/api/v1/users/${userData.username}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const result = await response.json();
                this.showToast('Account deleted successfully', 'success');
                
                // Show deletion summary
                const deletedData = result.deletedData;
                this.showToast(
                    `Deleted: ${deletedData.files} files, ${deletedData.folders} folders (${deletedData.storageKB} KB)`, 
                    'info'
                );
                
                // Redirect to auth page after a delay
                setTimeout(() => {
                    window.location.href = '/auth';
                }, 3000);
                
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to delete account', 'error');
            }
        } catch (error) {
            console.error('Delete account error:', error);
            this.showToast('Failed to delete account', 'error');
        }
    }

    // Enhanced error handling and loading states
    showLoading(elementId, show = true) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        if (show) {
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner me-2';
            spinner.id = `${elementId}-spinner`;
            element.prepend(spinner);
            element.disabled = true;
        } else {
            const spinner = document.getElementById(`${elementId}-spinner`);
            if (spinner) spinner.remove();
            element.disabled = false;
        }
    }

    showError(message, container = 'body') {
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger alert-dismissible fade show position-fixed';
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.querySelector(container).appendChild(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    showSuccess(message, container = 'body') {
        const alert = document.createElement('div');
        alert.className = 'alert alert-success alert-dismissible fade show position-fixed';
        alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.querySelector(container).appendChild(alert);
        
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 3000);
    }

    // Enhanced fetch with error handling and retries
    async fetchWithRetry(url, options = {}, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    }
                });

                // Handle different error status codes
                if (response.status === 555) {
                    throw new Error('Server temporarily unavailable (555). Retrying...');
                }

                if (response.status === 429) {
                    throw new Error('Too many requests. Please wait a moment and try again.');
                }

                if (response.status === 401) {
                    // Redirect to login for authentication errors
                    window.location.href = '/auth';
                    return;
                }

                if (response.status === 403) {
                    throw new Error('Access denied. You do not have permission for this action.');
                }

                if (response.status === 404) {
                    throw new Error('The requested resource was not found.');
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                }

                return response;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                
                if (i === retries - 1) {
                    // Last attempt failed
                    throw error;
                }
                
                // Wait before retrying (exponential backoff)
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Enhanced API call wrapper
    async apiCall(endpoint, options = {}, showLoading = true) {
        const loadingId = `api-call-${Date.now()}`;
        
        try {
            if (showLoading) {
                this.showGlobalLoading(true);
            }

            const response = await this.fetchWithRetry(endpoint, options);
            const data = await response.json();

            if (showLoading) {
                this.showGlobalLoading(false);
            }

            return data;
        } catch (error) {
            if (showLoading) {
                this.showGlobalLoading(false);
            }
            
            this.showError(error.message);
            throw error;
        }
    }

    showGlobalLoading(show = true) {
        let loader = document.getElementById('global-loader');
        
        if (show && !loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.className = 'position-fixed d-flex align-items-center justify-content-center';
            loader.style.cssText = `
                top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(0,0,0,0.3); z-index: 9999;
                backdrop-filter: blur(2px);
            `;
            loader.innerHTML = `
                <div class="bg-white rounded-3 p-4 text-center shadow">
                    <div class="loading-spinner mx-auto mb-3" style="width: 3rem; height: 3rem;"></div>
                    <div class="text-muted">Loading...</div>
                </div>
            `;
            document.body.appendChild(loader);
        } else if (!show && loader) {
            loader.remove();
        }
    }

    // Enhanced error recovery
    handleConnectionError() {
        this.showError(`
            <strong>Connection Error</strong><br>
            Please check your internet connection and try again.
            <button class="btn btn-sm btn-outline-primary ms-2" onclick="location.reload()">
                Reload Page
            </button>
        `);
    }

    // Check server health periodically
    startHealthCheck() {
        setInterval(async () => {
            try {
                await fetch('/api/test/random-error');
            } catch (error) {
                console.warn('Health check failed:', error);
                // Could show offline indicator here
            }
        }, 30000); // Check every 30 seconds
    }
}

// Global functions for onclick handlers
let bdpaDrive;

function logout() {
    bdpaDrive.logout();
}

function createItem() {
    bdpaDrive.createItem();
}

function openFolder(id) {
    bdpaDrive.showToast('Folder functionality coming soon!', 'info');
}

function viewFile(id) {
    window.open(`/editor/${id}`, '_blank');
}

function editFile(id) {
    window.open(`/editor/${id}`, '_blank');
}

async function renameItem(type, id, currentName) {
    const newName = prompt(`Rename ${type}:`, currentName);
    if (newName && newName.trim() !== currentName) {
        try {
            const endpoint = type === 'file' ? `/api/files/${id}` : `/api/folders/${id}`;
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newName.trim() })
            });

            if (response.ok) {
                bdpaDrive.showToast(`${type === 'file' ? 'File' : 'Folder'} renamed successfully!`, 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                const error = await response.json();
                bdpaDrive.showToast(error.error || `Failed to rename ${type}`, 'error');
            }
        } catch (error) {
            console.error('Rename error:', error);
            bdpaDrive.showToast(`Failed to rename ${type}`, 'error');
        }
    }
}

async function deleteItem(type, id) {
    if (confirm(`Are you sure you want to delete this ${type}?`)) {
        try {
            const endpoint = type === 'file' ? `/api/files/${id}` : `/api/folders/${id}`;
            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                bdpaDrive.showToast(`${type === 'file' ? 'File' : 'Folder'} deleted successfully!`, 'success');
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                const error = await response.json();
                bdpaDrive.showToast(error.error || `Failed to delete ${type}`, 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            bdpaDrive.showToast(`Failed to delete ${type}`, 'error');
        }
    }
}

// New enhanced functions

async function showItemPropertiesModal(type, id) {
    try {
        const userResponse = await fetch('/api/user/me');
        const userData = await userResponse.json();
        
        if (!userData.username) {
            bdpaDrive.showToast('Authentication required', 'error');
            return;
        }

        // Get item details using v1 API
        const response = await fetch(`/api/v1/filesystem/${userData.username}/${id}`);
        if (!response.ok) {
            throw new Error('Failed to load item details');
        }

        const item = await response.json();
        bdpaDrive.currentItemProperties = { type, id, ...item };
        
        const modal = new bootstrap.Modal(document.getElementById('itemPropertiesModal'));
        const content = document.getElementById('itemPropertiesContent');
        
        content.innerHTML = renderItemPropertiesForm(item, type);
        modal.show();
    } catch (error) {
        console.error('Error loading item properties:', error);
        bdpaDrive.showToast('Failed to load item properties', 'error');
    }
}

function renderItemPropertiesForm(item, type) {
    const isFile = type === 'file';
    const isSymlink = item.type === 'symlink';
    const tags = item.tags || [];
    
    return `
        <form id="itemPropertiesForm">
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">Name</label>
                        <input type="text" class="form-control" id="propName" value="${item.name}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Type</label>
                        <input type="text" class="form-control" value="${type === 'file' ? (isSymlink ? 'Symbolic Link' : 'Document') : 'Folder'}" readonly>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Owner</label>
                        <input type="text" class="form-control" id="propOwner" value="${item.owner || 'Current User'}">
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">Size</label>
                        <input type="text" class="form-control" value="${Math.round((item.size || 0) / 1024)} KB (${item.size || 0} bytes)" readonly>
                        ${item.size > 10240 ? '<div class="text-warning small"><i class="bi bi-exclamation-triangle"></i> Exceeds 10KB limit</div>' : ''}
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Created</label>
                        <input type="text" class="form-control" value="${new Date(item.createdAt).toLocaleString()}" readonly>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Modified</label>
                        <input type="text" class="form-control" value="${new Date(item.modifiedAt).toLocaleString()}" readonly>
                    </div>
                </div>
            </div>
            
            ${isFile ? `
                <div class="mb-3">
                    <label class="form-label">Tags (max 5 alphanumeric tags)</label>
                    <input type="text" class="form-control" id="propTags" value="${tags.join(', ')}" placeholder="tag1, tag2, tag3">
                    <div class="form-text">Separate tags with commas. Only alphanumeric characters allowed.</div>
                </div>
            ` : ''}
            
            ${isSymlink ? `
                <div class="mb-3">
                    <label class="form-label">Target Path</label>
                    <input type="text" class="form-control" id="propSymlinkTarget" value="${item.symlinkTarget || ''}" placeholder="Path to target">
                    <div class="form-text">The file or folder this symlink points to</div>
                </div>
            ` : ''}
            
            ${isFile && !isSymlink ? `
                <div class="mb-3">
                    <label class="form-label">Content Preview</label>
                    <textarea class="form-control" rows="4" readonly style="font-family: monospace; font-size: 0.9rem;">${(item.text || '').substring(0, 500)}${(item.text || '').length > 500 ? '\n\n... (truncated)' : ''}</textarea>
                </div>
            ` : ''}
        </form>
    `;
}

async function saveItemProperties() {
    try {
        const form = document.getElementById('itemPropertiesForm');
        const formData = new FormData(form);
        
        const userResponse = await fetch('/api/user/me');
        const userData = await userResponse.json();
        
        if (!userData.username) {
            bdpaDrive.showToast('Authentication required', 'error');
            return;
        }

        const updates = {
            name: document.getElementById('propName').value.trim(),
            owner: document.getElementById('propOwner').value.trim()
        };

        // Handle tags for files
        const tagsInput = document.getElementById('propTags');
        if (tagsInput) {
            const tags = bdpaDrive.parseTags(tagsInput.value);
            if (tags === null) return; // Validation failed
            updates.tags = tags;
        }

        // Handle symlink target
        const symlinkTargetInput = document.getElementById('propSymlinkTarget');
        if (symlinkTargetInput) {
            updates.symlinkTarget = symlinkTargetInput.value.trim();
        }

        const response = await fetch(`/api/v1/filesystem/${userData.username}/${bdpaDrive.currentItemProperties.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });

        if (response.ok) {
            bdpaDrive.showToast('Properties updated successfully', 'success');
            const modal = bootstrap.Modal.getInstance(document.getElementById('itemPropertiesModal'));
            modal.hide();
            setTimeout(() => window.location.reload(), 1000);
        } else {
            const error = await response.json();
            bdpaDrive.showToast(error.error || 'Failed to update properties', 'error');
        }
    } catch (error) {
        console.error('Error saving properties:', error);
        bdpaDrive.showToast('Failed to save properties', 'error');
    }
}

// Bulk operations
function toggleSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('input[name="itemSelect"]');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    
    if (checkbox.checked) {
        checkboxes.forEach(cb => bdpaDrive.selectedItems.add(cb.value));
    } else {
        bdpaDrive.selectedItems.clear();
    }
}

function getSelectedItems() {
    const selected = [];
    const checkboxes = document.querySelectorAll('input[name="itemSelect"]:checked');
    checkboxes.forEach(cb => {
        selected.push({
            id: cb.value,
            type: cb.dataset.type
        });
    });
    return selected;
}

async function bulkDelete() {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) {
        bdpaDrive.showToast('No items selected', 'warning');
        return;
    }

    if (confirm(`Are you sure you want to delete ${selectedItems.length} selected items?`)) {
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                bdpaDrive.showToast('Authentication required', 'error');
                return;
            }

            let deletedCount = 0;
            for (const item of selectedItems) {
                try {
                    const response = await fetch(`/api/v1/filesystem/${userData.username}/${item.id}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) deletedCount++;
                } catch (error) {
                    console.error(`Failed to delete ${item.id}:`, error);
                }
            }

            bdpaDrive.showToast(`Deleted ${deletedCount} of ${selectedItems.length} items`, deletedCount > 0 ? 'success' : 'warning');
            if (deletedCount > 0) {
                setTimeout(() => window.location.reload(), 1500);
            }
        } catch (error) {
            console.error('Bulk delete error:', error);
            bdpaDrive.showToast('Bulk delete failed', 'error');
        }

        const modal = bootstrap.Modal.getInstance(document.getElementById('bulkActionsModal'));
        modal.hide();
    }
}

async function bulkChangeOwner() {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) {
        bdpaDrive.showToast('No items selected', 'warning');
        return;
    }

    const newOwner = prompt(`Enter new owner for ${selectedItems.length} selected items:`);
    if (!newOwner || !newOwner.trim()) {
        return;
    }

    try {
        const userResponse = await fetch('/api/user/me');
        const userData = await userResponse.json();
        
        if (!userData.username) {
            bdpaDrive.showToast('Authentication required', 'error');
            return;
        }

        let updatedCount = 0;
        for (const item of selectedItems) {
            try {
                const response = await fetch(`/api/v1/filesystem/${userData.username}/${item.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ owner: newOwner.trim() })
                });
                if (response.ok) updatedCount++;
            } catch (error) {
                console.error(`Failed to update owner for ${item.id}:`, error);
            }
        }

        bdpaDrive.showToast(`Updated owner for ${updatedCount} of ${selectedItems.length} items`, updatedCount > 0 ? 'success' : 'warning');
        if (updatedCount > 0) {
            setTimeout(() => window.location.reload(), 1500);
        }
    } catch (error) {
        console.error('Bulk change owner error:', error);
        bdpaDrive.showToast('Bulk change owner failed', 'error');
    }

    const modal = bootstrap.Modal.getInstance(document.getElementById('bulkActionsModal'));
    modal.hide();
}

async function bulkAddTags() {
    const selectedItems = getSelectedItems().filter(item => item.type === 'file');
    if (selectedItems.length === 0) {
        bdpaDrive.showToast('No files selected', 'warning');
        return;
    }

    const tagsInput = prompt(`Enter tags to add to ${selectedItems.length} selected files (comma-separated):`);
    if (!tagsInput || !tagsInput.trim()) {
        return;
    }

    const tags = bdpaDrive.parseTags(tagsInput);
    if (tags === null) return; // Validation failed

    try {
        const userResponse = await fetch('/api/user/me');
        const userData = await userResponse.json();
        
        if (!userData.username) {
            bdpaDrive.showToast('Authentication required', 'error');
            return;
        }

        let updatedCount = 0;
        for (const item of selectedItems) {
            try {
                // Get current file to merge tags
                const getResponse = await fetch(`/api/v1/filesystem/${userData.username}/${item.id}`);
                if (getResponse.ok) {
                    const fileData = await getResponse.json();
                    const currentTags = fileData.tags || [];
                    const mergedTags = [...new Set([...currentTags, ...tags])].slice(0, 5); // Dedupe and limit to 5

                    const putResponse = await fetch(`/api/v1/filesystem/${userData.username}/${item.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ tags: mergedTags })
                    });
                    if (putResponse.ok) updatedCount++;
                }
            } catch (error) {
                console.error(`Failed to add tags to ${item.id}:`, error);
            }
        }

        bdpaDrive.showToast(`Added tags to ${updatedCount} of ${selectedItems.length} files`, updatedCount > 0 ? 'success' : 'warning');
        if (updatedCount > 0) {
            setTimeout(() => window.location.reload(), 1500);
        }
    } catch (error) {
        console.error('Bulk add tags error:', error);
        bdpaDrive.showToast('Bulk add tags failed', 'error');
    }

    const modal = bootstrap.Modal.getInstance(document.getElementById('bulkActionsModal'));
    modal.hide();
}

// Initialize BDPADrive when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    bdpaDrive = new BDPADrive();
    
    // Load storage information for dashboard
    if (document.getElementById('storageUsed')) {
        bdpaDrive.updateStorageDisplay();
    }
    
    // Setup delete confirmation validation
    const deleteConfirmInput = document.getElementById('deleteConfirmation');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    
    if (deleteConfirmInput && confirmDeleteBtn) {
        deleteConfirmInput.addEventListener('input', (e) => {
            confirmDeleteBtn.disabled = e.target.value.trim() !== 'DELETE';
        });
    }
    
    // Load storage info when delete modal is shown
    const deleteModal = document.getElementById('deleteAccountModal');
    if (deleteModal) {
        deleteModal.addEventListener('show.bs.modal', () => {
            bdpaDrive.updateStorageDisplay();
        });
    }
});

// Account Management Functions

function updateProfile() {
    if (bdpaDrive) {
        bdpaDrive.updateProfile();
    }
}

function changePassword() {
    if (bdpaDrive) {
        bdpaDrive.changePassword();
    }
}

function deleteAccount() {
    if (bdpaDrive) {
        bdpaDrive.deleteAccount();
    }
}
