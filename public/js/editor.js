// BDPADrive Document Editor JavaScript

class DocumentEditor {
    constructor() {
        // Find the correct editor elements (markdown textareas)
        this.editor = document.getElementById('markdownEditor');
        this.editorSplit = document.getElementById('markdownEditorSplit');
        this.previewPanel = document.getElementById('markdownPreview');
        this.previewSplit = document.getElementById('markdownPreviewSplit');
        
        this.fileId = document.getElementById('fileId')?.value || null;
        this.isNewDocument = document.getElementById('isNewDocument')?.value === 'true';
        this.currentUser = document.getElementById('currentUser')?.value || null;
        this.fileOwner = document.getElementById('fileOwner')?.value || null;
        
        // State management
        this.autoSaveInterval = null;
        this.lockCheckInterval = null;
        this.lastSaveTime = null;
        this.hasUnsavedChanges = false;
        this.isLocked = false;
        this.lockOwner = null;
        
        // Live preview state
        this.livePreviewEnabled = true;
        this.previewUpdateTimeout = null;
        this.lastPreviewUpdate = 0;
        
        // Markdown configuration
        this.marked = null;
        this.initializeMarked();
        
        this.init();
    }

    init() {
        if (!this.editor) return;
        
        this.bindEvents();
        this.startAutoSave();
        this.startLockCheck();
        this.updateSaveStatus();
        
        // Load initial content and render preview
        this.renderPreview();
        
        // Focus on editor
        this.editor.focus();
        
        // Set cursor at end if new document
        if (this.isNewDocument) {
            this.moveCursorToEnd();
        }
        
        // Load file properties if editing existing file
        if (!this.isNewDocument && this.fileId) {
            this.loadFileProperties();
        }
    }

