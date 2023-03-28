console.log('ComHunt - Injected youtube_window.js')
const tabId = parseInt(document.querySelector("[data-tabid]").getAttribute("data-tabid"));
const CLIENT_APIKEY = window.ytcfg.get('INNERTUBE_API_KEY');
let SAPISIDHASH = null;
let loadCounter = 0; // current comment requests count

let currentVideoId = null;
let sent_ack_video_change = false;

String.prototype.replaceAt = function(index, replacement) {
    return this.substring(0, index) + replacement + this.substring(index + replacement.length);
}

function log (data) {
    console.log('%cComHunt%cyoutube_window.js : \n' + data, 'background: red; color: white');
}

function isYouTubeVideo () {
    return window.location.href.startsWith('https://www.youtube.com/watch?v=')
}

function isYouTubePost() {
    return window.location.href.startsWith('https://www.youtube.com/post/') || window.location.href.includes('community?lb=')
}

function isYouTubeShort() {
    return window.location.href.startsWith('https://www.youtube.com/shorts/');
}

function getCurrentVideoId() {
    return new URLSearchParams(this.window.location.search).get('v');
}

const getInitialTokenFromReel = (reelId) => new Promise((resolve) => {
    fetch("https://www.youtube.com/youtubei/v1/reel/reel_item_watch?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
        "body": "{\"context\":{\"client\":{\"clientName\":\"WEB\",\"clientVersion\":\"2.20230317.00.00\",\"mainAppWebInfo\":{}},\"user\":{\"lockedSafetyMode\":false},\"request\":{\"useSsl\":true,\"internalExperimentFlags\":[],\"consistencyTokenJars\":[]},\"clickTracking\":{\"clickTrackingParams\":\"\"},\"adSignalsInfo\":{}},\"playerRequest\":{\"videoId\":\"" + reelId +"\"}}",
        "method": "POST",
    }).then(response => {
        response.json().then(json => {
            let token = json.engagementPanels[0].engagementPanelSectionListRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            resolve(token);
        });
    })
});

const getInitialTokenFromVideoId = (videoId) => new Promise((resolve) => {
    fetch("https://www.youtube.com/youtubei/v1/next?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
        "body": "{\"context\":{\"client\":{\"clientName\":\"WEB\",\"clientVersion\":\"2.20230301.09.00\"}},\"videoId\":\"" + videoId + "\"}",
        "method": "POST",
        "mode": "cors"
    }).then(response => {
        try {
            response.json().then(json => {
                continuationToken = json.contents.twoColumnWatchNextResults.results.results.contents.filter(
                    renderer => renderer.itemSectionRenderer != null && renderer.itemSectionRenderer.sectionIdentifier == 'comment-item-section'
                );
                continuationToken = continuationToken[continuationToken.length-1].itemSectionRenderer.contents;
                continuationToken = continuationToken[continuationToken.length-1].continuationItemRenderer.continuationEndpoint.continuationCommand.token;

                // when sorting from newest to older instead of top comments, all comments display correctly... ??
                continuationToken = continuationToken.replaceAt(47, 'B')

                resolve(continuationToken)
            })
        } catch {
            alert('ComHunt -- Error when getting initial token')
        }
    });
});

