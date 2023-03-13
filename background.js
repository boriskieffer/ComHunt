let tabInstances = [];
chrome.tabs.onUpdated.addListener( async function (tabId, changeInfo, tab) {
    if (changeInfo.status == 'complete') {
        if (tabInstances.indexOf(tabId) == -1) {
            await browser.tabs.executeScript(tab.id, {file: 'comhunt.js'}).then(async response => {
                await browser.tabs.sendMessage(tab.id, { comhunt_command: 'setTabId', comhunt_data: {new_tabId: tabId} });
            });
            
            tabInstances.push(tabId);
        } else {
            if (changeInfo.url){
                browser.tabs.sendMessage(tab.id, { comhunt_command: 'locationUpdate'});
            } else {
                tabInstances.pop(tabId);
            }
        }
    }
});

