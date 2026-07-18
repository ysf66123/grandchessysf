const fs = require('fs');
let code = fs.readFileSync('app-v2.js', 'utf8');

// In syncSettingsFormFromCurrentUser
code = code.replace(
    /if \(langSelect\) langSelect.value = localStorage.getItem\('gm_analysis_lang'\) \|\| 'tr';/,
    `if (langSelect) langSelect.value = localStorage.getItem('gm_analysis_lang') || 'tr';
        const dashSelect = document.getElementById('settingsDashboardLayout');
        if (dashSelect) dashSelect.value = localStorage.getItem('gm_dashboard_layout') || 'modern';
        window.applyDashboardLayout();`
);

// In saveSettings
code = code.replace(
    /if \(langSelect\) localStorage.setItem\('gm_analysis_lang', langSelect.value === 'en' \? 'en' : 'tr'\);/,
    `if (langSelect) localStorage.setItem('gm_analysis_lang', langSelect.value === 'en' ? 'en' : 'tr');
            const dashSelect = document.getElementById('settingsDashboardLayout');
            if (dashSelect) localStorage.setItem('gm_dashboard_layout', dashSelect.value);
            window.applyDashboardLayout();`
);

// Add applyDashboardLayout to global scope
const applyFunc = `
    window.applyDashboardLayout = function() {
        const layout = localStorage.getItem('gm_dashboard_layout') || 'modern';
        const classic = document.getElementById('dashboard-classic-layout');
        const modern = document.getElementById('dashboard-modern-layout');
        if (classic && modern) {
            if (layout === 'classic') {
                classic.style.display = 'block';
                modern.style.display = 'none';
            } else {
                classic.style.display = 'none';
                modern.style.display = 'block';
            }
        }
    };
    
    document.addEventListener('DOMContentLoaded', () => {
        window.applyDashboardLayout();
    });
`;

code = code + applyFunc;

fs.writeFileSync('app-v2.js', code);
