console.log('[comhunt.js] content-script loaded!');
let commentElements = {};
let settings = {};
browser.storage.local.get().then(_settings => settings = _settings);
let tabId = null;
let ytWindowScriptIsLoaded = false;
let instanceUrl = null;
let userTheme = null;

function isYouTubeVideo () {
    return window.location.href.startsWith('https://www.youtube.com/watch?v=')
}

function isYouTubePost() {
    return window.location.href.startsWith('https://www.youtube.com/post/') || window.location.href.includes('community?lb=')
}

function isYouTubeShort() {
    return window.location.href.startsWith('https://www.youtube.com/shorts/');
}

function getId() {
    if (isYouTubeVideo()) {
        return new URLSearchParams(this.window.location.search).get('v');
    }
    return null;
}

// sends message to window
function sendCommandToWindow (comhunt_command, comhunt_data = null) {
    window.postMessage({
        comhunt_command,
        comhunt_data,
        comhunt_target: 'window',
        target_tabId: tabId
    })
}

function waitForEl(selector, callback) {
    const el = document.querySelector(selector);
    if (el) {
      callback(el);
    } else {
      const observer = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
          for (const addedNode of mutation.addedNodes) {
            if (addedNode.nodeType === Node.ELEMENT_NODE && addedNode.matches(selector)) {
              observer.disconnect();
              callback(addedNode);
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }  

function formatDuration(duration) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
  
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');
  
    let timestamp = `${formattedMinutes}:${formattedSeconds}`;
  
    if (hours >= 1) {
      const formattedHours = hours.toString().padStart(2, '0');
      timestamp = `${formattedHours}:${timestamp}`;
    }
  
    return timestamp;
}  

function findKeyByValue(obj, val) {
    const [key, value] = Object.entries(obj).find(([key, value]) => value === val) || [];
    return key;
  }

// injects the "youtube_window" script into body
let ytWindowScript = document.createElement('script');
ytWindowScript.type = 'text/javascript';
ytWindowScript.src = browser.runtime.getURL('youtube_window.js');
ytWindowScript.onload = function () {
    doneIfReady();
}

// injects the needed css files
let comhuntStyle = document.createElement('link');
comhuntStyle.rel = 'stylesheet';
comhuntStyle.href = browser.runtime.getURL('css/comhunt.css');
document.body.append(comhuntStyle);

// injects remixicon
let remixIcon = document.createElement('link');
remixIcon.rel = 'stylesheet';
remixIcon.href = browser.runtime.getURL('css/remixicon.css');
document.body.append(remixIcon);

// messages sent from window instance
window.addEventListener('message', function (event) {
    let message = event.data;
    if (!message.comhunt_command) return;
    if (!message.comhunt_target || message.comhunt_target != 'cs') return;
    switch (message.comhunt_command) {
        case 'SET_UI_THEME':
            if (message.comhunt_data == 'USER_INTERFACE_THEME_DARK') {
                userTheme = 'dark-theme';
            } else {
                userTheme = 'light-theme';
            }
            break;
        case 'append_comment':
            if (!CommentSearchBoxDOM.comments.filter(comment => comment.commentId == message.comhunt_data.commentId).length) {
                CommentSearchBoxDOM.comments.push(message.comhunt_data);
                CommentSearchBoxDOM.updateCountUI('comments');
            }
            break;
        case 'ACK_VIDEO_CHANGE':
            instanceUrl = window.location.href;
            CommentSearchBoxDOM.resetInstance();
            doneIfReady();
        case 'APPEND_TRANSCRIPT':
            CommentSearchBoxDOM.transcripts.push(message.comhunt_data);
            CommentSearchBoxDOM.updateCountUI('transcript');
            break;
        case 'reset_instance':
            break;
        case 'update_settings':
            settings = message.comhunt_data;
            break;
        case 'SET_LOADING_STATUS':
            CommentSearchBoxDOM.setLoadingStatus(message.comhunt_data.loading_type, message.comhunt_data.loading, message.comhunt_data.error || false)
            break;
        case 'SET_AUTHOR_THUMBNAIL':
            CommentSearchBoxDOM.videoAuthorProfilePicture = message.comhunt_data.videoAuthorProfilePicture;
            break;
        case 'ACK_LIKE_ACTION':
            if (!message.comhunt_data.error) {
                let _commentElements = commentElements[message.comhunt_data.commentId];
                let commentIconContainer = _commentElements.likeCountIcon;
                let commentlikeCountTxt = _commentElements.likeCountTxt;
                
                let commentData = CommentSearchBoxDOM.comments.filter(comment => comment.commentId == message.comhunt_data.commentId)[0];

                if (message.comhunt_data.feedback == 'FEEDBACK_LIKE' && !commentData.isLiked) {
                    commentData.voteCount++;
                    commentData.isLiked = true;
                    
                    commentIconContainer.classList.remove('ri-thumb-up-line');
                    commentIconContainer.classList.add('ri-thumb-up-fill');
                } else if (message.comhunt_data.feedback == 'FEEDBACK_UNLIKE' && commentData.isLiked) {
                    commentData.voteCount--;
                    commentData.isLiked = false;
                    
                    commentIconContainer.classList.remove('ri-thumb-up-fill');
                    commentIconContainer.classList.add('ri-thumb-up-line');
                }

                commentlikeCountTxt.innerText = commentData.voteCount;
            } else this.alert('ComHunt: Error when liking the comment!');
          
            break;
        default:
            console.log('[comhunt.js] Unknown command:', message);
            break;
    }
});

// messages sent from the background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message.comhunt_command) return;
    switch(message.comhunt_command) {
        case 'setTabId':
            tabId = message.comhunt_data.new_tabId;
            // we got the tabId, can put it into our window instance
            ytWindowScript.setAttribute('data-tabId', tabId)
            document.body.append(ytWindowScript);
            break;
        case 'REFRESH_INSTANCE':
            // pass the message to "window" script
            if (instanceUrl == null || (isYouTubeVideo() && CommentSearchBoxDOM.loadingStatus.video.loading == false)) {
                CommentSearchBoxDOM.resetInstance();
                doneIfReady();
            }
            // otherwise, we wait for "ACK_VIDEO_CHANGE" because a set of comment is actually loading
            break;
        case 'update_settings':
            browser.storage.local.get().then(_settings => settings = _settings);
        default:
            console.log('[comhunt.js] Unknown command', message.comhunt_command)
    }
});