    initializeMarked() {
        // Configure marked for safe markdown rendering
        if (typeof marked !== 'undefined') {
            this.marked = marked;
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false, // We trust user input for their own files
                smartypants: true,
                highlight: function(code, lang) {
                    // Basic syntax highlighting could be added here
                    return code;
                }
            });
        }
    }

    bindEvents() {
        // Track changes for auto-save and live preview updates
        const updateHandler = (e) => {
            this.hasUnsavedChanges = true;
            this.updateSaveStatus('Unsaved changes...');
            
            // Trigger live preview update with debouncing
            if (this.livePreviewEnabled) {
                this.debouncedPreviewUpdate();
            }
        };

        // Real-time preview updates with input events
        this.editor.addEventListener('input', updateHandler);
        this.editor.addEventListener('paste', updateHandler);
        this.editor.addEventListener('keyup', updateHandler);
        
        // Split view editor with live preview
        if (this.editorSplit) {
            this.editorSplit.addEventListener('input', (e) => {
                this.hasUnsavedChanges = true;
                this.updateSaveStatus('Unsaved changes...');
                
                // Live preview update for split view
                if (this.livePreviewEnabled) {
                    this.debouncedPreviewUpdateSplit();
                }
                
                // Sync content between editors
                this.editor.value = this.editorSplit.value;
            });
            
            this.editorSplit.addEventListener('keyup', (e) => {
                if (this.livePreviewEnabled) {
                    this.debouncedPreviewUpdateSplit();
                }
            });
        }

        // Live preview toggle
        const livePreviewToggle = document.getElementById('livePreviewToggle');
        if (livePreviewToggle) {
            livePreviewToggle.addEventListener('change', (e) => {
                this.livePreviewEnabled = e.target.checked;
                if (this.livePreviewEnabled) {
                    this.renderPreview();
                    this.renderPreviewSplit();
                }
            });
        }

        // Handle title changes
        const titleInput = document.getElementById('documentTitle');
        if (titleInput) {
            titleInput.addEventListener('input', () => {
                this.hasUnsavedChanges = true;
                this.updateSaveStatus('Unsaved changes...');
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+S to save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveDocument();
            }
            
            // Ctrl+B for bold
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.insertMarkdownSyntax('**', '**', 'bold text');
            }
            
            // Ctrl+I for italic
            if (e.ctrlKey && e.key === 'i') {
                e.preventDefault();
                this.insertMarkdownSyntax('*', '*', 'italic text');
            }
            
            // Ctrl+K for link
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.insertMarkdownSyntax('[', '](url)', 'link text');
            }
        });

        // Tab synchronization
        const editorTabLinks = document.querySelectorAll('#editorTabs .nav-link');
        editorTabLinks.forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                if (e.target.id === 'split-tab' && this.editorSplit) {
                    // Sync content when switching to split view
                    this.editorSplit.value = this.editor.value;
                    this.renderPreviewSplit();
                }
            });
        });

        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }

    // Markdown-specific methods
    insertMarkdownSyntax(before, after, placeholder) {
        const activeEditor = document.activeElement === this.editorSplit ? this.editorSplit : this.editor;
        const start = activeEditor.selectionStart;
        const end = activeEditor.selectionEnd;
        const selectedText = activeEditor.value.substring(start, end);
        const replacement = selectedText || placeholder;
        const newText = before + replacement + after;
        
        activeEditor.setRangeText(newText, start, end, 'select');
        
        // Trigger change events
        this.hasUnsavedChanges = true;
        this.updateSaveStatus('Unsaved changes...');
        this.renderPreview();
        
        // Focus back on editor
        activeEditor.focus();
    }

    renderPreview() {
        if (!this.previewPanel || !this.marked) return;
        
        try {
            const markdown = this.editor.value;
            const html = this.marked.parse(markdown || '# Start typing your markdown here...\n\nYour preview will appear as you type.');
            this.previewPanel.innerHTML = html;
            this.showPreviewUpdateIndicator();
        } catch (error) {
            console.error('Markdown parsing error:', error);
            this.previewPanel.innerHTML = '<p class="text-danger">Error rendering markdown preview</p>';
        }
    }

    renderPreviewSplit() {
        if (!this.previewSplit || !this.marked) return;
        
        try {
            const markdown = this.editorSplit.value;
            const html = this.marked.parse(markdown || '# Start typing your markdown here...\n\nYour preview will appear as you type.');
            this.previewSplit.innerHTML = html;
            this.showPreviewUpdateIndicator();
        } catch (error) {
            console.error('Markdown parsing error:', error);
            this.previewSplit.innerHTML = '<p class="text-danger">Error rendering markdown preview</p>';
        }
    }

    // Debounced preview updates for live preview functionality
    debouncedPreviewUpdate() {
        clearTimeout(this.previewUpdateTimeout);
        this.previewUpdateTimeout = setTimeout(() => {
            this.renderPreview();
            this.lastPreviewUpdate = Date.now();
        }, 150); // 150ms debounce for smooth typing experience
    }

    debouncedPreviewUpdateSplit() {
        clearTimeout(this.previewUpdateTimeout);
        this.previewUpdateTimeout = setTimeout(() => {
            this.renderPreviewSplit();
            this.lastPreviewUpdate = Date.now();
        }, 150); // 150ms debounce for smooth typing experience
    }

    showPreviewUpdateIndicator() {
        const indicator = document.getElementById('previewUpdateIndicator');
        if (indicator) {
            indicator.classList.remove('d-none');
            setTimeout(() => {
                indicator.classList.add('d-none');
            }, 1000);
        }
    }

    async saveDocument() {
        // Check file lock before saving
        if (this.isLocked && this.lockOwner !== this.currentUser) {
            this.showToast(`File is locked by ${this.lockOwner}. Cannot save changes.`, 'warning');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn.innerHTML;
        
        try {
            saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
            saveBtn.disabled = true;
            
            const title = document.getElementById('documentTitle').value.trim() || 'Untitled Document';
            const content = this.editor.value; // Use markdown content, not HTML
            
            // Validate content size (10KiB limit)
            const contentSize = new Blob([content]).size;
            if (contentSize > 10240) {
                throw new Error('Content exceeds 10KiB limit');
            }
            
            // Get current user info
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                throw new Error('User not authenticated');
            }

            let response;
            
            if (this.isNewDocument) {
                // Create new document using v1 API
                response = await fetch(`/api/v1/filesystem/${userData.username}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: title.endsWith('.md') ? title : title + '.md',
                        content: content,
                        isDirectory: false,
                        mimeType: 'text/markdown',
                        tags: this.getCurrentTags()
                    })
                });
                
                if (response.ok) {
                    const newFile = await response.json();
                    this.fileId = newFile.node.name;
                    this.isNewDocument = false;
                    
                    // Update URL without page reload
                    window.history.replaceState(null, null, `/editor/${this.fileId}`);
                    
                    // Acquire lock on new file
                    await this.acquireLock();
                }
            } else {
                // Update existing document using v1 API
                response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: title.endsWith('.md') ? title : title + '.md',
                        content: content,
                        mimeType: 'text/markdown',
                        tags: this.getCurrentTags()
                    })
                });
            }
            
            if (response.ok) {
                const file = await response.json();
                this.hasUnsavedChanges = false;
                this.lastSaveTime = new Date();
                this.updateSaveStatus(`Saved at ${this.lastSaveTime.toLocaleTimeString()}`);
                this.showToast('Document saved successfully!', 'success');
                
                // Update page title
                const finalTitle = title.endsWith('.md') ? title : title + '.md';
                document.title = `${finalTitle} - BDPADrive Editor`;
                
                // Update file ID if name changed
                if (file.node && file.node.name) {
                    this.fileId = file.node.name;
                }
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to save document', 'error');
            }
        } catch (error) {
            console.error('Save error:', error);
            this.showToast(error.message || 'Failed to save document', 'error');
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    startAutoSave() {
        // Auto-save every 30 seconds if there are changes
        this.autoSaveInterval = setInterval(() => {
            if (this.hasUnsavedChanges && !this.isLocked) {
                this.showAutoSaveIndicator();
                this.saveDocument().then(() => {
                    this.hideAutoSaveIndicator();
                });
            }
        }, 30000);
    }

    startLockCheck() {
        // Check file lock status every 10 seconds
        if (!this.isNewDocument && this.fileId) {
            this.lockCheckInterval = setInterval(() => {
                this.checkLockStatus();
            }, 10000);
            
            // Initial lock check and acquisition
            this.acquireLock();
        }
    }

    async acquireLock() {
        if (this.isNewDocument) return;
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) return;
            
            const response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}/lock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'acquire'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.isLocked = true;
                this.lockOwner = this.currentUser;
                this.updateLockStatus('You have editing access');
            } else {
                const error = await response.json();
                if (error.lockOwner) {
                    this.isLocked = true;
                    this.lockOwner = error.lockOwner;
                    this.updateLockStatus(`File locked by ${error.lockOwner}`);
                    this.disableEditing();
                    this.showLockConflictDialog(error.lockOwner);
                }
            }
        } catch (error) {
            console.error('Lock acquisition error:', error);
        }
    }

    async releaseLock() {
        if (this.isNewDocument || !this.isLocked) return;
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) return;
            
            await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}/lock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'release'
                })
            });
            
            this.isLocked = false;
            this.lockOwner = null;
            this.updateLockStatus('');
        } catch (error) {
            console.error('Lock release error:', error);
        }
    }

    async checkLockStatus() {
        if (this.isNewDocument) return;
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) return;
            
            const response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}/lock`);
            
            if (response.ok) {
                const result = await response.json();
                if (result.locked && result.lockOwner !== this.currentUser) {
                    this.isLocked = true;
                    this.lockOwner = result.lockOwner;
                    this.updateLockStatus(`File locked by ${result.lockOwner}`);
                    this.disableEditing();
                } else if (!result.locked && this.isLocked) {
                    // Lock was released, try to acquire it
                    this.acquireLock();
                }
            }
        } catch (error) {
            console.error('Lock check error:', error);
        }
    }

    disableEditing() {
        this.editor.readOnly = true;
        if (this.editorSplit) {
            this.editorSplit.readOnly = true;
        }
        
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
        }
        
        const titleInput = document.getElementById('documentTitle');
        if (titleInput) {
            titleInput.readOnly = true;
        }
    }

    updateLockStatus(message) {
        const lockStatus = document.getElementById('lockStatus');
        if (lockStatus) {
            lockStatus.textContent = message;
            lockStatus.className = message.includes('locked by') ? 'text-warning small' : 'text-success small';
        }
        
        const lockIndicator = document.getElementById('lockIndicator');
        const lockMessage = document.getElementById('lockMessage');
        if (lockIndicator && lockMessage) {
            if (message.includes('locked by')) {
                lockMessage.textContent = message;
                lockIndicator.style.display = 'block';
            } else {
                lockIndicator.style.display = 'none';
            }
        }
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        if (this.lockCheckInterval) {
            clearInterval(this.lockCheckInterval);
        }
    }

    getCurrentTags() {
        const tagsInput = document.getElementById('propFileTags');
        if (!tagsInput) return [];
        
        const tagsText = tagsInput.value.trim();
        if (!tagsText) return [];
        
        return tagsText.split(',')
            .map(tag => tag.trim().replace(/[^a-zA-Z0-9]/g, ''))
            .filter(tag => tag.length > 0)
            .slice(0, 5); // Max 5 tags
    }

    async loadFileProperties() {
        if (this.isNewDocument) return;
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) return;
            
            const response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}`);
            if (response.ok) {
                const data = await response.json();
                const file = data.node;
                
                // Populate property fields
                const propFileName = document.getElementById('propFileName');
                const propFileOwner = document.getElementById('propFileOwner');
                const propFileSize = document.getElementById('propFileSize');
                const propFileCreated = document.getElementById('propFileCreated');
                const propFileModified = document.getElementById('propFileModified');
                const propFileTags = document.getElementById('propFileTags');
                
                if (propFileName) propFileName.value = file.name || '';
                if (propFileOwner) propFileOwner.value = file.owner || '';
                if (propFileSize) propFileSize.value = `${Math.round((file.size || 0) / 1024)} KB (${file.size || 0} bytes)`;
                if (propFileCreated) propFileCreated.value = new Date(file.createdAt).toLocaleString();
                if (propFileModified) propFileModified.value = new Date(file.lastModified).toLocaleString();
                if (propFileTags) propFileTags.value = (file.tags || []).join(', ');
            }
        } catch (error) {
            console.error('Error loading file properties:', error);
        }
    }

    async deleteDocument() {
        if (this.isNewDocument) {
            this.goBack();
            return;
        }
        
        // Check ownership
        if (this.fileOwner && this.fileOwner !== this.currentUser) {
            this.showToast('You can only delete files you own', 'error');
            return;
        }
        
        if (confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            try {
                const userResponse = await fetch('/api/user/me');
                const userData = await userResponse.json();
                
                if (!userData.username) {
                    throw new Error('User not authenticated');
                }
                
                const response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    this.showToast('Document deleted successfully!', 'success');
                    setTimeout(() => {
                        this.goBack();
                    }, 1000);
                } else {
                    const error = await response.json();
                    this.showToast(error.error || 'Failed to delete document', 'error');
                }
            } catch (error) {
                console.error('Delete error:', error);
                this.showToast('Failed to delete document', 'error');
            }
        }
    }

    async renameDocument() {
        const newName = prompt('Enter new document name:', this.fileId || 'document.md');
        if (!newName || newName === this.fileId) return;
        
        // Check ownership
        if (this.fileOwner && this.fileOwner !== this.currentUser) {
            this.showToast('You can only rename files you own', 'error');
            return;
        }
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                throw new Error('User not authenticated');
            }
            
            const response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    newPath: newName.endsWith('.md') ? newName : newName + '.md'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.fileId = result.node.name;
                document.getElementById('documentTitle').value = result.node.name;
                document.title = `${result.node.name} - BDPADrive Editor`;
                this.showToast('Document renamed successfully!', 'success');
                
                // Update URL
                window.history.replaceState(null, null, `/editor/${this.fileId}`);
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to rename document', 'error');
            }
        } catch (error) {
            console.error('Rename error:', error);
            this.showToast('Failed to rename document', 'error');
        }
    }

    async saveFileProperties() {
        if (this.isNewDocument) {
            this.showToast('Cannot modify properties of unsaved document', 'warning');
            return;
        }
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) {
                throw new Error('User not authenticated');
            }
            
            // Get updated values from the form
            const propFileName = document.getElementById('propFileName');
            const propFileTags = document.getElementById('propFileTags');
            
            const updates = {};
            
            // Check if name changed
            if (propFileName && propFileName.value.trim() !== this.fileId) {
                updates.name = propFileName.value.trim();
            }
            
            // Update tags
            if (propFileTags) {
                const tagsText = propFileTags.value.trim();
                if (tagsText) {
                    const tags = tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                    if (tags.length > 5) {
                        throw new Error('Maximum 5 tags allowed');
                    }
                    // Validate alphanumeric tags
                    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
                    for (const tag of tags) {
                        if (!alphanumericRegex.test(tag)) {
                            throw new Error(`Tag "${tag}" must be alphanumeric only`);
                        }
                    }
                    updates.tags = tags;
                } else {
                    updates.tags = [];
                }
            }
            
            if (Object.keys(updates).length === 0) {
                this.showToast('No changes to save', 'info');
                return;
            }
            
            const response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // If name changed, update our internal state and URL
                if (updates.name) {
                    const oldFileId = this.fileId;
                    this.fileId = updates.name;
                    document.getElementById('documentTitle').value = this.fileId;
                    document.title = `${this.fileId} - BDPADrive Editor`;
                    window.history.replaceState(null, null, `/editor/${this.fileId}`);
                    
                    // Update lock key if we have a lock
                    if (this.isLocked && this.lockOwner === this.currentUser) {
                        // The server should have migrated the lock automatically
                        // We just need to update our internal state
                    }
                }
                
                this.showToast('File properties updated successfully!', 'success');
                
                // Close the modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('filePropertiesModal'));
                if (modal) {
                    modal.hide();
                }
                
                // Reload properties to show updated values
                setTimeout(() => {
                    this.loadFileProperties();
                }, 500);
                
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update properties');
            }
            
        } catch (error) {
            console.error('Error saving file properties:', error);
            this.showToast(error.message || 'Failed to save properties', 'error');
        }
    }

    showLockConflictDialog(lockOwner) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title">
                            <i class="bi bi-exclamation-triangle me-2"></i>File Locked
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>This file is currently being edited by <strong>${lockOwner}</strong>.</p>
                        <p>You have the following options:</p>
                        <ul>
                            <li><strong>Wait:</strong> Check again in a few minutes when they're done</li>
                            <li><strong>Read-only:</strong> View the file but cannot make changes</li>
                            <li><strong>Force unlock:</strong> Take control (use with caution)</li>
                        </ul>
                        <div class="alert alert-info">
                            <i class="bi bi-info-circle me-2"></i>
                            Locks automatically expire after 10 minutes of inactivity.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-eye me-2"></i>View Read-Only
                        </button>
                        <button type="button" class="btn btn-primary" onclick="documentEditor.retryLock()">
                            <i class="bi bi-arrow-clockwise me-2"></i>Check Again
                        </button>
                        <button type="button" class="btn btn-warning" onclick="documentEditor.forceUnlock()">
                            <i class="bi bi-unlock me-2"></i>Force Unlock
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
        
        // Clean up modal when hidden
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    async retryLock() {
        // Close any open modals
        const modals = document.querySelectorAll('.modal.show');
        modals.forEach(modal => {
            const bootstrapModal = bootstrap.Modal.getInstance(modal);
            if (bootstrapModal) bootstrapModal.hide();
        });
        
        // Try to acquire lock again
        await this.acquireLock();
    }

    async forceUnlock() {
        if (!confirm('Are you sure you want to force unlock this file? This may cause conflicts if the other user is still editing.')) {
            return;
        }
        
        try {
            const userResponse = await fetch('/api/user/me');
            const userData = await userResponse.json();
            
            if (!userData.username) return;
            
            // Force release the lock first
            await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}/lock`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'force-release'
                })
            });
            
            // Close any open modals
            const modals = document.querySelectorAll('.modal.show');
            modals.forEach(modal => {
                const bootstrapModal = bootstrap.Modal.getInstance(modal);
                if (bootstrapModal) bootstrapModal.hide();
            });
            
            // Try to acquire lock
            setTimeout(() => this.acquireLock(), 500);
            
        } catch (error) {
            console.error('Force unlock error:', error);
            this.showToast('Failed to force unlock file', 'error');
        }
    }

    // ...existing code...
}

