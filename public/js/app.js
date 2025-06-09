// BDPADrive Frontend JavaScript

class BDPADrive {
    constructor() {
        this.currentUser = null;
        this.files = [];
        this.folders = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadUserData();
        this.initializeSearch();
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

        if (!email || !password) {
            this.showToast('Please fill in all fields', 'warning');
            return;
        }

        try {
            // Use legacy auth for now to get user data, then use v1 API
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Sign in successful!', 'success');
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/dashboard';
                }, 1000);
            } else {
                this.showToast(data.error || 'Sign in failed', 'error');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            this.showToast('Sign in failed. Please try again.', 'error');
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
        
        // Show description field for documents
        const descriptionField = document.getElementById('descriptionField');
        if (descriptionField) {
            descriptionField.style.display = type === 'document' ? 'block' : 'none';
        }

        // Update form labels
        const itemName = document.getElementById('itemName');
        if (itemName) {
            itemName.placeholder = type === 'document' ? 'Enter document name...' : 'Enter folder name...';
        }

        // Hide the type selection cards
        document.querySelectorAll('.create-option').forEach(card => {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
        });
    }

    resetCreateForm() {
        document.getElementById('createForm').style.display = 'none';
        document.getElementById('createBtn').style.display = 'none';
        document.getElementById('newItemForm')?.reset();
        
        // Show the type selection cards
        document.querySelectorAll('.create-option').forEach(card => {
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
        });
    }

    async createItem() {
        const type = document.getElementById('itemType').value;
        const name = document.getElementById('itemName').value.trim();
        const description = document.getElementById('itemDescription')?.value.trim() || '';

        if (!name) {
            this.showToast('Name is required', 'warning');
            return;
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
                mimeType: type === 'document' ? 'text/plain' : undefined
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
                const newItem = await response.json();
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createModal'));
                modal.hide();
                
                this.showToast(`${type === 'document' ? 'Document' : 'Folder'} created successfully!`, 'success');
                
                // Refresh the page to show the new item
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
    }

    toggleViewMode(viewMode) {
        const gridView = document.getElementById('gridViewContainer');
        const listView = document.getElementById('listViewContainer');

        if (viewMode === 'gridView') {
            gridView.style.display = 'block';
            listView.style.display = 'none';
        } else {
            gridView.style.display = 'none';
            listView.style.display = 'block';
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
                    case 'date':
                        return new Date(parseInt(b.dataset.date)) - new Date(parseInt(a.dataset.date));
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
                           (filterType === 'document' && itemType === 'document') ||
                           (filterType === 'folder' && itemType === 'folder');
                
                item.style.display = show ? '' : 'none';
            });
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '1055';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toastId = 'toast-' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header">
                    <i class="bi bi-${this.getToastIcon(type)} text-${this.getToastColor(type)} me-2"></i>
                    <strong class="me-auto">BDPADrive</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
        
        toast.show();
        
        // Remove toast element after it's hidden
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    getToastIcon(type) {
        const icons = {
            success: 'check-circle-fill',
            error: 'exclamation-triangle-fill',
            warning: 'exclamation-triangle-fill',
            info: 'info-circle-fill'
        };
        return icons[type] || icons.info;
    }

    getToastColor(type) {
        const colors = {
            success: 'success',
            error: 'danger',
            warning: 'warning',
            info: 'primary'
        };
        return colors[type] || colors.info;
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

// Initialize BDPADrive when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    bdpaDrive = new BDPADrive();
});
