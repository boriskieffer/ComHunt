document.getElementById('version').innerText = browser.runtime.getManifest().version;

let highlightCheckbox = document.getElementById('enable_highlight');
let caseSensitiveCheckbox = document.getElementById('enable_caseSensitive');

let settings = {};
let settingsGet = browser.storage.local.get();

document.querySelectorAll("[i18n-key]").forEach(element => {
    element.innerText = browser.i18n.getMessage(element.getAttribute('i18n-key'));
})

settingsGet.then(setSettingsObject);

function setSettingsObject (currentSettings) {
    settings['enable_highlight'] = currentSettings.enable_highlight;
    settings['enable_caseSensitive'] = currentSettings.enable_caseSensitive;
    settings['enable_commentCount'] = currentSettings.enable_commentCount;

    highlightCheckbox.checked = settings['enable_highlight'];
    caseSensitiveCheckbox.checked = settings['enable_caseSensitive'];

    highlightCheckbox.addEventListener('click', function () {
        update_settings('enable_highlight', !settings.enable_highlight);
    });

    caseSensitiveCheckbox.addEventListener('click', function () {
        update_settings('enable_caseSensitive', !settings.enable_caseSensitive);
    });
}

function update_settings(key, value) {
    settings[key] = value;
    browser.storage.local.set(settings);

    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { comhunt_command: "update_settings", comhunt_data: settings })
        })
    });
}