function getCommentTextFromRuns(runs) {
    let finalComment = '';
    // @todo remove \n etc
    runs.forEach(run => {
        finalComment += run.text;
    });
    return finalComment;
}

function renderCommentFromRuns(runs, container) {
    let currentParagraphContainer = document.createElement('p');
    currentParagraphContainer.classList.add('comhunt__commentParagraph');
    currentParagraphContainer.classList.add('t-color-inverse')
    
    runs.forEach((run, runIndex) => {
        let runText = run.text;
        let finalRunTextEl;

        if (run.navigationEndpoint != null) {
            let anchor = document.createElement('a');
            anchor.classList.add('comhunt__link');
            if (run.navigationEndpoint.browseEndpoint != null) {
                anchor.href = run.navigationEndpoint.browseEndpoint.canonicalBaseUrl;
            } else {
                anchor.href = run.navigationEndpoint.commandMetadata.webCommandMetadata.url
            }
            anchor.innerText = runText;

            anchor.addEventListener('click', function (evt) {
                evt.preventDefault();
                document.querySelector('video').currentTime = run.navigationEndpoint.watchEndpoint.startTimeSeconds;
            });
            
            finalRunTextEl = anchor;
            currentParagraphContainer.append(anchor);
        }
        
        else if (run.emoji) {
            let img = document.createElement('img');
            img.src = run.emoji.image.thumbnails[0].url;
            img.classList.add('comhunt__commentParagraph');
            img.classList.add('comhunt__commentEmoji');
            img.alt = runText;
            finalRunTextEl = img;
            currentParagraphContainer.append(img);
        }
        
        else {
            if (runText != '\n') {
                let span = document.createElement('span');
                span.innerText = runText;

                if (run.bold || run.italics || run.strikethrough) {
                    span.classList.add('yt-formatted-string');
                    if (run.bold) span.classList.add('bold');
                    if (run.strikethrough) span.classList.add('strikethrough');
                    if (run.italics) span.classList.add('italic');
                }

                finalRunTextEl = span;
                currentParagraphContainer.append(span)

            }
            // is a new line
            else {
                container.append(currentParagraphContainer);
                currentParagraphContainer = document.createElement('p');
                currentParagraphContainer.classList.add('comhunt__commentParagraph');
                currentParagraphContainer.classList.add('t-color-inverse');
            }
        }

        // highlight
        let matches = {
            el: finalRunTextEl,
            occurences: []
        };
        let search = CommentSearchBoxDOM.searchBox.value;
        let searchIndex = 0;

        if (settings.enable_highlight) {
            for (var runCharIndex=0; runCharIndex<runText.length; runCharIndex++) {
                // checks if characters are contiguous
                if (finalRunTextEl.innerText[runCharIndex].toLowerCase() == search[searchIndex].toLowerCase()) {
                    // if the current search index is smaller than searchbox text length then
                    // search.length-1 because string length starts at 1 and searchIndex starts at 0
                    if (searchIndex < search.length-1) {
                        searchIndex++;
                    }
                    // if the current search index if greater than searchbox text length then
                    else {
                        matches.occurences.push({startIdx: runCharIndex - (search.length-1), endIdx: runCharIndex+1})
                        // we reset search index so that the search index of searchbox is 0 (ex: thanks), if we search "th"
                        // searchIndex will be "2" and must be reset to 0 to
                        // actually reset the searchIndex to find next occurence
                        searchIndex = 0;
                    }
                }
                // non-contiguous, we reset searchIndex and delete last match
                else {
                    searchIndex = 0;
                }
            }

            highlight(matches);
        }

        if (runIndex+1 == runs.length) {
            container.append(currentParagraphContainer);
        }
    });

}

function subsplit (str, startIdx, endIdx) {
    return [{ mark: false, text: str.substring(0, startIdx) }, { mark: true, text: str.substring(startIdx, endIdx) }, {text: str.substring(endIdx)}]
}

