const tabId = parseInt(document.querySelector("[data-tabid]").getAttribute("data-tabid"));
const CLIENT_APIKEY = window.ytcfg.get('INNERTUBE_API_KEY');

window.addEventListener('message', function (event) {
    let message = event.data;
    switch (message.comhunt_command) {
        case 'getApiKey':
            this.window.postMessage({
                comhunt_command: 'setApiKey',
                comhunt_data: {
                    apiKey: CLIENT_APIKEY,
                    to_tabInstance: tabId
                }
            });
            break;
    }
});