function refreshInstance (params) {
    if (!SAPISIDHASH) {
        let SAPISID = getCookie("SAPISID")
        getSApiSidHash(SAPISID, "https://www.youtube.com").then(_SAPISIDHASH => {
            SAPISIDHASH = _SAPISIDHASH
        })
    }
    if (isYouTubeVideo()) {
        if (params) {
            if (params.transcript) {
                loadVideoTranscript(getCurrentVideoId());
            }

            if (params.comments) {
                loadCounter = 1;
                getInitialTokenFromVideoId(getCurrentVideoId()).then(token => {
                    initialTokenLoad(token);
                });
            }
        } else {
            log('Received REFRESH_INSTANCE on "video" without params!')
        }
    } else if (isYouTubePost()) {
        loadCounter = 1;
        this.fetch(this.window.location.href).then(response => {
            response.text().then(html => {
                const regex = /"continuationCommand":{"token":"(.+?)"/;
                let continuationToken = html.match(regex)[1];

                fetch("https://www.youtube.com/youtubei/v1/browse?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
                    "body": "{\"context\":{\"client\":{\"clientName\":\"WEB\",\"clientVersion\":\"2.20230327.01.00\"}},\"continuation\":\"" + continuationToken + "\"}",
                    "method": "POST",
                }).then(continuationResponse => {
                    continuationResponse.json().then(continuationResponseJson => {
                        continuationToken = continuationResponseJson.onResponseReceivedEndpoints[0].reloadContinuationItemsCommand.continuationItems[0].commentsHeaderRenderer.sortMenu.sortFilterSubMenuRenderer.subMenuItems[1].serviceEndpoint.continuationCommand.token
                        initialTokenLoad(continuationToken);  
                    });
                });
                
            })
        })
    } else if (isYouTubeShort()) {
        let reelId = window.location.pathname.split('/')[2];
        getInitialTokenFromReel(reelId).then(continuationToken => {
            initialTokenLoad(continuationToken);
        })
    }
}

// sends message to content script
function sendCommandToCS (comhunt_command, comhunt_data) {
    window.postMessage({
        comhunt_command,
        comhunt_data,
        comhunt_target: 'cs'
    })
}

// source: https://www.w3schools.com/js/js_cookies.asp 
function getCookie(cname) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
  }

window.addEventListener('message', function (message) {
    let messageData = message.data;
    if (!messageData.comhunt_command) return;
    if (!messageData.comhunt_target || messageData.comhunt_target != 'window') return;
    if (!messageData.target_tabId || messageData.target_tabId != tabId) return;

    switch (messageData.comhunt_command) {
        case 'REFRESH_INSTANCE':
            log('Received REFRESH_INSTANCE order')
            sent_ack_video_change = false;
            let params = messageData.comhunt_data || null;
            refreshInstance(params);
            break;
        case 'likeComment':
            fetch("https://www.youtube.com/youtubei/v1/comment/perform_comment_action?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
                "headers": {
                    "Authorization": "SAPISIDHASH " + SAPISIDHASH,
                },
                "body": "{\"context\":{\"client\":{\"hl\":\"fr\",\"gl\":\"FR\",\"clientName\":\"WEB\",\"clientVersion\":\"2.20230309.08.00\",\"platform\":\"DESKTOP\",\"mainAppWebInfo\":{}},\"user\":{\"lockedSafetyMode\":false},\"request\":{\"useSsl\":true,\"consistencyTokenJars\":[]},\"adSignalsInfo\":{\"params\":[]}},\"actions\":[\"" + messageData.comhunt_data.likeActionEndpoint + "\"]}",
                "method": "POST",
            }).then(response => response.json().then(result => {
                let commentId = messageData.comhunt_data.commentId;
                let likeActionEndpoint = messageData.comhunt_data.likeActionEndpoint;
                let error = !result.actionResults[0].status == 'STATUS_SUCCEEDED';
                let feedback = result.actionResults[0].feedback;

                sendCommandToCS('ACK_LIKE_ACTION', {
                    commentId,
                    likeActionEndpoint,
                    feedback,
                    error
                });
            }));
            break;
        case 'LOAD_STOP':
            let type = messageData.comhunt_data;
            if (type == 'comments') {
                loadCounter = 0;
                sendLoadStatus('comments', false, false);
            }
            break;
        default:
            console.log('Unknown command:', messageData.comhunt_command)
    }
});


const getSApiSidHash = async function(SAPISID, origin) {
    async function sha1(str) {
      return window.crypto.subtle.digest("SHA-1", new TextEncoder("utf-8").encode(str)).then(buf => {
        return Array.prototype.map.call(new Uint8Array(buf), x=>(('00'+x.toString(16)).slice(-2))).join('');
      });
    }
    
    const TIMESTAMP_MS = Date.now().toString().substring(0, 10);
    const digest = await sha1(`${TIMESTAMP_MS} ${SAPISID} ${origin}`);

    return `${TIMESTAMP_MS}_${digest}`;
}