function highlight (matchesData) {
    let el = matchesData.el;
    let text = el.textContent;
    if (matchesData.occurences.length > 0) {
        el.textContent = null;
        let processing = text;
        let final = [];
        let idxMinus = 0;
        matchesData.occurences.forEach((matchData, matchIdx) => {
            const startIdx = matchData.startIdx - idxMinus;
            const endIdx   = matchData.endIdx - idxMinus;
    
            let spl = subsplit(processing, startIdx, endIdx);
            processing = spl[spl.length-1].text;
            if (matchesData.occurences.length > 1 && matchIdx +1 < matchesData.occurences.length) {
                spl.pop();                
            }

            spl.forEach((splitData) => final.push(splitData))

            idxMinus += endIdx;
        });
    
        final.forEach(finalObj => {
            if (finalObj.mark) {
                let mark = document.createElement('mark');
                mark.innerText = finalObj.text;
                el.append(mark);
            } else {
                el.append(document.createTextNode(finalObj.text));
            }
        })
    }
}

var CommentSearchBoxDOM = {
    initialized: false,
    // loading may be asynchronous so must have one state for each media type
    loadingStatus: {
        video: {
            loading: false,
            error: false
        },
        post: {
            loading: false,
            error: false
        },
        transcript: {
            loading: false,
            error: false
        }
    },
    searchBox: null,
    transcripts: [],
    comments: [],
    // Contains dom objects associated to a comment
    commentElements: [],
    resList: null,
    replySetContainer: {},
    videoAuthorProfilePicture: null, 

    createInstance: function (parentContainer, beforeContainer, containerCss = null) {
        if (this.initialized) return;
        this.initialized = true;

        this.appContainer = document.createElement('div');
        this.appContainer.classList.add('comhunt__appContainer');
        this.appContainer.classList.add(userTheme);

        // <table>
        let loadingTable = document.createElement('table');
        
        // <table><tr>
        this.loadingTable__commentsRow = document.createElement('tr');
        // <table><tr><td>
        this.loadingTable__commentsRow__icon = document.createElement('td');
        this.loadingTable__commentsRow__icon.style.fontSize = '18px';
        this.loadingTable__commentsRow__icon.classList.add('ri-chat-download-fill');
        this.loadingTable__commentsRow__icon.classList.add('blink');
        // <table><tr><td>
        let loadingTable__commentsRow__title = document.createElement('td');
        loadingTable__commentsRow__title.innerText = browser.i18n.getMessage('COMMENTS');
        loadingTable__commentsRow__title.classList.add('t-color-inverse');
        // <table><tr><td>
        this.loadingTable__commentsRow__data = document.createElement('td');
        this.loadingTable__commentsRow__data.innerText = '0'
        this.loadingTable__commentsRow__data.classList.add('t-color-inverse');
        // <table><tr><td>
        this.loadingTable__commentsRow__action = document.createElement('td');
        this.loadingTable__commentsRow__action.innerText = browser.i18n.getMessage('TEXT_LOAD_STOP');
        this.loadingTable__commentsRow__action.style.fontSize = '9px';
        this.loadingTable__commentsRow__action.addEventListener('click', () => {
            if (this.loadingStatus.video.loading) {
                // currently loading so stop the load
                sendCommandToWindow('LOAD_STOP', 'comments')
            } else {
                this.comments = [];
                this.deleteFromCache('comments', getId())
                this.updateCountUI('comments');
                this.loadingTable__commentsRow__icon.classList.add('ri-chat-download-fill');
                this.loadingTable__commentsRow__icon.classList.add('blink');
                this.loadingTable__commentsRow__icon.classList.remove('is-done-color')
                sendCommandToWindow('REFRESH_INSTANCE', {
                    comments: true
                })
            }
        })

        this.loadingTable__commentsRow__cachedIndicator = document.createElement('td');
        this.loadingTable__commentsRow__cachedIndicator.innerText = browser.i18n.getMessage('TEXT_LOAD_CACHED');
        this.loadingTable__commentsRow__cachedIndicator.style.fontSize = '9px';
        this.loadingTable__commentsRow__cachedIndicator.classList.add('comhunt__load_cachedIndicator')
    
        this.loadingTable__transcriptRow__cachedIndicator = document.createElement('td');
        this.loadingTable__transcriptRow__cachedIndicator.innerText = browser.i18n.getMessage('TEXT_LOAD_CACHED');
        this.loadingTable__transcriptRow__cachedIndicator.style.fontSize = '9px';
        this.loadingTable__transcriptRow__cachedIndicator.classList.add('comhunt__load_cachedIndicator')

        // inserts x4 <table><tr><td> 
        this.loadingTable__commentsRow.append(this.loadingTable__commentsRow__icon, loadingTable__commentsRow__title, this.loadingTable__commentsRow__data, this.loadingTable__commentsRow__action)
        // <table><tr>
        this.loadingTable__transcriptionRow = document.createElement('tr');
        // <table><tr><td>
        this.loadingTable__transcriptionRow__icon = document.createElement('td');
        this.loadingTable__transcriptionRow__icon.style.fontSize = '18px';
        this.loadingTable__transcriptionRow__icon.classList.add('ri-chat-download-fill');
        this.loadingTable__transcriptionRow__icon.classList.add('blink');
        // <table><tr><td>
        let loadingTable__transcriptionRow__title = document.createElement('td');
        loadingTable__transcriptionRow__title.innerText = browser.i18n.getMessage('TRANSCRIPT');
        loadingTable__transcriptionRow__title.classList.add('t-color-inverse')
        // <table><tr><td>
        this.loadingTable__transcriptionRow__data = document.createElement('td');
        this.loadingTable__transcriptionRow__data.innerText = '0'
        this.loadingTable__transcriptionRow__data.classList.add('t-color-inverse');
        // <table><tr><td>
        this.loadingTable__transcriptRow__action = document.createElement('td');
        this.loadingTable__transcriptRow__action.innerText = browser.i18n.getMessage('TEXT_LOAD_STOP');
        this.loadingTable__transcriptRow__action.style.fontSize = '9px';
        this.loadingTable__transcriptRow__action.addEventListener('click', () => {
            this.loadingTable__transcriptRow__action.innerText = browser.i18n.getMessage('TEXT_LOAD_STOP');;
            this.transcripts = [];
            this.updateCountUI('transcript');
            sendCommandToWindow('REFRESH_INSTANCE', {
                transcript: true
            })
        })
        // inserts x4 <table><tr><td> 
        this.loadingTable__transcriptionRow.append(this.loadingTable__transcriptionRow__icon, loadingTable__transcriptionRow__title, this.loadingTable__transcriptionRow__data, this.loadingTable__transcriptRow__action)
        
        // inserts <table><tr>
        loadingTable.append(this.loadingTable__commentsRow);
        if (isYouTubeVideo()) {
            loadingTable.append(this.loadingTable__transcriptionRow)
        }

        // inserts <table>
        this.appContainer.append(loadingTable);

        this.resList = document.createElement('div');
        this.resList.classList.add('comhunt__resultListContainer');

        let headerStatus = document.createElement('div');

        let commentCountContainer = document.createElement('div');

        // Sort input in "headerStatus" div
        sortField = document.createElement('select');

        let sortOpt__description = document.createElement('option');
        sortOpt__description.innerText = browser.i18n.getMessage('SORT_DESCRIPTION');

        let sortOpt__commentLength = document.createElement('option');
        sortOpt__commentLength.innerText = browser.i18n.getMessage('SORTBY_COMMENT_LENGTH');

        let sortOpt__commentDate = document.createElement('option');
        sortOpt__commentDate.innerText = browser.i18n.getMessage('SORTBY_COMMENT_DATE');

        let sortOpt__likeCount = document.createElement('option');
        sortOpt__likeCount.innerText = browser.i18n.getMessage('SORTBY_LIKE_COUNT');
        
        sortField.append(sortOpt__description, sortOpt__commentLength, sortOpt__commentDate, sortOpt__likeCount);

        let sortType = document.createElement('select');

        let sortTypeOpt__description = document.createElement('option');
        sortTypeOpt__description.innerText = browser.i18n.getMessage('SORT_TYPE_DESCRIPTION');
        let sortTypeOpt__ASC = document.createElement('option');
        sortTypeOpt__ASC.innerText = browser.i18n.getMessage('SORT_TYPE_ASC');
        let sortTypeOpt__DESC = document.createElement('option');
        sortTypeOpt__DESC.innerText = browser.i18n.getMessage('SORT_TYPE_DESC');

        sortType.append(sortTypeOpt__description, sortTypeOpt__ASC, sortTypeOpt__DESC);

        let sortFieldList = {
            'commentLength': sortOpt__commentLength,
            'commentDate': sortOpt__commentDate,
            'likeCount': sortOpt__likeCount
        }

        sortField.addEventListener('change', () => {
            let ascending = sortType.selectedOptions[0] == sortTypeOpt__ASC;
            let sortFieldName = findKeyByValue(sortFieldList, sortField.selectedOptions[0])
            this.sortComments(sortFieldName, ascending);
        })

        sortType.addEventListener('change', () => {
            let ascending = sortType.selectedOptions[0] == sortTypeOpt__ASC;
            let sortFieldName = findKeyByValue(sortFieldList, sortField.selectedOptions[0])
            this.sortComments(sortFieldName, ascending);
        })

        // append to header sortfield and commentcount container
        headerStatus.append(sortField, sortType)
        headerStatus.append(commentCountContainer);

        this.searchBox = document.createElement('input');
        this.searchBox.placeholder = browser.i18n.getMessage("searchBox");
        this.searchBox.classList.add('comhunt__searchBox');

        this.searchBox.addEventListener('keypress', (event) => {
            if (event.key === "Enter") {
                try {

                let results = this.comments.filter(
                    commentData => {
                        let searchInput = !settings.enable_caseSensitive ? this.searchBox.value.toLowerCase() : this.searchBox.value;
                        let commentText = !settings.enable_caseSensitive ? getCommentTextFromRuns(commentData.commentRuns).toLowerCase() : getCommentTextFromRuns(commentData.commentRuns);
                        let authorName = !settings.enable_caseSensitive ? commentData.authorName.toLowerCase() : commentData.authorName;
                        return commentText.includes(searchInput) || authorName.includes(searchInput);
                    }
                );

                let transcriptResults = this.transcripts.filter(
                    transcript => {
                        let searchInput = !settings.enable_caseSensitive ? this.searchBox.value.toLowerCase() : this.searchBox.value;
                        return !settings.enable_caseSensitive ? transcript.transcriptText.toLowerCase().includes(searchInput) : transcript.transcriptText.includes(searchInput)
                    }
                );

                if (results) this.renderCommentSet(results, this.searchBox.value);
                if (transcriptResults) this.renderTranscriptSet(transcriptResults);
            } catch(ex) { alert(ex)}

            }
        });

        this.appContainer.append(headerStatus);
        this.appContainer.append(this.searchBox);
        this.appContainer.append(this.resList);

        if (containerCss) {
            Object.assign(this.appContainer.style, containerCss);
        }

        parentContainer.insertBefore(this.appContainer, beforeContainer);
        this.YT_Video_instance = true;
    },
    sortComments(sortFieldName, ascending = false) {
        switch (sortFieldName) {
            case 'commentLength':
                this.comments.sort((comment1, comment2) => {
                    // scope parents only
                    if (ascending) {
                        return (getCommentTextFromRuns(comment1.commentRuns).length - getCommentTextFromRuns(comment2.commentRuns).length)
                    } else {
                        return (getCommentTextFromRuns(comment2.commentRuns).length - getCommentTextFromRuns(comment1.commentRuns).length);
                    }
                });
                break;
            case 'commentDate':
                this.comments.sort((comment1, comment2) => {
                    // scope parents only
                    if (ascending) {
                        return comment1.index - comment2.index;
                    } else {
                        return comment2.index - comment1.index;
                    }
                });
                break;
            case 'likeCount':
                this.comments.sort((comment1, comment2) => {
                    // scope parents only
                    if (ascending) {
                        return comment1.voteCount - comment2.voteCount;
                    } else {
                        return comment2.voteCount - comment1.voteCount;
                    }
                });
                break;
        }
    },
    resetInstance: function () {
        this.comments = [];
        this.transcripts = [];
        this.replySetContainer = {};

        if (this.resList != null) {
            let _resList = document.createElement('div');
            _resList.classList.add('comhunt__resultListContainer');
            this.resList.replaceWith(_resList);
            this.resList = _resList;
        }

        console.log('deleting rows', this.loadingTable__commentsRow__cachedIndicator);
        this.loadingTable__commentsRow__cachedIndicator.remove();
        this.loadingTable__transcriptRow__cachedIndicator.remove();
        this.updateCountUI('transcript');
        this.updateCountUI('comments');
        this.setLoadingStatus('comments', false);
        this.setLoadingStatus('transcript', false);

    },
    transformReplyIntoThread: function (thread, parentId, highlightCommentId) {
        this.renderCommentSet(thread, null, null, {
            parentId,
            highlightCommentId
        });
    },
    transformThreadIntoReply: function (replyData, commentContainer) {
        let newCommentContainer = document.createElement('div');
        newCommentContainer.style.margin = '15px 0';

        commentContainer.replaceWith(newCommentContainer);
        
        this.renderComment(newCommentContainer, replyData, {operation: 'renderReply'})
    },

    // renders the comment, could be a parent comment or a reply
    // parentElement is either resList (result list) or a parent comment containing replies
    // renderType is the type of rendered comment => parentComment | threadFromParentComment | threadFromReply
    // @todo commentSettings.operation should be an argument here.. maybe call it "renderType" to make it more clear
    renderComment: function (parentElement, commentData, commentSettings = {}) {
        let commentContainer = document.createElement("div");
        commentContainer.classList.add('comhunt__commentContainer');

        if (commentSettings.operation == 'showThreadFromReply' && commentData.commentId == commentSettings.highlightReplyId) {
            commentContainer.classList.add('comhunt__activeComment')
        }

        let repliesContainer = document.createElement('div');
        repliesContainer.classList.add('comhunt__repliesContainer');    

        // Author profile picture
        let profilePicture = document.createElement('img');
        profilePicture.classList.add('comhunt__profilePicture');
        profilePicture.src = commentData.authorThumbnail;

        commentContainer.append(profilePicture);

        // Wraps everything except image
        let commentDetailsContainer = document.createElement('div');
        commentDetailsContainer.style.float = 'left';
        commentDetailsContainer.style.width = 'calc(100% - 55px)';

        // Top bar, with author name and date
        let topTitle = document.createElement('div')

        let authorName = document.createElement('a');
        authorName.classList.add('comhunt__authorName');
        authorName.classList.add('t-color-inverse');
        authorName.href = commentData.authorChannel;
        authorName.innerText = commentData.authorName;
        if (commentData.isChannelOwner) {
            authorName.classList.add('is_channel_author')
        }
        topTitle.append(authorName)

        let commentDateText = document.createElement('a');
        commentDateText.href = window.location + '&lc=' + commentData.commentId;
        commentDateText.innerText = commentData.timeText;
        commentDateText.classList.add('comhunt__commentDateText');
        topTitle.append(commentDateText);

        commentDetailsContainer.append(topTitle)

        // Comment text itself
        let commentTextContainer = document.createElement('div');
        commentTextContainer.classList.add('comhunt__commentTextContainer');
        renderCommentFromRuns(commentData.commentRuns, commentTextContainer, this.searchBox.value);

        commentDetailsContainer.append(commentTextContainer)

        // append the author details container to the wrapper
        commentContainer.append(commentDetailsContainer)

        // clearfix
        let clearFix = document.createElement('div');
        clearFix.style.clear = 'both';
        commentContainer.append(clearFix);

        // bottom bar, likes, video owner heart..
        let bottomBar = document.createElement('div')
        bottomBar.style.marginTop = '5px';

        let likeCountContainer = document.createElement('div');
        likeCountContainer.title = browser.i18n.getMessage('likeCount', commentData.voteCount)

        let likeCountIcon = document.createElement('i');
        likeCountIcon.classList.add('comhunt_icon');
        if (commentData.isLiked) {
            likeCountIcon.classList.add('ri-thumb-up-fill')
        } else likeCountIcon.classList.add('ri-thumb-up-line')
        likeCountIcon.style.marginRight = '4px';
        likeCountIcon.style.color = '#606060';
 
        likeCountIcon.addEventListener('click', () => {
            if (!commentData.isLiked) {
                this.sendToggleLike(commentData.likeActionEndpoint, commentData.commentId)
            } else {
                this.sendToggleLike(commentData.toggleActionButton, commentData.commentId)
            }
        })

        likeCountContainer.append(likeCountIcon);

        let likeCountTxt = document.createElement('span')
        likeCountTxt.innerText = commentData.voteCount;
        likeCountTxt.style.fontSize = '12px';
        likeCountTxt.style.verticalAlign = 'middle';
        likeCountTxt.style.color = '#606060';
        likeCountContainer.append(likeCountTxt);

        likeCountContainer.classList.add('comhunt__comment_bottomBar_item')
        bottomBar.append(likeCountContainer)

        if (commentData.isHearted) {
            let heartedByAuthorContainer = document.createElement('div');
            heartedByAuthorContainer.classList.add('comment_hearted_author_container');
            heartedByAuthorContainer.title = browser.i18n.getMessage('heartedByVideoOwner');

            let heartedByAuthorImg = document.createElement('img');
            heartedByAuthorImg.src = this.videoAuthorProfilePicture;
            heartedByAuthorImg.classList.add('comhunt__hearted_author_img')

            let heartedByAuthorIcon = document.createElement('i');
            heartedByAuthorIcon.classList.add('ri-heart-fill');
            heartedByAuthorIcon.classList.add('comhunt__hearted_author_icon');

            heartedByAuthorContainer.append(heartedByAuthorImg, heartedByAuthorIcon);
            heartedByAuthorContainer.classList.add('comhunt__comment_bottomBar_item')

            bottomBar.append(heartedByAuthorContainer);
        }

        commentDetailsContainer.append(bottomBar);

        commentElements[commentData.commentId] = {
            likeCountTxt,
            likeCountIcon
        }

        // if it's a parent comment AND the thread is not deployed from a reply
        if (commentData.parentId == null) {
            let replies = this.comments.filter(comment => comment.parentId == commentData.commentId);

            if (replies.length > 0){
                let buttonText = {
                    show: replies.length == 1 ? browser.i18n.getMessage('SHOW_ONE_REPLY_BTN') : browser.i18n.getMessage('SHOW_MULTIPLE_REPLIES_BTN', replies.length),
                    hide: replies.length == 1 ? browser.i18n.getMessage('HIDE_ONE_REPLY_BTN') : browser.i18n.getMessage('HIDE_MULTIPLE_REPLIES_BTN')
                };

                let showRepliesButton = document.createElement('button');

                showRepliesButton.classList.add('comhunt__feedbackBtn');

                showRepliesButton.addEventListener('click', () => {
                    commentData.isThreadShown = !commentData.isThreadShown;

                    if (commentData.isThreadShown) {
                        commentContainer.append(repliesContainer);
                        this.replySetContainer[commentData.commentId] = repliesContainer;
                        this.renderCommentSet(replies, this.searchBox.value, repliesContainer, {
                            operation: 'showAllReplies'
                        })
                        showRepliesButton.innerText = buttonText.hide;
                    } else {
                        // destroy every dom elements of threadreplies for the "commentData.commentId"
                        showRepliesButton.innerText = buttonText.show;

                        // @todo ugly, to replace
                        repliesContainer = document.createElement('div');
                        repliesContainer.classList.add('comhunt__repliesContainer');    

                        this.destroyReplySetContainer(commentData.commentId);
                    }
                });

                showRepliesButton.innerText = buttonText.show;
                if (commentSettings.operation != 'showThreadFromReply') {
                    commentContainer.append(showRepliesButton);
                }
            }

            // since parentId is null so it's a parent comment, append it to the root container (resList)
            if (commentSettings.replacesContainer == null){
                this.resList.append(commentContainer);
            } else {
                commentSettings.replacesContainer.replaceWith(commentContainer)
            }
            
        } else {
            // append the comment container to the replies container if the operation is not "showAllReplies"
            if (commentSettings.operation != 'showAllReplies') { 
                let showThreadButton = document.createElement('button');
                showThreadButton.classList.add('comhunt__feedbackBtn');

                let buttonText = {
                    show: browser.i18n.getMessage('SHOW_ENTIRE_THREAD_BTN'),
                    hide: browser.i18n.getMessage('HIDE_THREAD_BTN')
                };

                showThreadButton.addEventListener('click', () => {
                    let parentComment = this.comments.filter(comment => comment.commentId == commentData.parentId)[0];
                    commentData.isThreadShown = !commentData.isThreadShown;

                    if (commentData.isThreadShown && commentSettings.operation != 'showThreadFromReply') {
                        this.renderComment(null, parentComment, {
                            operation: 'showThreadFromReply',
                            highlightReplyId: commentData.commentId,
                            replacesContainer: commentContainer
                        });

                        showThreadButton.innerText = buttonText.hide;
                    } else {
                        // hide the thread
                        this.transformThreadIntoReply(commentData, commentSettings.threadContainer);
                    }
                });

                // since the thread is already shown (operation is showThreadFromReply) display "hide button"
                if (commentSettings.operation == 'showThreadFromReply') {
                    showThreadButton.innerText = buttonText.hide;
                } else {
                    showThreadButton.innerText = buttonText.show;
                }

                if (commentSettings.operation != 'showThreadFromReply' || commentData.commentId == commentSettings.highlightReplyId) {
                    commentContainer.append(showThreadButton);
                }
            }

            // commentSettings.threadContainer est appelé la 2nd fois..
            parentElement.append(commentContainer)
        }

        // reply has been replaced with its parent comement, now expand the whole thread
        if (commentSettings.operation == 'showThreadFromReply' && commentSettings.threadContainer == null) {
            let thread = this.comments.filter(comment => comment.parentId == commentData.commentId)

            commentContainer.append(repliesContainer);
            this.replySetContainer[commentData.commentId] = repliesContainer;

            this.renderCommentSet(thread, this.searchBox.value, repliesContainer, {
                operation: 'showThreadFromReply',
                threadContainer: commentContainer,
                highlightReplyId: commentSettings.highlightReplyId
            })
        }
    },
    destroyReplySetContainer: function (commentId) {
        if (this.replySetContainer[commentId] != null && this.replySetContainer[commentId].parentNode) {
            this.replySetContainer[commentId].parentNode.removeChild(this.replySetContainer[commentId]);
        }
    },
    setLoadingStatus: function (type, isLoading, hasError = false) {
        let iconContainer;
        switch (type) {
            case 'comments':
                iconContainer = this.loadingTable__commentsRow__icon;
                this.loadingStatus.video.loading = isLoading;
                this.loadingTable__commentsRow__action.innerText = isLoading ? browser.i18n.getMessage('TEXT_LOAD_STOP') : browser.i18n.getMessage('TEXT_LOAD_RELOAD')
                break;
            case 'transcript':
                iconContainer = this.loadingTable__transcriptionRow__icon;
                this.loadingStatus.transcript.loading = isLoading;
                this.loadingTable__transcriptRow__action.innerText = isLoading ? browser.i18n.getMessage('TEXT_LOAD_STOP') : browser.i18n.getMessage('TEXT_LOAD_RELOAD')
                break;
        }
        
        let iconContainer_loadingClasses = ['blink', 'ri-chat-download-fill'];
        let iconContainer_doneClasses = ['is-done-color', 'ri-chat-check-fill'];
        let iconContainer_doneClasses_err = ['is-done-error-color', 'ri-chat-off-line'];

        iconContainer.classList.remove(...iconContainer_loadingClasses);
        iconContainer.classList.remove(...iconContainer_doneClasses);
        iconContainer.classList.remove(...iconContainer_doneClasses_err);

        if (hasError) {
            iconContainer.classList.add(...iconContainer_doneClasses_err);
            return;
        }

        console.log('received', isLoading, ' loading status for', type)

        if (isLoading) {
            iconContainer.classList.add(...iconContainer_loadingClasses);
        } else {
            iconContainer.classList.add(...iconContainer_doneClasses);

            // cache
            let id = getId();
            if (id != null) {
                CommentSearchBoxDOM.setCache(type, getId(), this.comments);
            }
        }

    },
    renderTranscriptSet: function (transcriptSet) {
        transcriptSet.forEach(transcript => {
            let commentContainer = document.createElement("div");
            commentContainer.classList.add('comhunt__commentContainer');

            let transcriptGoto = document.createElement('a');
            transcriptGoto.style.fontSize = '13px';
            transcriptGoto.classList.add('comhunt__link');
            transcriptGoto.innerText = '[transcript] ' + formatDuration(transcript.start);
            transcriptGoto.addEventListener('click', function () {
                document.querySelector('video').currentTime = transcript.start;
            });

            let transcriptParagraphContainer = document.createElement('div');
            transcriptParagraphContainer.classList.add('comhunt__commentTextContainer');
            
            let transcriptParagraph = document.createElement('p');
            transcriptParagraph.classList.add('comhunt__commentTextContainer');
            transcriptParagraph.innerText = transcript.transcriptText;
            transcriptParagraphContainer.append(transcriptParagraph);

            commentContainer.append(transcriptGoto, transcriptParagraphContainer);

            this.resList.append(commentContainer);
        })
    },
    // @todo parameters docs
    renderCommentSet: function (commentSet, search, commentContainer = this.resList, commentSettings) {
        let title = document.createElement('h3');
        title.classList.add('comhunt__resultCount');
        title.classList.add('t-color-inverse');

        if (commentSet.length > 1) {
            title.innerText = browser.i18n.getMessage("multipleResultMsg", commentSet.length);
        } else if (commentSet.length == 1) {
            title.innerText = browser.i18n.getMessage("singleResultMsg");
        } else {
            title.innerText =  browser.i18n.getMessage("noResult")
        }

        // If rendering on the resList div (root container), reset it
        if (commentContainer == this.resList) {
            this.resList.replaceChildren(); // reset results ; firefox version >= 78
            this.resList.append(title);
        }

        commentSet.forEach(comment => {
            this.renderComment(commentContainer || this.resList, comment, commentSettings)                
        });
    },
    sendToggleLike: function (likeActionEndpoint, commentId) {
        sendCommandToWindow('likeComment', {
            likeActionEndpoint,
            commentId
        })
    },
    // type = video or transcript
    updateCountUI: function (type, isCached = false) {
        if (type == 'comments') {
            this.loadingTable__commentsRow__data.innerText = this.comments.length;
        } else if(type == 'transcript') {
            this.loadingTable__transcriptionRow__data.innerText = this.transcripts.length;
        }
    },
    getFromCache: function (type, id) {
        return new Promise((resolve, reject) => {
            browser.storage.local.get("cache").then(cacheData => {
                try {
                    if (cacheData['cache']) {
                        let cacheDataId = cacheData['cache'][type+'_'+id]
                        if (cacheDataId !== undefined) {
                            resolve(cacheDataId);
                        } else {
                            reject('NO_CACHE_ENTRY');
                        }
                    } else {
                        let cacheData = {cache: {}}
                        browser.storage.local.set(cacheData).then(function () {
                            reject('NO_CACHE');
                        })
                    }
                    
                } catch (ex) {
                    reject('UNKNOWN_ERR');
                }
            });
        })
    },
    setCache: function (type, id, data) {
        return new Promise((resolve) => {
            browser.storage.local.get('cache').then(cacheData => {
                cacheData.cache[type+'_'+id] = JSON.stringify(data)
                console.log('new element cache size count is',Object.keys(cacheData.cache).length)

                // @todo check if "cache" setting in on
                browser.storage.local.set(cacheData).then(response => {
                    if (type == 'comments') {
                        this.loadingTable__commentsRow.appendChild(this.loadingTable__commentsRow__cachedIndicator);
                    } else
                    if (type == 'transcript') {
                        this.loadingTable__transcriptionRow.appendChild(this.loadingTable__transcriptRow__cachedIndicator);
                    }
                    
                    resolve(true);
                })
            })
        })
    },
    deleteFromCache: function (type, id) {
        return new Promise((resolve) => {
            browser.storage.local.get('cache').then(cacheData => {
                delete cacheData['cache'][type+'_'+id];
                browser.storage.local.set(cacheData);

                if (id == getId()){
                    if (type == 'comments') {
                        this.loadingTable__commentsRow.removeChild(this.loadingTable__commentsRow__cachedIndicator);
                    } else
                    if (type == 'transcript') {
                        this.loadingTable__transcriptRow.removeChild(this.loadingTable__trancriptRow__cachedIndicator);
                    }
                }

                resolve(true);
            })
        });
    } 
}

