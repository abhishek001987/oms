# Debugging Login Issues

## What Was Fixed:
1. Added comprehensive console logging to identify issues
2. Added null checks for all DOM elements before using them
3. Added DOMContentLoaded event listener to ensure DOM is ready before initializing
4. Enhanced login button handlers with error logging

## How to Debug:

### Step 1: Open Browser Console
- Right-click on the page → Inspect (or press F12)
- Click on the "Console" tab
- Look for any red errors

### Step 2: Check Initialization Logs
You should see in the console:
```
=== APP INITIALIZING ===
Checking login controls...
loginCards: Found
loginPasswordPanel: Found
loginPassword: Found
loginShell: Found
appShell: Found
Setting up navigation...
Navigation setup complete
=== APP INITIALIZATION COMPLETE ===
```

### Step 3: Test Login
1. Click on "Admin" button
2. Check console - you should see: `selectLoginCard called with: admin`
3. The password panel should appear
4. Enter password "admin123"
5. Click "Login" button
6. Check console - you should see: `loginWithSelectedUser called` followed by `loginSuccess`

### Step 4: Common Issues

**Issue**: loginPasswordPanel says "MISSING"
- Solution: Check HTML ID in index.html - should be `id="login-password-panel"`

**Issue**: "Password entered but login fails"
- Solution: Check browser console for exact password being compared

**Issue**: Nothing happens when clicking buttons
- Solution: Check if event listeners are attached - console should show "Login submit handler attached"

## Buttons to Test:
✅ Admin button (data-user="admin")
✅ Outlet 31 button
✅ Outlet 35 button  
✅ Outlet 42 button
✅ Outlet 88 button
✅ Login submit button
✅ Back button
✅ Logout button