function checkLoadVideoId (videoId) {
    if (videoId != getCurrentVideoId()) {
        if (!sent_ack_video_change) {
            sendCommandToCS('ACK_VIDEO_CHANGE');
            sent_ack_video_change = true;
        }
        return false;
    }
    return true;
}

function load (videoId, continuationToken, CLIENT_APIKEY, isReplySet = false, parentId = null) {
    let apiEndpoint = null;
    if (window.location.href.startsWith('https://www.youtube.com/watch?v=')) {
        if (!checkLoadVideoId(videoId)) return;

        apiEndpoint = 'https://www.youtube.com/youtubei/v1/next?key=';
    } else if (isYouTubePost() || isYouTubeShort()) {
        apiEndpoint = 'https://www.youtube.com/youtubei/v1/browse?key=';
    }
   
    fetch(apiEndpoint + CLIENT_APIKEY + "&prettyPrint=false", {
        "body": "{\"context\":{\"client\":{\"hl\":\"" + navigator.language + "\",\"clientName\":\"WEB\",\"clientVersion\":\"2.20230221.06.00\"}},\"continuation\":\"" + continuationToken + "\"}",
        "headers": {
            "Authorization": "SAPISIDHASH " + SAPISIDHASH,
        },
        "method": "POST"
    }).then(response => {
        response.json().then(json => {
            let continuationItems = null;
            if (json.onResponseReceivedEndpoints[1] != null) {
                continuationItems = json.onResponseReceivedEndpoints[1].reloadContinuationItemsCommand.continuationItems;
            } else {
                continuationItems = json.onResponseReceivedEndpoints[0].appendContinuationItemsAction.continuationItems;
            }
            if (continuationItems != null) {
                continuationItems.forEach(continuationItem => {
                    let comment = null;
                    // if it's a parent comment
                    if (continuationItem.commentThreadRenderer != null) {
                        comment = continuationItem.commentThreadRenderer.comment.commentRenderer;
                        // load replies using token if got any replies
                        if (continuationItem.commentThreadRenderer.replies != null && loadCounter > 0) {
                            loadCounter++;
                            load(videoId, continuationItem.commentThreadRenderer.replies.commentRepliesRenderer.contents[0].continuationItemRenderer.continuationEndpoint.continuationCommand.token, CLIENT_APIKEY, true, comment.commentId)
                        }
                    }
                    // otherwise it's probably a reply
                    else if (isReplySet && continuationItem.commentRenderer != null) {
                        comment = continuationItem.commentRenderer;
                    }
                    // append the comment
                    if (comment != null && loadCounter > 0 && videoId == getCurrentVideoId()) {
                        let commentRuns = comment.contentText.runs;
                        let isChannelOwner = comment.authorIsChannelOwner;
                        let authorName = comment.authorText.simpleText;
                        let authorChannel = comment.authorEndpoint.browseEndpoint.canonicalBaseUrl;
                        let timeText = comment.publishedTimeText.runs[0].text;
                        let commentId = comment.commentId;
                        let voteCount = comment.voteCount != null ? comment.voteCount.simpleText : 0;
                        let isHearted = comment.actionButtons != null && comment.actionButtons.commentActionButtonsRenderer.creatorHeart != null;
                        let isPinned = comment.pinnedCommentBadge != null;
                        let authorThumbnail = comment.authorThumbnail.thumbnails[0].url; // 48x48 profile picture
                        let isLiked = comment.isLiked;
                        let likeActionEndpoint;
                        let toggleActionButton;
                        // only if user is logged
                        if (comment.actionButtons.commentActionButtonsRenderer.likeButton.toggleButtonRenderer.defaultServiceEndpoint) {
                            likeActionEndpoint = comment.actionButtons.commentActionButtonsRenderer.likeButton.toggleButtonRenderer.defaultServiceEndpoint.performCommentActionEndpoint.action;
                            toggleActionButton = comment.actionButtons.commentActionButtonsRenderer.likeButton.toggleButtonRenderer.toggledServiceEndpoint.performCommentActionEndpoint.action;
                        }
                        if (isHearted) {
                            let videoOwnerThumbnail = comment.actionButtons.commentActionButtonsRenderer.creatorHeart.creatorHeartRenderer.creatorThumbnail.thumbnails[0].url;
                            sendCommandToCS('SET_AUTHOR_THUMBNAIL', {
                                videoAuthorProfilePicture: videoOwnerThumbnail
                            })
                        }
                        sendCommandToCS('append_comment',{
                            commentId,
                            isChannelOwner,
                            authorName,
                            authorChannel,
                            authorThumbnail,
                            timeText,
                            commentRuns,
                            parentId,
                            isHearted,
                            isPinned,
                            voteCount,
                            isLiked,
                            likeActionEndpoint,
                            toggleActionButton
                        });
                    }
                    // generally contains token for loading next comments (next "page"), if it doesn't then it's the end of loading comments??
                    else if (continuationItem.continuationItemRenderer != null) {
                        if (continuationItem.continuationItemRenderer.trigger == 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN' && loadCounter > 0) {
                            let nextContinuationToken = continuationItem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                            loadCounter++;
                            load(videoId, nextContinuationToken, CLIENT_APIKEY, false, null);
                        }
                        // probably "show more" button
                        else if (continuationItem.continuationItemRenderer.button != null && loadCounter > 0) {
                            loadCounter++;
                            load(videoId, continuationItem.continuationItemRenderer.button.buttonRenderer.command.continuationCommand.token, CLIENT_APIKEY, true, parentId);
                        }
                    }
                });
            }
            loadCounter--;
            if (loadCounter == 0) {
                // No more loads, send a notification to our commentsearchbox instance
                sendLoadStatus('comments', false, false);
                return;
            }
        });
    });
}

