/**
 * BDPADrive Authentication System
 * Requirement 5 Implementation: Enhanced Auth View
 * 
 * Features:
 * - User registration with comprehensive validation
 * - API-based authentication with digest values
 * - Password strength indicators and validation
 * - CAPTCHA implementation
 * - Rate limiting (3 failed attempts = 1 hour lockout)
 * - Remember me functionality
 * - Username/email uniqueness validation
 */

class AuthManager {
    constructor() {
        this.authStatus = {
            remainingAttempts: 3,
            requiresCaptcha: false,
            lockedOut: false
        };
        this.captchaCache = new Map();
        this.validationTimers = new Map();
        
        this.initializeEventListeners();
        this.loadAuthStatus();
        this.generateCaptchas();
    }
    
    /**
     * Initialize all event listeners for auth forms
     */
    initializeEventListeners() {
        // Form submissions
        const signinForm = document.getElementById('signinForm');
        const signupForm = document.getElementById('signupForm');
        
        if (signinForm) {
            signinForm.addEventListener('submit', (e) => this.handleSignin(e));
        }
        
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }
        
        // Password visibility toggles
        this.setupPasswordToggle('signinPassword', 'toggleSigninPassword', 'signinPasswordIcon');
        this.setupPasswordToggle('signupPassword', 'toggleSignupPassword', 'signupPasswordIcon');
        
        // Real-time validation
        this.setupRealTimeValidation();
        
        // Password strength checking
        const signupPassword = document.getElementById('signupPassword');
        if (signupPassword) {
            signupPassword.addEventListener('input', () => this.checkPasswordStrength());
        }
        
