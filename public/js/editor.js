// BDPADrive Document Editor JavaScript

class DocumentEditor {
    constructor() {
        this.editor = document.getElementById('editor');
        this.fileId = document.getElementById('fileId')?.value || null;
        this.isNewDocument = document.getElementById('isNewDocument')?.value === 'true';
        this.autoSaveInterval = null;
        this.lastSaveTime = null;
        this.hasUnsavedChanges = false;
        
        this.init();
    }

    init() {
        if (!this.editor) return;
        
        this.bindEvents();
        this.startAutoSave();
        this.updateSaveStatus();
        
        // Focus on editor
        this.editor.focus();
        
        // Set cursor at end if new document
        if (this.isNewDocument) {
            this.moveCursorToEnd();
        }
    }

    bindEvents() {
        // Track changes for auto-save
        this.editor.addEventListener('input', () => {
            this.hasUnsavedChanges = true;
            this.updateSaveStatus('Unsaved changes...');
        });

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
                this.execCommand('bold');
            }
            
            // Ctrl+I for italic
            if (e.ctrlKey && e.key === 'i') {
                e.preventDefault();
                this.execCommand('italic');
            }
            
            // Ctrl+U for underline
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                this.execCommand('underline');
            }
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

    execCommand(command, value = null) {
        this.editor.focus();
        document.execCommand(command, false, value);
        this.hasUnsavedChanges = true;
        this.updateSaveStatus('Unsaved changes...');
    }

    changeFontSize() {
        const fontSize = document.getElementById('fontSize').value;
        this.execCommand('fontSize', fontSize);
    }

    changeTextColor() {
        const color = document.getElementById('textColor').value;
        this.execCommand('foreColor', color);
    }

    async saveDocument() {
        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn.innerHTML;
        
        try {
            saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
            saveBtn.disabled = true;
            
            const title = document.getElementById('documentTitle').value.trim() || 'Untitled Document';
            const content = this.editor.innerHTML;
            
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
                        name: title,
                        content: content,
                        isDirectory: false,
                        mimeType: 'text/html'
                    })
                });
                
                if (response.ok) {
                    const newFile = await response.json();
                    this.fileId = newFile.name;
                    this.isNewDocument = false;
                    
                    // Update URL without page reload
                    window.history.replaceState(null, null, `/editor/${this.fileId}`);
                }
            } else {
                // Update existing document using v1 API
                response = await fetch(`/api/v1/filesystem/${userData.username}/${this.fileId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: title,
                        content: content,
                        mimeType: 'text/html'
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
                document.title = `${title} - BDPADrive Editor`;
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Failed to save document', 'error');
            }
        } catch (error) {
            console.error('Save error:', error);
            this.showToast('Failed to save document', 'error');
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    startAutoSave() {
        // Auto-save every 30 seconds if there are changes
        this.autoSaveInterval = setInterval(() => {
            if (this.hasUnsavedChanges) {
                this.showAutoSaveIndicator();
                this.saveDocument().then(() => {
                    this.hideAutoSaveIndicator();
                });
            }
        }, 30000);
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
    }

    showAutoSaveIndicator() {
        const indicator = document.getElementById('autoSaveIndicator');
        if (indicator) {
            indicator.style.display = 'block';
        }
    }

    hideAutoSaveIndicator() {
        const indicator = document.getElementById('autoSaveIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    updateSaveStatus(message) {
        const saveStatus = document.getElementById('saveStatus');
        if (saveStatus) {
            saveStatus.textContent = message || 'Not saved';
        }
    }

    moveCursorToEnd() {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(this.editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async shareDocument() {
        if (this.isNewDocument) {
            this.showToast('Please save the document first before sharing', 'warning');
            return;
        }
        
        const shareUrl = `${window.location.origin}/editor/${this.fileId}`;
        
        try {
            await navigator.clipboard.writeText(shareUrl);
            this.showToast('Document link copied to clipboard!', 'success');
        } catch (error) {
            this.showToast('Share functionality coming soon!', 'info');
        }
    }

    exportDocument(format) {
        const title = document.getElementById('documentTitle').value.trim() || 'document';
        const content = this.editor.textContent;
        
        let mimeType, fileName;
        
        switch (format) {
            case 'txt':
                mimeType = 'text/plain';
                fileName = `${title}.txt`;
                break;
            default:
                this.showToast('Export format not supported yet', 'warning');
                return;
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('Document exported successfully!', 'success');
    }

    printDocument() {
        window.print();
    }

    async deleteDocument() {
        if (this.isNewDocument) {
            this.goBack();
            return;
        }
        
        if (confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
            try {
                const response = await fetch(`/api/files/${this.fileId}`, {
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

    goBack() {
        if (this.hasUnsavedChanges) {
            if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
                window.location.href = '/files';
            }
        } else {
            window.location.href = '/files';
        }
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
                    <strong class="me-auto">BDPADrive Editor</strong>
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

    // Cleanup when leaving the page
    destroy() {
        this.stopAutoSave();
    }
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
