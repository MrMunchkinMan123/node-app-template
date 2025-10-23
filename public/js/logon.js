// Tab switching
const loginTab = document.getElementById('login-tab');
const createAccountTab = document.getElementById('create-account-tab');
const logonForm = document.getElementById('logon-form');
const createAccountForm = document.getElementById('create-account-form');
const messageEl = document.getElementById('message');

loginTab.addEventListener('click', () => {
    logonForm.classList.add('active-form');
    createAccountForm.classList.remove('active-form');
    loginTab.classList.add('active');
    createAccountTab.classList.remove('active');
    messageEl.classList.remove('show');
});

createAccountTab.addEventListener('click', () => {
    createAccountForm.classList.add('active-form');
    logonForm.classList.remove('active-form');
    createAccountTab.classList.add('active');
    loginTab.classList.remove('active');
    messageEl.classList.remove('show');
});

// Logon form submission
logonForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            localStorage.setItem('jwtToken', result.token);
            localStorage.setItem('userName', result.name); // Store user's name
            window.location.href = '/dashboard';
        } else {
            messageEl.textContent = result.message;
            messageEl.className = 'alert error show';
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.textContent = 'An error occurred. Please try again later.';
        messageEl.className = 'alert error show';
    }
});

// Create account form submission
createAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('create-name').value;
    const email = document.getElementById('create-email').value;
    const password = document.getElementById('create-password').value;

    try {
        const response = await fetch('/api/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            messageEl.textContent = 'Account created successfully! You can now log in.';
            messageEl.className = 'alert success show';
            document.getElementById('login-email').value = email;
            document.getElementById('login-password').value = password;
            setTimeout(() => {
                logonForm.classList.add('active-form');
                createAccountForm.classList.remove('active-form');
                loginTab.classList.add('active');
                createAccountTab.classList.remove('active');
            }, 1500);
        } else {
            messageEl.textContent = result.message;
            messageEl.className = 'alert error show';
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.textContent = 'An error occurred. Please try again later.';
        messageEl.className = 'alert error show';
    }
});