        // Confirm password matching
        const confirmPassword = document.getElementById('signupConfirmPassword');
        if (confirmPassword) {
            confirmPassword.addEventListener('input', () => this.checkPasswordMatch());
        }
    }
    
    /**
     * Setup password visibility toggle
     */
    setupPasswordToggle(passwordId, toggleId, iconId) {
        const passwordField = document.getElementById(passwordId);
        const toggleButton = document.getElementById(toggleId);
        const icon = document.getElementById(iconId);
        
        if (passwordField && toggleButton && icon) {
            toggleButton.addEventListener('click', () => {
                const isPassword = passwordField.type === 'password';
                passwordField.type = isPassword ? 'text' : 'password';
                icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
            });
        }
    }
    
    /**
     * Setup real-time validation for form fields
     */
    setupRealTimeValidation() {
        // Username validation
        const usernameField = document.getElementById('signupUsername');
        if (usernameField) {
            usernameField.addEventListener('input', () => {
                this.debounceValidation('username', () => this.validateUsername());
            });
        }
        
        // Email validation
        const emailFields = ['signinEmail', 'signupEmail'];
        emailFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => {
                    this.debounceValidation('email', () => this.validateEmail(fieldId));
                });
                field.addEventListener('blur', () => {
                    if (fieldId === 'signupEmail') {
                        this.checkEmailAvailability();
                    }
                });
            }
        });
        
        // Name validation
        const nameField = document.getElementById('signupName');
        if (nameField) {
            nameField.addEventListener('input', () => this.validateName());
        }
    }
    
    /**
     * Debounce validation calls
     */
    debounceValidation(key, callback, delay = 500) {
        if (this.validationTimers.has(key)) {
            clearTimeout(this.validationTimers.get(key));
        }
        
        const timer = setTimeout(callback, delay);
        this.validationTimers.set(key, timer);
    }
    
    /**
     * Load current authentication status from server
     */
    async loadAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            if (response.ok) {
                const status = await response.json();
                this.authStatus = {
                    remainingAttempts: status.remainingAttempts,
                    requiresCaptcha: status.requiresCaptcha,
                    lockedOut: status.lockedOut,
                    lockoutMinutes: status.lockoutMinutes
                };
                
                this.updateUI();
            }
        } catch (error) {
            console.error('Failed to load auth status:', error);
        }
    }
    
    /**
     * Generate CAPTCHA challenges for both forms
     */
    async generateCaptchas() {
        try {
            // Generate CAPTCHA for signin (if needed)
            if (this.authStatus.requiresCaptcha) {
                await this.generateCaptcha('signin');
                this.showCaptcha('signin');
            }
            
            // Always generate CAPTCHA for signup
            await this.generateCaptcha('signup');
        } catch (error) {
            console.error('Failed to generate CAPTCHA:', error);
        }
    }
    
    /**
     * Generate a single CAPTCHA challenge
     */
    async generateCaptcha(type = 'signin') {
        try {
            const response = await fetch('/api/auth/captcha');
            if (response.ok) {
                const data = await response.json();
                this.captchaCache.set(type, data.question);
                
                const questionElement = document.getElementById(
                    type === 'signin' ? 'captchaQuestion' : 'signupCaptchaQuestion'
                );
                if (questionElement) {
                    questionElement.textContent = data.question;
                }
            }
        } catch (error) {
            console.error('Failed to generate CAPTCHA:', error);
        }
    }
    
    /**
     * Show CAPTCHA challenge
     */
    showCaptcha(type) {
        if (type === 'signin') {
            const captchaDiv = document.getElementById('captchaChallenge');
            if (captchaDiv) {
                captchaDiv.classList.remove('d-none');
            }
        }
        // Signup CAPTCHA is always visible
    }
    
    /**
     * Update UI based on authentication status
     */
    updateUI() {
        // Show rate limit warning if needed
        if (this.authStatus.lockedOut) {
            this.showRateLimitWarning(this.authStatus.lockoutMinutes);
            this.disableAuthForms();
        } else if (this.authStatus.remainingAttempts < 3) {
            this.showRateLimitWarning(null, this.authStatus.remainingAttempts);
        }
        
        // Show CAPTCHA if required
        if (this.authStatus.requiresCaptcha) {
            this.generateCaptcha('signin').then(() => this.showCaptcha('signin'));
        }
    }
    
    /**
     * Show rate limiting warning
     */
    showRateLimitWarning(lockoutMinutes = null, remainingAttempts = null) {
        const warningDiv = document.getElementById('rateLimitWarning');
        const messageSpan = document.getElementById('rateLimitMessage');
        
        if (warningDiv && messageSpan) {
            if (lockoutMinutes) {
                messageSpan.textContent = `Account temporarily locked. Try again in ${lockoutMinutes} minutes.`;
                warningDiv.classList.remove('d-none');
            } else if (remainingAttempts !== null) {
                messageSpan.textContent = `Warning: ${remainingAttempts} attempts remaining before account lockout.`;
                warningDiv.classList.remove('d-none');
            } else {
                warningDiv.classList.add('d-none');
            }
        }
    }
    
    /**
     * Disable authentication forms
     */
    disableAuthForms() {
        const submitButtons = ['signinSubmitBtn', 'signupSubmitBtn'];
        submitButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-lock me-2"></i>Temporarily Locked';
            }
        });
    }
    
    /**
     * Handle sign-in form submission
     */
    async handleSignin(event) {
        event.preventDefault();
        
        const email = document.getElementById('signinEmail').value.trim();
        const password = document.getElementById('signinPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        const captchaAnswer = document.getElementById('captchaAnswer')?.value;
        
        // Clear previous errors
        this.clearFieldErrors(['signinEmail', 'signinPassword']);
        
        if (!this.validateSigninForm(email, password)) {
            return;
        }
        
        const submitBtn = document.getElementById('signinSubmitBtn');
        const originalText = submitBtn.innerHTML;
        
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Signing In...';
            
            const requestBody = { email, password, rememberMe };
            
            // Include CAPTCHA if required
            if (this.authStatus.requiresCaptcha && captchaAnswer) {
                requestBody.captchaAnswer = captchaAnswer;
            }
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast('Sign in successful!', 'success');
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/dashboard';
                }, 1000);
            } else {
                this.handleAuthError(data, 'signin');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            this.showToast('Sign in failed. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
    
    /**
     * Handle sign-up form submission
     */
    async handleSignup(event) {
        event.preventDefault();
        
        const name = document.getElementById('signupName').value.trim();
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;
        const captchaAnswer = document.getElementById('signupCaptchaAnswer').value;
        
        // Clear previous errors
        this.clearFieldErrors(['signupName', 'signupUsername', 'signupEmail', 'signupPassword', 'signupConfirmPassword']);
        
        if (!this.validateSignupForm(name, username, email, password, confirmPassword, agreeTerms, captchaAnswer)) {
            return;
        }
        
        const submitBtn = document.getElementById('signupSubmitBtn');
        const originalText = submitBtn.innerHTML;
        
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Creating Account...';
            
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    username,
                    email,
                    password,
                    captchaAnswer
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast('Account created successfully!', 'success');
                setTimeout(() => {
                    window.location.href = data.redirectUrl || '/dashboard';
                }, 1000);
            } else {
                this.handleAuthError(data, 'signup');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('Registration failed. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
    
    /**
     * Handle authentication errors
     */
    async handleAuthError(data, formType) {
        if (data.requiresCaptcha || data.lockedOut) {
            await this.loadAuthStatus();
            this.updateUI();
        }
        
        if (data.lockedOut) {
            this.showToast(`Account locked for ${data.lockoutMinutes} minutes.`, 'error');
        } else {
            this.showToast(data.error || 'Authentication failed', 'error');
        }
        
        // Regenerate CAPTCHA after failed attempt
        if (formType === 'signin' && this.authStatus.requiresCaptcha) {
            await this.generateCaptcha('signin');
        } else if (formType === 'signup') {
            await this.generateCaptcha('signup');
        }
    }
    
    /**
     * Validate sign-in form
     */
    validateSigninForm(email, password) {
        let isValid = true;
        
        if (!email) {
            this.setFieldError('signinEmail', 'Email is required');
            isValid = false;
        } else if (!this.isValidEmail(email)) {
            this.setFieldError('signinEmail', 'Please enter a valid email address');
            isValid = false;
        }
        
        if (!password) {
            this.setFieldError('signinPassword', 'Password is required');
            isValid = false;
        }
        
        return isValid;
    }
    
    /**
     * Validate sign-up form
     */
    validateSignupForm(name, username, email, password, confirmPassword, agreeTerms, captchaAnswer) {
        let isValid = true;
        
        // Name validation
        if (!name || name.length < 2) {
            this.setFieldError('signupName', 'Name must be at least 2 characters');
            isValid = false;
        } else if (name.length > 50) {
            this.setFieldError('signupName', 'Name must be less than 50 characters');
            isValid = false;
        }
        
        // Username validation
        if (!username) {
            this.setFieldError('signupUsername', 'Username is required');
            isValid = false;
        } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            this.setFieldError('signupUsername', 'Username must be 3-20 characters with letters, numbers, and underscores only');
            isValid = false;
        }
        
        // Email validation
        if (!email) {
            this.setFieldError('signupEmail', 'Email is required');
            isValid = false;
        } else if (!this.isValidEmail(email)) {
            this.setFieldError('signupEmail', 'Please enter a valid email address');
            isValid = false;
        }
        
        // Password validation
        const passwordValidation = this.validatePassword(password);
        if (!passwordValidation.isValid) {
            this.setFieldError('signupPassword', passwordValidation.error);
            isValid = false;
        }
        
        // Confirm password validation
        if (password !== confirmPassword) {
            this.setFieldError('signupConfirmPassword', 'Passwords do not match');
            isValid = false;
        }
        
        // Terms agreement
        if (!agreeTerms) {
            this.showToast('You must agree to the Terms of Service and Privacy Policy', 'warning');
            isValid = false;
        }
        
        // CAPTCHA validation
        if (!captchaAnswer) {
            this.showToast('Please complete the security check', 'warning');
            isValid = false;
        }
        
        return isValid;
    }
    
    /**
     * Validate individual form fields
     */
    validateName() {
        const nameField = document.getElementById('signupName');
        const name = nameField.value.trim();
        
        if (name.length === 0) {
            this.clearFieldError('signupName');
            return true;
        }
        
        if (name.length < 2) {
            this.setFieldError('signupName', 'Name must be at least 2 characters');
            return false;
        } else if (name.length > 50) {
            this.setFieldError('signupName', 'Name must be less than 50 characters');
            return false;
        } else {
            this.clearFieldError('signupName');
            return true;
        }
    }
    
    async validateUsername() {
        const usernameField = document.getElementById('signupUsername');
        const username = usernameField.value.trim();
        
        if (username.length === 0) {
            this.clearFieldError('signupUsername');
            return true;
        }
        
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            this.setFieldError('signupUsername', 'Username must be 3-20 characters with letters, numbers, and underscores only');
            return false;
        }
        
        // Check availability
        try {
            const response = await fetch('/api/auth/check-availability', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (!data.usernameAvailable) {
                    this.setFieldError('signupUsername', 'Username is already taken');
                    return false;
                } else {
                    this.clearFieldError('signupUsername');
                    return true;
                }
            }
        } catch (error) {
            console.error('Username validation error:', error);
        }
        
        this.clearFieldError('signupUsername');
        return true;
    }
    
    validateEmail(fieldId) {
        const emailField = document.getElementById(fieldId);
        const email = emailField.value.trim();
        
        if (email.length === 0) {
            this.clearFieldError(fieldId);
            return true;
        }
        
        if (!this.isValidEmail(email)) {
            this.setFieldError(fieldId, 'Please enter a valid email address');
            return false;
        } else {
            this.clearFieldError(fieldId);
            return true;
        }
    }
    
    async checkEmailAvailability() {
        const emailField = document.getElementById('signupEmail');
        const email = emailField.value.trim();
        
        if (!email || !this.isValidEmail(email)) {
            return;
        }
        
        try {
            const response = await fetch('/api/auth/check-availability', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (!data.emailAvailable) {
                    this.setFieldError('signupEmail', 'Email is already registered');
                    return false;
                } else {
                    this.clearFieldError('signupEmail');
                    return true;
                }
            }
        } catch (error) {
            console.error('Email validation error:', error);
        }
        
        return true;
    }
    
    /**
     * Check password strength and update UI
     */
    checkPasswordStrength() {
        const passwordField = document.getElementById('signupPassword');
        const password = passwordField.value;
        
        const requirements = {
            length: password.length >= 8,
            upper: /[A-Z]/.test(password),
            lower: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        
        // Update requirement indicators
        Object.keys(requirements).forEach(req => {
            const element = document.getElementById(`req-${req}`);
            if (element) {
                const icon = element.querySelector('i');
                if (requirements[req]) {
                    icon.className = 'bi bi-check-circle text-success';
                } else {
                    icon.className = 'bi bi-x-circle text-danger';
                }
            }
        });
        
        // Calculate strength
        const metRequirements = Object.values(requirements).filter(Boolean).length;
        let strength = 0;
        let strengthText = '';
        let strengthClass = '';
        
        if (password.length === 0) {
            strengthText = 'Enter password to see strength';
            strengthClass = '';
        } else if (metRequirements < 3) {
            strength = 25;
            strengthText = 'Weak';
            strengthClass = 'bg-danger';
        } else if (metRequirements < 4) {
            strength = 50;
            strengthText = 'Fair';
            strengthClass = 'bg-warning';
        } else if (metRequirements < 5) {
            strength = 75;
            strengthText = 'Good';
            strengthClass = 'bg-info';
        } else {
            strength = 100;
            strengthText = 'Strong';
            strengthClass = 'bg-success';
        }
        
        // Update progress bar
        const progressBar = document.getElementById('passwordStrengthBar');
        const strengthTextElement = document.getElementById('passwordStrengthText');
        
        if (progressBar) {
            progressBar.style.width = `${strength}%`;
            progressBar.className = `progress-bar ${strengthClass}`;
        }
        
        if (strengthTextElement) {
            strengthTextElement.textContent = strengthText;
        }
    }
    
    /**
     * Check if passwords match
     */
    checkPasswordMatch() {
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        
        if (confirmPassword.length === 0) {
            this.clearFieldError('signupConfirmPassword');
            return;
        }
        
        if (password !== confirmPassword) {
            this.setFieldError('signupConfirmPassword', 'Passwords do not match');
        } else {
            this.clearFieldError('signupConfirmPassword');
        }
    }
    
    /**
     * Password validation with detailed feedback
     */
    validatePassword(password) {
        if (!password) {
            return { isValid: false, error: 'Password is required' };
        }
        
        if (password.length < 8) {
            return { isValid: false, error: 'Password must be at least 8 characters long' };
        }
        
        if (password.length > 128) {
            return { isValid: false, error: 'Password must be less than 128 characters long' };
        }
        
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        
        if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
            return { 
                isValid: false, 
                error: 'Password must contain uppercase, lowercase, number, and special character' 
            };
        }
        
        return { isValid: true };
    }
    
    /**
     * Utility functions
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    setFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const errorDiv = document.getElementById(`${fieldId}Error`);
        
        if (field) {
            field.classList.add('is-invalid');
        }
        
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }
    
    clearFieldError(fieldId) {
        const field = document.getElementById(fieldId);
        const errorDiv = document.getElementById(`${fieldId}Error`);
        
        if (field) {
            field.classList.remove('is-invalid');
        }
        
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    }
    
    clearFieldErrors(fieldIds) {
        fieldIds.forEach(id => this.clearFieldError(id));
    }
    
    showToast(message, type = 'info') {
        // Create toast element
        const toastContainer = document.querySelector('.toast-container') || this.createToastContainer();
        
        const toastId = `toast-${Date.now()}`;
        const iconClass = {
            success: 'bi-check-circle',
            error: 'bi-exclamation-triangle',
            warning: 'bi-exclamation-triangle',
            info: 'bi-info-circle'
        }[type] || 'bi-info-circle';
        
        const bgClass = {
            success: 'bg-success',
            error: 'bg-danger',
            warning: 'bg-warning',
            info: 'bg-info'
        }[type] || 'bg-info';
        
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi ${iconClass} me-2"></i>${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 5000
        });
        
        toast.show();
        
        // Clean up after toast is hidden
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }
    
    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
        return container;
    }
}

// Password Recovery Functions
async function submitForgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();
    const errorDiv = document.getElementById('forgotEmailError');
    const successDiv = document.getElementById('forgotSuccessMessage');
    const submitBtn = document.getElementById('forgotSubmitBtn');
    
    // Clear previous messages
    errorDiv.textContent = '';
    errorDiv.classList.add('d-none');
    successDiv.classList.add('d-none');
    
    if (!email) {
        errorDiv.textContent = 'Email address is required';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        errorDiv.textContent = 'Please enter a valid email address';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Sending...';
    
    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            successDiv.classList.remove('d-none');
            document.getElementById('forgotPasswordForm').reset();
        } else {
            errorDiv.textContent = data.error || 'Failed to send reset email';
            errorDiv.classList.remove('d-none');
        }
        
    } catch (error) {
        console.error('Forgot password error:', error);
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList.remove('d-none');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-envelope me-2"></i>Send Reset Link';
    }
}

async function submitPasswordReset() {
    const token = document.getElementById('resetToken').value;
    const password = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    const errorDiv = document.getElementById('resetPasswordError');
    
    // Clear previous errors
    errorDiv.classList.add('d-none');
    
    if (!password || !confirmPassword) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    if (password.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters long';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    // Validate password strength
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
        errorDiv.textContent = 'Password must contain uppercase, lowercase, number, and special character';
        errorDiv.classList.remove('d-none');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Close modal and show success
            const modal = bootstrap.Modal.getInstance(document.getElementById('passwordResetModal'));
            modal.hide();
            
            showToast('Password reset successful! You can now sign in with your new password.', 'success');
            
            // Switch to sign in tab
            setTimeout(() => {
                document.getElementById('signin-tab').click();
            }, 2000);
            
        } else {
            errorDiv.textContent = data.error || 'Failed to reset password';
            errorDiv.classList.remove('d-none');
        }
        
    } catch (error) {
        console.error('Password reset error:', error);
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList.remove('d-none');
    }
}

// Check for reset token in URL
function checkResetToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        // Verify token and show reset modal
        fetch(`/api/auth/reset-password/${token}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('resetToken').value = token;
                    document.getElementById('resetEmail').value = data.email;
                    
                    const modal = new bootstrap.Modal(document.getElementById('passwordResetModal'));
                    modal.show();
                } else {
                    showToast('Invalid or expired reset link', 'error');
                }
            })
            .catch(error => {
                console.error('Token verification error:', error);
                showToast('Error verifying reset link', 'error');
            });
    }
}

// Initialize authentication manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('signinForm') || document.getElementById('signupForm')) {
        window.authManager = new AuthManager();
    }
    
    // Setup forgot password form handler
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitForgotPassword();
        });
    }
    
    // Setup password reset modal handlers
    const resetPasswordToggle = document.getElementById('toggleResetPassword');
    if (resetPasswordToggle) {
        resetPasswordToggle.addEventListener('click', () => {
            const passwordField = document.getElementById('resetNewPassword');
            const icon = document.getElementById('resetPasswordIcon');
            const isPassword = passwordField.type === 'password';
            passwordField.type = isPassword ? 'text' : 'password';
            icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
        });
    }
    
    // Password strength for reset form
    const resetPassword = document.getElementById('resetNewPassword');
    if (resetPassword) {
        resetPassword.addEventListener('input', () => {
            const password = resetPassword.value;
            
            const requirements = {
                length: password.length >= 8,
                upper: /[A-Z]/.test(password),
                lower: /[a-z]/.test(password),
                number: /\d/.test(password),
                special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
            };
            
            const metRequirements = Object.values(requirements).filter(Boolean).length;
            let strength = 0;
            let strengthText = '';
            let strengthClass = '';
            
            if (password.length === 0) {
                strengthText = 'Enter password to see strength';
                strengthClass = '';
            } else if (metRequirements < 3) {
                strength = 25;
                strengthText = 'Weak';
                strengthClass = 'bg-danger';
            } else if (metRequirements < 4) {
                strength = 50;
                strengthText = 'Fair';
                strengthClass = 'bg-warning';
            } else if (metRequirements < 5) {
                strength = 75;
                strengthText = 'Good';
                strengthClass = 'bg-info';
            } else {
                strength = 100;
                strengthText = 'Strong';
                strengthClass = 'bg-success';
            }
            
            const progressBar = document.getElementById('resetPasswordStrengthBar');
            const strengthTextElement = document.getElementById('resetPasswordStrengthText');
            
            if (progressBar) {
                progressBar.style.width = `${strength}%`;
                progressBar.className = `progress-bar ${strengthClass}`;
            }
            
            if (strengthTextElement) {
                strengthTextElement.textContent = strengthText;
            }
        });
    }
    
    // Check for reset token on auth page or password recovery page
    checkResetToken();
});