function doneIfReady (cache = true) {
    if (tabId != null) {
        if (isYouTubePost()) {
            setTimeout(function () {
                if (!document.querySelector("ytd-comments")) {
                    doneIfReady();
                } else {
                    if (!CommentSearchBoxDOM.initialized) CommentSearchBoxDOM.createInstance(document.querySelector("#contents"), document.querySelector('ytd-comments'), {
                        width: '852px',
                        marginTop: '10px'
                    });
                   
                    this.comments = [];
                    sendCommandToWindow('REFRESH_INSTANCE', {
                        comments: true, transcript: false
                    });
                }
            }, 300);
        } else if (isYouTubeVideo()) {
            setTimeout(function () {
                if (!document.querySelector("#below #comments")) {
                    doneIfReady();
                } else {
                    if (!CommentSearchBoxDOM.initialized) CommentSearchBoxDOM.createInstance(document.querySelector("#below"), document.querySelector('#below #comments'));
                    
                    console.log('Trying to load from cache...');
                    if (cache) {
                        CommentSearchBoxDOM.getFromCache('comments', getId()).then(cacheData => {
                            CommentSearchBoxDOM.comments = JSON.parse(cacheData);
                            CommentSearchBoxDOM.updateCountUI('comments', true);
                            CommentSearchBoxDOM.setLoadingStatus('comments', false, false);
                        })
                        .catch((err) => {
                            if (err == 'NO_CACHE' || err == 'NO_CACHE_ENTRY') {
                                sendCommandToWindow('REFRESH_INSTANCE', {
                                    transcript: true,
                                    comments: true
                                });
                            }
                        });
                    }
                    // cache isn't enabled
                    else {
                        sendCommandToWindow('REFRESH_INSTANCE', {
                            transcript: true,
                            comments: true
                        });
                    }
                }
            }, 300);
        } else if (isYouTubeShort()) {
            waitForEl('ytd-section-list-renderer ytd-comments', (el) => {
                if (!CommentSearchBoxDOM.initialized) CommentSearchBoxDOM.createInstance(document.querySelector("ytd-section-list-renderer ytd-comments").parentElement, document.querySelector("ytd-section-list-renderer ytd-comments"), {
                    overflow: 'scroll',
                    minHeight: '200px',
                    margin: '0 auto'
                });
                sendCommandToWindow('REFRESH_INSTANCE');
            })
        }
    }
}