// Global functions for onclick handlers
let documentEditor;

function goBack() {
    documentEditor.goBack();
}

function saveDocument() {
    documentEditor.saveDocument();
}

function shareDocument() {
    documentEditor.shareDocument();
}

function exportDocument(format) {
    documentEditor.exportDocument(format);
}

function printDocument() {
    documentEditor.printDocument();
}

function deleteDocument() {
    documentEditor.deleteDocument();
}

function execCommand(command, value = null) {
    documentEditor.execCommand(command, value);
}

function changeFontSize() {
    documentEditor.changeFontSize();
}

function changeTextColor() {
    documentEditor.changeTextColor();
}

// Global functions for markdown toolbar
function insertMarkdown(before, after) {
    if (documentEditor) {
        documentEditor.insertMarkdownSyntax(before, after);
    }
}

function insertLink() {
    const url = prompt('Enter the URL:');
    const text = prompt('Enter the link text:') || 'Link';
    if (url) {
        insertMarkdown(`[${text}](${url})`, '');
    }
}

function insertImage() {
    const url = prompt('Enter the image URL:');
    const alt = prompt('Enter the alt text:') || 'Image';
    if (url) {
        insertMarkdown(`![${alt}](${url})`, '');
    }
}

function insertCodeBlock() {
    const language = prompt('Enter the language (optional):') || '';
    insertMarkdown(`\`\`\`${language}\n`, '\n\`\`\`');
}

function insertTable() {
    const rows = parseInt(prompt('Number of rows:')) || 3;
    const cols = parseInt(prompt('Number of columns:')) || 3;
    
    let table = '| ';
    for (let i = 0; i < cols; i++) {
        table += `Column ${i + 1} | `;
    }
    table += '\n| ';
    for (let i = 0; i < cols; i++) {
        table += '--- | ';
    }
    table += '\n';
    
    for (let r = 0; r < rows; r++) {
        table += '| ';
        for (let c = 0; c < cols; c++) {
            table += ' | ';
        }
        table += '\n';
    }
    
    insertMarkdown(table, '');
}

// Initialize editor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('editor')) {
        documentEditor = new DocumentEditor();
    }
});

// Cleanup before page unload
window.addEventListener('beforeunload', () => {
    if (documentEditor) {
        documentEditor.destroy();
    }
});

function saveFileProperties() {
    if (documentEditor) {
        documentEditor.saveFileProperties();
    }
}

function showFileProperties() {
    if (documentEditor) {
        documentEditor.loadFileProperties();
        const modal = new bootstrap.Modal(document.getElementById('filePropertiesModal'));
        modal.show();
    }
}