function sendLoadStatus(loadType, loadingStatus, hasError) {
    sendCommandToCS('SET_LOADING_STATUS', {
        loading_type: loadType,
        loading: loadingStatus,
        error: hasError
    })
}

function loadVideoTranscript(videoId) {
    sendLoadStatus('transcript', true, false);
    fetch("https://www.youtube.com/youtubei/v1/player?key=" + CLIENT_APIKEY + "&prettyPrint=false", {
        "body": "{\"context\":{\"client\":{\"hl\":\"" + navigator.language + "\",\"clientName\":\"WEB\",\"clientVersion\":\"2.20230309.08.00\"},\"adSignalsInfo\":{\"params\":[]}},\"videoId\":\"" + videoId+ "\"}",
        "method": "POST"
    }).then(response => {
        response.json().then(json => {
            if (json.captions) {
                let captionUrl = json.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl;
                captionUrl += '&fmt=json3';
    
                fetch(captionUrl).then(response => {
                    response.json().then(jsonTranscript => {
                        jsonTranscript.events.forEach(transcriptData => {
                            if (transcriptData.segs && transcriptData.segs.length>1) {  
                                let transcriptText = '';
                                transcriptData.segs.forEach(segment => {
                                    transcriptText += segment.utf8;
                                });
        
                                sendCommandToCS('APPEND_TRANSCRIPT', {
                                    transcriptText,
                                    start: (transcriptData.tStartMs / 1000)
                                });
                            }
                        })
                        // transcript load is done, send notification to our commentsearchbox instance 
                        sendLoadStatus('transcript', false, false);
                    })
                });
            } else {
                // transcript load has error, send notification to our commentsearchbox instance 
                sendLoadStatus('transcript', false, true);
            }
        })
    });
}

function initialTokenLoad (continuationToken = null) {
    console.log('[.initialTokenLoad] Loading with token', continuationToken)

    sendLoadStatus('comments', true, false);
    load(getCurrentVideoId(), continuationToken, CLIENT_APIKEY, false, null)
}