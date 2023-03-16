console.log('bg script');
let tabInstances = [];
chrome.tabs.onUpdated.addListener( async function (tabId, changeInfo, tab) {
    console.log(changeInfo)
    if (changeInfo.status == 'complete') {
        if (tabInstances.indexOf(tabId) == -1) {
            await browser.tabs.executeScript(tab.id, {file: 'comhunt.js'}).then(async response => {
                console.log('Injected comhunt.js');
                await browser.tabs.sendMessage(tab.id, {
                    comhunt_command: 'locationUpdate',
                    comhunt_data: {
                        target_tabId: tab.id,
                        newUrl: tab.url
                    }
                });
                await browser.tabs.sendMessage(tab.id, { comhunt_command: 'setTabId', comhunt_data: {new_tabId: tabId} });
            });
            
            tabInstances.push(tabId);
        } else {
            if (changeInfo.url){
                await browser.tabs.sendMessage(tab.id, {
                    comhunt_command: 'locationUpdate',
                    comhunt_data: {
                        target_tabId: tab.id,
                        newUrl: tab.url
                    }
                });
            } else {
                tabInstances.pop(tabId);
            }
        }
    }
});

