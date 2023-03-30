let tabInstances = {};
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
    if (new URL(tab.url).hostname == 'www.youtube.com') {
        if (changeInfo.status !== undefined) {
            if (changeInfo.status == 'complete') {
                // if the tab instance doens't exist or updated tab instance url equals the stored tab instance url,
                // then it's probably an initial load or a refresh
                if (!tabInstances[tabId] || tabInstances[tabId] == tab.url) {
                    await browser.tabs.executeScript(tab.id, {file: 'comhunt.js'}).then(async response => {
                        await browser.tabs.sendMessage(tab.id, { comhunt_command: 'setTabId', comhunt_data: {new_tabId: tabId} });
                    });
                } else {
                    // else, send notification to the content scripts
                    await browser.tabs.sendMessage(tab.id, {
                        comhunt_command: 'REFRESH_INSTANCE',
                        comhunt_data: {
                            target_tabId: tab.id,
                            newUrl: tab.url
                        }
                    });
                }
    
                tabInstances[tabId] = tab.url;
            }
        }
    }
});

chrome.runtime.onInstalled.addListener(async function(details) {
    if (details.reason == 'update') return;
    browser.tabs.query({url: "https://www.youtube.com/*"}).then(async function (tabs) {
        tabs.forEach(async function (tab) {
            let tabId = tab.id;
            await browser.tabs.executeScript(tabId, {file: 'comhunt.js'}).then(async function() {
                await browser.tabs.sendMessage(tabId, {
                    comhunt_command: 'setTabId',
                    comhunt_data: {new_tabId: tabId}
                });
            });
        })
    })
});

chrome.tabs.onRemoved.addListener(function(tabId) {
    delete tabInstances[tabId];
})